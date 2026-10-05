// ============================================================
//  NEONSTRIKE — assets.js
//  All textures & sprites are procedurally drawn on offscreen
//  canvases (original art — no external files).
// ============================================================
'use strict';

const Assets = (() => {

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function ctxOf(c) { return c.getContext('2d'); }

  // ---------- Wall textures ----------
  // Each texture: 64x64 base, plus 5 pre-darkened fog variants.
  const TEX = 64;
  const FOG_LEVELS = 6; // 0 = nearest (bright) ... 5 = farthest (dark)

  function fogVariant(base, level) {
    const c = cv(TEX, TEX);
    const g = ctxOf(c);
    g.drawImage(base, 0, 0);
    const dark = Math.min(0.88, level * 0.19);
    g.fillStyle = `rgba(2, 4, 10, ${dark})`;
    g.fillRect(0, 0, TEX, TEX);
    return c;
  }

  function basePanel(id) {
    // dark tech panel with grid lines
    const c = cv(TEX, TEX);
    const g = ctxOf(c);
    g.fillStyle = '#131b2e';
    g.fillRect(0, 0, TEX, TEX);
    // panel seams
    g.strokeStyle = '#0a0f1e';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, TEX - 3, TEX - 3);
    g.beginPath();
    g.moveTo(TEX / 2, 0); g.lineTo(TEX / 2, TEX);
    g.moveTo(0, TEX / 2); g.lineTo(TEX, TEX / 2);
    g.stroke();
    // rivets
    g.fillStyle = '#1f2c4a';
    for (const [x, y] of [[10, 10], [54, 10], [10, 54], [54, 54], [32, 32]]) {
      g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
    }
    // subtle top highlight
    g.fillStyle = 'rgba(120, 160, 255, 0.07)';
    g.fillRect(0, 0, TEX, 5);
    return c;
  }

  function baseNeon(id, color) {
    // dark panel with a glowing diagonal neon stripe
    const c = basePanel(id);
    const g = ctxOf(c);
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.shadowColor = color;
    g.shadowBlur = 8;
    g.beginPath();
    g.moveTo(0, TEX * 0.78);
    g.lineTo(TEX * 0.78, 0);
    g.stroke();
    g.restore();
    return c;
  }

  function baseBrick() {
    const c = cv(TEX, TEX);
    const g = ctxOf(c);
    g.fillStyle = '#161d30';
    g.fillRect(0, 0, TEX, TEX);
    g.strokeStyle = '#0a0e1a';
    g.lineWidth = 2;
    const bh = 13, bw = 30;
    for (let row = 0; row < 5; row++) {
      const y = row * bh;
      const off = (row % 2) ? bw / 2 : 0;
      for (let x = -bw; x < TEX + bw; x += bw) {
        g.strokeRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
    g.fillStyle = 'rgba(140, 180, 255, 0.05)';
    g.fillRect(0, 0, TEX, 4);
    return c;
  }

  function baseHazard() {
    // hazard stripes for outer walls
    const c = cv(TEX, TEX);
    const g = ctxOf(c);
    g.fillStyle = '#1a2138';
    g.fillRect(0, 0, TEX, TEX);
    g.save();
    g.beginPath(); g.rect(0, 0, TEX, TEX); g.clip();
    g.fillStyle = 'rgba(255, 176, 32, 0.24)';
    for (let i = -TEX; i < TEX * 2; i += 22) {
      g.beginPath();
      g.moveTo(i, TEX); g.lineTo(i + 11, TEX); g.lineTo(i + 11 + TEX, 0); g.lineTo(i + TEX, 0);
      g.closePath(); g.fill();
    }
    g.restore();
    g.strokeStyle = '#0b101f';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, TEX - 3, TEX - 3);
    return c;
  }

  function baseCenter() {
    // center structure: magenta energy core pattern
    const c = basePanel(0);
    const g = ctxOf(c);
    g.fillStyle = 'rgba(255, 56, 150, 0.14)';
    g.fillRect(6, 6, TEX - 12, TEX - 12);
    g.strokeStyle = '#ff3896';
    g.lineWidth = 2.5;
    g.shadowColor = '#ff3896';
    g.shadowBlur = 7;
    g.beginPath();
    g.arc(32, 32, 14, 0, Math.PI * 2);
    g.moveTo(32, 12); g.lineTo(32, 52);
    g.moveTo(12, 32); g.lineTo(52, 32);
    g.stroke();
    return c;
  }

  let wallTextures = [];   // [type][fogLevel] -> canvas
  const BASE = {};

  function buildWallTextures() {
    BASE['1'] = baseHazard();
    BASE['2'] = baseBrick();
    BASE['3'] = baseNeon('3', '#00f0c0');
    BASE['4'] = baseCenter();
    wallTextures = {};
    for (const k of Object.keys(BASE)) {
      wallTextures[k] = [];
      for (let f = 0; f < FOG_LEVELS; f++) {
        wallTextures[k][f] = f === 0 ? BASE[k] : fogVariant(BASE[k], f);
      }
    }
  }

  // ---------- Enemy sprites ----------
  // Robot bots, ~88x132, three types. Frames: walk1, walk2, attack.
  function makeBot(type) {
    const PAL = {
      drone:  { body: '#123a4a', trim: '#00e0ff', core: '#22e6ff', eye: '#aef4ff' },
      sentry: { body: '#3a2a12', trim: '#ffb020', core: '#ffd060', eye: '#ffe9b0' },
      heavy:  { body: '#3a1230', trim: '#ff3896', core: '#ff66b8', eye: '#ffc2e0' },
    }[type];

    const W = 88, H = 132;
    const frames = {};

    function drawBot(pose, firing) {
      const c = cv(W, H);
      const g = ctxOf(c);
      const cx = W / 2;

      g.save();
      if (pose === 'walkA') g.translate(0, -3);
      if (pose === 'walkB') g.translate(0, 3);

      // legs
      g.fillStyle = '#0c1220';
      const legSwing = pose === 'walkA' ? -5 : pose === 'walkB' ? 5 : 0;
      g.fillRect(cx - 20 + legSwing, 96, 13, 34);
      g.fillRect(cx + 7 - legSwing, 96, 13, 34);

      // torso
      g.fillStyle = PAL.body;
      g.strokeStyle = PAL.trim;
      g.lineWidth = 2.5;
      roundRect(g, cx - 30, 34, 60, 68, 10);
      g.fill(); g.stroke();

      // chest core
      g.fillStyle = firing ? '#ffffff' : PAL.core;
      g.shadowColor = PAL.core;
      g.shadowBlur = firing ? 16 : 8;
      roundRect(g, cx - 10, 52, 20, 24, 5);
      g.fill();
      g.shadowBlur = 0;

      // head
      g.fillStyle = '#101828';
      g.strokeStyle = PAL.trim;
      roundRect(g, cx - 22, 8, 44, 30, 8);
      g.fill(); g.stroke();

      // visor / eye
      g.fillStyle = firing ? '#ffffff' : PAL.eye;
      g.shadowColor = PAL.core;
      g.shadowBlur = 10;
      roundRect(g, cx - 15, 17, 30, 11, 5);
      g.fill();
      g.shadowBlur = 0;

      // arms
      g.fillStyle = PAL.body;
      g.strokeStyle = PAL.trim;
      const armY = firing ? 46 : 58;
      roundRect(g, cx - 42, armY, 12, 44, 5); g.fill(); g.stroke();
      roundRect(g, cx + 30, armY, 12, 44, 5); g.fill(); g.stroke();

      // gun in right hand
      g.fillStyle = '#0b101f';
      g.strokeStyle = PAL.trim;
      g.lineWidth = 2;
      roundRect(g, cx + 26, firing ? 50 : 62, 34, 10, 3);
      g.fill(); g.stroke();
      if (firing) {
        g.fillStyle = '#fff8d0';
        g.shadowColor = PAL.core;
        g.shadowBlur = 18;
        g.beginPath();
        g.arc(cx + 62, firing ? 55 : 67, 7, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }

      // feet glow
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.beginPath();
      g.ellipse(cx, 130, 30, 5, 0, 0, Math.PI * 2);
      g.fill();

      g.restore();
      return c;
    }

    frames.walk1 = drawBot('walkA', false);
    frames.walk2 = drawBot('walkB', false);
    frames.attack = drawBot('idle', true);
    frames.idle = drawBot('idle', false);
    return frames;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ---------- Pickups ----------
  function makeHealth() {
    const c = cv(56, 56);
    const g = ctxOf(c);
    g.fillStyle = '#20101a';
    g.strokeStyle = '#ff3860';
    g.lineWidth = 3;
    roundRect(g, 4, 4, 48, 48, 8);
    g.fill(); g.stroke();
    g.fillStyle = '#ff3860';
    g.shadowColor = '#ff3860';
    g.shadowBlur = 9;
    g.fillRect(24, 13, 8, 30);
    g.fillRect(13, 24, 30, 8);
    g.shadowBlur = 0;
    return c;
  }

  function makeAmmo() {
    const c = cv(56, 56);
    const g = ctxOf(c);
    g.fillStyle = '#201a08';
    g.strokeStyle = '#ffb020';
    g.lineWidth = 3;
    roundRect(g, 4, 4, 48, 48, 8);
    g.fill(); g.stroke();
    g.fillStyle = '#ffb020';
    g.shadowColor = '#ffb020';
    g.shadowBlur = 9;
    for (let i = 0; i < 3; i++) {
      roundRect(g, 13 + i * 11, 17, 7, 22, 3);
      g.fill();
    }
    g.shadowBlur = 0;
    return c;
  }

  // ---------- FX sprites ----------
  function makeProjectile() {
    const c = cv(32, 32);
    const g = ctxOf(c);
    const grd = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, '#ffcf60');
    grd.addColorStop(1, 'rgba(255, 120, 0, 0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
    return c;
  }

  function makePlayerShot() {
    // teal-ish player projectile glow (for visual tracers we use lines; kept as accent)
    const c = cv(32, 32);
    const g = ctxOf(c);
    const grd = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, '#7dffea');
    grd.addColorStop(1, 'rgba(0, 240, 192, 0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
    return c;
  }

  function makeFlash() {
    const c = cv(48, 48);
    const g = ctxOf(c);
    const grd = g.createRadialGradient(24, 24, 2, 24, 24, 23);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.4, '#ffe9a0');
    grd.addColorStop(1, 'rgba(255, 180, 60, 0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(24, 24, 23, 0, Math.PI * 2); g.fill();
    return c;
  }

  function makeSpark() {
    const c = cv(24, 24);
    const g = ctxOf(c);
    g.strokeStyle = '#ffe9a0';
    g.lineWidth = 2;
    g.shadowColor = '#ffb020';
    g.shadowBlur = 6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.moveTo(12 + Math.cos(a) * 3, 12 + Math.sin(a) * 3);
      g.lineTo(12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10);
      g.stroke();
    }
    return c;
  }

  function makeCrate() {
    // decorative supply crate would go here; ammo/health cover the need
    return null;
  }

  // ---------- API ----------
  const api = {
    TEX, FOG_LEVELS,
    wallTextures,
    bots: {},
    health: null, ammo: null,
    projectile: null, playerShot: null, flash: null, spark: null,
    ready: false,
    init() {
      buildWallTextures();
      api.wallTextures = wallTextures;
      api.bots.drone = makeBot('drone');
      api.bots.sentry = makeBot('sentry');
      api.bots.heavy = makeBot('heavy');
      api.health = makeHealth();
      api.ammo = makeAmmo();
      api.projectile = makeProjectile();
      api.playerShot = makePlayerShot();
      api.flash = makeFlash();
      api.spark = makeSpark();
      api.ready = true;
    },
  };

  return api;
})();

Assets.init();
