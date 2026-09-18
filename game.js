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

// Paletas alternativas: mismo orden e indices que COLORS (0 vacio ... 8 tuerca, 9 bomba)
const COLORS_NEON = [
  null,
  '#00f0ff', // I
  '#fff700', // O
  '#c04dff', // T
  '#39ff6a', // S
  '#ff2d6f', // Z
  '#2d7bff', // J
  '#ff9d00', // L
  '#d8f0ff', // N
  '#ff3131', // B
];

const COLORS_PASTEL = [
  null,
  '#a8e6e4', // I
  '#fdf0b5', // O
  '#d9c2ef', // T
  '#bfe6c4', // S
  '#f5c2c2', // Z
  '#c3d9f5', // J
  '#fad7b0', // L
  '#dcdfe4', // N
  '#f2a6a6', // B
];

const COLORS_PIXEL = [
  null,
  '#3a9aa8', // I
  '#cfa63a', // O
  '#8e4fa3', // T
  '#5f9e61', // S
  '#b04a4a', // Z
  '#4a6fa8', // J
  '#c07a33', // L
  '#8a8f96', // N
  '#c43c3c', // B
];

// Cada skin define paleta, funcion de dibujo de bloque y (salvo retro) color de rejilla.
// themeable: true -> respeta el toggle claro/oscuro; false -> la skin impone su propio fondo.
const SKINS = {
  retro:  { label: 'Retro',  colors: COLORS,        draw: drawBlockRetro,  themeable: true },
  neon:   { label: 'Neon',   colors: COLORS_NEON,   draw: drawBlockNeon,   themeable: false, grid: '#1b1b33' },
  pastel: { label: 'Pastel', colors: COLORS_PASTEL, draw: drawBlockPastel, themeable: false, grid: '#e4dcef' },
  pixel:  { label: 'Pixel',  colors: COLORS_PIXEL,  draw: drawBlockPixel,  themeable: false, grid: '#3a352b' },
};

const SKIN_KEY = 'tetris-skin';
const THEME_KEY = 'tetris-theme';

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
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, nextBombAt, bombPending;
let theme = 'dark';
let skin = 'retro';

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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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

// Aclara (amount > 0) u oscurece (amount < 0) un color '#rrggbb'.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => {
    const t = amount > 0 ? 255 : 0;
    return Math.round(v + (t - v) * Math.abs(amount));
  });
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

// Camino rectangular con esquinas redondeadas (respaldo si no hay roundRect nativo).
function roundRectPath(context, px, py, w, h, r) {
  if (context.roundRect) {
    context.beginPath();
    context.roundRect(px, py, w, h, r);
    return;
  }
  context.beginPath();
  context.moveTo(px + r, py);
  context.arcTo(px + w, py, px + w, py + h, r);
  context.arcTo(px + w, py + h, px, py + h, r);
  context.arcTo(px, py + h, px, py, r);
  context.arcTo(px, py, px + w, py, r);
  context.closePath();
}

function drawBlockRetro(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawBlockNeon(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = 'rgba(0,0,0,0.55)';
  context.fillRect(px + 2, py + 2, size - 4, size - 4);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 2.5, py + 2.5, size - 5, size - 5);
  // sin reset el glow contamina rejilla, fantasma y resto del frame
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
}

function drawBlockPastel(context, px, py, size, color) {
  const r = size * 0.28;
  roundRectPath(context, px + 1, py + 1, size - 2, size - 2, r);
  context.fillStyle = color;
  context.fill();
  context.save();
  context.clip();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px + 1, py + 1, size - 2, size * 0.32);
  context.restore();
  context.strokeStyle = shade(color, -0.18);
  context.lineWidth = 1;
  roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
  context.stroke();
}

// Posiciones fijas (fraccion de celda) del dither: deterministas, no parpadean entre frames.
const PIXEL_DITHER = [[0.30, 0.45], [0.55, 0.30], [0.65, 0.65], [0.40, 0.72]];

function drawBlockPixel(context, px, py, size, color) {
  const b = 3;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // bisel
  context.fillStyle = shade(color, 0.35);
  context.fillRect(px, py, size, b);
  context.fillRect(px, py, b, size);
  context.fillStyle = shade(color, -0.35);
  context.fillRect(px, py + size - b, size, b);
  context.fillRect(px + size - b, py, b, size);
  // textura
  const dot = Math.max(2, Math.round(size / 10));
  for (let i = 0; i < PIXEL_DITHER.length; i++) {
    context.fillStyle = i % 2 ? shade(color, 0.22) : shade(color, -0.22);
    context.fillRect(px + PIXEL_DITHER[i][0] * size, py + PIXEL_DITHER[i][1] * size, dot, dot);
  }
}

function drawBombMark(context, px, py, size) {
  context.fillStyle = 'rgba(0,0,0,0.6)';
  context.beginPath();
  context.arc(px + size / 2, py + size / 2, size * 0.3, 0, Math.PI * 2);
  context.fill();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const s = SKINS[skin];
  const px = x * size;
  const py = y * size;
  context.globalAlpha = alpha ?? 1;
  s.draw(context, px, py, size, s.colors[colorIndex]);
  if (colorIndex === BOMB) drawBombMark(context, px, py, size);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skin].grid ?? GRID_COLORS[theme];
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
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
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
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  nextBombAt = BOMB_EVERY;
  bombPending = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
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

function setTheme(t) {
  theme = t;
  // el tema claro solo se aplica en skins themeable; la preferencia se guarda igual
  document.body.classList.toggle('light-theme', theme === 'light' && SKINS[skin].themeable);
  localStorage.setItem(THEME_KEY, theme);
}

function applySkin(name, repaint) {
  skin = SKINS[name] ? name : 'retro';
  document.body.dataset.skin = skin;
  const themeable = SKINS[skin].themeable;
  document.body.classList.toggle('light-theme', themeable && theme === 'light');
  themeToggle.disabled = !themeable;
  localStorage.setItem(SKIN_KEY, skin);
  // en pausa o game over el rAF esta cancelado: hay que repintar a mano
  if (repaint) {
    draw();
    drawNext();
  }
}

themeToggle.addEventListener('change', () => {
  setTheme(themeToggle.checked ? 'light' : 'dark');
  draw();
  drawNext();
});

skinSelect.addEventListener('change', () => applySkin(skinSelect.value, true));

theme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
themeToggle.checked = theme === 'light';
applySkin(localStorage.getItem(SKIN_KEY), false);
skinSelect.value = skin;
setTheme(theme);

init();
