import './style.css';
import { initI18n } from './i18n.js';
import { Game } from './game.js';

initI18n();
const canvas = document.getElementById('scene');
new Game(canvas);
