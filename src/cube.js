import * as THREE from 'three';
import { MATERIAL_DEFS, getMaterial, threeMaterial, shadeColor } from './materials.js';
import { LOOT_DEFS, getLoot, getShape, weightedPick, lootMaterial, RARITY } from './objects.js';

const EXTRACT_THRESHOLD = 0.5; // fraction of object voxels exposed to auto-pop
const OBJ_GRID = 5;
const CRACK_STAGES = 3;
const CRACK_POOL = 28;

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

// Procedural crack textures — branching fractures that intensify by stage.
// Drawn dark with a light core so they read on both pale and dark materials.
let _crackTexs = null;
function crackTextures() {
  if (_crackTexs) return _crackTexs;
  _crackTexs = [];
  const size = 64;
  for (let s = 0; s < CRACK_STAGES; s++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const branches = 3 + s * 3;
    for (let b = 0; b < branches; b++) {
      let ang = (b / branches) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      let x = cx, y = cy;
      const segs = 3 + s * 2;
      const len = size * 0.11 * (1 + s * 0.25);
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
      stroke(2.6, 'rgba(8,6,10,0.7)');
      stroke(1.0, 'rgba(255,255,255,0.45)');
    }
    const tex = new THREE.CanvasTexture(c);
    _crackTexs.push(tex);
  }
  return _crackTexs;
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
    this._one = new THREE.Vector3(1, 1, 1);

    this._generate();
    this._build();
    this._initCracks();
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
    // Full-size (flush) voxels so the surface reads as ONE solid cube; the
    // voxel structure only reveals itself as the player digs in.
    const geo = new THREE.BoxGeometry(this.vs, this.vs, this.vs);
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
        const col = shadeColor(matId, i, j, k);
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
      // damaged: keep full size, show cracks + a quick jiggle, slight darken.
      const frac = 1 - c.health / c.maxHealth; // 0 = pristine, →1 = about to break
      const dark = c.baseColor.clone().multiplyScalar(0.82 + 0.18 * (1 - frac));
      c.mesh.setColorAt(c.inst, dark);
      c.mesh.instanceColor.needsUpdate = true;
      this._setCrack(id, frac);
      this._startJiggle(id);
      return { type: 'damage', pos: wp, matId: c.matId, hardness: def.durability };
    }

    // broken
    this._releaseCrack(id);
    this.jiggles.delete(id);
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

  // ── Crack decals ────────────────────────────────────────────────────────
  // A pool of transparent overlay boxes; only a handful are ever active since
  // the player damages one voxel at a time.
  _initCracks() {
    const texs = crackTextures();
    this._crackTexs = texs;
    this.crackPool = [];
    this.crackFree = [];
    this.crackByCell = new Map();
    this.jiggles = new Map();
    const geo = new THREE.BoxGeometry(this.vs * 1.02, this.vs * 1.02, this.vs * 1.02);
    for (let i = 0; i < CRACK_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.95 });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 2;
      this.group.add(m);
      this.crackPool.push(m);
      this.crackFree.push(i);
    }
  }

  _setCrack(cellId, frac) {
    let idx = this.crackByCell.get(cellId);
    if (idx == null) {
      if (!this.crackFree.length) return;
      idx = this.crackFree.pop();
      this.crackByCell.set(cellId, idx);
    }
    const m = this.crackPool[idx];
    const stage = Math.min(CRACK_STAGES - 1, Math.max(0, Math.floor(frac * CRACK_STAGES)));
    m.material.map = this._crackTexs[stage];
    const cell = this.cells[cellId];
    if (cell && cell.matId) m.material.color.set(getMaterial(cell.matId).crackTint);
    m.material.needsUpdate = true;
    const [i, j, k] = this._coords(cellId);
    this.worldPos(i, j, k);
    m.position.copy(this._v);
    m.visible = true;
  }

  _releaseCrack(cellId) {
    const idx = this.crackByCell.get(cellId);
    if (idx == null) return;
    this.crackPool[idx].visible = false;
    this.crackByCell.delete(cellId);
    this.crackFree.push(idx);
  }

  _startJiggle(cellId) {
    const [i, j, k] = this._coords(cellId);
    this.worldPos(i, j, k);
    let ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5;
    const n = Math.hypot(ax, ay, az) || 1;
    const cell = this.cells[cellId];
    const amp = (cell && cell.matId ? getMaterial(cell.matId).dyn.jiggle : 0.14) * this.vs;
    this.jiggles.set(cellId, {
      bx: this._v.x, by: this._v.y, bz: this._v.z,
      ax: ax / n, ay: ay / n, az: az / n, t: 0.18, dur: 0.18, amp,
    });
  }

  _updateJiggles(dt) {
    if (!this.jiggles || !this.jiggles.size) return;
    for (const [cellId, jg] of this.jiggles) {
      const c = this.cells[cellId];
      jg.t -= dt;
      if (jg.t <= 0 || !c || c.kind === 0) {
        if (c && c.kind !== 0) {
          this._v.set(jg.bx, jg.by, jg.bz);
          this._tmp.compose(this._v, this._q.identity(), this._one);
          c.mesh.setMatrixAt(c.inst, this._tmp);
          c.mesh.instanceMatrix.needsUpdate = true;
        }
        this.jiggles.delete(cellId);
        continue;
      }
      const k2 = jg.t / jg.dur;
      const osc = Math.sin((jg.dur - jg.t) * 70) * jg.amp * k2;
      const ox = jg.ax * osc, oy = jg.ay * osc, oz = jg.az * osc;
      this._v.set(jg.bx + ox, jg.by + oy, jg.bz + oz);
      this._tmp.compose(this._v, this._q.identity(), this._one);
      c.mesh.setMatrixAt(c.inst, this._tmp);
      c.mesh.instanceMatrix.needsUpdate = true;
      const idx = this.crackByCell.get(cellId);
      if (idx != null) this.crackPool[idx].position.set(jg.bx + ox, jg.by + oy, jg.bz + oz);
    }
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
    this._updateJiggles(dt);
    if (!this.extracted) this.group.rotation.y += dt * 0.25;
    else this.group.rotation.y += dt * 1.5; // spin faster on the extraction beat
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); });
  }
}
