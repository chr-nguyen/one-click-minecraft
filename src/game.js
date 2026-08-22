import * as THREE from 'three';
import { Cube } from './cube.js';
import { Particles, Shake } from './juice.js';
import { particleColor, getMaterial } from './materials.js';
import { TOOLS, getTool, bestTool } from './tools.js';
import { pickFunItem } from './objects.js';
import { initAudio, resumeAudio, sfx, digSound, breakSound } from './audio.js';
import { HeldTool } from './heldtool.js';
import { UI } from './ui.js';

const ROUND_SECONDS = 60;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this._initScene();
    this.held = new HeldTool(this.camera);
    this.particles = new Particles(this.scene, 1);
    this.shake = new Shake();
    this.ui = new UI();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.state = 'idle'; // idle | playing | over
    this.timeLeft = ROUND_SECONDS;
    this.score = 0;
    // Persistent, automatic progression: cumulative material totals and the
    // best shovel they've earned carry across runs (localStorage).
    this.totals = this._loadTotals();
    this.tool = getTool(localStorage.getItem('justdig.tool') || 'hand');
    this.best = Number(localStorage.getItem('justdig.best') || 0);
    this.cubeSeed = 1;
    this.cube = null;
    this._lastClock = ROUND_SECONDS;

    this.ui.setBest(this.best);
    this.ui.setTool(this.tool);
    this.ui.showStart(() => this.start());

    this._bindInput();
    this._clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1220);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camBase = new THREE.Vector3(0, 2.5, 15);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera); // so the camera-parented held tool renders

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 8, 10);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xaac4ff, 0.7);
    fill.position.set(-8, 2, 4);
    this.scene.add(fill);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x24304a, 0.9));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    // subtle ground glow plane for depth
    const gGeo = new THREE.PlaneGeometry(60, 60);
    const gMat = new THREE.MeshStandardMaterial({ color: 0x0a0e18, roughness: 1 });
    const ground = new THREE.Mesh(gGeo, gMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -6;
    this.scene.add(ground);

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._fitCamera();
  }

  // Pull the camera to whatever distance fits the block on this aspect ratio,
  // using the more-constraining of the vertical/horizontal FOV. Keeps the block
  // framed the same on a wide desktop and a tall phone.
  _fitCamera() {
    const R = 6.2; // block bounding-sphere radius + margin (block is 6 wide)
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const dist = Math.max(R / Math.sin(fovV / 2), R / Math.sin(fovH / 2));
    this.camBase.set(0, dist * 0.14, dist);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, 0);
  }

  _bindInput() {
    const onDown = (e) => {
      initAudio(); resumeAudio();
      if (this.state !== 'playing') return;
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      this.pointer.x = (cx / rect.width) * 2 - 1;
      this.pointer.y = -(cy / rect.height) * 2 + 1;
      this._dig();
    };
    this.canvas.addEventListener('mousedown', onDown);
    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
  }

  // Current shovel's dig power. Durability sets the pace; stronger shovels
  // (earned automatically) dig everything faster.
  _powerFor() {
    return this.tool.power;
  }

  _loadTotals() {
    try { return JSON.parse(localStorage.getItem('justdig.mats') || '{}'); }
    catch { return {}; }
  }
  _persist() {
    localStorage.setItem('justdig.mats', JSON.stringify(this.totals));
    localStorage.setItem('justdig.tool', this.tool.id);
  }

  _dig() {
    this.held.swing(); // swing on every click, hit or miss
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.cube.meshes, false);
    if (!hits.length) return;
    if (!this.cube.resolveHit()) return;
    const evt = this.cube.dig(hits[0].point, this._powerFor());
    if (!evt) return;
    this._react(evt);
  }

  _react(evt) {
    const p = evt.pos;
    // world-space particle origin (account for cube rotation)
    const wp = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(this.cube.group.matrixWorld);
    switch (evt.type) {
      case 'bonk':
        this.shake.add(0.05, 0.12);
        sfx.tick(4);
        break;
      case 'damage': {
        const def = getMaterial(evt.matId);
        this.particles.burst(wp.x, wp.y, wp.z, particleColor(evt.matId), 6, 3, 0.7);
        this.shake.add(0.06 + evt.hardness * 0.01, 0.12);
        digSound(def);
        break;
      }
      case 'break': {
        const def = getMaterial(evt.matId);
        // whole block shatters into big chunks, from the block center
        const c = this.cube.group.position; // ~origin
        this.particles.burst(c.x, c.y, c.z, particleColor(evt.matId), def.dyn.chips * 4, def.dyn.chipSpeed * 1.9, 2.6);
        this.shake.add(0.42, 0.35);
        breakSound(def);
        if (evt.extracted) this._extract(evt.extracted);
        break;
      }
    }
  }

  _extract({ matId }) {
    const md = getMaterial(matId);
    // collect the material (persists), +1 to the block count
    this.totals[matId] = (this.totals[matId] || 0) + 1;
    this.score += 1;
    this.ui.setScore(this.score);
    sfx.reveal(3);
    this.shake.add(0.35, 0.4);
    const center = this.cube._objectCenter().applyMatrix4(this.cube.group.matrixWorld);
    const matHex = '#' + particleColor(matId).getHexString();
    this.particles.burst(center.x, center.y, center.z, particleColor(matId), 40, 7, 1.4);

    // Gold Alloy Shovel: chance to unearth a fun bonus item.
    let funItem = null;
    if (this.tool.funItems && Math.random() < 0.25) {
      funItem = pickFunItem();
      this.score += funItem.score;
      this.ui.setScore(this.score);
      sfx.reveal(funItem.score);
    }

    // Automatic shovel upgrade when totals meet the next recipe.
    const best = bestTool(this.totals);
    const upgraded = best.tier > this.tool.tier;
    if (upgraded) {
      this.tool = best;
      this.ui.setTool(best, true);
      this.held.setTool(best.id);
      this.shake.add(0.5, 0.5);
      sfx.reveal(20);
    }
    this._persist();

    // Flourish priority: upgrade > fun item > material collected.
    if (upgraded) this.ui.flourish(`NEW! ${best.name}`, '#ffd54a');
    else if (funItem) this.ui.flourish(`${funItem.name}  +${funItem.score}`, funItem.color);
    else this.ui.flourish(`+1 ${md.name}`, matHex);

    setTimeout(() => this._nextCube(), 550);
  }

  _nextCube() {
    if (this.state !== 'playing') return;
    if (this.cube) this.cube.dispose(this.scene);
    this.cubeSeed = (this.cubeSeed * 1103515245 + 12345) & 0x7fffffff;
    this.cube = new Cube(this.scene, { seed: this.cubeSeed });
  }

  start() {
    this.state = 'playing';
    this.timeLeft = ROUND_SECONDS;
    this.score = 0;
    // NOTE: material totals and the earned shovel persist across runs — only
    // the per-run score and clock reset.
    this._lastClock = ROUND_SECONDS;
    this.ui.setScore(0);
    this.ui.setTool(this.tool);
    this.held.setTool(this.tool.id);
    this.ui.hideOverlay();
    sfx.start();
    if (this.cube) this.cube.dispose(this.scene);
    this.cubeSeed = (this.cubeSeed * 1103515245 + 12345) & 0x7fffffff;
    this.cube = new Cube(this.scene, { seed: this.cubeSeed });
  }

  _end() {
    this.state = 'over';
    sfx.end();
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('justdig.best', String(this.best));
      this.ui.setBest(this.best);
    }
    this.ui.showGameOver(this.score, this.best, () => this.start());
  }

  _loop() {
    const dt = Math.min(this._clock.getDelta(), 0.05);
    if (this.state === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this._end(); }
      const whole = Math.ceil(this.timeLeft);
      if (whole !== this._lastClock && whole <= 5 && whole > 0) sfx.tickClock();
      this._lastClock = whole;
      this.ui.setTime(this.timeLeft);
    }
    if (this.cube) this.cube.update(dt);
    this.held.update(dt);
    this.particles.update(dt);

    // apply screen shake as camera offset
    const s = this.shake.sample(dt);
    this.camera.position.set(this.camBase.x + s.x, this.camBase.y + s.y, this.camBase.z);
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
}
