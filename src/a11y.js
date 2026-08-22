// ─────────────────────────────────────────────────────────────────────────────
// ACCESSIBILITY
//   iOS (native): follow system settings automatically — Reduce Motion via the
//     media query, and Dynamic Type by measuring the system body font size.
//   Web: user-controlled via the Accessibility panel (start screen), persisted.
// Exposes reduced-motion + a UI text scale (applied as the --ui-scale CSS var).
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'justdig.a11y';

export const isNativePlatform = () =>
  !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export const systemReduceMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function load() {
  try { return { reduceMotion: false, textScale: 1, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { reduceMotion: false, textScale: 1 }; }
}
let state = load();
export const getA11y = () => state;

// iOS Dynamic Type: measure a `-apple-system-body` element (scales with the
// system text-size setting) against its 17px default to derive a UI scale.
function iosDynamicScale() {
  try {
    const el = document.createElement('span');
    el.style.cssText = 'position:absolute;visibility:hidden;font:-apple-system-body;';
    el.textContent = 'X';
    document.body.appendChild(el);
    const px = parseFloat(getComputedStyle(el).fontSize) || 17;
    el.remove();
    return Math.max(0.85, Math.min(1.7, px / 17));
  } catch { return 1; }
}

export function effectiveReduceMotion() {
  // iOS follows the system; web is manual-only and OFF by default (does not
  // auto-inherit the browser's reduced-motion unless the user opts in).
  return isNativePlatform() ? systemReduceMotion() : state.reduceMotion;
}

export function applyA11y() {
  const scale = isNativePlatform() ? iosDynamicScale() : state.textScale;
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

export function setA11y(patch) {
  state = { ...state, ...patch };
  localStorage.setItem(KEY, JSON.stringify(state));
  applyA11y();
}
