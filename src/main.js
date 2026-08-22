import './style.css';
import { initI18n } from './i18n.js';
import { applyA11y } from './a11y.js';
import { Game } from './game.js';

// Load the saved/default locale before first render, then boot.
initI18n().then(() => {
  applyA11y();
  new Game(document.getElementById('scene'));
});
