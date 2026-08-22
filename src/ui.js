// Thin DOM layer over elements declared in index.html. No framework.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.time = $('time');
    this.score = $('score');
    this.best = $('best');
    this.toolName = $('toolName');
    this.overlay = $('overlay');
    this.overlayInner = $('overlay-inner');
    this.flourishEl = $('flourish');
  }

  setTime(t) {
    this.time.textContent = t.toFixed(1);
    this.time.classList.toggle('danger', t <= 5);
  }
  setScore(s) {
    this.score.textContent = s;
    this.score.classList.remove('bump');
    void this.score.offsetWidth; // restart animation
    this.score.classList.add('bump');
  }
  setBest(b) { this.best.textContent = b; }
  setTool(t, upgraded = false) {
    this.toolName.textContent = t.name;
    if (upgraded) {
      this.toolName.classList.remove('upgraded');
      void this.toolName.offsetWidth;
      this.toolName.classList.add('upgraded');
    }
  }

  flourish(text, color) {
    this.flourishEl.textContent = text;
    this.flourishEl.style.color = color;
    this.flourishEl.classList.remove('show');
    void this.flourishEl.offsetWidth;
    this.flourishEl.classList.add('show');
  }

  showStart(onStart) {
    this.overlay.classList.remove('hidden');
    this.overlayInner.innerHTML = `
      <h1>JUSTDIG</h1>
      <p>Tap to smash blocks and collect their materials.<br>
         Your shovel upgrades itself as you dig — automatically.<br>
         <b>60 seconds. How many blocks can you crack?</b></p>
      <button id="startBtn">START DIGGING</button>
      <p class="credit">© 2026 Charles Nguyen &amp; Aviah Morag</p>`;
    $('startBtn').onclick = onStart;
  }

  showGameOver(score, best, onRestart) {
    this.overlay.classList.remove('hidden');
    const record = score >= best && score > 0;
    this.overlayInner.innerHTML = `
      <h1>TIME!</h1>
      <p class="bigscore">${score}</p>
      <p>${record ? '🏆 NEW BEST!' : `Best: ${best}`}</p>
      <button id="againBtn">GO AGAIN</button>`;
    $('againBtn').onclick = onRestart;
  }

  hideOverlay() { this.overlay.classList.add('hidden'); }
}
