import { t, LOCALES, getLocale, setLocale } from './i18n.js';
import { isNativePlatform, getA11y, setA11y } from './a11y.js';

// Thin DOM layer over elements declared in index.html. No framework.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.time = $('time');
    this.score = $('score');
    this.best = $('best');
    this.toolName = $('toolName');
    this.progLabel = $('progLabel');
    this.progItems = $('progItems');
    this.overlay = $('overlay');
    this.overlayInner = $('overlay-inner');
    this.flourishEl = $('flourish');
    this._onStart = null;
    this.applyStaticText();
  }

  // HUD labels that don't change during play — refreshed on locale change.
  applyStaticText() {
    $('timeLabel').textContent = t('time');
    $('scoreLabel').textContent = t('score');
    $('bestLabel').textContent = t('best');
  }

  setTime(t2) {
    this.time.textContent = t2.toFixed(1);
    this.time.classList.toggle('danger', t2 <= 5);
  }
  setScore(s) {
    this.score.textContent = s;
    this.score.classList.remove('bump');
    void this.score.offsetWidth;
    this.score.classList.add('bump');
  }
  setBest(b) { this.best.textContent = b; }
  setTool(t2) { this.toolName.textContent = t('tool_' + t2.id); }

  // items: [{name, have, need?}] pre-ordered by the caller. `label` is localized.
  setProgress(label, items) {
    this.progLabel.textContent = label;
    this.progItems.innerHTML = items.map(({ name, have, need }) => {
      if (need != null) {
        const done = have >= need ? ' done' : '';
        return `<span class="prog-item${done}">${name} ${Math.min(have, need)}/${need}</span>`;
      }
      return `<span class="prog-item">${name} ${have}</span>`;
    }).join('');
  }

  flourish(text, color) {
    this.flourishEl.textContent = text;
    this.flourishEl.style.color = color;
    this.flourishEl.classList.remove('show');
    void this.flourishEl.offsetWidth;
    this.flourishEl.classList.add('show');
  }

  _languagePicker() {
    const opts = LOCALES.map((l) =>
      `<option value="${l.code}"${l.code === getLocale() ? ' selected' : ''}>${l.name}</option>`).join('');
    return `<select id="langSel" aria-label="Language">${opts}</select>`;
  }

  showStart(onStart) {
    this._onStart = onStart || this._onStart;
    this.overlay.classList.remove('hidden');
    this.overlayInner.innerHTML = `
      <h1>JUSTDIG</h1>
      <p>${t('htp1')}<br>${t('htp2')}<br><b>${t('challenge', { sec: 60 })}</b></p>
      <button id="startBtn">${t('start')}</button>
      ${this._languagePicker()}
      ${isNativePlatform() ? '' : `<button id="a11yBtn" class="linkbtn">${t('a11yOpen')}</button>`}
      <p class="credit">© 2026 Charles Nguyen &amp; Aviah Morag</p>`;
    const b = $('startBtn');
    b.onclick = () => this._onStart && this._onStart();
    this._wireLang(() => this.showStart());
    const ab = $('a11yBtn');
    if (ab) ab.onclick = () => this.showAccessibility();
  }

  // Web-only accessibility settings (iOS follows system settings automatically).
  showAccessibility() {
    const a = getA11y();
    const sizeBtn = (val, key) =>
      `<button class="chip${a.textScale === val ? ' on' : ''}" data-scale="${val}">${t(key)}</button>`;
    this.overlay.classList.remove('hidden');
    this.overlayInner.innerHTML = `
      <h1 class="sub">${t('a11yTitle')}</h1>
      <div class="a11y-item">
        <div class="a11y-label">${t('a11yMotion')}</div>
        <button id="motionToggle" class="switch${a.reduceMotion ? ' on' : ''}" role="switch" aria-checked="${a.reduceMotion}" aria-label="${t('a11yMotion')}"><span class="knob"></span></button>
      </div>
      <div class="a11y-item">
        <div class="a11y-label">${t('a11yText')}</div>
        <div class="chips">${sizeBtn(1, 'sizeS')}${sizeBtn(1.25, 'sizeM')}${sizeBtn(1.5, 'sizeL')}</div>
      </div>
      <button id="a11yBack">${t('back')}</button>`;
    $('motionToggle').onclick = () => { setA11y({ reduceMotion: !getA11y().reduceMotion }); this.showAccessibility(); };
    this.overlayInner.querySelectorAll('[data-scale]').forEach((el) => {
      el.onclick = () => { setA11y({ textScale: Number(el.dataset.scale) }); this.showAccessibility(); };
    });
    $('a11yBack').onclick = () => this.showStart();
  }

  showGameOver(score, best, toolReached, onRestart) {
    this._onStart = onRestart || this._onStart;
    this.overlay.classList.remove('hidden');
    const record = score >= best && score > 0;
    this.overlayInner.innerHTML = `
      <h1>${t('timeUp')}</h1>
      <p class="bigscore">${score}</p>
      <p class="reached">${t('reached', { tool: toolReached })}</p>
      <p>${record ? t('newBest') : t('bestLine', { n: best })}</p>
      <button id="againBtn" class="pending">${t('again')}</button>
      ${this._languagePicker()}`;
    // Reveal the restart button on a delay so tap-momentum from digging can't
    // accidentally start a new run.
    const btn = $('againBtn');
    btn.onclick = null;
    setTimeout(() => {
      btn.classList.remove('pending');
      btn.onclick = () => this._onStart && this._onStart();
    }, 1100);
    this._wireLang(() => this.showGameOver(score, best, toolReached, onRestart));
  }

  _wireLang(rerender) {
    const sel = $('langSel');
    if (!sel) return;
    sel.onchange = async (e) => {
      await setLocale(e.target.value); // lazy-loads the locale's JSON catalog
      this.applyStaticText();
      rerender();
    };
  }

  hideOverlay() { this.overlay.classList.add('hidden'); }
}
