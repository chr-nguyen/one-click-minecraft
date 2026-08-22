import { IntlMessageFormat } from 'intl-messageformat';
import { MESSAGES } from './locales.js';

// ─────────────────────────────────────────────────────────────────────────────
// i18n — ICU MessageFormat, RTL, and per-script fonts.
//
// Locales are drop-in: add an entry to LOCALES + a block in locales.js.
// Missing keys fall back to English, so partial translations still run.
// Press Start 2P only covers Latin-1, so non-Latin (and heavy-diacritic)
// locales switch to a readable system font via `pixel: false`.
// ─────────────────────────────────────────────────────────────────────────────

// `script` selects the pixel font (see fonts.css). Darija is written in Latin
// (Arabizi/French-style), so it's LTR + Latin.
export const LOCALES = [
  { code: 'en',    name: 'English',              rtl: false, script: 'latin'    },
  { code: 'es',    name: 'Español',              rtl: false, script: 'latin'    },
  { code: 'fr',    name: 'Français',             rtl: false, script: 'latin'    },
  { code: 'pt-BR', name: 'Português (Brasil)',   rtl: false, script: 'latin'    },
  { code: 'pt-PT', name: 'Português (Portugal)', rtl: false, script: 'latin'    },
  { code: 'gl',    name: 'Galego',               rtl: false, script: 'latin'    },
  { code: 'ary',   name: 'Darija',               rtl: false, script: 'latin'    },
  { code: 'cs',    name: 'Čeština',              rtl: false, script: 'latinExt' },
  { code: 'sk',    name: 'Slovenčina',           rtl: false, script: 'latinExt' },
  { code: 'vi',    name: 'Tiếng Việt',           rtl: false, script: 'latinExt' },
  { code: 'ru',    name: 'Русский',              rtl: false, script: 'cyrillic' },
  { code: 'uk',    name: 'Українська',           rtl: false, script: 'cyrillic' },
  { code: 'bg',    name: 'Български',             rtl: false, script: 'cyrillic' },
  { code: 'ja',    name: '日本語',                rtl: false, script: 'cjk'      },
  { code: 'he',    name: 'עברית',                rtl: true,  script: 'hebrew'   },
];

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));
const DEFAULT = 'en';

let current = DEFAULT;
const cache = new Map(); // `${locale}:${key}` → IntlMessageFormat

function pickInitial() {
  const saved = localStorage.getItem('justdig.lang');
  if (saved && BY_CODE.has(saved)) return saved;
  const navs = navigator.languages || [navigator.language || 'en'];
  for (const n of navs) {
    if (BY_CODE.has(n)) return n;                       // exact (e.g. pt-BR)
    const base = n.split('-')[0];
    const hit = LOCALES.find((l) => l.code === base || l.code.startsWith(base + '-'));
    if (hit) return hit.code;
  }
  return DEFAULT;
}

export function getLocale() { return current; }
export function localeMeta(code = current) { return BY_CODE.get(code) || BY_CODE.get(DEFAULT); }

export function setLocale(code) {
  if (!BY_CODE.has(code)) code = DEFAULT;
  current = code;
  localStorage.setItem('justdig.lang', code);
  const meta = localeMeta(code);
  const root = document.documentElement;
  root.lang = code;
  root.dir = meta.rtl ? 'rtl' : 'ltr';
  root.setAttribute('data-pixel', meta.pixel ? '1' : '0');
}

// Translate `key` with optional ICU `values`. Falls back to English, then key.
export function t(key, values) {
  const msg = (MESSAGES[current] && MESSAGES[current][key]) ?? MESSAGES[DEFAULT][key];
  if (msg == null) return key;
  const ck = current + ':' + key;
  let f = cache.get(ck);
  if (!f) {
    try { f = new IntlMessageFormat(msg, current); }
    catch { f = new IntlMessageFormat(MESSAGES[DEFAULT][key] || key, DEFAULT); }
    cache.set(ck, f);
  }
  try { return f.format(values); } catch { return msg; }
}

export function initI18n() { setLocale(pickInitial()); }
