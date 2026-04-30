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

function startHexAnimation() {
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

