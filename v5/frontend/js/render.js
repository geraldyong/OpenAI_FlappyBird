// render.js — draws background, pipes, bird, specials, HUD

import { BASE_PIPE_W, INVULN_MS } from './config.js';
import { roundedRect, escapeHtml } from './utils.js';
import { sprites } from './assets.js';

export function drawBackground(st) {
  const { ctx, canvas } = st.dom;

  // Stronger sky gradient
  const sky = ctx.createLinearGradient(0,0,0,canvas.height);
  sky.addColorStop(0,'#b4e7ff');
  sky.addColorStop(0.45,'#5fb5f2');
  sky.addColorStop(1,'#1e6fb3');
  ctx.fillStyle = sky; ctx.fillRect(0,0,canvas.width,canvas.height);

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  st.backClouds.forEach(c => { roundedRect(ctx, c.x, c.y, c.w, 24, 12); ctx.fill(); });

  // Hills
  ctx.fillStyle = '#2f865f';
  st.midHills.forEach(h => {
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.quadraticCurveTo(h.x+h.w/2, h.y-h.h, h.x+h.w, h.y);
    ctx.closePath();
    ctx.fill();
  });

  // Sky birds silhouettes
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  st.skyBirds.forEach(sb => {
    const w = 20, h = 7;
    const flapY = Math.sin(sb.flap) * 2;
    ctx.save();
    ctx.translate(sb.x, sb.y + flapY);
    ctx.scale(sb.flip ? 1 : -1, 1);
    ctx.beginPath();
    ctx.moveTo(-w/2, 0);
    ctx.quadraticCurveTo(0, -h, w/2, 0);
    ctx.quadraticCurveTo(0, -h/2, -w/2, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  });

  // Water (thick strip)
  const waterTop = canvas.height - 80;
  drawWater(st, waterTop);

  // Islands
  st.islands.forEach(is => {
    const baseW = 100 * is.scale, baseH = 22 * is.scale;
    ctx.fillStyle = '#3b6d4a';
    ctx.beginPath();
    ctx.ellipse(is.x, is.y, baseW/2, baseH/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#2a5338';
    ctx.beginPath();
    ctx.moveTo(is.x, is.y - baseH*0.9);
    ctx.lineTo(is.x - baseW*0.25, is.y);
    ctx.lineTo(is.x + baseW*0.25, is.y);
    ctx.closePath(); ctx.fill();
  });

  // Volcanoes
  st.volcanoes.forEach(v => {
    const s = v.scale;
    ctx.fillStyle = '#4a4036';
    ctx.beginPath();
    ctx.moveTo(v.x - 60*s, v.y);
    ctx.lineTo(v.x, v.y - 80*s);
    ctx.lineTo(v.x + 60*s, v.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = v.erupting ? '#ff784e' : '#6b5246';
    ctx.beginPath(); ctx.arc(v.x, v.y - 80*s, 10*s, 0, Math.PI*2); ctx.fill();
  });

  // Boats
  st.boats.forEach(b => {
    const y = b.y + Math.sin(b.bob)*1.5;
    const w = 42, h = 12;
    ctx.fillStyle = '#5c3d2e';
    ctx.beginPath();
    ctx.moveTo(b.x - w/2, y);
    ctx.lineTo(b.x + w/2, y);
    ctx.lineTo(b.x + w/2 - 8, y + h);
    ctx.lineTo(b.x - w/2 + 8, y + h);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x, y - 18); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.moveTo(b.x, y - 18); ctx.lineTo(b.x + 14, y - 8); ctx.lineTo(b.x, y - 8); ctx.closePath(); ctx.fill();
  });

  // Volcano FX
  st.volcanoSmoke.forEach(s => {
    const lifeT = (performance.now() - s.born)/s.life;
    const alpha = Math.max(0, 0.6*(1 - lifeT));
    ctx.fillStyle = `rgba(80,80,80,${alpha})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
  });
  st.volcanoLava.forEach(p => {
    ctx.fillStyle = 'rgba(255,120,70,0.9)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
  });

  // Ground
  ctx.fillStyle = '#2a8f3b'; ctx.fillRect(0, st.dom.canvas.height - 20, st.dom.canvas.width, 20);
  ctx.fillStyle = 'rgba(0,0,0,.1)';
  for (let x=-40; x<st.dom.canvas.width+40; x+=40) ctx.fillRect(Math.floor(x - st.groundScroll), st.dom.canvas.height - 20, 20, 20);
}

export function drawWater(st, topY) {
  const { ctx, canvas } = st.dom;
  const h = canvas.height - topY;
  const g = ctx.createLinearGradient(0, topY, 0, canvas.height);
  g.addColorStop(0,'#1671b5'); g.addColorStop(1,'#0a3d67');
  ctx.fillStyle = g; ctx.fillRect(0, topY, canvas.width, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  const amp1 = 4, freq1 = 0.014, speed1 = st.waterPhase;
  const amp2 = 3, freq2 = 0.024, speed2 = st.waterPhase * 1.35;

  ctx.beginPath();
  for (let x=0; x<=canvas.width; x+=4) {
    const y = topY + 10 + Math.sin(x*freq1 + speed1)*amp1 + Math.sin(x*freq2 + speed2)*amp2;
    if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  for (let x=0; x<=canvas.width; x+=6) {
    const y = topY + 18 + Math.sin(x*freq2 + speed2*1.2)*amp2;
    if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

export function drawScene(st) {
  const { ctx, canvas } = st.dom;

  // Background
  drawBackground(st);

  // Pipes (with per-level hue shift)
  const now = performance.now();
  const hueBase = 140;
  const hueShift = (st.levelIndex * 7) % 24;
  const hueA = hueBase + hueShift;
  const hueB = hueA + 12;

  st.pipes.forEach(p => {
    const pipeW = p.pipeW || Math.max(40, BASE_PIPE_W*(st.config.pipeWmul || 1));
    const offset = (st.difficulty==='hard' && p.oscAmp) ? Math.sin(p.phase + now/1000 * p.oscSpeed) * p.oscAmp : 0;
    const gapY = p.baseTop + offset, gapH = p.gap;

    const gradTop = ctx.createLinearGradient(p.x, 0, p.x + pipeW, 0);
    gradTop.addColorStop(0, `hsl(${hueA} 55% 45%)`);
    gradTop.addColorStop(1, `hsl(${hueB} 55% 38%)`);
    const gradBottom = ctx.createLinearGradient(p.x, 0, p.x + pipeW, 0);
    gradBottom.addColorStop(0, `hsl(${hueA} 55% 45%)`);
    gradBottom.addColorStop(1, `hsl(${hueB} 55% 38%)`);

    ctx.fillStyle = gradTop;    ctx.fillRect(p.x, 0, pipeW, gapY);
    ctx.fillStyle = gradBottom; ctx.fillRect(p.x, gapY + gapH, pipeW, canvas.height - (gapY + gapH) - 20);

    ctx.fillStyle = `hsl(${hueB} 60% 30%)`;
    ctx.fillRect(p.x - 3, gapY - 12, pipeW + 6, 12);
    ctx.fillRect(p.x - 3, gapY + gapH, pipeW + 6, 12);

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 10; y < gapY - 10; y += 16) ctx.fillRect(p.x, y, pipeW, 3);
    for (let y = gapY + gapH + 10; y < canvas.height - 30; y += 16) ctx.fillRect(p.x, y, pipeW, 3);
  });

  // Specials
  st.specials.forEach(s => drawSpecial(st, s));

  // Bird — textured (blink on hit)
  const blink = (performance.now() - st.lastHitTs) < INVULN_MS && Math.floor(performance.now()/100)%2===0;
  if (!blink && st.bird) {
    const r = st.bird.r;
    const g = ctx.createRadialGradient(st.bird.x - r*0.3, st.bird.y - r*0.3, r*0.2, st.bird.x, st.bird.y, r);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(0.6, '#ffd166'); g.addColorStop(1, '#f4b04d');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(st.bird.x, st.bird.y, r, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(st.bird.x - r*0.35, st.bird.y - r*0.35, r*0.35, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    ctx.strokeStyle = '#e09e3e'; ctx.lineWidth = 3; ctx.stroke();
  }

  // Particles
  drawParticles(st);

  // HUD
  drawHud(st);
}

function drawSpecial(st, s) {
  const { ctx } = st.dom;
  const spr = sprites[s.type];
  if (!spr || !spr.ok) {
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(14, s.r), 0, Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.strokeStyle = '#ff00aa'; ctx.lineWidth = 2; ctx.stroke();
    return;
  }
  const now = performance.now();
  if (now - s.lastFrameAt > 1000/s.fps) { s.frame = (s.frame + 1) % spr.frames; s.lastFrameAt = now; }
  const sx = s.frame * spr.w, sy = 0;
  const scale = 0.7, dw = Math.floor(spr.w * scale), dh = Math.floor(spr.h * scale);
  st.dom.ctx.drawImage(spr.img, sx, sy, spr.w, spr.h, Math.floor(s.x - dw/2), Math.floor(s.y - dh/2), dw, dh);
}

function drawParticles(st) {
  const { ctx } = st.dom;
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  st.particles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill(); });
}

function drawHud(st) {
  const { ctx, canvas } = st.dom;
  const pad = 14, panelH = 50, leftW = 260, rightW = 240;
  const centerW = Math.min(380, canvas.width - (leftW + rightW + pad*4));

  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(pad, 12, leftW, panelH);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto';
  ctx.fillText(`Score ${Math.floor(st.score)}`, pad + 10, 44);
  if (st.combo > 1) { ctx.fillStyle = '#ffd166'; ctx.font = 'bold 14px system-ui'; ctx.fillText(`Combo ×${st.combo}`, pad + 10, 62); }

  const centerX = Math.floor((canvas.width - centerW) / 2);
  const pipesLeft = Math.max(0, st.goal.goal - st.pipesPassedThisLevel);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(centerX, 12, centerW, panelH);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto';
  ctx.fillText(`Level ${st.levelIndex+1}`, centerX + centerW/2, 36);
  ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
  ctx.fillText(`Pipes left: ${pipesLeft}`, centerX + centerW/2, 56);
  ctx.textAlign = 'left';

  const rightX = canvas.width - rightW - pad;
  const barPad = 8, barW = rightW - barPad*2, barH = 16, x = rightX + barPad, y = 18;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(rightX, 12, rightW, panelH);
  ctx.fillStyle = '#e74c3c'; ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = '#2ecc71'; const ratio = Math.max(0, st.health)/5; ctx.fillRect(x, y, Math.floor(barW*ratio), barH);
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, barW, barH);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
  ctx.fillText(`HP ${st.health}/5`, x, y+barH+14);

  const sinceHit = performance.now() - st.lastHitTs;
  if (sinceHit >=0 && sinceHit < 120) { ctx.fillStyle = `rgba(255,255,255,${1 - sinceHit/120})`; ctx.fillRect(0,0,canvas.width,canvas.height); }
}
