// ============================================================
//  NEONSTRIKE — game.js
//  Arena FPS: player controller, bot AI, weapons, match flow.
//  (Original game — own map, art, sounds, code.)
// ============================================================
'use strict';

// ---------- Arena map (validated: all cells reachable) ----------
// 1=outer 2=wall 3=neon pillar 4=center core ; '.' floor
// P=player spawn  B=bot spawn  h=health  a=ammo
const MAP = [
  "111111111111111111111111",
  "1...........B..........1",
  "1..33......ha......33..1",
  "1..33..............33..1",
  "1......2........2......1",
  "1......2........2......1",
  "1.B....2........2....B.1",
  "1......2........2......1",
  "1......................1",
  "1....2222....2222......1",
  "1....2..........2......1",
  "1....2..4444....2......1",
  "1.......4444...........1",
  "1.......4444...........1",
  "1.......4444...........1",
  "1....2..........2......1",
  "1....2222....2222......1",
  "1......................1",
  "1..h...2........2...a..1",
  "1......2........2......1",
  "1..B...2........2...B..1",
  "1......................1",
  "1...P........h....a....1",
  "111111111111111111111111",
];

const COLS = 24, ROWS = 24;

const level = {
  map: MAP,
  at(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return '1';
    return MAP[y][x] === '.' || MAP[y][x] === 'P' || MAP[y][x] === 'B' || MAP[y][x] === 'h' || MAP[y][x] === 'a' ? '.' : MAP[y][x];
  },
  solid(x, y) { return this.at(x, y) !== '.'; },
};

function collectPoints(ch) {
  const out = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (MAP[y][x] === ch) out.push({ x: x + 0.5, y: y + 0.5 });
  return out;
}

const PLAYER_SPAWNS = collectPoints('P');
const BOT_SPAWNS = collectPoints('B');
const HEALTH_SPOTS = collectPoints('h');
const AMMO_SPOTS = collectPoints('a');

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const canvas = $('game');
const hud = $('hud');
const minimapC = $('minimap');
const mmCtx = minimapC.getContext('2d');

// ---------- Audio (synthesized) ----------
let audio = null;
let muted = localStorage.getItem('ns-muted') === '1';

function ac() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audio = new AC();
  }
  if (audio && audio.state === 'suspended') audio.resume();
  return audio;
}

function tone(freq, dur, type = 'square', vol = 0.05, when = 0, slideTo = null) {
  if (muted) return;
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, vol, freq0, freq1, q = 1) {
  if (muted) return;
  const c = ac(); if (!c) return;
  const t0 = c.currentTime;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(freq0, t0);
  bp.frequency.exponentialRampToValueAtTime(Math.max(40, freq1), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

const SFX = {
  pistol() { noiseBurst(0.09, 0.22, 2400, 500, 0.8); tone(190, 0.08, 'triangle', 0.12); },
  rifle() { noiseBurst(0.07, 0.16, 2100, 600, 0.9); tone(160, 0.05, 'square', 0.07); },
  shotgun() { noiseBurst(0.24, 0.3, 1400, 220, 0.7); tone(110, 0.2, 'triangle', 0.16); },
  enemyShot() { tone(720, 0.14, 'sawtooth', 0.05, 0, 260); },
  hit() { tone(1250, 0.045, 'square', 0.06); },
  kill() { tone(420, 0.1, 'square', 0.07); tone(880, 0.12, 'square', 0.07, 0.07); noiseBurst(0.16, 0.12, 1600, 300); },
  hurt() { noiseBurst(0.12, 0.2, 700, 240, 0.8); tone(120, 0.14, 'triangle', 0.14); },
  death() { [340, 280, 220, 160, 100].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.14)); },
  pickup() { tone(880, 0.09, 'square', 0.06); tone(1320, 0.14, 'square', 0.06, 0.08); },
  reload() { noiseBurst(0.04, 0.12, 3000, 1200, 2); noiseBurst(0.05, 0.14, 2000, 700, 2); tone(300, 0.05, 'square', 0.05, 0.18); },
  reloadDone() { noiseBurst(0.05, 0.16, 2600, 900, 2); tone(520, 0.07, 'square', 0.06); },
  dash() { noiseBurst(0.22, 0.18, 500, 1900, 0.6); },
  empty() { noiseBurst(0.03, 0.14, 3000, 2600, 3); },
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, 'square', 0.07, i * 0.13)); },
  defeat() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, i * 0.22)); },
  step() { noiseBurst(0.035, 0.045, 500, 220, 1.2); },
};

// ---------- Weapons ----------
const WEAPONS = [
  { id: 'pistol', name: 'PULSE PISTOL', dmg: 24, interval: 0.24, mag: 12, reloadTime: 1.0, spread: 0.012, pellets: 1, reserve: Infinity, auto: false },
  { id: 'rifle', name: 'PULSE RIFLE', dmg: 15, interval: 0.095, mag: 30, reloadTime: 1.7, spread: 0.035, pellets: 1, reserve: 150, auto: true },
  { id: 'scatter', name: 'SCATTERGUN', dmg: 11, interval: 0.8, mag: 6, reloadTime: 2.1, spread: 0.14, pellets: 7, reserve: 36, auto: false },
];

// ---------- State ----------
const state = {
  phase: 'menu',          // menu | playing | paused | dead | end
  kills: 0, deaths: 0, target: 20,
  time: 0,
  shots: 0, hits: 0,
  killfeed: [],
  bestTime: parseFloat(localStorage.getItem('ns-best') || '0') || null,
  sens: parseFloat(localStorage.getItem('ns-sens') || '1') || 1,
};

const player = {
  x: 4.5, y: 22.5, angle: -Math.PI / 2, pitch: 0,
  hp: 100, speed: 3.4, sprintMul: 1.55,
  sprinting: false, moving: false,
  weapon: 0, ammo: [12, 30, 6],
  reloading: 0, reloadTotal: 0,
  fireCd: 0, recoil: 0, kick: 0,
  dashCd: 0, dashT: 0, dashVx: 0, dashVy: 0,
  bobT: 0, stepT: 0,
  lastHurt: 99, spawnGrace: 0,
  deadT: 0,
  muzzle: 0,
};

