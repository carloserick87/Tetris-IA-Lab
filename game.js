'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const BOMB = 9;
const BOMB_EVERY = 5;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
  '#ff5252', // B - bomba (fuera de PIECES)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca, hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const MAX_START_LEVEL = 10;

const GRID_COLORS = { dark: '#22222e', light: '#dcdce6' };

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const gameoverBox = document.getElementById('gameover-box');
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, nextBombAt, bombPending;
let theme = 'dark';
let startLevel = 1;
let menuOpen = false;

function levelInterval(l) {
  return Math.max(100, 1000 - (l - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function bombPiece() {
  return { type: BOMB, shape: [[BOMB]], x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = levelInterval(level);
    if (lines >= nextBombAt) {
      bombPending = true;
      nextBombAt += BOMB_EVERY;
    }
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function explode(cx, cy) {
  let destroyed = 0;
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++)
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS && board[y][x]) {
        board[y][x] = 0;
        destroyed++;
      }
  score += destroyed * 10 * level;
}

function lockPiece() {
  if (current.type === BOMB) {
    explode(current.x, current.y);
  } else {
    merge();
    clearLines();
  }
  spawn();
}

function spawn() {
  current = next;
  next = bombPending ? bombPiece() : randomPiece();
  bombPending = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (colorIndex === BOMB) {
    context.fillStyle = 'rgba(0,0,0,0.6)';
    context.beginPath();
    context.arc(x * size + size / 2, y * size + size / 2, size * 0.3, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  menuOpen = false;
  cancelAnimationFrame(animId);
  animId = null;
  pauseMenu.classList.add('hidden');
  gameoverBox.classList.remove('hidden');
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function menuItems() {
  const view = pauseMain.classList.contains('hidden') ? pauseControls : pauseMain;
  return Array.from(view.querySelectorAll('.menu-btn, .menu-select'));
}

function focusItem(index) {
  const items = menuItems();
  if (!items.length) return;
  const i = (index + items.length) % items.length;
  items[i].focus();
}

function moveFocus(delta) {
  const items = menuItems();
  const at = items.indexOf(document.activeElement);
  focusItem(at === -1 ? 0 : at + delta);
}

function showMenuView(view) {
  pauseMain.classList.toggle('hidden', view !== 'main');
  pauseControls.classList.toggle('hidden', view === 'main');
  focusItem(0);
}

function openMenu() {
  if (gameOver || menuOpen) return;
  paused = true;
  menuOpen = true;
  cancelAnimationFrame(animId);
  animId = null;
  gameoverBox.classList.add('hidden');
  pauseMenu.classList.remove('hidden');
  overlay.classList.remove('hidden');
  startLevelSelect.value = String(startLevel);
  showMenuView('main');
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  paused = false;
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  gameoverBox.classList.remove('hidden');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (gameOver) return;
  lastTime = performance.now();
  dropAccum = 0;
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (menuOpen) closeMenu();
  else openMenu();
}

function loop(ts) {
  if (paused || gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  paused = false;
  gameOver = false;
  menuOpen = false;
  level = startLevel;
  dropInterval = levelInterval(startLevel);
  dropAccum = 0;
  nextBombAt = BOMB_EVERY;
  bombPending = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  gameoverBox.classList.remove('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function handleMenuKey(e) {
  // Con el menu abierto ninguna tecla llega al juego (salvo atajos del navegador).
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyP':
    case 'Escape':
      if (pauseMain.classList.contains('hidden')) showMenuView('main');
      else closeMenu();
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      // Dentro del selector, las flechas cambian de opcion (lo gestiona el navegador).
      if (document.activeElement === startLevelSelect) {
        startLevelSelect.selectedIndex = Math.min(
          startLevelSelect.options.length - 1,
          Math.max(0, startLevelSelect.selectedIndex + (e.code === 'ArrowDown' ? 1 : -1))
        );
        startLevelSelect.dispatchEvent(new Event('change'));
      } else {
        moveFocus(e.code === 'ArrowDown' ? 1 : -1);
      }
      break;
    case 'Enter':
    case 'Space':
      if (document.activeElement && document.activeElement.classList.contains('menu-btn')) {
        document.activeElement.click();
      }
      break;
    case 'Tab':
      moveFocus(e.shiftKey ? -1 : 1);
      break;
  }
}

document.addEventListener('keydown', e => {
  if (menuOpen) { handleMenuKey(e); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { openMenu(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

pauseMenu.addEventListener('click', e => {
  const btn = e.target.closest('.menu-btn');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'resume': closeMenu(); break;
    case 'restart': btn.blur(); menuOpen = false; init(); break;
    case 'controls': showMenuView('controls'); break;
    case 'back': showMenuView('main'); break;
  }
});

startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
  localStorage.setItem('tetris-start-level', startLevel);
});

function initStartLevel() {
  for (let l = 1; l <= MAX_START_LEVEL; l++) {
    const opt = document.createElement('option');
    opt.value = String(l);
    opt.textContent = String(l);
    startLevelSelect.appendChild(opt);
  }
  const stored = Number(localStorage.getItem('tetris-start-level'));
  startLevel = Number.isInteger(stored) && stored >= 1 && stored <= MAX_START_LEVEL ? stored : 1;
  startLevelSelect.value = String(startLevel);
}

function setTheme(t) {
  theme = t;
  document.body.classList.toggle('light-theme', theme === 'light');
  localStorage.setItem('tetris-theme', theme);
}

themeToggle.addEventListener('change', () => {
  setTheme(themeToggle.checked ? 'light' : 'dark');
  draw();
  drawNext();
});

setTheme(localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark');
themeToggle.checked = theme === 'light';

initStartLevel();
init();
