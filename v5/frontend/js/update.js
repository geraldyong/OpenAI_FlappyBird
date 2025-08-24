// update.js — physics, spawning, collisions, level logic

import {
  DIFF, BASE_PIPE_W, INVULN_MS, COMBO_DECAY_ON_HIT, COMBO_MAX,
  pipesGoalForLevel, timeGoalForLevel,
  SPECIAL_NEAR_TRIGGER_X, maxSpecialsForLevel, minSpecialsForLevel,
} from './config.js';

import { now, clamp } from './utils.js';
import { SPECIAL_TYPES } from './assets.js';

export function spawnInitialBackground(st) {
  const c = st.dom.canvas;
  for (let i=0;i<6;i++) st.backClouds.push({ x: Math.random()*c.width, y: 40+Math.random()*120, w: 60+Math.random()*80 });
  for (let i=0;i<5;i++) st.midHills.push({ x: i*220 + Math.random()*60, y: c.height-80, w:260, h: 80+Math.random()*20 });
}

export function updateBackground(st, dtSec) {
  const c = st.dom.canvas;

  // clouds & hills scroll
  st.backClouds.forEach(c1 => { c1.x -= 20*dtSec; if (c1.x < -c1.w) c1.x = c.width + Math.random()*200; });
  st.midHills.forEach(h => { h.x -= 60*dtSec; if (h.x < -h.w) h.x = c.width + Math.random()*120; });
  st.groundScroll = (st.groundScroll + 140*dtSec) % 40;

  // sky birds
  st.skyBirdTimer += dtSec;
  if (st.skyBirdTimer > 5 + Math.random()*4) {
    st.skyBirdTimer = 0;
    const y = 40 + Math.random()*120;
    const speed = 30 + Math.random()*30;
    const flip = Math.random() < 0.5;
    st.skyBirds.push({ x: flip ? -40 : c.width + 40, y, vx: flip ? speed : -speed, flap: 0, flip });
  }
  st.skyBirds.forEach(sb => { sb.x += sb.vx * dtSec * (sb.flip ? 1 : -1); sb.flap += dtSec * 10; });
  for (let i=st.skyBirds.length-1; i>=0; i--) {
    const sb = st.skyBirds[i];
    if (sb.x < -60 || sb.x > c.width + 60) st.skyBirds.splice(i,1);
  }

  // water phase
  st.waterPhase += dtSec * 2.0;

  // boats
  st.boatTimer += dtSec;
  if (st.boatTimer > 6 + Math.random()*6) {
    st.boatTimer = 0;
    const y = c.height - 54 - (Math.random()*10);
    st.boats.push({ x: c.width + 60, y, vx: -(40 + Math.random()*35), bob: Math.random()*Math.PI*2 });
  }
  st.boats.forEach(b => { b.x += b.vx * dtSec; b.bob += dtSec*2; });
  for (let i=st.boats.length-1;i>=0;i--) if (st.boats[i].x < -80) st.boats.splice(i,1);

  // islands
  st.islandTimer += dtSec;
  if (st.islandTimer > 12 + Math.random()*8) {
    st.islandTimer = 0;
    st.islands.push({ x: c.width + 120, y: c.height - (48 + Math.random()*8), vx: -30, scale: 0.8 + Math.random()*0.4 });
  }
  st.islands.forEach(is => { is.x += is.vx * dtSec; });
  for (let i=st.islands.length-1;i>=0;i--) if (st.islands[i].x < -140) st.islands.splice(i,1);

  // volcanoes
  st.volcanoTimer += dtSec;
  if (st.volcanoTimer > 15 + Math.random()*15) {
    st.volcanoTimer = 0;
    const scale = 0.9 + Math.random()*0.5;
    st.volcanoes.push({
      x: c.width + 160, y: c.height - 70, vx: -28, scale,
      erupting: false, nextEruptAt: now() + (3000 + Math.random()*4000), eruptUntil: 0
    });
  }
  const tnow = now();
  st.volcanoes.forEach(v => {
    v.x += v.vx * dtSec;
    if (!v.erupting && tnow >= v.nextEruptAt) {
      v.erupting = true; v.eruptUntil = tnow + (1800 + Math.random()*1800);
    }
    if (v.erupting && tnow < v.eruptUntil) {
      if (Math.random() < 0.2) {
        st.volcanoSmoke.push({ x: v.x, y: v.y - 40*v.scale, vx: (Math.random()*30 - 15), vy: -(20 + Math.random()*20), life: 1800, born: tnow, r: 8 + Math.random()*12 });
      }
      if (Math.random() < 0.15) {
        const angle = -Math.PI/2 + (Math.random()*0.7 - 0.35);
        const speed = 120 + Math.random()*120;
        st.volcanoLava.push({ x: v.x, y: v.y - 40*v.scale, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 900, born: tnow });
      }
    }
    if (v.erupting && tnow >= v.eruptUntil) { v.erupting = false; v.nextEruptAt = tnow + (5000 + Math.random()*6000); }
  });
  for (let i=st.volcanoes.length-1;i>=0;i--) if (st.volcanoes[i].x < -180) st.volcanoes.splice(i,1);

  st.volcanoSmoke.forEach(s => {
    const t = (tnow - s.born)/s.life;
    s.x += s.vx * dtSec * (1 - t*0.5);
    s.y += s.vy * dtSec;
    s.vx *= (1 - 0.15*dtSec);
    s.vy *= (1 - 0.05*dtSec);
  });
  for (let i=st.volcanoSmoke.length-1;i>=0;i--) if (tnow - st.volcanoSmoke[i].born > st.volcanoSmoke[i].life) st.volcanoSmoke.splice(i,1);

  st.volcanoLava.forEach(p => { p.x += p.vx * dtSec; p.y += p.vy * dtSec; p.vy += 280 * dtSec; });
  for (let i=st.volcanoLava.length-1;i>=0;i--) if (tnow - st.volcanoLava[i].born > st.volcanoLava[i].life || st.volcanoLava[i].y > c.height - 40) st.volcanoLava.splice(i,1);
}