let bots = [];
let projectiles = [];
let particles = [];   // impact sparks & tracers
let pickups = [];
let tracers = [];
let botSerial = 0;
let fx = { shake: 0, muzzle: 0 };

// ---------- Input ----------
const keys = {};
let mouseDown = false;
let pointerLocked = false;
let hadLock = false;

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') {}
  if (state.phase === 'playing') {
    if (e.code === 'Digit1') switchWeapon(0);
    if (e.code === 'Digit2') switchWeapon(1);
    if (e.code === 'Digit3') switchWeapon(2);
    if (e.code === 'KeyR') startReload();
    if (e.code === 'Space') tryDash();
  }
  if (e.code === 'Escape' && state.phase === 'playing') pause();
  if ((e.code === 'Enter' || e.code === 'Space') && state.phase === 'menu') { hideOverlays(); startMatch(); }
  if ((e.code === 'Enter') && (state.phase === 'end')) { hideOverlays(); startMatch(); }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('mousedown', e => {
  if (e.button === 0) mouseDown = true;
});
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });

document.addEventListener('mousemove', e => {
  if (!pointerLocked || state.phase !== 'playing') return;
  const s = state.sens * 0.0021;
  player.angle += e.movementX * s;
  player.pitch -= e.movementY * s;
  player.pitch = Math.max(-0.38, Math.min(0.38, player.pitch));
});

document.addEventListener('pointerlockchange', () => {
  const wasLocked = pointerLocked;
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) { hadLock = true; $('ov-click').classList.remove('visible'); }
  if (wasLocked && !pointerLocked && hadLock && state.phase === 'playing') pause();
});

function requestLock() {
  if (canvas.requestPointerLock) {
    try { canvas.requestPointerLock(); } catch (e) {}
  }
}

// ---------- Overlays ----------
function hideOverlays() {
  ['ov-menu', 'ov-pause', 'ov-end', 'ov-click'].forEach(id => $(id).classList.remove('visible'));
}
function show(id) { $(id).classList.add('visible'); }

function pause() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused';
  document.exitPointerLock && document.exitPointerLock();
  show('ov-pause');
}

function resume() {
  if (state.phase !== 'paused') return;
  state.phase = 'playing';
  hideOverlays();
  requestLock();
}

// ---------- Match flow ----------
function startMatch() {
  state.phase = 'playing';
  state.kills = 0; state.deaths = 0; state.time = 0;
  state.shots = 0; state.hits = 0;
  state.killfeed = [];
  $('killfeed').innerHTML = '';

  // player reset
  const ps = PLAYER_SPAWNS[0];
  player.x = ps.x; player.y = ps.y;
  player.angle = -Math.PI / 2; player.pitch = 0;
  player.hp = 100; player.weapon = 0;
  player.ammo = [12, 30, 6];
  player.reloading = 0; player.fireCd = 0;
  player.dashCd = 0; player.dashT = 0;
  player.lastHurt = 99; player.spawnGrace = 2;
  player.deadT = 0;

  bots = [];
  projectiles = [];
  particles = [];
  tracers = [];
  botSerial = 0;
  for (let i = 0; i < 5; i++) spawnBot(i % 3 === 0 ? 'heavy' : (i % 2 === 0 ? 'sentry' : 'drone'), true);

  // pickups
  pickups = [];
  HEALTH_SPOTS.forEach((p, i) => pickups.push({ type: 'health', x: p.x, y: p.y, taken: 0, spot: i }));
  AMMO_SPOTS.forEach((p, i) => pickups.push({ type: 'ammo', x: p.x, y: p.y, taken: 0, spot: i }));

  ac();
  requestLock();
  hideOverlays();
  syncHUD(true);
}

function endMatch(victory) {
  state.phase = 'end';
  document.exitPointerLock && document.exitPointerLock();
  const el = $('end-title');
  el.textContent = victory ? 'VICTORY' : 'DEFEAT';
  el.className = victory ? '' : 'defeat';
  $('end-sub').textContent = victory ? 'ARENA CLEARED — RACE WON' : 'THE BOTS TOOK THE ARENA';
  const acc = state.shots ? Math.round((state.hits / state.shots) * 100) : 0;
  let bestLine = '';
  if (victory) {
    if (!state.bestTime || state.time < state.bestTime) {
      state.bestTime = state.time;
      localStorage.setItem('ns-best', String(state.time));
      bestLine = '<div class="st gold"><span>NEW BEST TIME</span><b>' + fmtTime(state.time) + '</b></div>';
    } else {
      bestLine = '<div class="st"><span>BEST TIME</span><b>' + fmtTime(state.bestTime) + '</b></div>';
    }
  }
  $('end-stats').innerHTML = `
    <div class="st"><span>KILLS</span><b>${state.kills}</b></div>
    <div class="st"><span>DEATHS</span><b>${state.deaths}</b></div>
    <div class="st"><span>ACCURACY</span><b>${acc}%</b></div>
    <div class="st"><span>TIME</span><b>${fmtTime(state.time)}</b></div>
    ${bestLine}
  `;
  victory ? SFX.victory() : SFX.defeat();
  show('ov-end');
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ---------- Bots ----------
const BOT_TYPES = {
  drone:  { hp: 42,  speed: 3.1, dmg: 7,  fireCd: 1.1, range: 7,  reaction: 0.45, projSpeed: 7.2, inacc: 0.10, w: 0.62, h: 1.05, score: 1 },
  sentry: { hp: 62,  speed: 2.35, dmg: 12, fireCd: 1.5, range: 11, reaction: 0.6,  projSpeed: 7.6, inacc: 0.06, w: 0.70, h: 1.30, score: 1 },
  heavy:  { hp: 105, speed: 1.6,  dmg: 19, fireCd: 2.0, range: 14, reaction: 0.8,  projSpeed: 8.0, inacc: 0.045, w: 0.86, h: 1.55, score: 1 },
};

function spawnBot(type, initial) {
  const T = BOT_TYPES[type];
  // pick spawn farthest from player, preferring the map's B spawns
  let best = null, bestD = -1;
  const spawns = BOT_SPAWNS.slice();
  if (initial) {
    // spread initial bots over distinct spawns
    const used = bots.map(b => b.spawnIdx);
    for (let i = 0; i < spawns.length; i++) if (!used.includes(i)) { best = spawns[i]; bestD = 1; break; }
  }
  if (!best) {
    for (let i = 0; i < spawns.length; i++) {
      const d = (spawns[i].x - player.x) ** 2 + (spawns[i].y - player.y) ** 2;
      if (!bots.some(b => b.spawnIdx === i && b.alive) && d > bestD) { bestD = d; best = spawns[i]; }
    }
  }
  if (!best) best = spawns[Math.floor(Math.random() * spawns.length)];
  const idx = spawns.indexOf(best);

  botSerial++;
  const name = type.toUpperCase() + '-' + String(botSerial).padStart(2, '0');
  bots.push({
    name, type, spawnIdx: idx,
    x: best.x, y: best.y, angle: Math.random() * Math.PI * 2,
    hp: T.hp, maxHp: T.hp,
    alive: true, state: 'wander', stateT: 0,
    lastKnown: null, reactionT: 0, fireCd: 1 + Math.random(), strafeDir: Math.random() < 0.5 ? -1 : 1, strafeT: 0,
    wanderT: null, frame: 0, frameT: 0, firing: 0,
    deadT: 0, spotted: false, wanderTarget: null,
  });
  return bots[bots.length - 1];
}

function botLOS(bot) {
  const dx = player.x - bot.x, dy = player.y - bot.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 20) return false;
  const hit = Engine.rayHit(level, bot.x, bot.y, dx / dist, dy / dist, dist);
  return hit.dist >= dist - 0.15;
}

