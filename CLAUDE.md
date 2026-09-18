# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris in vanilla JavaScript + HTML5 Canvas + CSS. No dependencies, no `package.json`, no bundler/transpiler, no tests, no linter. UI strings and README are in Spanish (`lang="es"`) — keep new user-facing text in Spanish.

## Running

```bash
open index.html                 # macOS, direct
python3 -m http.server 8000     # or any static server → http://localhost:8000
```

## Architecture

Three files: `index.html` (DOM + canvases), `style.css` (dark theme), `game.js` (all logic, classic script — no modules, runs `init()` at load).

`game.js` key points:

- **Global mutable state**: `board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, nextBombAt, bombPending` declared at top; `init()` resets all of them (also used by restart button).
- **Piece type = color index = cell value.** `PIECES[type]` matrices contain the type number in filled cells; `merge()` copies those values into `board`; `drawBlock` looks up `COLORS[value]`. Index 0 / `null` = empty. Adding a piece means updating `PIECES` and `COLORS` together (`randomPiece()` derives the count from `PIECES.length`).
- **Bomb** (`BOMB = 9`): not in `PIECES` (so `randomPiece()` never yields it), only `COLORS[9]`; built by `bombPiece()` (1x1). `clearLines()` sets `bombPending` every `BOMB_EVERY` lines → next `spawn()` puts it in `next`. `lockPiece()` calls `explode()` (clears 3x3, no gravity, +10×level per cell) instead of `merge()`/`clearLines()`. `drawBlock` adds a dark circle for it.
- **Skins** (`SKINS`): cada entrada aporta `colors` (paleta paralela a `COLORS`, mismos índices), `draw` (función de bloque), `themeable` y `grid` opcional. `drawBlock()` es solo un despachador: aplica `globalAlpha`, delega en `SKINS[skin].draw(ctx, px, py, size, color)` y añade `drawBombMark()` si el valor es `BOMB`. Añadir una pieza implica añadir su color en las **cuatro** paletas. Solo Retro es `themeable` (respeta el toggle claro/oscuro); las demás imponen su fondo vía `body[data-skin=...]` en `style.css` y deshabilitan el toggle. Persistencia en `localStorage` (`tetris-skin`), aplicada sin recargar por `applySkin()`.
- **Pieces** are `{ type, shape, x, y }`; rotation is `rotateCW` (transpose + reverse) with kicks `[0,-1,1,-2,2]` in `tryRotate`. `collide(shape, ox, oy)` is the single source of truth for bounds/overlap (cells with `y < 0` are allowed).
- **Lock flow**: `lockPiece()` → `merge()` → `clearLines()` (updates lines/score/level/`dropInterval`) → `spawn()` (promotes `next`, game over if spawn collides) → `drawNext()`.
- **Loop**: `requestAnimationFrame(loop)` accumulates `dt` into `dropAccum`; gravity step at `dropInterval` (`max(100, 1000 - (level-1)*90)` ms). `draw()` redraws everything every frame (grid, board, ghost at alpha 0.2, current piece).
- **Pause/game over** stop the loop via `cancelAnimationFrame(animId)` and reuse one overlay (`#overlay`, toggled with `.hidden` class; title/score text set in JS).
- **Input**: single `keydown` listener using `e.code`; `updateHUD()` is called after every key, so drop functions don't always update HUD themselves.
- **Scoring**: `LINE_SCORES[cleared] * level`; hard drop +2/cell, soft drop +1/row. Level = `floor(lines/10) + 1`.

## Coupled values

- `<canvas id="board">` size in `index.html` must equal `COLS*BLOCK × ROWS*BLOCK` (300×600).
- `#next-canvas` (120×120) assumes a 4×4 grid of `NB = 30` px in `drawNext()`.
