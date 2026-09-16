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

const RECORDS_KEY = 'tetris-records';
const PLAYER_NAME_KEY = 'tetris-player-name';
const RECORDS_MAX = 5;
const NAME_MAX = 12;

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
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const gameoverRecords = document.getElementById('gameover-records');
const recordForm = document.getElementById('record-form');
const nameInput = document.getElementById('name-input');
const saveRecordBtn = document.getElementById('save-record-btn');
const recordBlocks = document.querySelectorAll('.records-block');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, nextBombAt, bombPending;
let combo, maxCombo, recordPending;
let theme = 'dark';

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
    const linesBefore = lines;
    clearLines();
    // combo = bloqueos consecutivos que limpian ≥1 línea (la bomba no lo altera)
    combo = lines > linesBefore ? combo + 1 : 0;
    maxCombo = Math.max(maxCombo, combo);
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
  if (!next) return;
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
  showGameOverRecords();
  overlay.classList.remove('hidden');
}

// ---- Records (localStorage) ----

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return emptyRecords();
    const top = (Array.isArray(data.top) ? data.top : [])
      .filter(r => r && typeof r === 'object' && Number.isFinite(r.score))
      .map(r => ({
        name: String(r.name ?? '').slice(0, NAME_MAX) || 'Anónimo',
        score: toCount(r.score),
        lines: toCount(r.lines),
        maxCombo: toCount(r.maxCombo),
        level: toCount(r.level) || 1,
        date: typeof r.date === 'string' ? r.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RECORDS_MAX);
    return { top, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
  } catch {
    return emptyRecords();
  }
}

function saveRecords(rec) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rec));
  } catch { /* almacenamiento no disponible */ }
}

function qualifies(rec, s) {
  return s > 0 && (rec.top.length < RECORDS_MAX || s > rec.top[rec.top.length - 1].score);
}

// Pinta tabla + estadísticas en todos los bloques; highlight = índice de fila a resaltar
function renderRecords(highlight = -1, rec = loadRecords()) {
  recordBlocks.forEach(block => {
    const tbody = block.querySelector('tbody');
    tbody.replaceChildren();
    if (!rec.top.length) {
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'empty';
      td.textContent = 'Sin records todavía';
      tbody.appendChild(document.createElement('tr')).appendChild(td);
    }
    rec.top.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (i === highlight) tr.classList.add('highlight');
      for (const val of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.maxCombo, r.level]) {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    block.querySelector('.best-combo').textContent = rec.bestCombo;
    block.querySelector('.max-lines').textContent = rec.maxLines;
    block.querySelector('.reset-confirm').classList.add('hidden');
    block.querySelector('.reset-btn').classList.remove('hidden');
  });
}

function showGameOverRecords() {
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  recordPending = qualifies(rec, score);
  recordForm.classList.toggle('hidden', !recordPending);
  renderRecords(-1, rec);
  gameoverRecords.classList.remove('hidden');
  if (recordPending) {
    try {
      nameInput.value = localStorage.getItem(PLAYER_NAME_KEY) || '';
    } catch {
      nameInput.value = '';
    }
    // pequeño retardo: que una tecla mantenida (p. ej. Space) no escriba en el campo
    setTimeout(() => {
      if (!recordPending || !gameOver) return;
      nameInput.focus();
      nameInput.select();
    }, 300);
  }
}

function submitRecord() {
  if (!recordPending) return;
  recordPending = false;
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo';
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch { /* almacenamiento no disponible */ }
  const rec = loadRecords();
  let idx = rec.top.findIndex(r => score > r.score);
  if (idx === -1) idx = rec.top.length;
  rec.top.splice(idx, 0, {
    name, score, lines, maxCombo, level,
    date: new Date().toISOString().slice(0, 10),
  });
  rec.top = rec.top.slice(0, RECORDS_MAX);
  saveRecords(rec);
  recordForm.classList.add('hidden');
  nameInput.blur();
  // se pinta desde memoria: resalta bien aunque localStorage falle
  renderRecords(idx, rec);
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
  combo = 0;
  maxCombo = 0;
  recordPending = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  gameoverRecords.classList.add('hidden');
  startScreen.classList.add('hidden');
  // evita que Space/Enter re-activen el botón pulsado
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // escribiendo el nombre: no procesar teclas del juego
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
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
playBtn.addEventListener('click', init);
saveRecordBtn.addEventListener('click', submitRecord);
nameInput.addEventListener('keydown', e => {
  // ignora autorepetición (tecla mantenida desde la partida, p. ej. Space)
  if (e.repeat) { e.preventDefault(); return; }
  if (e.key === 'Enter') submitRecord();
});

// Borrar records con confirmación dentro de la página
recordBlocks.forEach(block => {
  const resetBtn = block.querySelector('.reset-btn');
  const confirmBox = block.querySelector('.reset-confirm');
  resetBtn.addEventListener('click', () => {
    resetBtn.classList.add('hidden');
    confirmBox.classList.remove('hidden');
  });
  block.querySelector('.confirm-no').addEventListener('click', () => {
    confirmBox.classList.add('hidden');
    resetBtn.classList.remove('hidden');
  });
  block.querySelector('.confirm-yes').addEventListener('click', () => {
    try {
      localStorage.removeItem(RECORDS_KEY);
    } catch { /* almacenamiento no disponible */ }
    renderRecords();
  });
});

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

// Pantalla de inicio: tablero vacío y juego detenido hasta pulsar "Jugar"
board = createBoard();
gameOver = true;
draw();
renderRecords();
