// ============================================================
//  CHOMP! — A neon maze-chase arcade game
//  Original game: own maze, characters, art & synthesized sound.
// ============================================================
'use strict';

// ---------- Maze ----------
// # wall | . dot | o power orb | ' ' empty | - gate (sparks only) | x player start
const MAZE = [
  "############################",
  "#o........................o#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#............##............#",
  "#.###.###.##.##.##.###.###.#",
  "#.###.###.##.##.##.###.###.#",
  "#............##............#",
  "##.###.#####.  .#####.###.##",
  "##.....#.....  .....#.....##",
  "##.###.#.####--####.#.###.##",
  "##.###.#.          .#.###.##",
  "##.....#.          .#.....##",
  "     ..#.#        #.#..     ",
  "##.###.#.          .#.###.##",
  "##.###.#.##########.#.###.##",
  "##......#.###..###.#......##",
  "#.#####.#.###..###.#.#####.#",
  "#.......#..........#.......#",
  "#.####.##.###..###.##.####.#",
  "#o.....##.###  ###.##.....o#",
  "#.####.##.###..###.##.####.#",
  "#.####.##.###..###.##.####.#",
  "#..........................#",
  "#.##########.##.##########.#",
  "############################",
];

const COLS = 28;
const ROWS = 26;
const TILE = 24;
const W = COLS * TILE;
const H = ROWS * TILE;

// Sanity: fix row 6 to be exactly mirror-symmetric like the design
(function normalizeMaze() {
  for (let y = 0; y < ROWS; y++) {
    if (MAZE[y].length !== COLS) throw new Error(`maze row ${y} bad width: ${MAZE[y].length}`);
  }
})();

const DIR = {
  up:    { x: 0,  y: -1 },
  left:  { x: -1, y: 0 },
  down:  { x: 0,  y: 1 },
  right: { x: 1,  y: 0 },
  none:  { x: 0,  y: 0 },
};

const PLAYER_START = { x: 13, y: 20 };
const GATE = { x: 13, y: 10 };

// Ghost roster — original characters
const GHOST_DEFS = [
  { name: 'Blaze',  color: '#ff5544', style: 'hunter',   corner: { x: 26, y: 1 },  start: { x: 13, y: 12 }, release: 0.0 },
  { name: 'Vex',    color: '#9d6bff', style: 'ambusher', corner: { x: 1,  y: 1 },  start: { x: 12, y: 13 }, release: 2.5 },
  { name: 'Jinx',   color: '#ffb02e', style: 'trickster',corner: { x: 26, y: 24 }, start: { x: 14, y: 13 }, release: 5.5 },
  { name: 'Glitch', color: '#2fc4ff', style: 'flanker',  corner: { x: 1,  y: 24 }, start: { x: 13, y: 14 }, release: 9.0 },
];

// ---------- DOM ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highEl = document.getElementById('high');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const menuHighEl = document.getElementById('menu-high');
const btnSound = document.getElementById('btn-sound');
const btnPause = document.getElementById('btn-pause');

const OV = {
  menu: document.getElementById('ov-menu'),
  ready: document.getElementById('ov-ready'),
  paused: document.getElementById('ov-paused'),
  gameover: document.getElementById('ov-gameover'),
  levelclear: document.getElementById('ov-levelclear'),
};

// ---------- Audio (synthesized) ----------
let audioCtx = null;
let muted = localStorage.getItem('chomp-muted') === '1';

function ac() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, dur, type = 'square', vol = 0.05, when = 0, slideTo = null) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SFX = {
  chompToggle: 0,
  chomp() { tone(this.chompToggle ? 210 : 170, 0.06, 'square', 0.035); this.chompToggle ^= 1; },
  orb() { tone(160, 0.28, 'sawtooth', 0.05, 0, 520); },
  sparkEaten() { tone(280, 0.22, 'square', 0.055, 0, 980); },
  die() { [420, 380, 330, 280, 220, 170, 120].forEach((f, i) => tone(f, 0.14, 'triangle', 0.06, i * 0.13)); },
  levelClear() { [523, 659, 784, 988, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.045, i * 0.14)); },
  ready() { [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.04, i * 0.15)); },
  gameOver() { [330, 262, 196, 147].forEach((f, i) => tone(f, 0.3, 'triangle', 0.06, i * 0.3)); },
  bonus() { [880, 1175, 1568].forEach((f, i) => tone(f, 0.1, 'square', 0.05, i * 0.08)); },
  extraLife() { [659, 880, 1109, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.05, i * 0.1)); },
};

