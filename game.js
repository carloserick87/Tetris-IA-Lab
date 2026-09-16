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

const GRID_COLORS = { dark: '#22222e', light: '#dcdce6' };

// Camino de rectángulo con esquinas redondeadas (sin depender de ctx.roundRect)
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Skins: misma indexación que COLORS (0 vacío, 1–8 piezas, 9 bomba).
// grid/boardBg pueden ser string o { dark, light }; boardBg null = usa --board-bg del CSS.
const SKINS = {
  retro: {
    colors: COLORS,
    grid: GRID_COLORS,
    boardBg: null,
    drawBlock(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff9100', '#e0e0ff', '#ff1744'],
    grid: '#10131c',
    boardBg: '#000000',
    drawBlock(context, px, py, size, color, colorIndex, alpha) {
      // glow sutil para el ghost
      context.shadowColor = color;
      context.shadowBlur = alpha < 1 ? size * 0.15 : size * 0.5;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.fillStyle = color;
      const a = context.globalAlpha;
      context.globalAlpha = a * (colorIndex === BOMB ? 0.8 : 0.35); // bomba rellena para que se vea el marcador
      context.fillRect(px + 4, py + 4, size - 8, size - 8);
      context.globalAlpha = a;
    },
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff3b0', '#d7b8f3', '#b9f2c0', '#ffb3ba', '#bcd4ff', '#ffd6a5', '#d5dbe0', '#ff9aa2'],
    grid: { dark: '#2e2b3a', light: '#efe6ee' },
    boardBg: { dark: '#221f2b', light: '#fffaf5' },
    drawBlock(context, px, py, size, color) {
      const r = size * 0.25;
      roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.6)';
      context.lineWidth = 1.5;
      context.stroke();
      // brillo suave
      roundRectPath(context, px + 5, py + 5, size - 10, size * 0.22, size * 0.1);
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fill();
    },
  },
  pixel: {
    colors: [null, '#29adff', '#ffec27', '#a05aff', '#00e436', '#ff004d', '#3d5afe', '#ffa300', '#83769c', '#ff2e2e'],
    grid: { dark: '#1c1c28', light: '#d6d0bf' },
    boardBg: { dark: '#0e0e16', light: '#ece6d4' },
    drawBlock(context, px, py, size, color) {
      const u = size / 10; // "píxel" lógico: 10×10 por bloque
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      // textura determinista (dither)
      for (let i = 2; i < 8; i++)
        for (let j = 2; j < 8; j++) {
          if ((i + j) % 4 === 0) context.fillStyle = 'rgba(255,255,255,0.25)';
          else if ((i * 3 + j) % 5 === 0) context.fillStyle = 'rgba(0,0,0,0.18)';
          else continue;
          context.fillRect(px + i * u, py + j * u, u, u);
        }
      // bisel: claro arriba/izquierda, oscuro abajo/derecha
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fillRect(px + u, py + u, size - 2 * u, u);
      context.fillRect(px + u, py + u, u, size - 2 * u);
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(px + u, py + size - 2 * u, size - 2 * u, u);
      context.fillRect(px + size - 2 * u, py + u, u, size - 2 * u);
      // borde oscuro
      context.fillStyle = 'rgba(0,0,0,0.7)';
      context.fillRect(px, py, size, u);
      context.fillRect(px, py + size - u, size, u);
      context.fillRect(px, py, u, size);
      context.fillRect(px + size - u, py, u, size);
    },
  },
};

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

// Resuelve un valor de skin que puede depender del tema
function themed(v) {
  return v && typeof v === 'object' ? v[theme] : v;
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
  updateHUD();
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
  const s = SKINS[skin];
  const a = alpha ?? 1;
  context.globalAlpha = a;
  s.drawBlock(context, x * size, y * size, size, s.colors[colorIndex], colorIndex, a);
  if (colorIndex === BOMB) {
    context.fillStyle = 'rgba(0,0,0,0.6)';
    context.beginPath();
    context.arc(x * size + size / 2, y * size + size / 2, size * 0.3, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = themed(SKINS[skin].grid);
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

// Fondo de tablero y preview según skin ('' = vuelve al --board-bg del CSS)
function applySkinBackground() {
  const bg = themed(SKINS[skin].boardBg) || '';
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
}

function setSkin(k) {
  skin = Object.prototype.hasOwnProperty.call(SKINS, k) ? k : 'retro';
  skinSelect.value = skin;
  applySkinBackground();
  try { localStorage.setItem('tetris-skin', skin); } catch (e) { /* sin storage */ }
}

function setTheme(t) {
  theme = t;
  document.body.classList.toggle('light-theme', theme === 'light');
  localStorage.setItem('tetris-theme', theme);
}

themeToggle.addEventListener('change', () => {
  setTheme(themeToggle.checked ? 'light' : 'dark');
  applySkinBackground();
  draw();
  drawNext();
});

setTheme(localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark');
themeToggle.checked = theme === 'light';

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // que las flechas no cambien la skin mientras se juega
  draw();
  drawNext();
});

let savedSkin = null;
try { savedSkin = localStorage.getItem('tetris-skin'); } catch (e) { /* sin storage */ }
setSkin(savedSkin);

init();