function moveBot(bot, tx, ty, speed, dt) {
  const T = BOT_TYPES[bot.type];
  let dx = tx - bot.x, dy = ty - bot.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return true;
  dx /= d; dy /= d;
  const step = speed * dt;
  let nx = bot.x + dx * step;
  let ny = bot.y + dy * step;
  const r = 0.26;
  let moved = false;
  if (!blockedAt(nx, bot.y, r)) { bot.x = nx; moved = true; }
  if (!blockedAt(bot.x, ny, r)) { bot.y = ny; moved = true; }
  return moved && d < 0.3;
}

function blockedAt(x, y, r) {
  return level.solid(Math.floor(x - r), Math.floor(y - r)) ||
         level.solid(Math.floor(x + r), Math.floor(y - r)) ||
         level.solid(Math.floor(x - r), Math.floor(y + r)) ||
         level.solid(Math.floor(x + r), Math.floor(y + r));
}

function updateBot(bot, dt) {
  const T = BOT_TYPES[bot.type];

  if (!bot.alive) {
    bot.deadT -= dt;
    if (bot.deadT <= 0) {
      // respawn fresh
      const i = bots.indexOf(bot);
      bots.splice(i, 1);
      spawnBot(Math.random() < 0.4 ? 'heavy' : (Math.random() < 0.5 ? 'sentry' : 'drone'), false);
    }
    return;
  }

  bot.frameT += dt;
  if (bot.frameT > 0.22) { bot.frameT = 0; bot.frame ^= 1; }
  if (bot.firing > 0) bot.firing -= dt;

  const los = botLOS(bot);
  const dx = player.x - bot.x, dy = player.y - bot.y;
  const dist = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);
  bot.lastSeen = los ? bot.lastSeen : bot.lastSeen;
  if (los) {
    bot.lastKnown = { x: player.x, y: player.y };
    bot.spotted = true;
    if (state.phase === 'playing' && player.spawnGrace <= 0) {
      if (bot.reactionT === null || bot.reactionT === undefined) bot.reactionT = T.reaction;
    }
  } else if (bot.spotted) {
    bot.lostT = (bot.lostT || 0) + dt;
  }

  bot.stateT += dt;

  switch (bot.state) {
    case 'wander': {
      if (los && dist < 17) { bot.state = 'alert'; bot.stateT = 0; bot.reactionT = T.reaction; break; }
      if (!bot.wanderTarget || bot.stateT > 6 || moveBot(bot, bot.wanderTarget.x, bot.wanderTarget.y, T.speed * 0.55, dt)) {
        bot.wanderTarget = randomOpen();
        bot.stateT = 0;
      }
      bot.angle = angleLerp(bot.angle, Math.atan2((bot.wanderTarget?.y ?? bot.y) - bot.y, (bot.wanderTarget?.x ?? bot.x) - bot.x), 6 * dt);
      break;
    }
    case 'alert': {
      bot.reactionT -= dt;
      bot.angle = angleLerp(bot.angle, toPlayer, 10 * dt);
      moveBot(bot, bot.x + dx * 0.5, bot.y + dy * 0.5, T.speed * 0.75, dt);
      if (!los) { bot.state = 'search'; bot.stateT = 0; }
      if (bot.reactionT <= 0 && los) { bot.state = 'combat'; bot.stateT = 0; }
      break;
    }
    case 'search': {
      bot.angle = angleLerp(bot.angle, Math.atan2(bot.lastKnown.y - bot.y, bot.lastKnown.x - bot.x), 6 * dt);
      const arrived = moveBot(bot, bot.lastKnown.x, bot.lastKnown.y, T.speed * 0.8, dt);
      if (los) { bot.state = 'combat'; bot.stateT = 0; break; }
      if (arrived || bot.stateT > 6) { bot.state = 'wander'; bot.stateT = 0; bot.wanderTarget = null; }
      break;
    }
    case 'combat': {
      if (!los && bot.stateT > 0.8) { bot.state = 'search'; bot.stateT = 0; break; }
      bot.angle = angleLerp(bot.angle, toPlayer, 12 * dt);

      // spacing: maintain preferred range
      const want = T.range * 0.55;
      let mvx = 0, mvy = 0;
      if (dist > want + 1.2) { mvx = dx / dist; mvy = dy / dist; }
      else if (dist < want - 1.2) { mvx = -dx / dist; mvy = -dy / dist; }

      // strafe
      bot.strafeT -= dt;
      if (bot.strafeT <= 0) { bot.strafeDir *= -1; bot.strafeT = 1 + Math.random() * 1.4; }
      const px = -dy / dist, py = dx / dist;
      mvx += px * bot.strafeDir * 0.9;
      mvy += py * bot.strafeDir * 0.9;

      const ml = Math.hypot(mvx, mvy);
      if (ml > 0.01) {
        moveBot(bot, bot.x + (mvx / ml) * 2, bot.y + (mvy / ml) * 2, T.speed, dt);
      }

      // fire
      bot.fireCd -= dt;
      if (bot.fireCd <= 0 && dist < T.range + 2 && player.spawnGrace <= 0) {
        bot.fireCd = T.fireCd * (0.85 + Math.random() * 0.4);
        bot.firing = 0.12;
        const spread = (Math.random() - 0.5) * 2 * T.inacc;   // symmetric ±inaccuracy
        const a = toPlayer + spread;
        projectiles.push({
          x: bot.x + Math.cos(a) * 0.45, y: bot.y + Math.sin(a) * 0.45, z: 0.55,
          vx: Math.cos(a) * T.projSpeed, vy: Math.sin(a) * T.projSpeed,
          dmg: T.dmg, life: 2.6, botName: bot.name,
        });
        if (distToPlayerAudio(bot.x, bot.y) < 14) SFX.enemyShot();
      }
      break;
    }
  }
}