// ---------- Game state ----------
let grid = [];          // mutable copy of pellet layout ('#','.','o',' ','-')
let state = {
  phase: 'menu',        // menu | ready | playing | paused | dying | levelclear | gameover
  score: 0,
  high: parseInt(localStorage.getItem('chomp-high') || '0', 10),
  lives: 3,
  level: 1,
  dotsLeft: 0,
  freeze: 0,
  phaseTimer: 0,
  frightTimer: 0,
  frightDuration: 7,
  ghostCombo: 0,
  mode: 'scatter',
  modeTimer: 7,
  modeIndex: 0,
  elapsed: 0,
  nextExtraLife: 10000,
  popups: [],
};

let player;             // {tx,ty,dir,nextDir,p,speed,mouth,alive}
let ghosts = [];

function buildGrid() {
  grid = MAZE.map(row => row.split(''));
  // player start tile & ghost pen interior become empty (no pellets there)
  grid[PLAYER_START.y][PLAYER_START.x] = ' ';
  state.dotsLeft = 0;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (grid[y][x] === '.' || grid[y][x] === 'o') state.dotsLeft++;
}

function tileWalkable(x, y, kind) {
  x = ((x % COLS) + COLS) % COLS;
  if (y < 0 || y >= ROWS) return false;
  const ch = MAZE[y][x];
  if (ch === '#') return false;
  if (ch === '-') return kind === 'spark';       // gate: sparks only
  return true;
}

function makeEntity(x, y) {
  return { tx: x, ty: y, dir: { ...DIR.none }, nextDir: null, p: 0, speed: 0 };
}

function resetPositions() {
  player = makeEntity(PLAYER_START.x, PLAYER_START.y);
  player.dir = { ...DIR.left };
  player.nextDir = null;
  player.mouth = 0;
  player.speed = playerSpeed();
  ghosts = GHOST_DEFS.map((def, i) => ({
    ...def,
    tx: def.start.x, ty: def.start.y,
    dir: i === 0 ? { ...DIR.up } : { ...DIR.down },
    p: 0,
    state: 'pen',            // pen | leaving | normal | eyes
    frightened: false,
    released: false,
    releaseTimer: def.release,
    speed: ghostSpeed(),
    bob: Math.random() * Math.PI * 2,
    wander: null,
    wanderTimer: 0,
  }));
  state.frightTimer = 0;
  state.ghostCombo = 0;
  state.freeze = 0;
  state.elapsed = 0;
}

function playerSpeed() { return 7.4 + Math.min(state.level - 1, 6) * 0.25; }
function ghostSpeed()  { return 6.9 + Math.min(state.level - 1, 6) * 0.28; }
function frightTime()  { return Math.max(3, 7 - (state.level - 1) * 0.5); }

// ---------- Movement core ----------
// Entity moves tile-to-tile with progress p in [0,1). Turns happen at tile centers.
function advance(e, dt, kind, onCenter) {
  let dist = e.speed * dt;
  let guard = 0;
  while (dist > 1e-9 && guard++ < 64) {
    if (e.p <= 1e-9) {
      e.p = 0;
      onCenter(e);                       // decide direction at center
      if (e.dir.x === 0 && e.dir.y === 0) break;
    }
    const remain = 1 - e.p;
    if (dist < remain) { e.p += dist; dist = 0; }
    else {
      // hard safety guard: never commit a move into a non-walkable tile
      const ntx = ((e.tx + e.dir.x) % COLS + COLS) % COLS;
      const nty = e.ty + e.dir.y;
      if (!tileWalkable(ntx, nty, kind)) { e.dir = { x: 0, y: 0 }; e.p = 0; break; }
      dist -= remain;
      e.tx = ntx;
      e.ty = nty;
      e.p = 0;
    }
  }
}

