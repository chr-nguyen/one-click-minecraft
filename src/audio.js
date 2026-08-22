// Procedural sound — all synthesized via WebAudio, no asset files.
// Kept deliberately punchy and short for arcade feedback.

let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

// Browsers suspend audio until a user gesture; resume on first interaction.
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(dur) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// A filtered noise burst — the base "impact" texture.
function burst({ dur = 0.09, freq = 1200, q = 1, type = 'lowpass', gain = 0.6 }) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start();
  src.stop(ctx.currentTime + dur);
}

function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.3, slideTo = null }) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g); g.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

// ── Per-material sound families ──────────────────────────────────────────────
// A material names a family; adding a family here gives every material that
// references it a distinct dig/break voice. `pitch` (from material.dyn) shifts it.
const SOUND_FAMILIES = {
  soft:    { tickF: 550,  tickQ: 1, breakF: 300,  breakQ: 0.6, thud: 150, ring: false },
  rock:    { tickF: 1100, tickQ: 2, breakF: 620,  breakQ: 0.7, thud: 150, ring: false },
  crystal: { tickF: 2200, tickQ: 7, breakF: 1500, breakQ: 5,   thud: 380, ring: true },
  metal:   { tickF: 1700, tickQ: 8, breakF: 900,  breakQ: 4,   thud: 220, ring: true },
};

export function digSound(matDef) {
  const f = SOUND_FAMILIES[matDef.family] || SOUND_FAMILIES.rock;
  const p = matDef.dyn.pitch;
  burst({ dur: 0.05, freq: f.tickF * p, q: f.tickQ, gain: 0.22 });
  if (f.ring) tone({ freq: f.tickF * p * 1.5, dur: 0.05, type: 'sine', gain: 0.06 });
}

export function breakSound(matDef) {
  const f = SOUND_FAMILIES[matDef.family] || SOUND_FAMILIES.rock;
  const p = matDef.dyn.pitch;
  burst({ dur: 0.13, freq: f.breakF * p, q: f.breakQ, gain: 0.5 });
  tone({ freq: f.thud * p, dur: 0.11, type: 'triangle', gain: 0.18 });
  if (f.ring) tone({ freq: f.breakF * p * 2, dur: 0.25, type: 'sine', gain: 0.12, slideTo: f.breakF * p });
}

// ── SFX vocabulary ───────────────────────────────────────────────────────────
export const sfx = {
  // light tick when a voxel is damaged but not broken; freq varies with hardness
  tick: (hardness = 1) => burst({ dur: 0.05, freq: 800 + hardness * 350, q: 2, gain: 0.25 }),
  // satisfying crunch when a voxel shatters
  shatter: (hardness = 1) => {
    burst({ dur: 0.12, freq: 500 + hardness * 180, q: 0.7, gain: 0.5 });
    tone({ freq: 180 - hardness * 12, dur: 0.1, type: 'triangle', gain: 0.18 });
  },
  // rising sparkle on extraction, pitched up by rarity
  reveal: (rarityScore = 1) => {
    const base = 520 + rarityScore * 18;
    tone({ freq: base, dur: 0.18, type: 'triangle', gain: 0.3, slideTo: base * 2 });
    setTimeout(() => tone({ freq: base * 1.5, dur: 0.22, type: 'sine', gain: 0.25, slideTo: base * 3 }), 60);
  },
  combo: (n = 1) => tone({ freq: 400 + n * 60, dur: 0.09, type: 'square', gain: 0.18 }),
  start: () => tone({ freq: 300, dur: 0.25, type: 'sawtooth', gain: 0.2, slideTo: 600 }),
  end: () => { tone({ freq: 400, dur: 0.4, type: 'sawtooth', gain: 0.25, slideTo: 120 }); },
  tickClock: () => tone({ freq: 900, dur: 0.04, type: 'square', gain: 0.15 }),
};
