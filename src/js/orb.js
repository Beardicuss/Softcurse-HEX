'use strict';
// == orb.js == 3D Thinking Animation & Glitch Effects =========================
// Extracted from renderer.js
// ── 3D ORB "THINKING" ANIMATION ──────────────────────────────
let hexCtx, hexW, hexH, hexRAF;

function initHexCanvas() {
  const canvas = document.getElementById('hex-canvas');
  hexCtx = canvas.getContext('2d');
  resizeHexCanvas();
  window.addEventListener('resize', resizeHexCanvas);
}

function resizeHexCanvas() {
  const canvas = document.getElementById('hex-canvas');
  const area = document.getElementById('hex-area');
  canvas.width = hexW = area.offsetWidth;
  canvas.height = hexH = area.offsetHeight;
}

function stopHexAnimation() {
  if (hexRAF) cancelAnimationFrame(hexRAF);
  hexRAF = null;
}

function startHexAnimation() {
  if (hexRAF) return;
  // ── Fibonacci sphere points ──
  const N = 400;
  const PHI = Math.PI * (3 - Math.sqrt(5));
  const pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = PHI * i;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }

  // ── Pulse waves ──
  const pulses = [];
  let cooldown = 30;

  // ── Live task status from hexTaskBus ──
  let lastTaskText = '', currentTaskText = 'System idle';
  let taskFrame = 0, taskPhase = 'in';
  const FIN = 30, FHOLD = 90, FOUT = 30;

  let rotY = 0, tick = 0;

  // ── 3D rotation helper ──
  function rot(px, py, pz, ry, rx) {
    const cy = Math.cos(ry), sy = Math.sin(ry);
    let x1 = px * cy + pz * sy;
    let z1 = -px * sy + pz * cy;
    const cxr = Math.cos(rx), sxr = Math.sin(rx);
    let y2 = py * cxr - z1 * sxr;
    let z2 = py * sxr + z1 * cxr;
    return [x1, y2, z2];
  }

  let _lastFrameTime = 0;
  const FRAME_INTERVAL = 50; // 20fps — decorative orb doesn't need 60fps

  function frame(timestamp) {
    hexRAF = requestAnimationFrame(frame);
    if (timestamp - _lastFrameTime < FRAME_INTERVAL) return;
    _lastFrameTime = timestamp;
    if (!hexCtx) return;
    tick++;
    rotY += 0.005;
    const rx = 0.2 + Math.sin(tick * 0.006) * 0.12;

    // Clear with background
    const isCard = (typeof currentMode !== 'undefined' && currentMode === 'cardinal');
    hexCtx.fillStyle = isCard ? '#0a0a0b' : '#020202';
    hexCtx.fillRect(0, 0, hexW, hexH);

    // Spawn pulses
    cooldown--;
    if (cooldown <= 0) {
      const s = pts[Math.floor(Math.random() * N)];
      pulses.push({ ox: s[0], oy: s[1], oz: s[2], t: 0 });
      cooldown = 50 + Math.floor(Math.random() * 70);
    }
    for (const p of pulses) p.t += 0.016;
    while (pulses.length && pulses[0].t > 2.4) pulses.shift();

    const availableH = hexH - 45; // space reserved above the text zone
    const cx = hexW / 2;
    const cy = availableH / 2 + 4; // center in available space
    const R = Math.min(availableH * 0.45, hexW * 0.08, 42); // capped radius to avoid orbit ring collision

    // Project and depth-sort
    const proj = pts.map(p => {
      const [x, y, z] = rot(p[0], p[1], p[2], rotY, rx);
      const persp = 600 / (600 + z * R);
      return { sx: cx + x * R * persp, sy: cy + y * R * persp, z, ox: p[0], oy: p[1], oz: p[2] };
    });
    proj.sort((a, b) => a.z - b.z);

    // Draw dots
    for (const pt of proj) {
      const depth = (pt.z + 1) / 2;
      if (depth < 0.03) continue;

      let pulse = 0;
      for (const p of pulses) {
        const dx = pt.ox - p.ox, dy = pt.oy - p.oy, dz = pt.oz - p.oz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const wave = p.t - dist;
        if (wave > -0.13 && wave < 0.13) {
          pulse = Math.max(pulse, (1 - Math.abs(wave) / 0.13) * (1 - p.t / 2.4));
        }
      }

      const br = 0.15 + depth * 0.6 + pulse * 1.2;
      const sz = Math.max(0.3, (0.5 + depth * 1.8) * (1 + pulse * 1.5));
      const alpha = Math.min(1, 0.25 + depth * 0.55 + pulse * 0.8);

      // Mode-aware colors: HEX = cyan-green, Cardinal = crimson-red
      let rr, gg, bb;
      if (isCard) {
        rr = Math.min(255, Math.floor((200 + pulse * 55) * br));
        gg = Math.min(255, Math.floor((40 + pulse * 30) * br));
        bb = Math.min(255, Math.floor((30 + pulse * 10) * br));
      } else {
        rr = Math.min(255, Math.floor((0 + pulse * 255) * br));
        gg = Math.min(255, Math.floor((200 + pulse * 55) * br));
        bb = Math.min(255, Math.floor((160 - pulse * 100) * br));
      }

      hexCtx.globalAlpha = alpha;
      hexCtx.fillStyle = `rgb(${rr},${gg},${bb})`;
      hexCtx.beginPath();
      hexCtx.arc(pt.sx, pt.sy, sz, 0, 6.283);
      hexCtx.fill();
    }

    hexCtx.globalAlpha = 1;

    // Subtle orbit rings
    hexCtx.strokeStyle = isCard ? 'rgba(200,57,43,0.08)' : 'rgba(0,255,200,0.05)';
    hexCtx.lineWidth = 0.5;
    for (let i = 0; i < 2; i++) {
      hexCtx.beginPath();
      hexCtx.arc(cx, cy, R + 8 + i * 8, 0, 6.283);
      hexCtx.stroke();
    }

    // ── Task text below orb (live from hexTaskBus) ──
    const busText = window.hexTaskBus?.current() || 'System idle';
    if (busText !== lastTaskText) {
      lastTaskText = busText;
      currentTaskText = busText;
      taskPhase = 'in'; taskFrame = 0;
    }
    taskFrame++;
    let ta = 1;
    if (taskPhase === 'in') {
      ta = Math.min(1, taskFrame / FIN);
      if (taskFrame >= FIN) { taskPhase = 'hold'; taskFrame = 0; }
    } else if (taskPhase === 'hold') {
      ta = 1;
      if (taskFrame >= FHOLD) { taskPhase = 'out'; taskFrame = 0; }
    } else {
      ta = Math.max(0, 1 - taskFrame / FOUT);
    }

    const ty = hexH - 3;

    // Label
    hexCtx.globalAlpha = 0.25;
    hexCtx.font = '500 9px "Space Mono", monospace';
    hexCtx.fillStyle = isCard ? '#c8392b' : '#00ffc8';
    hexCtx.textAlign = 'center';
    hexCtx.fillText(isCard ? '◉  COMMAND MATRIX' : '◉  NEURAL PROCESSING', cx, ty - 18);

    // Progress bar
    const barW = Math.min(180, hexW * 0.25);
    const barX = cx - barW / 2;
    hexCtx.globalAlpha = 0.12;
    hexCtx.fillStyle = isCard ? '#c8392b' : '#00ffc8';
    hexCtx.fillRect(barX, ty - 10, barW, 1.5);
    const fill = (Math.sin(tick * 0.04) * 0.5 + 0.5);
    hexCtx.globalAlpha = 0.5;
    hexCtx.fillRect(barX, ty - 10, barW * fill, 1.5);

    // Task text
    hexCtx.globalAlpha = ta * 0.7;
    hexCtx.font = '10px "Space Mono", monospace';
    hexCtx.fillStyle = isCard ? '#e05a4a' : '#0ff';
    hexCtx.fillText(currentTaskText, cx, ty);

    hexCtx.globalAlpha = 1;
  }
  frame();
}