function distToPlayerAudio(x, y) { return Math.hypot(player.x - x, player.y - y); }

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function randomOpen() {
  for (let i = 0; i < 200; i++) {
    const x = 1 + Math.floor(Math.random() * (COLS - 2));
    const y = 1 + Math.floor(Math.random() * (ROWS - 2));
    if (!level.solid(x, y)) return { x: x + 0.5, y: y + 0.5 };
  }
  return { x: 2.5, y: 2.5 };
}

// ---------- Player ----------
function switchWeapon(i) {
  if (i === player.weapon) return;
  player.weapon = i;
  player.reloading = 0;
  updateWeaponSlots();
  tone(500 + i * 140, 0.06, 'square', 0.05);
}

function startReload() {
  const W = WEAPONS[player.weapon];
  if (player.reloading > 0 || player.ammo[player.weapon] >= W.mag) return;
  if (W.reserve !== Infinity && player.reserveLeft(player.weapon) <= 0) return;
  player.reloading = W.reloadTime;
  player.reloadTotal = W.reloadTime;
  $('reload-bar').classList.add('on');
  SFX.reload();
}

// reserve helper on player (computed)
player.reserveLeft = function (i) {
  const W = WEAPONS[i];
  if (W.reserve === Infinity) return Infinity;
  return player.reserve[i];
};
player.reserve = [0, 150, 36];

function finishReload() {
  const W = WEAPONS[player.weapon];
  if (W.reserve === Infinity) {
    player.ammo[player.weapon] = W.mag;
  } else {
    const need = W.mag - player.ammo[player.weapon];
    const have = Math.min(need, player.reserve[player.weapon]);
    player.ammo[player.weapon] += have;
    player.reserve[player.weapon] -= have;
  }
  SFX.reloadDone();
  $('reload-bar').classList.remove('on');
}

function tryDash() {
  if (player.dashCd > 0) return;
  player.dashCd = 2.5;
  player.dashT = 0.16;
  const d = player.lastMoveDir || { x: Math.cos(player.angle), y: Math.sin(player.angle) };
  player.dashVx = d.x * 14; player.dashVy = d.y * 14;
  SFX.dash();
}

function tryFire() {
  const W = WEAPONS[player.weapon];
  if (player.fireCd > 0 || player.reloading > 0) return;
  if (player.ammo[player.weapon] <= 0) {
    SFX.empty();
    startReload();
    return;
  }
  player.ammo[player.weapon]--;
  player.fireCd = W.interval;
  state.shots++;

  // view kick
  player.kick = Math.min(0.05, player.kick + (W.id === 'scatter' ? 0.045 : 0.02));
  player.recoil = 1;
  player.muzzle = 1;
  fx.muzzle = 1;

  if (W.id === 'pistol') SFX.pistol();
  else if (W.id === 'rifle') SFX.rifle();
  else SFX.shotgun();

  // hitscan per pellet
  let anyHit = false;
  for (let p = 0; p < W.pellets; p++) {
    const spread = (Math.random() - 0.5) * W.spread * 2;
    const a = player.angle + spread;
    const rx = Math.cos(a), ry = Math.sin(a);
    const wall = Engine.rayHit(level, player.x, player.y, rx, ry, 60);
    let hitBot = null, hitDist = wall.dist;
    for (const b of bots) {
      if (!b.alive) continue;
      const t = rayCircle(player.x, player.y, rx, ry, b.x, b.y, 0.33);
      if (t !== null && t > 0.2 && t < hitDist) { hitDist = t; hitBot = b; }
    }
    if (hitBot) {
      anyHit = true;
      damageBot(hitBot, W.dmg, a);
      particles.push({ type: 'spark', x: player.x + rx * hitDist, y: player.y + ry * hitDist, z: 0.8, t: 0.18 });
    } else {
      particles.push({ type: 'spark', x: player.x + rx * wall.dist, y: player.y + ry * wall.dist, z: 0.5, t: 0.14, small: true });
    }

    // tracer to first obstacle
    const tp = Engine.project(level, player, player.x + rx * hitDist, player.y + ry * hitDist, 0.6);
    if (tp) tracers.push({ sx: Engine.width * 0.62, sy: Engine.height * 0.86, ex: tp.x, ey: tp.y, t: 0.055 });
  }
  if (anyHit) {
    state.hits++;
    const hm = $('hitmarker');
    hm.classList.add('show');
    setTimeout(() => hm.classList.remove('show'), 90);
    SFX.hit();
  }

  // recoil pitch nudge
  player.pitch = Math.min(0.38, player.pitch + 0.006 + W.spread * 0.05);
}

function rayCircle(px, py, rx, ry, cx, cy, cr) {
  // ray-circle intersection, ray normalized
  const ox = cx - px, oy = cy - py;
  const t = ox * rx + oy * ry;
  if (t < 0) return null;
  const d2 = ox * ox + oy * oy - t * t;
  if (d2 > cr * cr) return null;
  const dt = Math.sqrt(cr * cr - d2);
  return t - dt;
}

