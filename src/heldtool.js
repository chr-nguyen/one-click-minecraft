import * as THREE from 'three';
import { getTool } from './tools.js';

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

function buildShovel(color) {
  const blade = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.55 });
  const g = new THREE.Group();
  g.add(box(0.12, 1.5, 0.12, WOOD, 0, -0.35, 0));      // handle
  g.add(box(0.34, 0.16, 0.16, WOOD, 0, 0.45, 0));       // T-grip base
  // blade: tapered scoop from a few plates
  g.add(box(0.5, 0.5, 0.06, blade, 0, 0.8, 0));          // blade
  g.add(box(0.5, 0.12, 0.14, blade, 0, 0.56, 0.04, 0.4, 0, 0)); // shoulder
  g.add(box(0.14, 0.14, 0.14, blade, 0, 1.06, 0, 0, 0, 0.78));  // tip point
  return g;
}

// Resting rotation in camera space, tilted so the head points up-forward toward
// the block. Position + scale are derived from the frustum each frame so the
// tool stays in the bottom-right corner on any aspect ratio (phone or desktop).
const BASE_ROT = new THREE.Euler(0.45, -0.55, 0.4);
const BASE_SCALE = 0.78;
const DEPTH = 3.1;      // how far in front of the camera the tool sits
const SWING_DUR = 0.26;

export class HeldTool {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.rotation.copy(BASE_ROT);
    camera.add(this.root);
    this.model = null;
    this.swingT = 0;
    this.time = 0;
    this.setTool('hand');
    this.update(0);
  }

  setTool(toolId) {
    if (this.model) this.root.remove(this.model);
    const t = getTool(toolId);
    this.model = toolId === 'hand' ? buildHand() : buildShovel(t.color || '#cccccc');
    this.root.add(this.model);
  }

  swing() { this.swingT = SWING_DUR; }

  update(dt) {
    this.time += dt;
    // Frustum extents at the tool's depth → anchor to the bottom-right corner
    // and shrink on narrow (portrait) screens so it never clips off-screen.
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const halfH = DEPTH * Math.tan(fovV / 2);
    const halfW = halfH * this.camera.aspect;
    const scale = BASE_SCALE * Math.min(1, halfW / 1.9);
    this.root.scale.setScalar(scale);
    const baseX = halfW * 0.78;
    const baseY = -halfH * 0.84;

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
    this.root.position.set(baseX, baseY + bob, -DEPTH - thrust);
    this.root.rotation.set(BASE_ROT.x + swingX, BASE_ROT.y, BASE_ROT.z + swingZ);
  }
}
