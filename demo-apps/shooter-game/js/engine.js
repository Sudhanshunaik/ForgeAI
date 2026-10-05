// ============================================================
//  NEONSTRIKE — engine.js
//  First-person raycasting renderer (own implementation).
//  Textured walls (fog LUT), gradient floor/ceiling,
//  z-buffered sprites, screen shake, adaptive resolution.
// ============================================================
'use strict';

const Engine = (() => {
  let canvas, ctx;
  let RW = 960, RH = 540;          // render resolution
  let zbuf = null;
  let scale = 1.0;                 // adaptive quality: 0.6 .. 1.0
  const FOV_PLANE = 0.72;          // ~72° horizontal FOV

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const aspect = vw / Math.max(1, vh);
    // base target ~1024px wide, never above viewport width
    let rw = Math.min(1024, Math.max(560, vw));
    let rh = Math.round(rw / aspect);
    const MAXH = 720;
    if (rh > MAXH) { rh = MAXH; rw = Math.round(rh * aspect); }
    // apply adaptive quality scale (preserving aspect)
    rw = Math.max(480, Math.round(rw * scale));
    rh = Math.max(270, Math.round(rw / aspect));
    RW = rw;
    RH = rh;
    canvas.width = RW;
    canvas.height = RH;
    zbuf = new Float32Array(RW);
  }

  function setScale(s) {
    scale = Math.max(0.55, Math.min(1.0, s));
    resize();
  }

  function getScale() { return scale; }

  // ---------- Core cast ----------
  // Returns hit info for one ray (own DDA implementation).
  function castRay(level, px, py, rx, ry) {
    let mapX = Math.floor(px), mapY = Math.floor(py);
    const dx = Math.abs(1 / (rx || 1e-9));
    const dy = Math.abs(1 / (ry || 1e-9));
    let stepX, stepY, sideDistX, sideDistY;
    if (rx < 0) { stepX = -1; sideDistX = (px - mapX) * dx; }
    else { stepX = 1; sideDistX = (mapX + 1 - px) * dx; }
    if (ry < 0) { stepY = -1; sideDistY = (py - mapY) * dy; }
    else { stepY = 1; sideDistY = (mapY + 1 - py) * dy; }

    let side = 0, guard = 0;
    while (guard++ < 128) {
      if (sideDistX < sideDistY) { sideDistX += dx; mapX += stepX; side = 0; }
      else { sideDistY += dy; mapY += stepY; side = 1; }
      const ch = level.at(mapX, mapY);
      if (ch !== '.') {
        const dist = side === 0 ? (sideDistX - dx) : (sideDistY - dy);
        let wallX = side === 0 ? py + dist * ry : px + dist * rx;
        wallX -= Math.floor(wallX);
        return { dist: Math.max(dist, 0.0001), side, mapX, mapY, wallX, tile: ch };
      }
    }
    return { dist: 64, side: 0, mapX, mapY, wallX: 0, tile: '1' };
  }

  // Public ray for gameplay (hitscan LOS etc.)
  function rayHit(level, px, py, rx, ry, maxDist) {
    const h = castRay(level, px, py, rx, ry);
    return { ...h, dist: Math.min(h.dist, maxDist ?? 1e9) };
  }

  // ---------- Render ----------
  function render(level, player, sprites, fx) {
    const h = RH, w = RW;
    const horizon = Math.floor(h / 2 + (player.pitch || 0) * h * 0.85);
    const shakeX = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const shakeY = fx.shake ? (Math.random() - 0.5) * fx.shake * 0.6 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // --- ceiling & floor gradients ---
    const ceilG = ctx.createLinearGradient(0, 0, 0, horizon);
    ceilG.addColorStop(0, '#02030a');
    ceilG.addColorStop(1, '#0a1226');
    ctx.fillStyle = ceilG;
    ctx.fillRect(-8, -8, w + 16, horizon + 8);

    const floorG = ctx.createLinearGradient(0, horizon, 0, h);
    floorG.addColorStop(0, '#0b1120');
    floorG.addColorStop(1, '#03040a');
    ctx.fillStyle = floorG;
    ctx.fillRect(-8, horizon, w + 16, h - horizon + 8);

    // horizon glow
    const glow = ctx.createRadialGradient(w / 2, horizon, 40, w / 2, horizon, w * 0.55);
    glow.addColorStop(0, 'rgba(0, 220, 180, 0.07)');
    glow.addColorStop(1, 'rgba(0, 220, 180, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // --- walls ---
    const px = player.x, py = player.y;
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const planeX = -dirY * FOV_PLANE, planeY = dirX * FOV_PLANE;
    const fovScale = h; // wall of height 1 at dist 1 covers full screen height

    for (let x = 0; x < w; x++) {
      const camX = (2 * x) / w - 1;
      const rx = dirX + planeX * camX;
      const ry = dirY + planeY * camX;

      const hit = castRay(level, px, py, rx, ry);
      zbuf[x] = hit.dist;

      const lineH = fovScale / hit.dist;
      const y0 = horizon - lineH * 0.5;
      const y1 = horizon + lineH * 0.5;

      // fog level by distance
      const fog = Math.min(Assets.FOG_LEVELS - 1, Math.floor(hit.dist / 3.2));
      const tex = Assets.wallTextures[hit.tile] ? Assets.wallTextures[hit.tile][fog] : null;

      if (tex) {
        const T = Assets.TEX;
        let texX = Math.floor(hit.wallX * T);
        if ((hit.side === 0 && rx > 0) || (hit.side === 1 && ry < 0)) texX = T - texX - 1;
        texX = Math.max(0, Math.min(T - 1, texX));
        ctx.drawImage(tex, texX, 0, 1, T, x, y0, 1.02, lineH);
      } else {
        ctx.fillStyle = '#131b2e';
        ctx.fillRect(x, y0, 1.02, lineH);
      }

      // edge shading for side walls (fake depth)
      if (hit.side === 1) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(x, y0, 1.02, lineH);
      }
    }

    // --- sprites (z-buffered) ---
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    // sort back-to-front
    const sorted = sprites
      .map(s => {
        const sx = s.x - px, sy = s.y - py;
        const tx = invDet * (dirY * sx - dirX * sy);
        const ty = invDet * (-planeY * sx + planeX * sy);
        return { s, tx, ty };
      })
      .filter(o => o.ty > 0.08)
      .sort((a, b) => b.ty - a.ty);

    for (const o of sorted) {
      const s = o.s;
      const screenX = (w / 2) * (1 + o.tx / o.ty);
      const unitPx = fovScale / o.ty;              // pixels per world unit
      const sw = (s.w || 0.7) * unitPx;
      const sh = (s.h || 1.3) * unitPx;
      // world y=0 is floor; sprite stands on floor unless floating
      const bottom = horizon + 0.5 * unitPx - (s.float || 0) * unitPx;
      const top = bottom - sh;
      const x0 = Math.floor(screenX - sw / 2);
      const x1 = Math.ceil(screenX + sw / 2);

      const alpha = s.alpha ?? 1;
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;

      const step = 2;
      for (let x = x0; x < x1; x += step) {
        if (x < 0 || x >= w) continue;
        const zAt = zbuf[Math.max(0, Math.min(w - 1, x))];
        if (zAt < o.ty) continue; // occluded by wall
        const u = (x - x0) / (x1 - x0);
        const srcX = u * s.img.width;
        const srcW = Math.max(1, (step / (x1 - x0)) * s.img.width);
        ctx.drawImage(s.img, srcX, 0, srcW, s.img.height, x, top, step + 0.5, sh);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // --- muzzle light overlay ---
    if (fx.muzzle > 0.01) {
      ctx.fillStyle = `rgba(255, 214, 140, ${0.10 * fx.muzzle})`;
      ctx.fillRect(0, 0, w, h);
    }

    return { horizon, dirX, dirY, planeX, planeY, invDet };
  }

  // Project a world point to screen (for impact sparks etc.). Returns {x, y, depth} or null.
  function project(level, player, wx, wy, wz) {
    const px = player.x, py = player.y;
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const planeX = -dirY * FOV_PLANE, planeY = dirX * FOV_PLANE;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const sx = wx - px, sy = wy - py;
    const tx = invDet * (dirY * sx - dirX * sy);
    const ty = invDet * (-planeY * sx + planeX * sy);
    if (ty <= 0.05) return null;
    const horizon = Math.floor(RH / 2 + (player.pitch || 0) * RH * 0.85);
    const unitPx = RH / ty;
    return {
      x: (RW / 2) * (1 + tx / ty),
      y: horizon + 0.5 * unitPx - (wz || 0) * unitPx,
      depth: ty,
      size: unitPx,
    };
  }

  return { init, resize, setScale, getScale, render, rayHit, project,
           get width() { return RW; }, get height() { return RH; } };
})();