function damageBot(bot, dmg, fromAngle) {
  bot.hp -= dmg;
  bot.hitFlash = 0.12;
  // alert the bot when shot
  if (bot.alive && bot.state === 'wander') { bot.state = 'search'; bot.lastKnown = { x: player.x, y: player.y }; bot.stateT = 0; }
  if (bot.hp <= 0 && bot.alive) {
    bot.alive = false;
    bot.deadT = 2.8;
    state.kills++;
    addKillfeed(`<b>YOU</b> ▸ ${bot.name} ELIMINATED`, false);
    SFX.kill();
    const hm = $('hitmarker');
    hm.classList.add('show', 'kill');
    setTimeout(() => hm.classList.remove('show', 'kill'), 220);
    fx.shake = Math.max(fx.shake, 5);
    // streaks
    if (state.kills === 5) streak('RAMPAGE!');
    if (state.kills === 10) streak('DOMINATING!');
    if (state.kills === 15) streak('UNSTOPPABLE!');
    if (state.kills === state.target - 1) streak('ONE TO GO!');
    if (state.kills >= state.target) { syncHUD(true); endMatch(true); return; }
    syncHUD(true);
  }
}

function damagePlayer(dmg, sourceName) {
  if (state.phase !== 'playing' || player.spawnGrace > 0) return;
  player.hp -= dmg;
  player.lastHurt = 0;
  fx.shake = Math.max(fx.shake, 6);
  $('damage-flash').style.opacity = String(Math.min(1, 0.4 + dmg / 40));
  setTimeout(() => { $('damage-flash').style.opacity = '0'; }, 60);
  SFX.hurt();
  if (player.hp <= 0) {
    player.hp = 0;
    die();
  }
  syncHUD(true);
}

function die() {
  state.phase = 'dead';
  state.deaths++;
  player.deadT = 2.6;
  addKillfeed(`<b>${'BOTS'}</b> ▸ YOU ELIMINATED`, true);
  SFX.death();
  syncHUD(true);
}

function respawnPlayer() {
  // spawn point farthest from living bots
  let best = PLAYER_SPAWNS[0], bestD = -1;
  for (const s of PLAYER_SPAWNS) {
    let d = 1e9;
    for (const b of bots) if (b.alive) d = Math.min(d, (s.x - b.x) ** 2 + (s.y - b.y) ** 2);
    if (d > bestD) { bestD = d; best = s; }
  }
  player.x = best.x; player.y = best.y;
  player.hp = 100;
  player.ammo = [Math.max(player.ammo[0], 12), Math.max(player.ammo[1], 30), Math.max(player.ammo[2], 6)];
  player.reloading = 0;
  player.spawnGrace = 1.6;
  player.pitch = 0;
  state.phase = 'playing';
}

// ---------- Pickups ----------
function updatePickups(dt) {
  for (const p of pickups) {
    if (p.taken > 0) {
      p.taken -= dt;
      continue;
    }
    const d = Math.hypot(player.x - p.x, player.y - p.y);
    if (d < 0.6) {
      if (p.type === 'health') {
        if (player.hp >= 100) continue;
        player.hp = Math.min(100, player.hp + 35);
      } else {
        player.reserve[1] = Math.min(240, player.reserve[1] + 50);
        player.reserve[2] = Math.min(60, player.reserve[2] + 14);
      }
      p.taken = 15;
      SFX.pickup();
      syncHUD(true);
    }
  }
}

// ---------- Projectiles ----------
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy) * dt) / 0.25));
    const sdt = dt / steps;
    let dead = false;
    for (let s = 0; s < steps && !dead; s++) {
      pr.x += pr.vx * sdt;
      pr.y += pr.vy * sdt;
      pr.life -= sdt;
      if (level.solid(Math.floor(pr.x), Math.floor(pr.y))) {
        particles.push({ type: 'spark', x: pr.x, y: pr.y, z: pr.z, t: 0.16 });
        dead = true;
      } else if (state.phase === 'playing' && Math.hypot(player.x - pr.x, player.y - pr.y) < 0.34) {
        damagePlayer(pr.dmg, pr.botName);
        dead = true;
      }
      if (pr.life <= 0) dead = true;
    }
    if (dead) projectiles.splice(i, 1);
  }
}

// ---------- Player movement ----------
function updatePlayer(dt) {
  if (state.phase !== 'playing' && state.phase !== 'dead') return;
  if (state.phase === 'dead') {
    player.deadT -= dt;
    if (player.deadT <= 0) {
      if (state.deaths >= state.target) endMatch(false);
      else respawnPlayer();
    }
    return;
  }

  player.spawnGrace = Math.max(0, player.spawnGrace - dt);
  player.lastHurt += dt;
  if (player.lastHurt > 6 && player.hp < 100 && player.hp > 0) {
    player.hp = Math.min(100, player.hp + 4 * dt);
  }

  player.fireCd -= dt;
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.muzzle = Math.max(0, player.muzzle - dt * 6);
  player.kick = Math.max(0, player.kick - dt * 0.12);
  player.recoil = Math.max(0, player.recoil - dt * 4);

  if (player.reloading > 0) {
    player.reloading -= dt;
    const frac = 1 - player.reloading / player.reloadTotal;
    $('reload-fill').style.width = (frac * 100) + '%';
    if (player.reloading <= 0) {
      player.reloading = 0;
      finishReload();
    }
  }

  // movement input (camera-relative)
  let mx = 0, my = 0;
  if (keys['KeyW']) my += 1;
  if (keys['KeyS']) my -= 1;
  if (keys['KeyA']) mx -= 1;
  if (keys['KeyD']) mx += 1;
  player.sprinting = !!keys['ShiftLeft'] || !!keys['ShiftRight'];

  const fwdX = Math.cos(player.angle), fwdY = Math.sin(player.angle);
  const rightX = -fwdY, rightY = fwdX;
  let vx = fwdX * my + rightX * mx;
  let vy = fwdY * my + rightY * mx;
  const vl = Math.hypot(vx, vy);
  player.moving = vl > 0.01;
  if (vl > 0.01) {
    vx /= vl; vy /= vl;
    player.lastMoveDir = { x: vx, y: vy };
  }

  let speed = player.speed * (player.sprinting ? player.sprintMul : 1);
  let dx = vx * speed * dt;
  let dy = vy * speed * dt;

  // dash burst
  if (player.dashT > 0) {
    player.dashT -= dt;
    dx += player.dashVx * dt;
    dy += player.dashVy * dt;
  }

  const r = 0.22;
  if (!blockedAt(player.x + dx, player.y, r)) player.x += dx;
  if (!blockedAt(player.x, player.y + dy, r)) player.y += dy;

  // head bob + steps
  if (player.moving) {
    player.bobT += dt * (player.sprinting ? 11 : 8);
    player.stepT -= dt * (player.sprinting ? 1.5 : 1);
    if (player.stepT <= 0) { player.stepT = 0.36; SFX.step(); }
  } else {
    player.bobT += dt * 2;
  }

  // firing
  const W = WEAPONS[player.weapon];
  if (mouseDown) {
    if (W.auto) tryFire();
    else if (!player.semiLatch) { tryFire(); player.semiLatch = true; }
  } else {
    player.semiLatch = false;
  }
}