// ── GLITCH TEAR ───────────────────────────────────────────────
function spawnGlitchTear() {
  if (Math.random() > 0.4) return; // 60% skip
  const el = document.createElement('div');
  el.className = 'glitch-tear';
  el.style.top = Math.random() * 80 + 10 + 'vh';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 200);
}



// ── Voice AGI Hologram Canvas ─────────────────────────────────────────────
let voiceAgiCtx, voiceAgiRAF, voiceAgiPts, voiceAgiTick = 0;

function initVoiceAgiCanvas() {
  const canvas = document.getElementById('voice-agi-canvas');
  if (!canvas) return;
  voiceAgiCtx = canvas.getContext('2d', { alpha: true });
  resizeVoiceAgiCanvas();
  window.addEventListener('resize', resizeVoiceAgiCanvas);
}

function resizeVoiceAgiCanvas() {
  const canvas = document.getElementById('voice-agi-canvas');
  if (!canvas) return;
  const size = Math.max(320, Math.min(620, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.48)));
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  if (voiceAgiCtx) voiceAgiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getVoiceAgiPoints() {
  if (voiceAgiPts) return voiceAgiPts;
  const n = 620;
  const phi = Math.PI * (3 - Math.sqrt(5));
  voiceAgiPts = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = phi * i;
    const ridge = 1 + Math.sin(i * 0.19) * 0.018 + Math.sin(i * 0.047) * 0.026;
    voiceAgiPts.push({ x: Math.cos(th) * r * ridge, y: y * ridge, z: Math.sin(th) * r * ridge, seed: i });
  }
  return voiceAgiPts;
}

