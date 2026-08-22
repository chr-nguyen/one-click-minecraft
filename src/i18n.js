import { IntlMessageFormat } from 'intl-messageformat';
import en from './locales/en.json'; // bundled: default locale + fallback

// ─────────────────────────────────────────────────────────────────────────────
// i18n — ICU MessageFormat with per-locale JSON catalogs, lazy-loaded on demand.
// English is bundled (default + fallback for any missing key). Other locales are
// code-split and fetched only when selected. RTL + per-script fonts via <html>.
// ─────────────────────────────────────────────────────────────────────────────

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

// Vite code-splits each JSON into its own lazy chunk.
const loaders = import.meta.glob('./locales/*.json');

let current = DEFAULT;
const catalogs = { en };          // loaded catalogs by code
const cache = new Map();          // `${locale}:${key}` → IntlMessageFormat

export const getLocale = () => current;
export const localeMeta = (code = current) => BY_CODE.get(code) || BY_CODE.get(DEFAULT);

async function loadCatalog(code) {
  if (catalogs[code]) return;
  const loader = loaders[`./locales/${code}.json`];
  if (!loader) return; // unknown → English fallback
  const mod = await loader();
  catalogs[code] = mod.default || mod;
}

export async function setLocale(code) {
  if (!BY_CODE.has(code)) code = DEFAULT;
  await loadCatalog(code);
  current = code;
  localStorage.setItem('justdig.lang', code);
  const meta = localeMeta(code);
  const root = document.documentElement;
  root.lang = code;
  root.dir = meta.rtl ? 'rtl' : 'ltr';
  root.setAttribute('data-script', meta.script);
}

// Translate `key` with optional ICU `values`. Falls back to English, then key.
export function t(key, values) {
  const cat = catalogs[current] || catalogs[DEFAULT];
  const msg = (cat && cat[key]) ?? catalogs[DEFAULT][key];
  if (msg == null) return key;
  const ck = current + ':' + key;
  let f = cache.get(ck);
  if (!f) {
    try { f = new IntlMessageFormat(msg, current); }
    catch { f = new IntlMessageFormat(catalogs[DEFAULT][key] || key, DEFAULT); }
    cache.set(ck, f);
  }
  try { return f.format(values); } catch { return msg; }
}

function pickInitial() {
  // English by default; honor only an explicit prior choice (no browser match).
  const saved = localStorage.getItem('justdig.lang');
  return saved && BY_CODE.has(saved) ? saved : DEFAULT;
}

export async function initI18n() { await setLocale(pickInitial()); }
