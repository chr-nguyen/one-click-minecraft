import * as THREE from 'three';
import { MATERIAL_DEFS, getMaterial, threeMaterial, jitterColor } from './materials.js';
import { LOOT_DEFS, getLoot, getShape, weightedPick, lootMaterial, RARITY } from './objects.js';

const EXTRACT_THRESHOLD = 0.5; // fraction of object voxels exposed to auto-pop
const OBJ_GRID = 5;

// mulberry32 — small seeded PRNG so a cube is reproducible from its seed.
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Cube {
  constructor(scene, { size = 7, voxel = 1, seed = 1 } = {}) {
    this.N = size;
    this.vs = voxel;
    this.rng = rng32(seed);
    this.group = new THREE.Group();
    scene.add(this.group);

    this.cells = new Array(size ** 3).fill(null); // {kind,matId,health,maxHealth,mesh,inst,baseColor}
    this.objCells = [];        // indices of object voxels
    this.objExposed = 0;
    this.extracted = false;
    this.loot = null;
    this._tmp = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    this._generate();
    this._build();
  }

  idx(i, j, k) { return (i * this.N + j) * this.N + k; }
  inBounds(i, j, k) { return i >= 0 && j >= 0 && k >= 0 && i < this.N && j < this.N && k < this.N; }
  worldPos(i, j, k, out = this._v) {
    const c = (this.N - 1) / 2;
    return out.set((i - c) * this.vs, (j - c) * this.vs, (k - c) * this.vs);
  }

  _generate() {
    const N = this.N;
    // 1) Pick hidden loot and stamp its shape, centered.
    this.loot = weightedPick(LOOT_DEFS, this.rng);
    const shape = getShape(this.loot.shape);
    const off = Math.floor((N - OBJ_GRID) / 2);
    for (const [x, y, z] of shape) {
      const i = x + off, j = y + off, k = z + off;
      if (!this.inBounds(i, j, k)) continue;
      const id = this.idx(i, j, k);
      this.cells[id] = { kind: 2, matId: null, health: 1, maxHealth: 1 };
      this.objCells.push(id);
    }

    // 2) Voronoi seeds → contiguous material pockets.
    const seedCount = 4 + Math.floor(this.rng() * 3);
    const seeds = [];
    for (let s = 0; s < seedCount; s++) {
      seeds.push({
        i: this.rng() * N, j: this.rng() * N, k: this.rng() * N,
        matId: weightedPick(MATERIAL_DEFS.map((m) => ({ ...m, weight: m.spawnWeight })), this.rng).id,
      });
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const id = this.idx(i, j, k);
      if (this.cells[id]) continue; // object voxel
      let best = Infinity, mat = seeds[0].matId;
      for (const s of seeds) {
        const d = (i - s.i) ** 2 + (j - s.j) ** 2 + (k - s.k) ** 2;
        if (d < best) { best = d; mat = s.matId; }
      }
      const def = getMaterial(mat);
      this.cells[id] = { kind: 1, matId: mat, health: def.durability, maxHealth: def.durability };
    }
  }

  _build() {
    // Group matrix cells by material → one InstancedMesh each.
    const geo = new THREE.BoxGeometry(this.vs * 0.98, this.vs * 0.98, this.vs * 0.98);
    const byMat = new Map();
    for (let id = 0; id < this.cells.length; id++) {
      const c = this.cells[id];
      if (c && c.kind === 1) (byMat.get(c.matId) || byMat.set(c.matId, []).get(c.matId)).push(id);
    }
    this.matMeshes = new Map();
    for (const [matId, ids] of byMat) {
      const mesh = new THREE.InstancedMesh(geo, threeMaterial(matId), ids.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.matId = matId;
      ids.forEach((id, inst) => {
        const [i, j, k] = this._coords(id);
        this.worldPos(i, j, k);
        this._q.identity();
        this._tmp.compose(this._v, this._q, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(inst, this._tmp);
        const col = jitterColor(matId, id * 2654435761);
        mesh.setColorAt(inst, col);
        const c = this.cells[id];
        c.mesh = mesh; c.inst = inst; c.baseColor = col;
      });
      mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      this.matMeshes.set(matId, mesh);
    }

    // Object voxels — one glowing InstancedMesh.
    const objGeo = new THREE.BoxGeometry(this.vs * 0.9, this.vs * 0.9, this.vs * 0.9);
    this.objMesh = new THREE.InstancedMesh(objGeo, lootMaterial(this.loot.rarity), this.objCells.length);
    this.objMesh.userData.isObject = true;
    this.objCells.forEach((id, inst) => {
      const [i, j, k] = this._coords(id);
      this.worldPos(i, j, k);
      this._tmp.compose(this._v, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      this.objMesh.setMatrixAt(inst, this._tmp);
      const c = this.cells[id];
      c.mesh = this.objMesh; c.inst = inst;
    });
    this.group.add(this.objMesh);
  }

  _coords(id) {
    const N = this.N;
    const k = id % N;
    const j = Math.floor(id / N) % N;
    const i = Math.floor(id / (N * N));
    return [i, j, k];
  }

  // Raycast helper: returns array of meshes to test.
  get meshes() { return [...this.matMeshes.values(), this.objMesh]; }

  // Resolve an intersection into a cell id.
  resolveHit(intersection) {
    const mesh = intersection.object;
    const inst = intersection.instanceId;
    if (inst == null) return null;
    for (let id = 0; id < this.cells.length; id++) {
      const c = this.cells[id];
      if (c && c.mesh === mesh && c.inst === inst && c.kind !== 0) return id;
    }
    return null;
  }

  // Apply a dig to a cell. Returns an event describing what happened.
  dig(id, power) {
    const c = this.cells[id];
    if (!c || c.kind === 0) return null;
    const [i, j, k] = this._coords(id);
    this.worldPos(i, j, k);
    const wp = { x: this._v.x, y: this._v.y, z: this._v.z };

    if (c.kind === 2) return { type: 'bonk', pos: wp }; // object voxel: can't dig, hint

    const def = getMaterial(c.matId);
    c.health -= power;
    if (c.health > 0) {
      // damaged: shrink + darken
      const t = c.health / c.maxHealth;
      const s = 0.55 + 0.45 * t;
      this._tmp.compose(this._v, this._q.identity(), new THREE.Vector3(s, s, s));
      c.mesh.setMatrixAt(c.inst, this._tmp);
      c.mesh.instanceMatrix.needsUpdate = true;
      const dark = c.baseColor.clone().multiplyScalar(0.6 + 0.4 * t);
      c.mesh.setColorAt(c.inst, dark);
      c.mesh.instanceColor.needsUpdate = true;
      return { type: 'damage', pos: wp, matId: c.matId, hardness: def.durability };
    }

    // broken
    this._hideInstance(c);
    c.kind = 0;
    const evt = { type: 'break', pos: wp, matId: c.matId, hardness: def.durability };
    this._recomputeExposure();
    if (!this.extracted && this.objExposed / this.objCells.length >= EXTRACT_THRESHOLD) {
      this.extracted = true;
      evt.extracted = { loot: this.loot, rarity: RARITY[this.loot.rarity], pos: this._objectCenter() };
    }
    return evt;
  }

  _hideInstance(c) {
    this._tmp.compose(this._v.set(0, 0, 0), this._q.identity(), new THREE.Vector3(0, 0, 0));
    c.mesh.setMatrixAt(c.inst, this._tmp);
    c.mesh.instanceMatrix.needsUpdate = true;
  }

  _recomputeExposure() {
    let exposed = 0;
    for (const id of this.objCells) {
      const [i, j, k] = this._coords(id);
      const n = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
      for (const [di, dj, dk] of n) {
        const ni = i + di, nj = j + dj, nk = k + dk;
        if (!this.inBounds(ni, nj, nk) || this.cells[this.idx(ni, nj, nk)].kind === 0) {
          exposed++; break;
        }
      }
    }
    this.objExposed = exposed;
  }

  _objectCenter() {
    const c = new THREE.Vector3();
    for (const id of this.objCells) { const [i, j, k] = this._coords(id); c.add(this.worldPos(i, j, k).clone()); }
    return c.multiplyScalar(1 / this.objCells.length);
  }

  update(dt) {
    if (!this.extracted) this.group.rotation.y += dt * 0.25;
    else this.group.rotation.y += dt * 1.5; // spin faster on the extraction beat
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); });
  }
}