export function spawnPipe(st) {
  const c = st.dom.canvas;
  const gap = DIFF[st.difficulty].pipeGap;
  const minTop = 60;
  const maxTop = c.height - gap - 120;
  const baseTop = Math.floor(minTop + Math.random() * (maxTop - minTop));
  const oscAmp = st.difficulty === 'hard' ? (DIFF.hard.oscAmp || 0) : 0;
  const oscSpeed = st.difficulty === 'hard' ? (DIFF.hard.oscSpeed || 0) : 0;
  const phase = Math.random() * Math.PI * 2;
  const pipeW = Math.max(40, BASE_PIPE_W * (st.config.pipeWmul || 1));
  st.pipes.push({ x: c.width + 20, baseTop, gap, passed:false, oscAmp, oscSpeed, phase, pipeW });
}

// Specials
function selectSpecialByLevel(st) {
  const lvl = st.levelIndex + 1;
  const pool = ['heart','diamondB'];
  if (lvl >= 2) pool.push('diamondG');
  if (lvl >= 3) pool.push('diamondR');
  if (lvl >= 4) pool.push('angel');
  if (lvl >= 5) pool.push('disc');
  if (lvl >= 6) pool.push('tortoise');
  return pool[Math.floor(Math.random()*pool.length)];
}

function makeSpecial(st, key) {
  const spec = SPECIAL_TYPES[key];
  const born = now();
  const floatMs = 1600 + Math.random()*1600;
  const omega = 2 + Math.random()*2;
  const amp   = 6 + Math.random()*8;
  const y0    = 70 + Math.random() * (st.dom.canvas.height-200);
  st.specials.push({
    type: key, x: st.dom.canvas.width + 30, y: y0, baseY: y0,
    r: 14, vx: - (90 + Math.random() * 80), vy: 0,
    born, ttl: 14000, frame: 0, lastFrameAt: born, fps: spec.fps || 12,
    floatUntil: born + floatMs, omega, amp, phase: Math.random()*Math.PI*2,
    mode: 'hover'
  });
}