function stopVoiceAgiAnimation() {
  if (voiceAgiRAF) cancelAnimationFrame(voiceAgiRAF);
  voiceAgiRAF = null;
}

function startVoiceAgiAnimation() {
  if (voiceAgiRAF) return;
  if (!voiceAgiCtx) initVoiceAgiCanvas();
  const canvas = document.getElementById('voice-agi-canvas');
  if (!canvas || !voiceAgiCtx) return;
  const pts = getVoiceAgiPoints();
  let last = 0;
  function palette(surface) {
    if (surface?.classList.contains('voice-health-critical') || surface?.classList.contains('voice-health-danger')) {
      return { a: [255, 79, 58], b: [255, 178, 76], c: [255, 45, 92] };
    }
    if (surface?.classList.contains('voice-health-warning')) {
      return { a: [255, 210, 95], b: [255, 138, 56], c: [255, 76, 108] };
    }
    return { a: [82, 255, 238], b: [67, 137, 255], c: [255, 84, 126] };
  }
  function rot(p, ry, rx, rz) {
    let x = p.x, y = p.y, z = p.z;
    const cy = Math.cos(ry), sy = Math.sin(ry);
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    const cx = Math.cos(rx), sx = Math.sin(rx);
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    const cz = Math.cos(rz), sz = Math.sin(rz);
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    return { x, y, z };
  }
  function frame(ts) {
    voiceAgiRAF = requestAnimationFrame(frame);
    if (ts - last < 58) return; // ~17fps, intentionally light
    last = ts;
    const surface = document.getElementById('voice-agi-surface');
    if (!surface?.classList.contains('voice-agi-visible')) return;
    voiceAgiTick += 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ctx = voiceAgiCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    const cx = w / 2;
    const cy = h / 2;
    const speaking = surface.classList.contains('voice-agi-speaking');
    const modeBoost = speaking ? 1.18 : surface.classList.contains('voice-agi-listening') ? 1.14
      : surface.classList.contains('voice-agi-processing') || surface.classList.contains('voice-agi-action') ? 1.24
        : 1;
    const radius = Math.min(w, h) * 0.31 * modeBoost;
    const pal = palette(surface);
    const ry = voiceAgiTick * 0.012;
    const rx = 0.32 + Math.sin(voiceAgiTick * 0.018) * 0.08;
    const rz = Math.sin(voiceAgiTick * 0.011) * 0.08;
    const projected = pts.map((p) => {
      const speechWave = speaking ? Math.sin(p.y * 7 + voiceAgiTick * 0.34) * 0.085 : 0;
      const wave = Math.sin(p.seed * 0.071 + voiceAgiTick * 0.055) * 0.035 + speechWave;
      const rp = { x: p.x * (1 + wave), y: p.y * (1 - wave * 0.25), z: p.z * (1 + wave) };
      const q = rot(rp, ry, rx, rz);
      const depth = (q.z + 1.25) / 2.5;
      const persp = 540 / (540 + q.z * radius);
      return { x: cx + q.x * radius * persp, y: cy + q.y * radius * persp, z: q.z, depth, seed: p.seed };
    }).sort((a, b) => a.z - b.z);

    const glow = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius * 1.22);
    glow.addColorStop(0, `rgba(${pal.a[0]},${pal.a[1]},${pal.a[2]},0.20)`);
    glow.addColorStop(0.42, `rgba(${pal.b[0]},${pal.b[1]},${pal.b[2]},0.08)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    for (const pt of projected) {
      if (pt.depth < 0.08) continue;
      const edge = Math.hypot(pt.x - cx, pt.y - cy) / radius;
      const rim = Math.max(0, Math.min(1, (edge - 0.64) / 0.36));
      const sparkle = Math.max(0, Math.sin(pt.seed * 0.31 + voiceAgiTick * 0.19)) * 0.22;
      const mix = (pt.depth * 0.55 + rim * 0.55 + sparkle) % 1;
      const ca = mix < 0.45 ? pal.a : mix < 0.75 ? pal.b : pal.c;
      const alpha = Math.min(0.92, 0.12 + pt.depth * 0.34 + rim * 0.34 + sparkle);
      const size = 0.55 + pt.depth * 1.15 + rim * 0.9;
      ctx.fillStyle = `rgba(${ca[0]},${ca[1]},${ca[2]},${alpha})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Elegant edge arcs, not Jupiter rings.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const phase = voiceAgiTick * 0.018 + i * 2.1;
      ctx.strokeStyle = `rgba(${pal.a[0]},${pal.a[1]},${pal.a[2]},${0.08 + i * 0.035})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.92 + i * 0.08), phase, phase + Math.PI * (0.35 + i * 0.08));
      ctx.stroke();
    }
  }
  frame(0);
}

