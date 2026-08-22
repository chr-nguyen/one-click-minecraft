import './style.css';
import { initI18n } from './i18n.js';
import { applyA11y } from './a11y.js';
import { Game } from './game.js';

initI18n();
applyA11y();
const canvas = document.getElementById('scene');
new Game(canvas);