function ensureSpecialPopulation(st, dtMs) {
  st._specialCooldown = Math.max(0, (st._specialCooldown||0) - dtMs);
  const minCount = minSpecialsForLevel(st.levelIndex);
  const maxCount = maxSpecialsForLevel(st.levelIndex);
  if (st.specials.length < minCount && st._specialCooldown <= 0) {
    makeSpecial(st, selectSpecialByLevel(st)); st._specialCooldown = 900;
  }
  if (st.specials.length < maxCount) {
    const lvl = st.levelIndex + 1;
    const chance = 0.0009 * (1 + 0.25*lvl) * dtMs;
    if (Math.random() < chance) makeSpecial(st, selectSpecialByLevel(st));
  }
}

function applySpecial(st, s) {
  const tnow = now();
  switch (s.type) {
    case 'heart':    if (st.health < 5) st.health += 1; break;
    case 'diamondB': st.score += 25; break;
    case 'diamondG': st.score += 50; break;
    case 'diamondR': st.score += 100; break;
    case 'angel':    st.immunityUntil = Math.max(st.immunityUntil, tnow + (SPECIAL_TYPES.angel.durMs||6000)); break;
    case 'disc':     st.autopilotUntil = Math.max(st.autopilotUntil, tnow + (SPECIAL_TYPES.disc.durMs||5000)); break;
    case 'tortoise': st.slowmoUntil = Math.max(st.slowmoUntil, tnow + (SPECIAL_TYPES.tortoise.durMs||5000)); break;
  }
}

// Particles
export function burstParticles(st, x,y,count=24) {
  for (let i=0;i<count;i++) {
    const a = Math.random()*Math.PI*2;
    const sp = 120 + Math.random()*240;
    st.particles.push({ x, y, vx: Math.cos(a)*sp - 80, vy: Math.sin(a)*sp, life: 600, born: now() });
  }
}
function updateParticles(st, dtSec) {
  st.particles.forEach(p => { p.x += p.vx*dtSec; p.y += p.vy*dtSec; p.vy += 400*dtSec; });
  for (let i=st.particles.length-1;i>=0;i--) if (now()-st.particles[i].born > st.particles[i].life) st.particles.splice(i,1);
}