function reverseMid(entity, newDir) {
  // Instant reversal (allowed for player & when sparks get scared)
  const d = entity.dir;
  if (d.x === 0 && d.y === 0) { entity.dir = { ...newDir }; return; }
  if (newDir.x === -d.x && newDir.y === -d.y) {
    if (entity.p > 1e-9) {
      entity.tx = ((entity.tx + d.x) % COLS + COLS) % COLS;
      entity.ty += d.y;
      entity.p = 1 - entity.p;
    }
    entity.dir = { ...newDir };
  }
}

function pixelPos(e) {
  let px = (e.tx + e.dir.x * e.p) * TILE + TILE / 2;
  let py = (e.ty + e.dir.y * e.p) * TILE + TILE / 2;
  // tunnel wrap for rendering
  if (px < -TILE / 2) px += W;
  if (px > W + TILE / 2) px -= W;
  return { x: px, y: py };
}

// ---------- Player ----------
function playerCenter(p) {
  if (p.nextDir && tileWalkable(p.tx + p.nextDir.x, p.ty + p.nextDir.y, 'player')) {
    p.dir = { ...p.nextDir };
    p.nextDir = null;
  }
  if (!tileWalkable(p.tx + p.dir.x, p.ty + p.dir.y, 'player')) {
    p.dir = { ...DIR.none };
  }
}

function updatePlayer(dt) {
  // eat pellet at current tile
  const ch = grid[player.ty][player.tx];
  if (ch === '.') { grid[player.ty][player.tx] = ' '; state.dotsLeft--; state.score += 10; SFX.chomp(); checkExtraLife(); }
  else if (ch === 'o') {
    grid[player.ty][player.tx] = ' '; state.dotsLeft--; state.score += 50;
    SFX.orb();
    state.frightTimer = frightTime();
    state.ghostCombo = 0;
    ghosts.forEach(g => {
      if (g.state === 'normal') {
        g.frightened = true;
        reverseMid(g, { x: -g.dir.x, y: -g.dir.y });
      }
    });
    checkExtraLife();
  }

  advance(player, dt, 'player', playerCenter);
  if (player.dir.x !== 0 || player.dir.y !== 0) player.mouth += dt * 22;
}

// ---------- Ghost AI ----------
function ghostTarget(g) {
  if (g.state === 'eyes') return GATE;
  if (g.frightened) return null; // run away
  if (state.mode === 'scatter') return g.corner;
  switch (g.style) {
    case 'hunter': return { x: player.tx, y: player.ty };
    case 'ambusher': return { x: player.tx + player.dir.x * 4, y: player.ty + player.dir.y * 4 };
    case 'flanker': {
      const b = ghosts[0];
      return { x: player.tx * 2 - b.tx, y: player.ty * 2 - b.ty };
    }
    case 'trickster':
    default:
      g.wanderTimer -= 0.016;
      if (!g.wander || g.wanderTimer <= 0) {
        g.wander = randomWalkableTile();
        g.wanderTimer = 2.5;
      }
      return g.wander;
  }
}

function randomWalkableTile() {
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);
    if (MAZE[y][x] === '.' || MAZE[y][x] === 'o' || MAZE[y][x] === ' ') return { x, y };
  }
  return { x: 1, y: 1 };
}

