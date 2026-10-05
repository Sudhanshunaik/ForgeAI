/* ==========================================================================
   NeonSnake — vanilla canvas Snake on a 20x20 grid.
   No dependencies, no external assets, no network calls at runtime.
   Debug hook (for tests): window.__snake
   ========================================================================== */
(function () {
  'use strict';

  /* --------------------------------------------------------------- config */
  var GRID = 20;            // cells per side
  var BASE_TICK = 160;      // ms per move at level 1  -> 6.25 cells/s
  var LEVEL_STEP = 10;      // ms shaved off the tick per level
  var MIN_TICK = 70;        // hard floor on the tick — agrees with MAX_LEVEL (160 - 9*10)
  var MAX_LEVEL = 10;       // level cap, so top speed is 1000/70 = 14.3 cells/s
  var START_LEN = 3;
  var BEST_KEY = 'snake_best';
  var SWIPE_MIN = 22;       // px a finger must travel to count as a swipe
  var MAX_QUEUE = 2;        // queued turns per tick window

  var DIRS = {
    up:    { r: -1, c: 0 },
    down:  { r: 1,  c: 0 },
    left:  { r: 0,  c: -1 },
    right: { r: 0,  c: 1 }
  };

  var KEY_DIR = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', a: 'left', s: 'down', d: 'right',
    W: 'up', A: 'left', S: 'down', D: 'right'
  };

  /* ------------------------------------------------------------------ dom */
  var canvas       = document.getElementById('game');
  var ctx          = canvas.getContext('2d');
  var board        = document.getElementById('board');
  var boardWrap    = document.getElementById('board-wrap');
  var overlay      = document.getElementById('overlay');
  var ovKicker     = document.getElementById('overlay-kicker');
  var ovTitle      = document.getElementById('overlay-title');
  var ovSub        = document.getElementById('overlay-sub');
  var ovBtn        = document.getElementById('overlay-btn');
  var btnStart     = document.getElementById('btn-start');
  var btnPause     = document.getElementById('btn-pause');
  var btnRestart   = document.getElementById('btn-restart');
  var hudScore     = document.getElementById('hud-score');
  var hudBest      = document.getElementById('hud-best');
  var hudLevel     = document.getElementById('hud-level');
  var hudSpeed     = document.getElementById('hud-speed');
  var liveStatus   = document.getElementById('status');

  /* ---------------------------------------------------------------- state */
  var phase = 'start';           // 'start' | 'playing' | 'paused' | 'gameover'
  var snake = [];                // [{r,c}] — index 0 is the head
  var dir = 'right';
  var pending = [];              // queued directions
  var food = null;               // {r,c}
  var score = 0;
  var best = 0;
  var ticks = 0;                 // ticks actually executed
  var won = false;
  var acc = 0;                   // ms accumulated toward the next tick
  var cell = 30;                 // device px per cell
  var fx = [];                   // eat particles
  var ripples = [];              // eat shockwaves
  var lastTs = 0;
  var rafId = 0;

  /* ------------------------------------------------------------- helpers */
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function level() {
    return Math.min(MAX_LEVEL, 1 + Math.floor(score / 5));
  }
  function tickMs() {
    return Math.max(MIN_TICK, BASE_TICK - (level() - 1) * LEVEL_STEP);
  }
  function cellsPerSecond() {
    return 1000 / tickMs();
  }
  function announce(msg) {
    liveStatus.textContent = msg;
  }

  /* ------------------------------------------------------------ persistence */
  function loadBest() {
    var raw = null;
    try { raw = window.localStorage.getItem(BEST_KEY); } catch (e) { raw = null; }
    var n = parseInt(raw, 10);
    best = (isFinite(n) && n > 0) ? n : 0;
  }
  function saveBest() {
    try { window.localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* private mode */ }
  }

  /* -------------------------------------------------------------- hud / ui */
  function updateHud() {
    hudScore.textContent = String(score);
    hudBest.textContent = String(best);
    hudLevel.textContent = String(level());
    hudSpeed.textContent = cellsPerSecond().toFixed(1);
  }

  function showOverlay(kicker, title, sub, btnLabel) {
    ovKicker.textContent = kicker;
    ovTitle.textContent = title;
    ovSub.textContent = sub;
    ovBtn.textContent = btnLabel;
    // keep the accessible name in sync with the visible label
    ovBtn.setAttribute('aria-label', btnLabel === 'Play' ? 'Play NeonSnake' : btnLabel);
    overlay.hidden = false;
  }

  function syncUi() {
    if (phase === 'playing') {
      overlay.hidden = true;
    } else if (phase === 'paused') {
      showOverlay('Paused', 'PAUSED', 'Press Space or P (or the button) to resume.', 'Resume');
    } else if (phase === 'gameover') {
      showOverlay(
        won ? 'Board cleared' : 'Game over',
        won ? 'PERFECT RUN' : 'GAME OVER',
        'Score ' + score + '  \u00b7  Best ' + best + '  \u00b7  Level ' + level() +
          '.  Press Space or tap Play again.',
        'Play again'
      );
    } else {
      showOverlay(
        'Arcade ready',
        'NEONSNAKE',
        'Arrow keys / WASD to steer \u2014 or swipe on touch. Eat the glow, avoid the walls.',
        'Play'
      );
    }
    btnPause.textContent = phase === 'paused' ? 'Resume' : 'Pause';
    // the accessible name must track what the button actually does
    btnPause.setAttribute('aria-label', phase === 'paused' ? 'Resume the game' : 'Pause the game');
    btnPause.disabled = (phase !== 'playing' && phase !== 'paused');
    btnStart.disabled = (phase === 'playing');
    updateHud();
  }

  /* ---------------------------------------------------------------- engine */
  function onSnake(r, c) {
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].r === r && snake[i].c === c) return true;
    }
    return false;
  }

  function randomFreeCell() {
    var free = [];
    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        if (!onSnake(r, c)) free.push({ r: r, c: c });
      }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function spawnFood() {
    var next = randomFreeCell();
    if (next) { food = next; return; }
    food = null;      // board full — nothing left to eat
    win();
  }

  function resetGame() {
    var mid = Math.floor(GRID / 2);
    snake = [];
    for (var i = 0; i < START_LEN; i++) snake.push({ r: mid, c: mid - i });
    dir = 'right';
    pending = [];
    score = 0;
    ticks = 0;
    acc = 0;
    won = false;
    fx = [];
    ripples = [];
    food = null;
    spawnFood();
    updateHud();
  }

  function canTurn(next) {
    if (!DIRS[next]) return false;
    var ref = pending.length ? pending[pending.length - 1] : dir;
    if (next === ref) return false;                                  // no-op
    var a = DIRS[ref], b = DIRS[next];
    if (a.r + b.r === 0 && a.c + b.c === 0) return false;            // 180 degree reversal
    return true;
  }

  function pushDir(next) {
    if (!canTurn(next)) return false;
    if (pending.length >= MAX_QUEUE) return false;
    pending.push(next);
    return true;
  }

  function burst(r, c) {
    var cx = c * cell + cell / 2;
    var cy = r * cell + cell / 2;
    ripples.push({ x: cx, y: cy, life: 380, max: 380, c: cell * 1.5 });
    for (var i = 0; i < 12; i++) {
      var a = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
      var sp = cell * (0.9 + Math.random() * 1.5);
      fx.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 320 + Math.random() * 180,
        max: 500,
        size: Math.max(1.5, cell * 0.14)
      });
    }
    if (fx.length > 90) fx.splice(0, fx.length - 90);
  }

  function die() {
    phase = 'gameover';
    acc = 0;
    if (score > best) { best = score; saveBest(); }
    announce('Game over. Score ' + score + '. Best ' + best + '.');
    syncUi();
  }

  function win() {
    won = true;
    phase = 'gameover';
    acc = 0;
    if (score > best) { best = score; saveBest(); }
    announce('Board cleared. Score ' + score + '.');
    syncUi();
  }

  /** Advance exactly one game tick. Returns true when a tick ran. */
  function step() {
    if (phase !== 'playing') return false;
    if (pending.length) dir = pending.shift();

    var d = DIRS[dir];
    var head = snake[0];
    var nr = head.r + d.r;
    var nc = head.c + d.c;

    if (nr < 0 || nc < 0 || nr >= GRID || nc >= GRID) { die(); return true; }

    var eating = (food && nr === food.r && nc === food.c);
    var limit = eating ? snake.length : snake.length - 1;   // the tail vacates unless we grow
    for (var i = 0; i < limit; i++) {
      if (snake[i].r === nr && snake[i].c === nc) { die(); return true; }
    }

    snake.unshift({ r: nr, c: nc });

    if (eating) {
      score++;
      burst(nr, nc);
      if (score > best) { best = score; saveBest(); }
      spawnFood();                       // spawns on a free cell (head already in snake)
    } else {
      snake.pop();
    }

    ticks++;
    updateHud();
    return true;
  }

  /* ------------------------------------------------------------ lifecycle */
  function start() {
    if (phase === 'playing') return;
    if (phase === 'paused') {
      phase = 'playing';
      acc = 0;
      announce('Resumed.');
      syncUi();
      return;
    }
    resetGame();
    phase = 'playing';
    lastTs = 0;
    acc = 0;
    announce('Game started. Score 0.');
    syncUi();
  }

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    acc = 0;
    announce('Paused.');
    syncUi();
  }

  function resume() {
    if (phase !== 'paused') return;
    phase = 'playing';
    acc = 0;
    lastTs = 0;
    announce('Resumed.');
    syncUi();
  }

  function togglePause() {
    if (phase === 'playing') pause();
    else if (phase === 'paused') resume();
  }

  function restart() {
    resetGame();
    phase = 'playing';
    lastTs = 0;
    acc = 0;
    announce('Restarted. Score 0.');
    syncUi();
  }

  /* --------------------------------------------------------------- render */
  function layout() {
    var availW = boardWrap.clientWidth || 320;
    var availH = boardWrap.clientHeight || availW;
    var avail = Math.min(availW, availH);
    if (!isFinite(avail) || avail < 60) avail = Math.min(availW, 640);

    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var back = Math.floor((avail * dpr) / GRID) * GRID;   // whole device px per cell
    if (back < GRID * 10) back = GRID * 10;

    cell = back / GRID;
    board.style.width = (back / dpr) + 'px';
    board.style.height = (back / dpr) + 'px';
    if (canvas.width !== back) { canvas.width = back; canvas.height = back; }
    render(performance.now());
  }

  function drawFood(ts) {
    if (!food) return;
    var pulse = 0.5 + 0.5 * Math.sin(ts / 220);
    var pad = cell * 0.16;
    var s = cell - pad * 2;
    var x = food.c * cell + pad;
    var y = food.r * cell + pad;

    ctx.save();
    ctx.shadowColor = 'rgba(255, 90, 235, .95)';
    ctx.shadowBlur = cell * (0.6 + 0.7 * pulse);
    var g = ctx.createRadialGradient(x + s * 0.4, y + s * 0.4, s * 0.05, x + s / 2, y + s / 2, s * 0.85);
    g.addColorStop(0, '#ffd6fb');
    g.addColorStop(0.45, '#ff5df0');
    g.addColorStop(1, '#a0189c');
    ctx.fillStyle = g;
    rr(x, y, s, s, s * 0.3);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.45 + 0.45 * pulse;
    ctx.fillStyle = '#fff';
    rr(x + s * 0.33, y + s * 0.3, s * 0.26, s * 0.26, s * 0.12);
    ctx.fill();
    ctx.restore();
  }

  function drawEyes(x, y, s) {
    var d = DIRS[dir];
    var cx = x + s / 2;
    var cy = y + s / 2;
    var off = s * 0.24;
    var rad = Math.max(1.5, s * 0.085);
    var px = -d.r;
    var py = d.c;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#04222e';
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var ex = cx + d.c * off * 0.55 + px * off * sgn;
      var ey = cy + d.r * off * 0.55 + py * off * sgn;
      ctx.beginPath();
      ctx.arc(ex, ey, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSnake() {
    var n = snake.length;
    for (var i = n - 1; i >= 0; i--) {
      var seg = snake[i];
      var k = n > 1 ? i / (n - 1) : 0;                 // 0 = head, 1 = tail
      var isHead = (i === 0);
      var pad = isHead ? cell * 0.05 : cell * (0.11 + k * 0.07);
      var x = seg.c * cell + pad;
      var y = seg.r * cell + pad;
      var s = cell - pad * 2;

      ctx.save();
      if (isHead) {
        ctx.shadowColor = 'rgba(90, 250, 255, .95)';
        ctx.shadowBlur = cell * 1.1;
        ctx.fillStyle = 'hsl(184, 100%, 78%)';
      } else {
        ctx.shadowColor = 'rgba(45, 210, 255, ' + (0.55 - k * 0.3).toFixed(2) + ')';
        ctx.shadowBlur = cell * 0.5;
        ctx.fillStyle = 'hsl(' + (186 + k * 36).toFixed(0) + ', 92%, ' + (64 - k * 22).toFixed(0) + '%)';
      }
      rr(x, y, s, s, cell * 0.3);
      ctx.fill();
      ctx.restore();

      if (isHead) drawEyes(x, y, s);
    }
  }

  function updateFx(dt) {
    var i;
    for (i = fx.length - 1; i >= 0; i--) {
      var p = fx[i];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(i, 1); continue; }
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    for (i = ripples.length - 1; i >= 0; i--) {
      ripples[i].life -= dt;
      if (ripples[i].life <= 0) ripples.splice(i, 1);
    }
  }

  function drawFx() {
    var i;
    for (i = 0; i < ripples.length; i++) {
      var rp = ripples[i];
      var t = 1 - rp.life / rp.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t) * 0.85;
      ctx.strokeStyle = '#ff8df5';
      ctx.lineWidth = Math.max(1, cell * 0.12 * (1 - t));
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.c * (0.2 + t), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (i = 0; i < fx.length; i++) {
      var p = fx[i];
      var a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = 'rgba(255, 120, 240, .9)';
      ctx.shadowBlur = cell * 0.5;
      ctx.fillStyle = '#ffd2fb';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function render(ts) {
    var size = canvas.width;
    if (!size) return;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#070b18';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(80, 180, 255, .035)';
    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        if ((r + c) % 2 === 0) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }

    ctx.strokeStyle = 'rgba(90, 200, 255, .08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 1; i < GRID; i++) {
      var p = Math.round(i * cell) + 0.5;
      ctx.moveTo(p, 0); ctx.lineTo(p, size);
      ctx.moveTo(0, p); ctx.lineTo(size, p);
    }
    ctx.stroke();

    drawFood(ts);
    drawSnake();
    drawFx();
  }

  /* ----------------------------------------------------------------- loop */
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    var dt = ts - lastTs;
    lastTs = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 250) dt = 250;

    if (phase === 'playing') {
      acc += dt;
      var guard = 0;
      while (phase === 'playing' && acc >= tickMs() && guard++ < 8) {
        acc -= tickMs();
        step();
      }
      if (phase !== 'playing') acc = 0;
    } else {
      acc = 0;                     // paused / idle: the tick counter never advances
    }

    updateFx(dt);
    render(ts);
    rafId = window.requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- input */
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    var onControl = (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA');
    var k = e.key;

    if (k === ' ' || k === 'Spacebar') {
      if (onControl) return;                       // let a focused button activate
      e.preventDefault();
      if (phase === 'playing' || phase === 'paused') togglePause();
      else start();
      return;
    }
    if (k === 'p' || k === 'P') {
      if (onControl) return;
      e.preventDefault();
      togglePause();
      return;
    }
    if (k === 'Enter') {
      if (onControl) return;
      e.preventDefault();
      if (phase !== 'playing') start();
      return;
    }

    var d = KEY_DIR[k];
    if (!d) return;
    e.preventDefault();                            // no page scroll while playing
    if (phase === 'start' || phase === 'gameover') start();
    if (phase === 'playing' || phase === 'paused') pushDir(d);
  }, { passive: false });

  var touchStart = null;
  canvas.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener('touchend', function (e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    var d = (Math.abs(dx) > Math.abs(dy))
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    if (phase === 'start' || phase === 'gameover') start();
    if (phase === 'playing' || phase === 'paused') pushDir(d);
  }, { passive: true });

  ovBtn.addEventListener('click', function () {
    if (phase === 'paused') resume(); else start();
    ovBtn.blur();
  });
  btnStart.addEventListener('click', function () {
    start();
    btnStart.blur();
  });
  btnPause.addEventListener('click', function () {
    togglePause();
    btnPause.blur();
  });
  btnRestart.addEventListener('click', function () {
    restart();
    btnRestart.blur();
  });

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { window.setTimeout(layout, 120); });
  if (window.ResizeObserver) {
    try { new window.ResizeObserver(layout).observe(boardWrap); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ debug hook */
  window.__snake = {
    getState: function () {
      return {
        phase: phase,
        score: score,
        length: snake.length,
        dir: dir,
        speed: Number(cellsPerSecond().toFixed(1)),
        food: food ? { row: food.r, col: food.c } : null,
        head: snake[0] ? { row: snake[0].r, col: snake[0].c } : null,
        body: snake.map(function (s) { return { row: s.r, col: s.c }; }),
        ticks: ticks,
        level: level(),
        best: best,
        won: won
      };
    },
    start: start,
    pause: pause,
    resume: resume,
    restart: restart,
    step: function () { return step(); },
    setDirection: function (d) {
      d = String(d || '').toLowerCase();
      if (!DIRS[d]) return false;
      return pushDir(d);
    },
    placeFood: function (row, col) {
      row = Math.floor(row);
      col = Math.floor(col);
      if (!isFinite(row) || !isFinite(col)) return false;
      if (row < 0 || col < 0 || row >= GRID || col >= GRID) return false;
      food = { r: row, c: col };
      render(performance.now());
      return true;
    }
  };

  /* ----------------------------------------------------------------- boot */
  loadBest();
  resetGame();
  phase = 'start';
  syncUi();
  layout();
  lastTs = 0;
  rafId = window.requestAnimationFrame(frame);
})();
