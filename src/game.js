import * as THREE from 'three';
import { Cube } from './cube.js';
import { Particles, Shake } from './juice.js';
import { particleColor, getMaterial } from './materials.js';
import { TOOLS, toolPower } from './tools.js';
import { initAudio, resumeAudio, sfx, digSound, breakSound } from './audio.js';
import { UI } from './ui.js';

const ROUND_SECONDS = 60;
const CUBE_SIZE = 7;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this._initScene();
    this.particles = new Particles(this.scene, 1);
    this.shake = new Shake();
    this.ui = new UI();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.state = 'idle'; // idle | playing | over
    this.timeLeft = ROUND_SECONDS;
    this.score = 0;
    this.tool = TOOLS.hand;      // current auto-tool power source (upgrades on loot)
    this.best = Number(localStorage.getItem('voxeldig.best') || 0);
    this.cubeSeed = 1;
    this.cube = null;
    this._lastClock = ROUND_SECONDS;

    this.ui.setBest(this.best);
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

  // Auto-best-tool: the current tool's effective power against this material's
  // family. Right tool = full power; wrong tool = reduced. Durability sets pace.
  _powerFor(matId) {
    return toolPower(this.tool, getMaterial(matId).family);
  }

  _dig() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.cube.meshes, false);
    if (!hits.length) return;
    const id = this.cube.resolveHit(hits[0]);
    if (id == null) return;
    const cell = this.cube.cells[id];
    const power = cell.kind === 1 ? this._powerFor(cell.matId) : 1;
    const evt = this.cube.dig(id, power);
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
        this.particles.burst(wp.x, wp.y, wp.z, particleColor(evt.matId), 5, 2.5);
        this.shake.add(0.06 + evt.hardness * 0.01, 0.12);
        digSound(def);
        break;
      }
      case 'break': {
        const def = getMaterial(evt.matId);
        this.particles.burst(wp.x, wp.y, wp.z, particleColor(evt.matId), def.dyn.chips, def.dyn.chipSpeed);
        this.shake.add(0.14 + evt.hardness * 0.02, 0.22);
        breakSound(def);
        if (evt.extracted) this._extract(evt.extracted);
        break;
      }
    }
  }

  _extract({ loot, rarity }) {
    this.score += rarity.score;
    this.ui.setScore(this.score);
    this.ui.flourish(loot, rarity);
    sfx.reveal(rarity.score);
    this.shake.add(0.35, 0.4);
    // burst of loot-colored sparkle at cube center
    const center = this.cube._objectCenter().applyMatrix4(this.cube.group.matrixWorld);
    this.particles.burst(center.x, center.y, center.z, new THREE.Color(rarity.color), 40, 7);

    // Tool upgrade if this loot is a tool and stronger than current.
    if (loot.tool && TOOLS[loot.tool] && TOOLS[loot.tool].power > this.tool.power) {
      this.tool = TOOLS[loot.tool];
      this.ui.setTool(this.tool);
    }
    // brief beat, then next cube
    setTimeout(() => this._nextCube(), 550);
  }

  _nextCube() {
    if (this.state !== 'playing') return;
    if (this.cube) this.cube.dispose(this.scene);
    this.cubeSeed = (this.cubeSeed * 1103515245 + 12345) & 0x7fffffff;
    this.cube = new Cube(this.scene, { size: CUBE_SIZE, voxel: 1, seed: this.cubeSeed });
  }

  start() {
    this.state = 'playing';
    this.timeLeft = ROUND_SECONDS;
    this.score = 0;
    this.tool = TOOLS.hand;
    this._lastClock = ROUND_SECONDS;
    this.ui.setScore(0);
    this.ui.setTool(this.tool);
    this.ui.hideOverlay();
    sfx.start();
    if (this.cube) this.cube.dispose(this.scene);
    this.cubeSeed = 1;
    this.cube = new Cube(this.scene, { size: CUBE_SIZE, voxel: 1, seed: this.cubeSeed });
  }

  _end() {
    this.state = 'over';
    sfx.end();
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('voxeldig.best', String(this.best));
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
    this.particles.update(dt);

    // apply screen shake as camera offset
    const s = this.shake.sample(dt);
    this.camera.position.set(this.camBase.x + s.x, this.camBase.y + s.y, this.camBase.z);
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
}
