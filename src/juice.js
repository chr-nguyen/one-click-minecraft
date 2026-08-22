import * as THREE from 'three';

// ── Chunky voxel-debris particles ────────────────────────────────────────────
// Pooled InstancedMesh of tiny cubes so bursts are allocation-free at runtime.

const MAX_PARTICLES = 600;
const GRAV = -22;

export class Particles {
  constructor(scene, voxelSize) {
    this.n = MAX_PARTICLES;
    this.size = voxelSize;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = this.n;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);   // remaining seconds
    this.scale = new Float32Array(this.n);
    this.cursor = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    // hide all initially
    for (let i = 0; i < this.n; i++) this._writeMatrix(i, 0);
  }

  _writeMatrix(i, s) {
    this._v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    this._e.set(i * 1.3, i * 0.7, i * 0.5);
    this._q.setFromEuler(this._e);
    this._m.compose(this._v, this._q, new THREE.Vector3(s, s, s));
    this.mesh.setMatrixAt(i, this._m);
  }

  burst(x, y, z, color, count = 10, speed = 4, sizeScale = 1) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.8 + 0.2;
      const r = Math.random() * speed;
      this.vel[i * 3] = Math.cos(a) * r;
      this.vel[i * 3 + 1] = up * speed + 2;
      this.vel[i * 3 + 2] = Math.sin(a) * r;
      this.life[i] = 0.5 + Math.random() * 0.6;
      this.scale[i] = this.size * sizeScale * (0.2 + Math.random() * 0.35);
      this.mesh.setColorAt(i, color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] += GRAV * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const s = this.life[i] > 0 ? this.scale[i] * Math.min(1, this.life[i] * 2) : 0;
      this._writeMatrix(i, s);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ── Screen shake ─────────────────────────────────────────────────────────────
export class Shake {
  constructor() { this.t = 0; this.mag = 0; this.dur = 0; }
  add(mag, dur = 0.25) {
    this.mag = Math.max(this.mag * 0.6, mag);
    this.dur = Math.max(this.dur, dur);
    this.t = this.dur;
  }
  // returns {x,y} offset to add to camera each frame
  sample(dt) {
    if (this.t <= 0) return { x: 0, y: 0 };
    this.t -= dt;
    const k = Math.max(0, this.t / this.dur);
    const m = this.mag * k * k;
    return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
  }
}