// ---------- FX ----------
function streak(msg) {
  const el = $('streak-msg');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1500);
}

function addKillfeed(html, enemy) {
  const el = document.createElement('div');
  el.className = 'kf-item' + (enemy ? ' enemy' : '');
  el.innerHTML = html;
  $('killfeed').appendChild(el);
  while ($('killfeed').children.length > 5) $('killfeed').firstChild.remove();
  setTimeout(() => el.remove(), 4200);
}

function toggleMute() {
  muted = !muted;
  localStorage.setItem('ns-muted', muted ? '1' : '0');
  streak(muted ? 'SOUND OFF' : 'SOUND ON');
}

// ---------- HUD ----------
function updateWeaponSlots() {
  const el = $('weapons');
  el.innerHTML = WEAPONS.map((w, i) =>
    `<div class="wslot ${i === player.weapon ? 'active' : ''}" data-i="${i}">
       <div class="wkey">${i + 1}</div><div class="wname">${w.name.split(' ')[1] || w.name}</div>
     </div>`).join('');
  const ammo = player.ammo[player.weapon];
  const W = WEAPONS[player.weapon];
  $('ammo-num').textContent = ammo;
  $('ammo-num').classList.toggle('low', ammo <= Math.ceil(W.mag * 0.25));
  $('ammo-reserve').textContent = W.reserve === Infinity ? '∞' : player.reserve[player.weapon];
  $('ammo-weapon').textContent = W.name;
}

let hudTick = 0;
function syncHUD(force) {
  if (!force && hudTick++ % 5 !== 0) return;
  $('hud-you').textContent = state.kills;
  $('hud-bots').textContent = state.deaths;
  $('hud-target').textContent = state.target;

  // hp
  const hpPct = Math.max(0, Math.round(player.hp));
  $('hp-fill').style.width = hpPct + '%';
  $('hp-fill').classList.toggle('low', hpPct <= 35);
  $('hp-num').textContent = hpPct;
  $('low-hp').classList.toggle('on', hpPct <= 30 && state.phase === 'playing');

  // indicators
  $('sprint-ind').classList.toggle('active', player.sprinting && player.moving);
  const dash = $('dash-ind');
  dash.classList.toggle('cool', player.dashCd > 0);
  dash.classList.toggle('ready', player.dashCd <= 0);
  dash.textContent = player.dashCd > 0 ? `⇢ ${player.dashCd.toFixed(1)}s` : '⇢ DASH';

  updateWeaponSlots();
}

function drawMinimap() {
  const S = minimapC.width;      // 164
  const cell = S / 24;
  mmCtx.clearRect(0, 0, S, S);
  // floor
  mmCtx.fillStyle = 'rgba(6, 9, 18, 0.85)';
  mmCtx.fillRect(0, 0, S, S);
  // walls
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = MAP[y][x];
      if (ch === '.') continue;
      let col = 'rgba(60, 80, 140, 0.55)';
      if (ch === '3') col = 'rgba(0, 240, 192, 0.5)';
      if (ch === '4') col = 'rgba(255, 56, 150, 0.5)';
      if (ch === '2') col = 'rgba(90, 110, 170, 0.5)';
      mmCtx.fillStyle = col;
      mmCtx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }
  // pickups
  for (const p of pickups) {
    if (p.taken > 0) continue;
    mmCtx.fillStyle = p.type === 'health' ? '#ff3860' : '#ffb020';
    mmCtx.fillRect(p.x * cell - 1.5, p.y * cell - 1.5, 3, 3);
  }
  // bots
  for (const b of bots) {
    if (!b.alive) continue;
    mmCtx.fillStyle = b.state === 'wander' ? 'rgba(255, 90, 110, 0.75)' : '#ff3860';
    mmCtx.beginPath();
    mmCtx.arc(b.x * cell, b.y * cell, 2.4, 0, Math.PI * 2);
    mmCtx.fill();
  }
  // player arrow
  const pxm = player.x * cell, pym = player.y * cell;
  mmCtx.save();
  mmCtx.translate(pxm, pym);
  mmCtx.rotate(player.angle);
  mmCtx.fillStyle = '#00f0c0';
  mmCtx.beginPath();
  mmCtx.moveTo(6, 0); mmCtx.lineTo(-4, 4); mmCtx.lineTo(-4, -4);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();
}

