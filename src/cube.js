import * as THREE from 'three';
import { MATERIAL_DEFS, getMaterial, soloMaterial, nuggetMaterial } from './materials.js';
import { getShape, weightedPick } from './objects.js';

// ─────────────────────────────────────────────────────────────────────────────
// A cube is ONE solid block (a single big voxel). You chip at it: it cracks and
// jiggles as you hack, then shatters to reveal the loot hidden inside. Different
// materials = different durability, look, sound, and shatter. Then: next block.
// ─────────────────────────────────────────────────────────────────────────────

const SIZE = 6;          // world size of the block
const CRACK_STAGES = 6;  // gradual crack progression
const OBJ_GRID = 5;

// mulberry32 — seeded PRNG so a block is reproducible from its seed.
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural crack textures — branching fractures that intensify by stage.
// Drawn dark with a light core so they read on both pale and dark materials.
let _crackTexs = null;
function crackTextures() {
  if (_crackTexs) return _crackTexs;
  _crackTexs = [];
  const size = 128;
  for (let s = 0; s < CRACK_STAGES; s++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const branches = 2 + s * 2;
    for (let b = 0; b < branches; b++) {
      let ang = (b / branches) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      let x = cx, y = cy;
      const segs = 4 + s * 2;
      const len = size * 0.09 * (1 + s * 0.15);
      const pts = [[x, y]];
      for (let seg = 0; seg < segs; seg++) {
        ang += (Math.random() - 0.5) * 0.9;
        x += Math.cos(ang) * len; y += Math.sin(ang) * len;
        pts.push([x, y]);
      }
      const stroke = (w, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
        ctx.stroke();
      };
      stroke(3.4, 'rgba(8,6,10,0.72)');
      stroke(1.3, 'rgba(255,255,255,0.4)');
    }
    const tex = new THREE.CanvasTexture(c);
    _crackTexs.push(tex);
  }
  return _crackTexs;
}

export class Cube {
  constructor(scene, { seed = 1 } = {}) {
    this.rng = rng32(seed);
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._one = new THREE.Vector3(1, 1, 1);

    this.extracted = false;
    this.revealT = 0;
    this.jig = null;

    // pick the block's material (luck). It contains a nugget of itself.
    this.matDef = weightedPick(MATERIAL_DEFS.map((m) => ({ ...m, weight: m.spawnWeight })), this.rng);
    this.matId = this.matDef.id;

    this.maxHealth = (this.matDef.durability + 1) * 2;
    this.health = this.maxHealth;

    this._build();
  }

  _build() {
    // The solid block.
    this.mat = soloMaterial(this.matId);
    this._baseColor = this.mat.color.clone();
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(SIZE, SIZE, SIZE), this.mat);
    this.group.add(this.mesh);

    // Crack overlay — one transparent box hugging the block, on all faces.
    this._crackTexs = crackTextures();
    this.crackMat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, opacity: 0.95,
      color: new THREE.Color(this.matDef.crackTint),
    });
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(SIZE * 1.004, SIZE * 1.004, SIZE * 1.004), this.crackMat);
    this.crackMesh.visible = false;
    this.crackMesh.renderOrder = 2;
    this.group.add(this.crackMesh);

    // The loot, hidden inside until the block shatters.
    this._buildObject();
  }

  _buildObject() {
    const shape = getShape('gem'); // a chunky nugget of the block's material
    const mat = nuggetMaterial(this.matId);
    this.objMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat, shape.length);
    const c = (OBJ_GRID - 1) / 2;
    const m = new THREE.Matrix4();
    shape.forEach(([x, y, z], i) => {
      this._v.set(x - c, y - c, z - c);
      m.compose(this._v, this._q.identity(), this._one);
      this.objMesh.setMatrixAt(i, m);
    });
    this.objMesh.visible = false;
    this.objMesh.scale.setScalar(0.0);
    this.group.add(this.objMesh);
  }

  get meshes() { return [this.mesh]; }

  // Any hit on the block counts. (Kept for API symmetry with the caller.)
  resolveHit() { return this.extracted ? null : 'block'; }

  // Apply one dig. `point` is a world-space hit point (for particle origin).
  dig(point, power) {
    if (this.extracted) return null;
    const localPt = this.group.worldToLocal(point.clone());
    const pos = { x: localPt.x, y: localPt.y, z: localPt.z };
    const def = this.matDef;

    this.health -= power;
    const frac = 1 - Math.max(0, this.health) / this.maxHealth;

    if (this.health > 0) {
      // crack + jiggle + slight darken; block does NOT shrink
      this._showCrack(frac, localPt);
      this._startJiggle(def.dyn.jiggle);
      this.mat.color.copy(this._baseColor).multiplyScalar(0.78 + 0.22 * (1 - frac));
      return { type: 'damage', pos, matId: this.matId, hardness: def.durability, frac };
    }

    // shatter → reveal loot
    this.extracted = true;
    this.mesh.visible = false;
    this.crackMesh.visible = false;
    this.objMesh.visible = true;
    this.revealT = 0;
    return {
      type: 'break', pos, matId: this.matId, hardness: def.durability,
      extracted: { matId: this.matId, pos: { x: 0, y: 0, z: 0 } },
    };
  }

  _showCrack(frac, localPt) {
    const stage = Math.min(CRACK_STAGES - 1, Math.max(0, Math.floor(frac * CRACK_STAGES)));
    this.crackMat.map = this._crackTexs[stage];
    this.crackMat.needsUpdate = true;
    this.crackMesh.visible = true;
  }

  _startJiggle(amp) {
    let ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5;
    const n = Math.hypot(ax, ay, az) || 1;
    this.jig = { t: 0.15, dur: 0.15, ax: ax / n, ay: ay / n, az: az / n, amp: amp * 2.2 };
  }

  _objectCenter() { return new THREE.Vector3(0, 0, 0); }

  update(dt) {
    // jiggle the whole block
    if (this.jig) {
      this.jig.t -= dt;
      if (this.jig.t <= 0) {
        this.group.position.set(0, 0, 0);
        this.jig = null;
      } else {
        const k = this.jig.t / this.jig.dur;
        const osc = Math.sin((this.jig.dur - this.jig.t) * 75) * this.jig.amp * k;
        this.group.position.set(this.jig.ax * osc, this.jig.ay * osc, this.jig.az * osc);
      }
    }

    if (!this.extracted) {
      this.group.rotation.y += dt * 0.25;
    } else {
      // loot pop: scale up with an overshoot, spin on the reveal beat
      this.revealT += dt;
      const t = Math.min(1, this.revealT / 0.35);
      const s = 0.6 * (t * t * (3 - 2 * t)) * 1.6; // smoothstep → ~1.5x, fits inside old block
      this.objMesh.scale.setScalar(s);
      this.objMesh.rotation.y += dt * 3;
      this.group.rotation.y += dt * 1.2;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((mm) => mm.dispose());
        else o.material.dispose();
      }
    });
  }
}