function bfsNextDir(from, to, passable) {
  const key = (x, y) => y * COLS + x;
  const prev = new Map();
  const seen = new Set([key(from.x, from.y)]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) {
      // walk back to first step
      let node = cur;
      while (true) {
        const pk = prev.get(key(node.x, node.y));
        if (!pk) return null;
        const pnode = { x: pk % COLS, y: Math.floor(pk / COLS) };
        if (pnode.x === from.x && pnode.y === from.y) {
          return { x: node.x - from.x, y: node.y - from.y, wrapped: false };
        }
        node = pnode;
      }
    }
    for (const d of [DIR.up, DIR.left, DIR.down, DIR.right]) {
      let nx = (cur.x + d.x + COLS) % COLS;
      const ny = cur.y + d.y;
      if (ny < 0 || ny >= ROWS) continue;
      if (!passable(nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, key(cur.x, cur.y));
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

function inPen(x, y) {
  return x >= 10 && x <= 17 && y >= 10 && y <= 15;
}

function ghostCenter(g) {
  if (g.state === 'pen') { g.dir = { x: 0, y: 0 }; return; }

  // safety: a normal ghost that somehow sits in the pen must leave through the gate
  if (g.state === 'normal' && inPen(g.tx, g.ty)) {
    g.state = 'leaving';
  }

  if (g.state === 'leaving') {
    // Arrived in the exit lane? Switch to normal AI there.
    if (g.ty <= 8) {
      g.state = 'normal';
      if (g.dir.x === 0 && g.dir.y === 0) g.dir = { ...DIR.left };
      // fall through to normal decision below
    } else {
      const step = bfsNextDir({ x: g.tx, y: g.ty }, { x: 13, y: 8 },
        (x, y) => MAZE[y][x] !== '#');
      if (step) { g.dir = { x: step.x, y: step.y }; }
      else if (tileWalkable(g.tx, g.ty - 1, 'spark')) g.dir = { ...DIR.up };
      else { g.state = 'normal'; }
      return;
    }
  }

  if (g.state === 'eyes') {
    const step = bfsNextDir({ x: g.tx, y: g.ty }, { x: 13, y: 12 },
      (x, y) => MAZE[y][x] !== '#');
    if (step) { g.dir = { x: step.x, y: step.y }; }
    else { g.state = 'leaving'; }
    return;
  }

  // normal state
  const opts = [];
  for (const [name, d] of [['up', DIR.up], ['left', DIR.left], ['down', DIR.down], ['right', DIR.right]]) {
    if (d.x === -g.dir.x && d.y === -g.dir.y) continue;             // no reverse
    const nx = ((g.tx + d.x) % COLS + COLS) % COLS;
    const ny = g.ty + d.y;
    if (!tileWalkable(nx, ny, 'spark')) continue;                   // no walls (gate ok)
    if (MAZE[ny][nx] === '-') continue;                             // normal ghosts never re-enter the pen
    opts.push(d);
  }
  if (opts.length === 0) { g.dir = { x: -g.dir.x, y: -g.dir.y }; return; }

  const target = ghostTarget(g);
  if (!target) {
    // frightened: pick random option (feels panicked)
    g.dir = { ...opts[Math.floor(Math.random() * opts.length)] };
    return;
  }
  let best = opts[0], bestD = Infinity;
  for (const d of opts) {
    const nx = g.tx + d.x, ny = g.ty + d.y;
    const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
    if (dist < bestD) { bestD = dist; best = d; }
  }
  g.dir = { ...best };
}

function ghostSpeedNow(g) {
  if (g.state === 'eyes') return 15;
  if (g.state === 'leaving') return 6;
  let s = ghostSpeed();
  if (g.frightened) s *= state.frightTimer < 2 ? 0.62 : 0.5;
  return s;
}

function updateGhosts(dt) {
  for (const g of ghosts) {
    // release schedule
    if (g.state === 'pen') {
      g.releaseTimer -= dt;
      g.bob += dt * 3;
      if (g.releaseTimer <= 0) { g.state = 'leaving'; g.dir = { ...DIR.up }; }
      continue;
    }
    g.speed = ghostSpeedNow(g);
    advance(g, dt, 'spark', ghostCenter);

    // arrive back in pen as eyes -> revive
    if (g.state === 'eyes' && g.tx === 13 && g.ty === 12 && g.p < 0.5) {
      g.state = 'pen';
      g.frightened = false;
      g.releaseTimer = 1.2;
      g.dir = { ...DIR.up };
    }
  }
}

// ---------- Collisions ----------
function checkCollisions() {
  const pp = pixelPos(player);
  for (const g of ghosts) {
    if (g.state === 'eyes') continue;
    const gp = pixelPos(g);
    const dx = Math.abs(pp.x - gp.x);
    const dy = Math.abs(pp.y - gp.y);
    const wrappedX = Math.min(dx, W - dx);
    if (wrappedX < TILE * 0.62 && dy < TILE * 0.62) {
      if (g.frightened && g.state === 'normal') {
        // eaten!
        state.ghostCombo = Math.min(state.ghostCombo + 1, 4);
        const pts = 200 * Math.pow(2, state.ghostCombo - 1);
        state.score += pts;
        state.popups.push({ text: pts, x: gp.x, y: gp.y, t: 1 });
        g.frightened = false;
        g.state = 'eyes';
        state.freeze = 0.45;
        SFX.sparkEaten();
        checkExtraLife();
      } else if (g.state === 'normal' || g.state === 'leaving') {
        die();
        return;
      }
    }
  }
}

// ---------- Game flow ----------
function startGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.nextExtraLife = 10000;
  beginLevel();
}

// Fresh level: dots restored, positions reset.
function beginLevel() {
  buildGrid();
  respawn();
}

// After a death (or new level): reset positions & modes, keep remaining pellets.
function respawn() {
  resetPositions();
  state.mode = 'scatter';
  state.modeIndex = 0;
  state.modeTimer = 7;
  state.phase = 'ready';
  state.phaseTimer = 1.6;
  showOverlay('ready');
  document.getElementById('ready-title').textContent = 'READY!';
  document.getElementById('ready-sub').textContent = 'LEVEL ' + state.level;
  SFX.ready();
  syncHUD();
}

function die() {
  state.phase = 'dying';
  state.phaseTimer = 1.6;
  SFX.die();
}

function afterDeath() {
  state.lives--;
  syncHUD();
  if (state.lives <= 0) {
    gameOver();
  } else {
    respawn();   // keep remaining pellets, reset positions
  }
}

function gameOver() {
  state.phase = 'gameover';
  if (state.score > state.high) {
    state.high = state.score;
    localStorage.setItem('chomp-high', String(state.high));
  }
  document.getElementById('go-score').textContent = 'SCORE: ' + state.score;
  const best = state.score >= state.high && state.score > 0;
  document.getElementById('go-high').textContent = best ? '★ NEW HIGH SCORE! ★' : 'HIGH SCORE: ' + state.high;
  showOverlay('gameover');
  SFX.gameOver();
  syncHUD();
}

function levelCleared() {
  state.phase = 'levelclear';
  state.phaseTimer = 2.2;
  document.getElementById('lc-next').textContent = 'NEXT: LEVEL ' + (state.level + 1);
  showOverlay('levelclear');
  SFX.levelClear();
}

function nextLevel() {
  state.level++;
  beginLevel();
}

function checkExtraLife() {
  if (state.score >= state.nextExtraLife) {
    state.lives++;
    state.nextExtraLife += 10000;
    SFX.extraLife();
    state.popups.push({ text: '+1 LIFE', x: pixelPos(player).x, y: pixelPos(player).y, t: 1.4, wide: true });
    syncHUD();
  }
}

function togglePause(force) {
  if (state.phase === 'playing' && force !== false) {
    state.phase = 'paused';
    showOverlay('paused');
  } else if (state.phase === 'paused' && force !== true) {
    hideOverlays();
    state.phase = 'playing';
    lastT = performance.now();
  }
}

// ---------- Scatter / chase cycles ----------
const MODE_PLAN = [
  { mode: 'scatter', dur: 7 },
  { mode: 'chase',   dur: 20 },
  { mode: 'scatter', dur: 7 },
  { mode: 'chase',   dur: 20 },
  { mode: 'scatter', dur: 5 },
  { mode: 'chase',   dur: Infinity },
];

function updateModes(dt) {
  if (state.frightTimer > 0) {
    state.frightTimer -= dt;
    if (state.frightTimer <= 0) {
      state.frightTimer = 0;
      ghosts.forEach(g => { g.frightened = false; });
    }
    return; // mode clock pauses during fright
  }
  state.modeTimer -= dt;
  if (state.modeTimer <= 0) {
    state.modeIndex++;
    const plan = MODE_PLAN[Math.min(state.modeIndex, MODE_PLAN.length - 1)];
    state.mode = plan.mode;
    state.modeTimer = plan.dur;
    ghosts.forEach(g => { if (g.state === 'normal') reverseMid(g, { x: -g.dir.x, y: -g.dir.y }); });
  }
}

// ---------- Rendering ----------
function draw(t) {
  ctx.clearRect(0, 0, W, H);

  // subtle grid glow backdrop
  ctx.fillStyle = '#070a14';
  ctx.fillRect(0, 0, W, H);

  drawWalls(t);
  drawPellets(t);
  drawPopups();
  drawPlayer(t);
  for (const g of ghosts) drawGhost(g, t);
  drawPenDoor(t);
}

function wallShape(x, y, size, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + size, y, x + size, y + size, rad);
  ctx.arcTo(x + size, y + size, x, y + size, rad);
  ctx.arcTo(x, y + size, x, y, rad);
  ctx.arcTo(x, y, x + size, y, rad);
  ctx.closePath();
}

function drawWalls(t) {
  const pulse = 0.5 + 0.5 * Math.sin(t / 800);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (MAZE[y][x] !== '#') continue;
      const px = x * TILE, py = y * TILE;
      wallShape(px + 1.5, py + 1.5, TILE - 3, 6);
      const grad = ctx.createLinearGradient(px, py, px, py + TILE);
      grad.addColorStop(0, '#16224d');
      grad.addColorStop(1, '#0d1530');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = `rgba(79, 139, 255, ${0.5 + 0.25 * pulse})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }
}

function drawPellets(t) {
  const pulse = 0.5 + 0.5 * Math.sin(t / 240);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = grid[y][x];
      if (ch === '.') {
        ctx.beginPath();
        ctx.fillStyle = '#cdd6ff';
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (ch === 'o') {
        const r = 6 + pulse * 2;
        ctx.save();
        ctx.shadowColor = 'rgba(255, 210, 63, 0.9)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.fillStyle = '#ffd23f';
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

function drawPlayer(t) {
  if (state.phase === 'dying') {
    // spin + shrink animation
    const prog = 1 - Math.max(0, state.phaseTimer) / 1.6;   // 0 -> 1
    const pos = pixelPos(player);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(prog * Math.PI * 3);
    ctx.globalAlpha = Math.max(0, 1 - prog);
    ctx.beginPath();
    ctx.fillStyle = '#46e6b4';
    ctx.arc(0, 0, TILE * 0.44 * (1 - prog * 0.65), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (state.phase === 'gameover') return;

  const pos = pixelPos(player);
  const moving = player.dir.x !== 0 || player.dir.y !== 0;
  const open = moving ? Math.abs(Math.sin(player.mouth)) * 0.85 : 0.22; // mouth wedge
  const ang = Math.atan2(player.dir.y, player.dir.x);
  const r = TILE * 0.45;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(ang);

  // glow
  ctx.shadowColor = 'rgba(70, 230, 180, 0.75)';
  ctx.shadowBlur = 14;

  // body with chomping wedge
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, open * Math.PI * 0.55, Math.PI * 2 - open * Math.PI * 0.55);
  ctx.closePath();
  ctx.fillStyle = '#46e6b4';
  ctx.fill();
  ctx.shadowBlur = 0;

  // body highlight
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI * 1.1, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // eye (distinctive: Chomp has an eye!)
  ctx.beginPath();
  ctx.fillStyle = '#ffffff';
  ctx.arc(r * 0.15, -r * 0.42, r * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = '#04321f';
  ctx.arc(r * 0.24, -r * 0.42, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawGhost(g, t) {
  const pos = pixelPos(g);
  const r = TILE * 0.44;
  const bobY = g.state === 'pen' ? Math.sin(g.bob) * 2.5 : 0;
  const flash = g.frightened && state.frightTimer < 2 && Math.floor(t / 180) % 2 === 0;

  ctx.save();
  ctx.translate(pos.x, pos.y + bobY);

  if (g.state !== 'eyes') {
    const body = g.frightened ? (flash ? '#e8ecff' : '#3a37c8') : g.color;
    ctx.shadowColor = body;
    ctx.shadowBlur = 12;

    // dome + wavy skirt
    ctx.beginPath();
    ctx.arc(0, -r * 0.18, r * 0.92, Math.PI, 0);
    ctx.lineTo(r * 0.92, r * 0.62);
    const waves = 3;
    const waveW = (r * 0.92 * 2) / (waves * 2);
    for (let i = 0; i < waves; i++) {
      ctx.quadraticCurveTo(
        r * 0.92 - waveW * (i * 2 + 1), r * 0.95,
        r * 0.92 - waveW * (i * 2 + 2), r * 0.62
      );
    }
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.shadowBlur = 0;

    // eyes
    if (g.frightened) {
      // scared: small white dots + zigzag mouth
      ctx.fillStyle = flash ? '#3a37c8' : '#e8ecff';
      ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.22, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.32, -r * 0.22, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = flash ? '#3a37c8' : '#e8ecff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * 0.3);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(-r * 0.5 + (i + 0.5) * (r / 2), r * 0.3 + (i % 2 === 0 ? -3 : 4));
      }
      ctx.stroke();
    } else {
      // look toward movement
      const lx = g.dir.x * 2.6, ly = g.dir.y * 2.6;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.ellipse(sx * r * 0.34, -r * 0.25, r * 0.27, r * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = '#101a3e';
        ctx.arc(sx * r * 0.34 + lx, -r * 0.25 + ly, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // eyes-only, rushing home
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.fillStyle = '#e8ecff';
      ctx.ellipse(sx * r * 0.34, -r * 0.1, r * 0.27, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#2fc4ff';
      ctx.arc(sx * r * 0.34, -r * 0.1, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawPenDoor(t) {
  // gate shimmer
  const pulse = 0.5 + 0.5 * Math.sin(t / 300);
  ctx.fillStyle = `rgba(255, 130, 220, ${0.35 + 0.3 * pulse})`;
  ctx.fillRect(13 * TILE, 10 * TILE + TILE * 0.42, TILE * 2, 3.5);
}

function drawPopups() {
  for (const p of state.popups) {
    ctx.save();
    ctx.font = p.wide ? 'bold 13px monospace' : 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.wide ? '#46e6b4' : '#7fd0ff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.globalAlpha = Math.min(1, p.t * 2);
    ctx.fillText(p.text, p.x, p.y - (1 - p.t) * 26);
    ctx.restore();
  }
}

// ---------- HUD ----------
function syncHUD() {
  scoreEl.textContent = state.score.toLocaleString('en-IN');
  highEl.textContent = Math.max(state.high, state.score).toLocaleString('en-IN');
  levelEl.textContent = state.level;
  menuHighEl.textContent = 'HIGH SCORE: ' + state.high.toLocaleString('en-IN');
  // life icons
  livesEl.innerHTML = '';
  for (let i = 0; i < Math.min(state.lives, 7); i++) {
    const s = document.createElement('span');
    s.className = 'life-icon';
    livesEl.appendChild(s);
  }
  if (state.lives > 7) {
    const s = document.createElement('span');
    s.style.fontSize = '11px';
    s.style.color = '#7f8bc0';
    s.textContent = '×' + state.lives;
    livesEl.appendChild(s);
  }
}

// ---------- Overlays ----------
function showOverlay(name) {
  hideOverlays();
  OV[name].classList.add('visible');
}
function hideOverlays() {
  Object.values(OV).forEach(el => el.classList.remove('visible'));
}

// ---------- Input ----------
function setDir(name) {
  if (state.phase !== 'playing' && state.phase !== 'ready') return;
  const d = DIR[name];
  if (!d) return;
  // instant reverse when possible
  if (player.dir.x === -d.x && player.dir.y === -d.y &&
      (player.dir.x !== 0 || player.dir.y !== 0)) {
    reverseMid(player, d);
    player.nextDir = null;
    return;
  }
  player.nextDir = { ...d };
  // if sitting still at a center, take it immediately when walkable
  if (player.dir.x === 0 && player.dir.y === 0 &&
      tileWalkable(player.tx + d.x, player.ty + d.y, 'player')) {
    player.dir = { ...d };
    player.nextDir = null;
  }
}

const KEYMAP = {
  ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right',
  w: 'up', a: 'left', s: 'down', d: 'right',
  W: 'up', A: 'left', S: 'down', D: 'right',
};

document.addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); return; }
  if (e.key === 'm' || e.key === 'M') { toggleSound(); return; }
  if (e.key === 'Enter' || e.key === ' ') {
    if (state.phase === 'menu') { e.preventDefault(); hideOverlays(); startGame(); }
    else if (state.phase === 'gameover') { e.preventDefault(); hideOverlays(); startGame(); }
    return;
  }
  const dir = KEYMAP[e.key];
  if (dir) {
    e.preventDefault();
    setDir(dir);
  }
});

// Buttons
document.getElementById('btn-play').addEventListener('click', () => { ac(); hideOverlays(); startGame(); });
document.getElementById('btn-again').addEventListener('click', () => { hideOverlays(); startGame(); });
document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
btnPause.addEventListener('click', () => togglePause());
btnSound.addEventListener('click', () => toggleSound());

function toggleSound() {
  muted = !muted;
  localStorage.setItem('chomp-muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
  btnSound.classList.toggle('muted', muted);
}
btnSound.textContent = muted ? '🔇' : '🔊';
btnSound.classList.toggle('muted', muted);

// Touch: swipe on canvas + D-pad
let touchStart = null;
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!touchStart) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
  if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
  else setDir(dy > 0 ? 'down' : 'up');
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: false });

document.getElementById('dpad').addEventListener('pointerdown', e => {
  const btn = e.target.closest('.dbtn');
  if (!btn) return;
  e.preventDefault();
  setDir(btn.dataset.dir);
});

// Auto-pause when tab hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'playing') togglePause(true);
});

// ---------- Main loop ----------
let lastT = performance.now();

// One simulation step with an explicit dt — shared by the render loop and
// the deterministic test hook (GAME.step).
function step(dt) {
  if (state.phase === 'ready') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) { hideOverlays(); state.phase = 'playing'; }
  } else if (state.phase === 'playing') {
    if (state.freeze > 0) {
      state.freeze -= dt;
    } else {
      state.elapsed += dt;
      updateModes(dt);
      updatePlayer(dt);
      updateGhosts(dt);
      checkCollisions();
      if (state.dotsLeft <= 0 && (state.phase === 'playing')) levelCleared();
    }
  } else if (state.phase === 'dying') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) afterDeath();
  } else if (state.phase === 'levelclear') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) nextLevel();
  }

  // popups fade
  state.popups = state.popups.filter(p => (p.t -= dt) > 0);
  syncLightHUD();
}

function tick() {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  step(dt);
  draw(now);
}

let hudTick = 0;
function syncLightHUD() {
  // cheap every-frame updates (score changes often)
  if (hudTick++ % 6 === 0) syncHUD();
}

// Fixed 60fps stepping (interval-based so it also runs in throttled/headless contexts)
setInterval(tick, 1000 / 60);

// ---------- Init ----------
buildGrid();
resetPositions();
syncHUD();
draw(performance.now());

// ---------- Test / debug hooks ----------
window.GAME = {
  state,
  get player() { return player; },
  get ghosts() { return ghosts; },
  get grid() { return grid; },
  setDir,
  start: () => { hideOverlays(); startGame(); },
  togglePause,
  teleportPlayer: (x, y) => { player.tx = x; player.ty = y; player.p = 0; },
  eatAllDots: () => {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (grid[y][x] === '.' || grid[y][x] === 'o') { grid[y][x] = ' '; state.dotsLeft--; }
  },
  addScore: pts => { state.score += pts; },
  // deterministic stepping for tests / tooling: GAME.step(1/60) x N
  step: dt => { step(dt); draw(performance.now()); },
};