// ---------- Weapon view model ----------
function drawWeapon(dt) {
  const W = WEAPONS[player.weapon];
  const w = Engine.width, h = Engine.height;
  const bob = player.moving ? Math.sin(player.bobT) * 6 : Math.sin(player.bobT) * 1.5;
  const bobX = player.moving ? Math.cos(player.bobT * 0.5) * 4 : 0;
  const recoil = player.recoil * (W.id === 'scatter' ? 34 : (W.id === 'rifle' ? 14 : 18));
  const reloadDip = player.reloading > 0 ? Math.sin((1 - player.reloading / player.reloadTotal) * Math.PI) * 60 : 0;

  const bx = w * 0.63 + bobX;
  const by = h * 0.96 + bob + recoil + reloadDip;

  const g = canvas.getContext('2d');
  g.save();
  g.translate(bx, by);

  const metal = '#232f4e';
  const dark = '#141c30';
  const accent = W.id === 'pistol' ? '#00f0c0' : W.id === 'rifle' ? '#38a0ff' : '#ffb020';
  const scale = h / 540;
  g.scale(scale, scale);

  g.rotate(-0.06);
  // soft rim light so the gun reads against dark walls
  g.shadowColor = 'rgba(120, 170, 255, 0.35)';
  g.shadowBlur = 10;
  if (W.id === 'pistol') {
    // grip
    g.fillStyle = dark;
    g.fillRect(-26, -70, 60, 84);
    // slide
    g.fillStyle = metal;
    g.strokeStyle = accent;
    g.lineWidth = 2;
    roundRectPath(g, -46, -104, 118, 40, 6);
    g.fill(); g.stroke();
    // barrel tip glow line
    g.fillStyle = accent;
    g.fillRect(-40, -96, 100, 4);
    // sights
    g.fillStyle = dark;
    g.fillRect(-30, -112, 8, 10);
    g.fillRect(52, -112, 8, 10);
  } else if (W.id === 'rifle') {
    g.fillStyle = dark;
    g.fillRect(-40, -64, 66, 80);
    g.fillStyle = metal;
    g.strokeStyle = accent;
    g.lineWidth = 2;
    roundRectPath(g, -74, -112, 208, 42, 8);
    g.fill(); g.stroke();
    g.fillStyle = dark;
    roundRectPath(g, 100, -108, 60, 26, 6); g.fill();
    g.fillStyle = accent;
    g.fillRect(-60, -100, 170, 4);
    // mag
    g.fillStyle = metal;
    roundRectPath(g, -18, -72, 34, 44, 4); g.fill();
  } else {
    // scattergun: wide twin barrels
    g.fillStyle = dark;
    g.fillRect(-34, -60, 62, 78);
    g.fillStyle = metal;
    g.strokeStyle = accent;
    g.lineWidth = 2;
    roundRectPath(g, -80, -108, 40, 46, 7); g.fill(); g.stroke();
    roundRectPath(g, -36, -108, 40, 46, 7); g.fill(); g.stroke();
    g.fillStyle = accent;
    g.fillRect(-76, -102, 32, 5);
    g.fillRect(-32, -102, 32, 5);
    // pump
    g.fillStyle = dark;
    roundRectPath(g, -6, -84, 70, 26, 6); g.fill();
  }

  // muzzle flash
  if (player.muzzle > 0.15) {
    const mx = W.id === 'pistol' ? -40 : W.id === 'rifle' ? 60 : -56;
    const my = W.id === 'rifle' ? -92 : -88;
    const s = (0.8 + Math.random() * 0.5) * (W.id === 'scatter' ? 70 : 55);
    g.globalAlpha = Math.min(1, player.muzzle);
    g.drawImage(Assets.flash, mx - s / 2, my - s / 2, s, s);
    g.globalAlpha = 1;
  }

  g.restore();
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------- Sprite list builder ----------
function buildSprites() {
  const list = [];
  // pickups
  for (const p of pickups) {
    if (p.taken > 0) continue;
    const img = p.type === 'health' ? Assets.health : Assets.ammo;
    list.push({ x: p.x, y: p.y, img, w: 0.5, h: 0.5, float: 0.18 + Math.sin(performance.now() / 420 + p.spot) * 0.05 });
  }
  // bots
  for (const b of bots) {
    const frames = Assets.bots[b.type];
    let img = b.state === 'combat' && b.firing > 0 ? frames.attack : (b.frame ? frames.walk2 : frames.walk1);
    if (!b.alive) img = frames.idle;
    const T = BOT_TYPES[b.type];
    list.push({
      x: b.x, y: b.y, img,
      w: T.w, h: T.h,
      float: 0,
      alpha: b.alive ? 1 : Math.max(0, b.deadT / 2.8) * 0.85,
      dead: !b.alive,
    });
  }
  // projectiles
  for (const p of projectiles) {
    list.push({ x: p.x, y: p.y, img: Assets.projectile, w: 0.3, h: 0.3, float: p.z - 0.15 });
  }
  // impact sparks (world sprites)
  for (const pt of particles) {
    if (pt.type !== 'spark') continue;
    list.push({ x: pt.x, y: pt.y, img: Assets.spark, w: pt.small ? 0.2 : 0.3, h: pt.small ? 0.2 : 0.3, float: Math.max(0, pt.z - 0.1), alpha: Math.min(1, pt.t * 6) });
  }
  return list;
}

// ---------- Main loop ----------
let lastT = performance.now();
let acc = 0;
const FIXED = 1 / 60;
let frameCostAvg = 16;
let qualityCooldown = 2;

function pump() {
  const now = performance.now();
  let dt = Math.min((now - lastT) / 1000, 0.12);
  lastT = now;

  acc += dt;
  let steps = 0;
  while (acc >= FIXED && steps < 8) {
    step(FIXED);
    acc -= FIXED;
    steps++;
  }

  render(now);
  return dt;
}

function step(dt) {
  if (state.phase === 'playing' || state.phase === 'dead') {
    state.time += dt;
    updatePlayer(dt);
    for (const b of bots) updateBot(b, dt);
    updateProjectiles(dt);
    updatePickups(dt);
  }
  // fx decay
  fx.shake = Math.max(0, fx.shake - dt * 26);
  fx.muzzle = Math.max(0, fx.muzzle - dt * 7);
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].t -= dt;
    if (particles[i].t <= 0) particles.splice(i, 1);
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t -= dt;
    if (tracers[i].t <= 0) tracers.splice(i, 1);
  }
  if (state.phase !== 'menu') syncHUD(false);
  $('hud-timer').textContent = fmtTime(state.time);
}