export function updateGame(st, dt) {
  const tnow = now();
  let dtMs = Math.min(dt, 50);
  if (st.slowmoUntil > tnow) dtMs *= 0.5;
  const dtSec = dtMs / 1000;

  updateBackground(st, dtSec);

  // Autopilot
  if (st.autopilotUntil > tnow && st.bird) {
    const next = st.pipes.find(p => p.x + (p.pipeW || BASE_PIPE_W) > st.bird.x);
    if (next) {
      const offset = (st.difficulty==='hard' && next.oscAmp) ? Math.sin(next.phase + tnow/1000 * next.oscSpeed) * next.oscAmp : 0;
      const targetY = next.baseTop + offset + next.gap/2;
      const dy = targetY - st.bird.y; st.bird.vy = Math.max(-420, Math.min(420, dy*4));
    }
    st.score += 0.05;
  }

  // Bird physics
  st.bird.vy += st.config.gravity * dtSec;
  st.bird.y  += st.bird.vy * dtSec;

  // Pipe spawn
  st.lastSpawn += dtMs;
  const spawnJitter = 1 + (Math.random()*0.24 - 0.12);
  const spawnTarget = (st.config.spawnMsNow || DIFF[st.difficulty].spawnMs) * spawnJitter;
  if (st.lastSpawn >= spawnTarget) { spawnPipe(st); st.lastSpawn = 0; }

  // Move pipes
  st.pipes.forEach(p => p.x -= st.config.pipeSpeed * dtSec);
  st.pipes = st.pipes.filter(p => p.x > -120);

  // Specials
  ensureSpecialPopulation(st, dtMs);
  st.specials.forEach(s => {
    s.x += s.vx * dtSec;
    const age = tnow - s.born;
    const nearBird = (s.x - st.bird.x) < SPECIAL_NEAR_TRIGGER_X;
    if (s.mode === 'hover') {
      if (nearBird || age > (s.ttl * 0.6)) s.mode = 'fall';
      const t = age / 1000;
      s.y = s.baseY + s.amp * Math.sin(s.phase + t * s.omega);
      s.vx *= (1 - 0.12 * dtSec);
    } else {
      s.vy += 120 * dtSec;
      s.vy = Math.min(s.vy, 280);
      s.y  += s.vy * dtSec;
    }
  });
  for (let i=st.specials.length-1;i>=0;i--) {
    const s = st.specials[i];
    const offscreen = s.x < -60 || s.y > st.dom.canvas.height + 40;
    const tooOld = (tnow - s.born) > (s.ttl + 2500);
    if (offscreen || tooOld) st.specials.splice(i, 1);
  }

  // Collisions & scoring
  const invulnerable = (tnow - st.lastHitTs) < INVULN_MS || tnow < st.immunityUntil;
  const bx = st.bird.x, by = st.bird.y, br = st.bird.r;
  const groundY = st.dom.canvas.height - 20;

  if ((by + br >= groundY || by - br <= 0) && !invulnerable) onHit(st);
  if (by + br >= groundY) { st.bird.y = groundY - br; st.bird.vy = Math.min(st.bird.vy, 0); }
  if (by - br <= 0)       { st.bird.y = br;           st.bird.vy = Math.max(st.bird.vy, 0); }

  st.pipes.forEach(p => {
    const pipeW = p.pipeW || Math.max(40, BASE_PIPE_W*(st.config.pipeWmul || 1));
    const offset = (st.difficulty==='hard' && p.oscAmp) ? Math.sin(p.phase + tnow/1000 * p.oscSpeed) * p.oscAmp : 0;
    const gapY = p.baseTop + offset, gapH = p.gap;
    const inPipeX = bx + br > p.x && bx - br < p.x + pipeW;
    const inGapY  = by - br > gapY && by + br < gapY + gapH;
    if (inPipeX && !inGapY && !invulnerable) onHit(st);

    if (!p.passed && (p.x + pipeW) < (bx - br)) {
      p.passed = true;
      if (by > gapY && by < gapY + gapH) {
        st.combo = Math.min(COMBO_MAX, st.combo + 1);
        const awarded = DIFF[st.difficulty].pipeScore * (1 + (st.combo-1)*0.5);
        st.score += awarded;
        st.pipesPassedThisLevel += 1;
      } else if (COMBO_DECAY_ON_HIT) {
        st.combo = 0;
      }
    }
  });

  // Specials pickup
  for (let i=st.specials.length-1;i>=0;i--) {
    const s = st.specials[i];
    const dist = Math.hypot(s.x - bx, s.y - by);
    if (dist < (s.r + br)) { applySpecial(st, s); st.specials.splice(i,1); }
  }

  updateParticles(st, dtSec);

  // Level progression
  const levelIsPipes = (st.levelIndex % 2 === 0);
  if (levelIsPipes) {
    if (st.pipesPassedThisLevel >= pipesGoalForLevel(st.levelIndex)) st._nextLevelRequested = true;
  } else {
    const minPipes = pipesGoalForLevel(st.levelIndex);
    const pipesLeft = Math.max(0, minPipes - st.pipesPassedThisLevel);
    if (pipesLeft === 0) st._nextLevelRequested = true;
    else if ((tnow - st.levelStartTime)/1000 >= timeGoalForLevel(st.levelIndex) && st.pipesPassedThisLevel >= minPipes) st._nextLevelRequested = true;
  }
}

export function onHit(st) {
  st.lastHitTs = now();
  st.health -= 1;
  st.bird.vy = Math.min(st.bird.vy, -180);
  burstParticles(st, st.bird.x, st.bird.y, 24);
  if (COMBO_DECAY_ON_HIT) st.combo = 0;
  if (st.health <= 0) st._gameOverRequested = true;
}
