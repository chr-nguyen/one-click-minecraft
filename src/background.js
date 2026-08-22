import * as THREE from 'three';

import handUrl from './assets/backgrounds/grassy-field.jpg';
import clayUrl from './assets/backgrounds/cliff-valley.jpg';
import stoneUrl from './assets/backgrounds/stone-quarry.jpg';
import ironUrl from './assets/backgrounds/cave-overlook.jpg';
import steelUrl from './assets/backgrounds/steel-granite-depth.jpg';
import copperUrl from './assets/backgrounds/copper-cavern.jpg';
import bronzeUrl from './assets/backgrounds/bronze-depth.jpg';
import goldUrl from './assets/backgrounds/lava-cave.jpg';

// ─────────────────────────────────────────────────────────────────────────────
// DESCENT BACKGROUND — Aviah's tier-driven background API, backed by the eight
// authored voxel environments. Recipe upgrades call setTier(tool.tier), which
// slides and crossfades into the matching deeper scene.
// ─────────────────────────────────────────────────────────────────────────────

const DEPTH = 60;
const TRANSITION_SECONDS = 1.35;
const TIER_URLS = [
  handUrl,
  clayUrl,
  stoneUrl,
  ironUrl,
  steelUrl,
  copperUrl,
  bronzeUrl,
  goldUrl,
];

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uFrom;
  uniform sampler2D uTo;
  uniform float uMix;
  uniform float uFromTier;
  uniform float uToTier;
  uniform float uViewAspect;
  varying vec2 vUv;

  vec2 coverUv(vec2 uv) {
    vec2 centered = uv - 0.5;
    if (uViewAspect > 1.5) {
      centered.y *= 1.5 / uViewAspect;
    } else {
      centered.x *= uViewAspect / 1.5;
    }
    return centered + 0.5;
  }

  vec4 blurred(sampler2D map, vec2 uv) {
    vec2 blur = vec2(7.0 / 1536.0, 7.0 / 1024.0);
    vec4 color = texture2D(map, uv) * 0.20;
    color += texture2D(map, uv + vec2( blur.x, 0.0)) * 0.12;
    color += texture2D(map, uv + vec2(-blur.x, 0.0)) * 0.12;
    color += texture2D(map, uv + vec2(0.0,  blur.y)) * 0.12;
    color += texture2D(map, uv + vec2(0.0, -blur.y)) * 0.12;
    color += texture2D(map, uv + vec2( blur.x,  blur.y)) * 0.08;
    color += texture2D(map, uv + vec2(-blur.x,  blur.y)) * 0.08;
    color += texture2D(map, uv + vec2( blur.x, -blur.y)) * 0.08;
    color += texture2D(map, uv + vec2(-blur.x, -blur.y)) * 0.08;
    return color;
  }

  vec3 gradeForTier(vec3 color, float tier) {
    float depth = smoothstep(0.0, 1.0, clamp(tier / 7.0, 0.0, 1.0));
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Keep every scene vivid while moving from warm daylight into a deeper,
    // red-violet cast with stronger contrast.
    float saturation = mix(1.18, 1.34, depth);
    color = mix(vec3(luminance), color, saturation);
    color *= mix(vec3(1.10, 1.06, 0.96), vec3(1.02, 0.82, 0.90), depth);

    float contrast = mix(1.05, 1.18, depth);
    color = (color - 0.5) * contrast + 0.5;
    color *= mix(1.18, 0.92, depth);
    return clamp(color, 0.0, 1.0);
  }

  void main() {
    vec2 fromUv = coverUv(vUv + vec2(0.0, -0.06 * uMix));
    vec2 toUv = coverUv(vUv + vec2(0.0, 0.06 * (1.0 - uMix)));
    vec3 fromColor = gradeForTier(blurred(uFrom, fromUv).rgb, uFromTier);
    vec3 toColor = gradeForTier(blurred(uTo, toUv).rgb, uToTier);
    vec3 color = mix(fromColor, toColor, uMix);

    float tier = mix(uFromTier, uToTier, uMix);
    float depth = smoothstep(0.0, 1.0, clamp(tier / 7.0, 0.0, 1.0));
    float edge = smoothstep(0.20, 0.72, distance(vUv, vec2(0.5)));
    color *= mix(0.98, 0.88, depth) - edge * mix(0.08, 0.20, depth);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function loadTexture(url) {
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFrom: { value: texture },
      uTo: { value: texture },
      uMix: { value: 0 },
      uFromTier: { value: 0 },
      uToTier: { value: 0 },
      uViewAspect: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

export class Background {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.textures = TIER_URLS.map(loadTexture);
    this.material = makeMaterial(this.textures[0]);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.position.set(0, 0, -DEPTH);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);

    this.currentTier = 0;
    this.targetTier = 0;
    this.transition = 1;
    this.transitioning = false;
    this.resize();
  }

  setTier(tier, animate = true) {
    const nextTier = Math.max(0, Math.min(TIER_URLS.length - 1, Math.round(tier)));
    if (!animate) {
      this.currentTier = nextTier;
      this.targetTier = nextTier;
      this.transition = 1;
      this.transitioning = false;
      this.material.uniforms.uFrom.value = this.textures[nextTier];
      this.material.uniforms.uTo.value = this.textures[nextTier];
      this.material.uniforms.uMix.value = 0;
      this.material.uniforms.uFromTier.value = nextTier;
      this.material.uniforms.uToTier.value = nextTier;
      return;
    }
    if (nextTier === this.currentTier && !this.transitioning) return;

    if (this.transitioning) this._finishTransition();
    this.targetTier = nextTier;
    this.transition = 0;
    this.transitioning = true;
    this.material.uniforms.uFrom.value = this.textures[this.currentTier];
    this.material.uniforms.uTo.value = this.textures[nextTier];
    this.material.uniforms.uMix.value = 0;
    this.material.uniforms.uFromTier.value = this.currentTier;
    this.material.uniforms.uToTier.value = nextTier;
  }

  resize() {
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const h = 2 * DEPTH * Math.tan(fovV / 2);
    const w = h * this.camera.aspect;
    this.mesh.scale.set(w * 1.04, h * 1.04, 1);
    this.material.uniforms.uViewAspect.value = this.camera.aspect;
  }

  update(dt) {
    if (!this.transitioning) return;

    this.transition = Math.min(1, this.transition + dt / TRANSITION_SECONDS);
    const t = this.transition * this.transition * (3 - 2 * this.transition);
    this.material.uniforms.uMix.value = t;

    if (this.transition >= 1) this._finishTransition();
  }

  _finishTransition() {
    this.currentTier = this.targetTier;
    this.transition = 1;
    this.transitioning = false;
    this.material.uniforms.uFrom.value = this.textures[this.currentTier];
    this.material.uniforms.uTo.value = this.textures[this.currentTier];
    this.material.uniforms.uMix.value = 0;
    this.material.uniforms.uFromTier.value = this.currentTier;
    this.material.uniforms.uToTier.value = this.currentTier;
  }
}
