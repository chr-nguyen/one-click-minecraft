import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// DESCENT BACKGROUND — ONE tall cross-section of the earth (sky → grass → dirt →
// stone → ore caves → lava), shown through a screen-filling plane parented to the
// camera. Each shovel tier reveals a deeper slice; leveling up SCROLLS the view
// down through the strip, so progression literally feels like digging deeper.
// Low-res + nearest-filtered for the chunky 8-bit look.
// ─────────────────────────────────────────────────────────────────────────────

const W = 120, H = 900;      // tall strip
const TIERS = 8;             // hand … gold
const WINDOW = 0.26;         // fraction of the strip visible at once
const DEPTH = 60;            // how far behind the camera the plane sits

// Continuous top→bottom gradient (canvas y=0 is the sky).
const STOPS = [
  [0.00, '#8ecbff'], [0.09, '#bfe3ff'], [0.11, '#5fbf4a'], [0.15, '#6b4a2b'],
  [0.27, '#7a5433'], [0.40, '#5a5f68'], [0.53, '#3c424b'], [0.66, '#2f343b'],
  [0.80, '#2c2620'], [0.90, '#7a1f0f'], [1.00, '#ff6a1f'],
];

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const lerp = (a, b, t) => a + (b - a) * t;

function gradientAt(t) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [p0, c0] = STOPS[i], [p1, c1] = STOPS[i + 1];
    if (t >= p0 && t <= p1) {
      const k = (t - p0) / (p1 - p0 || 1), a = hexRgb(c0), b = hexRgb(c1);
      return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    }
  }
  return hexRgb(STOPS[STOPS.length - 1][1]);
}

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function earthTexture() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const base = gradientAt(t);
    for (let x = 0; x < W; x++) {
      let [r, g, b] = base;
      if (t > 0.16 && hash(x >> 1, y >> 1) > 0.87) {            // rocky speckles
        const dark = t < 0.9 ? 0.6 : 0.4;
        r *= dark; g *= dark; b *= dark;
      }
      if (t > 0.44 && t < 0.6 && hash(x + 3, y) > 0.95) { r = 200; g = 121; b = 47; } // iron/copper flecks
      if (t > 0.9 && hash(x, y + 7) > 0.72) { r = 255; g = lerp(g, 205, 0.7); b = lerp(b, 40, 0.7); } // lava shimmer
      if (t < 0.09 && hash(x >> 3, y >> 2) > 0.94) { r = g = b = 245; } // sky clouds
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1, WINDOW);
  return tex;
}

// UV offset so a tier's slice is visible (v=1 is sky/top → tier 0; v=0 is lava).
const offsetFor = (tier) => (1 - WINDOW) * (1 - Math.max(0, Math.min(TIERS - 1, tier)) / (TIERS - 1));

export class Background {
  constructor(scene, camera) {
    this.camera = camera;
    this.tex = earthTexture();
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = -1;      // draw behind everything
    this.mesh.position.set(0, 0, -DEPTH);
    camera.add(this.mesh);
    this.offset = offsetFor(0);
    this.target = this.offset;
    this.tex.offset.y = this.offset;
    this.resize();
  }

  setTier(tier, animate = true) {
    this.target = offsetFor(tier);
    if (!animate) { this.offset = this.target; this.tex.offset.y = this.offset; }
  }

  resize() {
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const h = 2 * DEPTH * Math.tan(fovV / 2);
    // Over-scale generously so the backdrop always covers the whole screen,
    // even with the camera's downward tilt and screen shake.
    this.mesh.scale.set(h * this.camera.aspect * 1.35, h * 1.4, 1);
  }

  update(dt) {
    if (Math.abs(this.target - this.offset) > 0.0005) {
      this.offset += (this.target - this.offset) * Math.min(1, dt * 3.5); // smooth scroll
      this.tex.offset.y = this.offset;
    }
  }
}
