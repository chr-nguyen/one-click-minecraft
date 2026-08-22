import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// First-person HELD TOOL — a real 3D model parented to the camera, angled toward
// the block, with a swing animation on each hit (Minecraft-style). Models are
// built procedurally (blocky, matching the voxel look) so there are no assets.
// ─────────────────────────────────────────────────────────────────────────────

const WOOD  = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85, metalness: 0.0 });
const IRON  = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, roughness: 0.35, metalness: 0.7 });
const DARK  = new THREE.MeshStandardMaterial({ color: 0x3c4048, roughness: 0.4,  metalness: 0.75 });
const SKIN  = new THREE.MeshStandardMaterial({ color: 0xe0a878, roughness: 0.8,  metalness: 0.0 });

function box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

// Each builder returns a group whose "working end" points up +Y (we tilt the
// whole group into view later). Handles run down -Y.
function buildHand() {
  const g = new THREE.Group();
  g.add(box(0.4, 1.0, 0.4, SKIN, 0, -0.25, 0));        // forearm
  g.add(box(0.46, 0.42, 0.46, SKIN, 0, 0.4, 0));        // fist
  g.add(box(0.16, 0.16, 0.34, SKIN, 0.28, 0.36, 0.02)); // thumb
  return g;
}

function buildShovel() {
  const g = new THREE.Group();
  g.add(box(0.12, 1.5, 0.12, WOOD, 0, -0.35, 0));      // handle
  g.add(box(0.34, 0.16, 0.16, WOOD, 0, 0.45, 0));       // T-grip base
  // blade: tapered scoop from a few plates
  g.add(box(0.5, 0.5, 0.06, IRON, 0, 0.8, 0));          // blade
  g.add(box(0.5, 0.12, 0.14, IRON, 0, 0.56, 0.04, 0.4, 0, 0)); // shoulder
  g.add(box(0.14, 0.14, 0.14, IRON, 0, 1.06, 0, 0, 0, 0.78));  // tip point
  return g;
}

function buildPickaxe() {
  const g = new THREE.Group();
  g.add(box(0.12, 1.7, 0.12, WOOD, 0, -0.35, 0));      // handle
  // curved double-pick head from angled segments
  g.add(box(0.4, 0.16, 0.2, IRON, 0, 0.68, 0));         // center
  g.add(box(0.34, 0.15, 0.19, IRON, 0.34, 0.64, 0, 0, 0, 0.35));
  g.add(box(0.34, 0.15, 0.19, IRON, -0.34, 0.64, 0, 0, 0, -0.35));
  g.add(box(0.24, 0.14, 0.18, IRON, 0.62, 0.52, 0, 0, 0, 0.8));  // right point
  g.add(box(0.24, 0.14, 0.18, IRON, -0.62, 0.52, 0, 0, 0, -0.8)); // left point
  return g;
}

function buildDrill() {
  const g = new THREE.Group();
  g.add(box(0.42, 0.7, 0.44, DARK, 0, -0.25, 0));      // motor body
  g.add(box(0.26, 0.6, 0.26, DARK, 0, 0.35, 0));        // chuck housing
  // helical bit: stacked twisted plates + cone tip
  for (let i = 0; i < 5; i++) {
    g.add(box(0.26, 0.1, 0.08, IRON, 0, 0.68 + i * 0.11, 0, 0, i * 0.6, 0));
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), IRON);
  tip.position.set(0, 1.35, 0);
  g.add(tip);
  g.add(box(0.18, 0.5, 0.18, DARK, 0, -0.72, 0.2, 0.55, 0, 0)); // handle grip
  return g;
}

const BUILDERS = { hand: buildHand, shovel: buildShovel, pickaxe: buildPickaxe, drill: buildDrill };

// Resting transform in camera space: bottom-right, tilted so the head points
// up-forward toward the block ahead.
const BASE_POS = new THREE.Vector3(1.25, -1.35, -3.1);
const BASE_ROT = new THREE.Euler(0.45, -0.55, 0.4);
const BASE_SCALE = 0.72;
const SWING_DUR = 0.26;

export class HeldTool {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.position.copy(BASE_POS);
    this.root.rotation.copy(BASE_ROT);
    this.root.scale.setScalar(BASE_SCALE);
    camera.add(this.root);
    this.model = null;
    this.swingT = 0;
    this.time = 0;
    this.setTool('hand');
  }

  setTool(toolId) {
    if (this.model) { this.root.remove(this.model); }
    const build = BUILDERS[toolId] || BUILDERS.hand;
    this.model = build();
    this.root.add(this.model);
  }

  swing() { this.swingT = SWING_DUR; }

  update(dt) {
    this.time += dt;
    // idle bob
    const bob = Math.sin(this.time * 2.2) * 0.03;
    // swing arc: a quick forward/down jab that eases back
    let swingX = 0, swingZ = 0, thrust = 0;
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt);
      const phase = 1 - this.swingT / SWING_DUR; // 0→1
      const arc = Math.sin(phase * Math.PI);
      swingX = arc * 1.15;   // pitch the head down/forward
      swingZ = arc * 0.35;
      thrust = arc * 0.5;    // push toward the block
    }
    this.root.position.set(BASE_POS.x, BASE_POS.y + bob, BASE_POS.z - thrust);
    this.root.rotation.set(BASE_ROT.x + swingX, BASE_ROT.y, BASE_ROT.z + swingZ);
  }
}