function render(now) {
  const t0 = performance.now();

  hud.classList.toggle('hidden', state.phase === 'menu');
  $('ov-click').classList.toggle('visible', state.phase === 'playing' && !pointerLocked && !hadLock);

  const sprites = buildSprites();
  Engine.render(level, player, sprites, fx);

  // tracers (screen space)
  if (tracers.length) {
    const g = canvas.getContext('2d');
    g.save();
    for (const tr of tracers) {
      g.globalAlpha = Math.min(1, tr.t * 22);
      g.strokeStyle = 'rgba(140, 255, 230, 0.9)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(tr.sx, tr.sy);
      g.lineTo(tr.ex, tr.ey);
      g.stroke();
    }
    g.restore();
  }

  // weapon & minimap
  if (state.phase !== 'menu' && state.phase !== 'end') drawWeapon();
  if (state.phase !== 'menu') drawMinimap();

  const cost = performance.now() - t0;
  frameCostAvg = frameCostAvg * 0.94 + cost * 0.06;
  if (qualityCooldown > 0) qualityCooldown -= 1 / 60;
  else if (frameCostAvg > 15.5 && Engine.getScale() > 0.6) {
    Engine.setScale(Engine.getScale() - 0.1);
    qualityCooldown = 2;
  } else if (frameCostAvg < 9 && Engine.getScale() < 1.0) {
    Engine.setScale(Engine.getScale() + 0.05);
    qualityCooldown = 3;
  }
}

// rAF + interval double-pump (robust in throttled/headless contexts)
let lastPump = 0;
function rafLoop() {
  lastPump = performance.now();
  pump();
  requestAnimationFrame(rafLoop);
}
requestAnimationFrame(rafLoop);
setInterval(() => {
  if (performance.now() - lastPump > 40) pump();
}, 50);

// ---------- Buttons / UI wiring ----------
$('btn-play').addEventListener('click', () => { ac(); hideOverlays(); startMatch(); });
$('btn-again').addEventListener('click', () => { hideOverlays(); startMatch(); });
$('btn-menu').addEventListener('click', () => { state.phase = 'menu'; show('ov-menu'); $('menu-best').textContent = state.bestTime ? 'BEST TIME: ' + fmtTime(state.bestTime) : 'BEST TIME: —'; });
$('btn-resume').addEventListener('click', resume);
$('btn-quit').addEventListener('click', () => { state.phase = 'menu'; show('ov-menu'); hideOthers('ov-menu'); });
function hideOthers(keep) { ['ov-pause', 'ov-end', 'ov-click'].forEach(id => { if (id !== keep) $(id).classList.remove('visible'); }); }

// sensitivity sliders (menu + pause, kept in sync)
function bindSens(input, label) {
  input.value = state.sens;
  label.textContent = Number(state.sens).toFixed(1) + '×';
  input.addEventListener('input', () => {
    state.sens = parseFloat(input.value);
    localStorage.setItem('ns-sens', String(state.sens));
    label.textContent = state.sens.toFixed(1) + '×';
    if (input === $('sens')) $('sens2').value = state.sens;
    else $('sens').value = state.sens;
    $('sens-val').textContent = state.sens.toFixed(1) + '×';
    $('sens2-val').textContent = state.sens.toFixed(1) + '×';
  });
}
bindSens($('sens'), $('sens-val'));
bindSens($('sens2'), $('sens2-val'));

// ---------- Touch controls ----------
(function touchSetup() {
  const zone = $('stick-zone');
  const knob = $('stick-knob');
  let stickId = null, sx = 0, sy = 0;
  const touchState = { mx: 0, my: 0 };

  zone.addEventListener('pointerdown', e => { stickId = e.pointerId; sx = e.clientX; sy = e.clientY; zone.setPointerCapture(e.pointerId); });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - sx, dy = e.clientY - sy;
    const d = Math.hypot(dx, dy);
    const max = 46;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchState.mx = dx / max; touchState.my = -dy / max;
    keys['KeyW'] = touchState.my > 0.3;
    keys['KeyS'] = touchState.my < -0.3;
    keys['KeyA'] = touchState.mx < -0.3;
    keys['KeyD'] = touchState.mx > 0.3;
  });
  const endStick = e => {
    if (e.pointerId !== stickId) return;
    stickId = null; knob.style.transform = '';
    keys['KeyW'] = keys['KeyS'] = keys['KeyA'] = keys['KeyD'] = false;
  };
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);

  // look: drag anywhere on canvas (right half)
  let lookId = null, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (e.clientX < window.innerWidth * 0.4) return;
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    const s = state.sens * 0.0035;
    player.angle += dx * s;
    player.pitch = Math.max(-0.38, Math.min(0.38, player.pitch - dy * s));
  });
  const endLook = e => { if (e.pointerId === lookId) lookId = null; };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  const fireBtn = $('btn-fire');
  fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); mouseDown = true; });
  fireBtn.addEventListener('pointerup', e => { e.preventDefault(); mouseDown = false; });
  fireBtn.addEventListener('pointercancel', () => { mouseDown = false; });
  $('btn-dash-t').addEventListener('pointerdown', e => { e.preventDefault(); tryDash(); });
  $('btn-swap-t').addEventListener('pointerdown', e => { e.preventDefault(); switchWeapon((player.weapon + 1) % 3); });
})();

// ---------- Init ----------
Engine.init(canvas);
$('menu-best').textContent = state.bestTime ? 'BEST TIME: ' + fmtTime(state.bestTime) : 'BEST TIME: —';
syncHUD(true);

// ---------- Test / debug hooks ----------
window.GAME = {
  state, player,
  get bots() { return bots; },
  get projectiles() { return projectiles; },
  get pickups() { return pickups; },
  MAP, level,
  start: () => { hideOverlays(); startMatch(); },
  step: (dt, draw = true) => { step(dt); if (draw) render(performance.now()); },
  sim: (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) step(dt); },   // fast batch, no draw
  renderNow: () => render(performance.now()),
  setYaw: a => { player.angle = a; },
  teleport: (x, y) => { player.x = x; player.y = y; },
  lookAt: (x, y) => { player.angle = Math.atan2(y - player.y, x - player.x); },
  setHp: v => { player.hp = v; },
  giveKills: n => { for (let i = 0; i < n; i++) { state.kills++; } syncHUD(true); if (state.kills >= state.target) endMatch(true); },
  forceMount: () => { pointerLocked = true; hadLock = true; state.phase = 'playing'; },
  fire: () => tryFire(),
  spawnBot,
  setMouse: v => { mouseDown = v; },
};
