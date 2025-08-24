/* Flappy Arcade — game.js (specials polish + pipe texture + dynamic spacing)
 * - Specials hover until the bird is near, then fall
 * - Maintain at least ~4 specials on screen; max increases with level
 * - Removed dev hotkey & debug HUD
 * - Pipe spacing scales with level/difficulty (spawnMs adjusts)
 * - Pipes have simple texture (gradient + bands + bolts)
 * - Time-mode levels advance when required pipes == 0
 * - Score on pass, HUD, Game Over, level banners, smaller sprites
 */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const submitBox = document.getElementById('submitScore');
  const nameInput = document.getElementById('playerName');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnClose = document.getElementById('btnClose');
  const btnStart = document.getElementById('btnStart');
  const diffSel = document.getElementById('difficulty');
  const lbDiffSel = document.getElementById('lbDifficulty');
  const lbList = document.getElementById('leaderboard');
  const refreshLB = document.getElementById('refreshLB');
  const btnSound = document.getElementById('btnSound');

  // ===== Audio (music only) =====
  let audio, audioEnabled = true, audioStarted = false;
  function initAudio() {
    if (audioStarted) return;
    audio = new Audio('/audio/loop.mp3');
    audio.loop = true; audio.volume = 0.35;
    audio.play().catch(()=>{});
    audioStarted = true;
  }
  if (btnSound) {
    btnSound.addEventListener('click', () => {
      audioEnabled = !audioEnabled; if (!audio) return;
      if (audioEnabled) { audio.play().catch(()=>{}); btnSound.textContent = '🔊'; }
      else { audio.pause(); btnSound.textContent = '🔈'; }
    });
  }

  // ===== Core config =====
  const DIFF = {
    easy:   { gravity: 1200, flap: -380, pipeGap: 190, pipeSpeed: 160, spawnMs: 1400, pipeScore: 5 },
    normal: { gravity: 1500, flap: -420, pipeGap: 160, pipeSpeed: 200, spawnMs: 1200, pipeScore: 8 },
    hard:   { gravity: 1800, flap: -460, pipeGap: 135, pipeSpeed: 240, spawnMs: 1000, pipeScore: 12, oscAmp: 32, oscSpeed: 1.2 },
  };
  const MAX_HEALTH = 5;
  const INVULN_MS = 800;
  const BASE_PIPE_W = 60;

  // Scoring boosts
  const DIAMOND_VALUES = { blue:25, green:50, red:100 };
  const COMBO_MAX = 5;
  const COMBO_DECAY_ON_HIT = true;

  // Level goals
  function pipesGoalForLevel(idx) { return 10 + Math.floor(idx * 4); }   // 10,14,18,...
  function timeGoalForLevel(idx)  { return 20 + Math.floor(idx * 8); }   // seconds

  // ===== Sprites (special objects) =====
  const IMAGE_BASES = ['images', '/images']; // works at root or subpath
  const SPECIAL_TYPES = {
    heart:   { file:'heart.png',         frames:6, fps:10 }, // +1 HP
    diamondB:{ file:'diamond_blue.png',  frames:6, fps:12, score: DIAMOND_VALUES.blue },
    diamondG:{ file:'diamond_green.png', frames:6, fps:12, score: DIAMOND_VALUES.green },
    diamondR:{ file:'diamond_red.png',   frames:6, fps:12, score: DIAMOND_VALUES.red },
    angel:   { file:'angel.png',         frames:8, fps:8,  durMs:6000 }, // immunity
    disc:    { file:'disc.png',          frames:8, fps:16, durMs:5000 }, // autopilot
    tortoise:{ file:'tortoise.png',      frames:8, fps:12, durMs:5000 }, // slow motion
  };

  const sprites = {}; // key -> {img, w, h, frames, ok}
  function tryLoad(srcs, onload, onerror) {
    if (!srcs.length) { onerror(); return; }
    const src = srcs[0];
    const img = new Image();
    img.onload = () => onload(img, src);
    img.onerror = () => tryLoad(srcs.slice(1), onload, onerror);
    img.src = src;
  }
  function loadSprite(key, file, frames) {
    const candidates = IMAGE_BASES.map(base => `${base}/${file}`);
    return new Promise((resolve) => {
      tryLoad(
        candidates,
        (img) => { sprites[key] = { img, w: img.width/frames, h: img.height, frames, ok: true }; resolve(); },
        () => { sprites[key] = { img: null, w: 0, h: 0, frames, ok: false }; resolve(); }
      );
    });
  }
  async function loadAllSprites() {
    const tasks = [];
    for (const [k, spec] of Object.entries(SPECIAL_TYPES)) tasks.push(loadSprite(k, spec.file, spec.frames));
    await Promise.all(tasks);
  }

  // ===== State =====
  let state = 'idle'; // idle | awaiting | running | levelup | gameover
  let difficulty = 'normal';
  let config;
  let score = 0;
  let combo = 0;
  let pipes = [];
  let lastSpawn = 0;
  let lastTs;
  let health, lastHitTs;

  // Bird
  let bird;

  // Levels (even = pipes mode, odd = time mode)
  let levelIndex = 0;
  let levelStartTime = 0;
  let pipesPassedThisLevel = 0;

  // Background
  const backClouds = [], midHills = [];
  let groundScroll = 0;

  // FX
  const particles = [];

  // Specials
  const specials = [];
  let immunityUntil = 0;
  let autopilotUntil = 0;
  let slowmoUntil = 0;

  // Specials population control
  let specialSpawnCooldown = 0; // ms — prevent bursts when refilling

  function maxSpecialsForLevel() { return Math.min(3 + Math.floor(levelIndex/2), 8); } // scales up
  function minSpecialsForLevel() { return 4; } // keep at least ~4 visible
  const SPECIAL_NEAR_TRIGGER_X = 50; // start falling when within this distance in front of the bird

  function applyLevelMods() {
    const base = DIFF[difficulty];
    // speed increases with level, gravity tweaks, smaller pipes width
    const speedMul   = 1 + Math.min(0.28, levelIndex * 0.03);
    const gravityMul = 1 + ( (levelIndex % 2 === 0) ? -0.06 : 0.08 ) * Math.min(1, levelIndex/10);

    // dynamic pipe spacing: decrease spawn interval as levels climb (harder = closer pipes)
    const spawnScale = 1 / (1 + Math.min(0.6, levelIndex * 0.08)); // up to ~40% faster spawns

    config = {
      ...base,
      pipeSpeed: base.pipeSpeed * speedMul,
      gravity:   Math.max(800, base.gravity * gravityMul),
      pipeWmul:  Math.max(0.72, 1 - levelIndex*0.02),
      birdR:     Math.max(12, 16 + ( (levelIndex%3)-1 )*2 ),
      spawnMsNow: Math.max(700, base.spawnMs * spawnScale), // dynamic spacing
    };
  }

  function reset() {
    difficulty = diffSel ? diffSel.value : 'normal';
    levelIndex = 0; applyLevelMods();

    score = 0; combo = 0; pipes = []; lastSpawn = 0; lastTs = undefined;
    health = MAX_HEALTH; lastHitTs = -1e9;
    immunityUntil = autopilotUntil = slowmoUntil = 0;
    specials.length = 0; particles.length = 0;
    specialSpawnCooldown = 0;

    bird = { x: 160, y: canvas.height/2, vy: 0, r: config.birdR };

    backClouds.length = 0; midHills.length = 0; groundScroll = 0;
    spawnInitialBackground();

    levelStartTime = performance.now();
    pipesPassedThisLevel = 0;
  }

  // ===== Background =====
  function spawnInitialBackground() {
    for (let i=0;i<6;i++) backClouds.push({ x: Math.random()*canvas.width, y: 40+Math.random()*120, w: 60+Math.random()*80 });
    for (let i=0;i<5;i++) midHills.push({ x: i*220 + Math.random()*60, y: canvas.height-80, w: 260, h: 80+Math.random()*20 });
  }
  function updateBackground(dtSec) {
    backClouds.forEach(c => { c.x -= 20*dtSec; if (c.x < -c.w) c.x = canvas.width + Math.random()*200; });
    midHills.forEach(h => { h.x -= 60*dtSec; if (h.x < -h.w) h.x = canvas.width + Math.random()*120; });
    groundScroll = (groundScroll + 140*dtSec) % 40;
  }
  function drawBackground() {
    const sky = ctx.createLinearGradient(0,0,0,canvas.height);
    sky.addColorStop(0,'#8fd3ff'); sky.addColorStop(1,'#56a8e6');
    ctx.fillStyle = sky; ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,.9)';
    backClouds.forEach(c => { roundedRect(c.x, c.y, c.w, 24, 12); ctx.fill(); });

    ctx.fillStyle = '#2f865f';
    midHills.forEach(h => { ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.quadraticCurveTo(h.x+h.w/2, h.y-h.h, h.x+h.w, h.y); ctx.closePath(); ctx.fill(); });

    const groundY = canvas.height - 20;
    ctx.fillStyle = '#2a8f3b'; ctx.fillRect(0, groundY, canvas.width, 20);
    ctx.fillStyle = 'rgba(0,0,0,.1)';
    for (let x=-40; x<canvas.width+40; x+=40) ctx.fillRect(Math.floor(x - groundScroll), groundY, 20, 20);
  }

  // ===== Pipes =====
  function spawnPipe() {
    const gap = DIFF[difficulty].pipeGap;
    const minTop = 60;
    const maxTop = canvas.height - gap - 120;
    const baseTop = Math.floor(minTop + Math.random() * (maxTop - minTop));
    const oscAmp = difficulty === 'hard' ? (DIFF.hard.oscAmp ?? 28) : 0;
    const oscSpeed = difficulty === 'hard' ? (DIFF.hard.oscSpeed ?? 1.0) : 0;
    const phase = Math.random() * Math.PI * 2;
    const pipeW = Math.max(40, BASE_PIPE_W * (config.pipeWmul ?? 1));
    pipes.push({ x: canvas.width + 20, baseTop, gap, passed:false, oscAmp, oscSpeed, phase, pipeW });
  }

  // ===== Specials (animated + hover-until-near + fall) =====
  function ensureSpecialPopulation(dtMs) {
    specialSpawnCooldown = Math.max(0, specialSpawnCooldown - dtMs);
    const minCount = minSpecialsForLevel();
    const maxCount = maxSpecialsForLevel();

    // Keep at least minCount by spawning one when cooldown allows
    if (specials.length < minCount && specialSpawnCooldown <= 0) {
      spawnSpecialImmediate();
      specialSpawnCooldown = 900; // avoid instant flooding
    }

    // Natural spawns (chance-based) up to maxCount
    if (specials.length < maxCount) {
      maybeSpawnSpecial(dtMs);
    }
  }

  function spawnSpecialImmediate() {
    const lvl = levelIndex+1;
    const pool = ['heart','diamondB'];
    if (lvl >= 2) pool.push('diamondG');
    if (lvl >= 3) pool.push('diamondR');
    if (lvl >= 4) pool.push('angel');
    if (lvl >= 5) pool.push('disc');
    if (lvl >= 6) pool.push('tortoise');

    const key = pool[Math.floor(Math.random()*pool.length)];
    makeSpecial(key);
  }

  function maybeSpawnSpecial(dtMs) {
    const lvl = levelIndex+1;
    const baseRate = 0.0009; // per ms
    const chance = baseRate * (1 + 0.25*lvl) * dtMs;
    if (Math.random() > chance) return;

    const pool = ['heart','diamondB'];
    if (lvl >= 2) pool.push('diamondG');
    if (lvl >= 3) pool.push('diamondR');
    if (lvl >= 4) pool.push('angel');
    if (lvl >= 5) pool.push('disc');
    if (lvl >= 6) pool.push('tortoise');

    const key = pool[Math.floor(Math.random()*pool.length)];
    makeSpecial(key);
  }

  function makeSpecial(key) {
    const spec = SPECIAL_TYPES[key];
    const born = performance.now();
    const floatMs = 1600 + Math.random()*1600; // longer hover
    const omega = 2 + Math.random()*2;         // rad/s for bob
    const amp   = 6 + Math.random()*8;         // px
    const y0    = 70 + Math.random()*(canvas.height-200);

    specials.push({
      type: key,
      x: canvas.width + 30,
      y: y0,
      baseY: y0,
      r: 14,
      vx: - (90 + Math.random() * 80),
      vy: 0,
      born,
      ttl: 14000,
      frame: 0, lastFrameAt: born, fps: spec.fps ?? 12,
      floatUntil: born + floatMs,
      omega, amp,
      phase: Math.random()*Math.PI*2,
      mode: 'hover' // 'hover' → 'fall'
    });
  }

  function drawSpecial(s) {
    const spr  = sprites[s.type];
    if (!spr || !spr.ok) {
      // Fallback marker
      const r = Math.max(14, s.r);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.fill();
      ctx.strokeStyle = '#ff00aa';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    // advance frame
    const now = performance.now();
    if (now - s.lastFrameAt > 1000/s.fps) { s.frame = (s.frame + 1) % spr.frames; s.lastFrameAt = now; }
    const sx = s.frame * spr.w, sy = 0;

    // draw at smaller scale (~0.7)
    const scale = 0.7;
    const dw = Math.floor(spr.w * scale);
    const dh = Math.floor(spr.h * scale);
    ctx.drawImage(spr.img, sx, sy, spr.w, spr.h, Math.floor(s.x - dw/2), Math.floor(s.y - dh/2), dw, dh);
  }

  function applySpecial(s) {
    const now = performance.now();
    switch (s.type) {
      case 'heart':    if (health < MAX_HEALTH) health += 1; break;
      case 'diamondB': score += DIAMOND_VALUES.blue; break;
      case 'diamondG': score += DIAMOND_VALUES.green; break;
      case 'diamondR': score += DIAMOND_VALUES.red; break;
      case 'angel':    immunityUntil = Math.max(immunityUntil, now + (SPECIAL_TYPES.angel.durMs||6000)); break;
      case 'disc':     autopilotUntil = Math.max(autopilotUntil, now + (SPECIAL_TYPES.disc.durMs||5000)); break;
      case 'tortoise': slowmoUntil = Math.max(slowmoUntil, now + (SPECIAL_TYPES.tortoise.durMs||5000)); break;
    }
  }

  // ===== Particles =====
  function burstParticles(x,y,count=24) {
    for (let i=0;i<count;i++) {
      const a = Math.random()*Math.PI*2;
      const sp = 120 + Math.random()*240;
      particles.push({ x, y, vx: Math.cos(a)*sp - 80, vy: Math.sin(a)*sp, life: 600, born: performance.now() });
    }
  }
  function updateParticles(dtSec) {
    for (const p of particles) { p.x += p.vx*dtSec; p.y += p.vy*dtSec; p.vy += 400*dtSec; }
    for (let i=particles.length-1;i>=0;i--) if (performance.now()-particles[i].born > particles[i].life) particles.splice(i,1);
  }
  function drawParticles() {
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    particles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill(); });
  }

  // ===== Controls =====
  function flap() { bird.vy = config.flap; }
  function handleFlap() { if (state === 'running') flap(); }
  canvas.addEventListener('mousedown', ()=>{ if (state==='awaiting') { state='running'; initAudio(); } handleFlap(); });
  canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); if (state==='awaiting') { state='running'; initAudio(); } handleFlap(); }, { passive:false });
  window.addEventListener('keydown', (e)=>{ if (e.code === 'Space') { e.preventDefault(); if (state==='awaiting') { state='running'; initAudio(); } handleFlap(); }});

  // ===== Loop =====
  function update(dt) {
    const now = performance.now();
    let dtMs = Math.min(dt, 50);
    if (slowmoUntil > now) dtMs *= 0.5;
    const dtSec = dtMs / 1000;

    updateBackground(dtSec);

    // Autopilot assist
    if (autopilotUntil > now) {
      const next = pipes.find(p => p.x + (p.pipeW||BASE_PIPE_W) > bird.x);
      if (next) {
        const offset = (difficulty==='hard' && next.oscAmp) ? Math.sin(next.phase + now/1000 * next.oscSpeed) * next.oscAmp : 0;
        const targetY = next.baseTop + offset + next.gap/2;
        const dy = targetY - bird.y; bird.vy = Math.max(-420, Math.min(420, dy*4));
      }
      score += 0.05; // trickle during autopilot
    }

    // Physics
    bird.vy += config.gravity * dtSec;
    bird.y  += bird.vy * dtSec;

    // Spawn pipes with dynamic interval + light randomness (±12%)
    lastSpawn += dtMs;
    const spawnJitter = 1 + (Math.random()*0.24 - 0.12);
    const spawnTarget = (config.spawnMsNow || DIFF[difficulty].spawnMs) * spawnJitter;
    if (lastSpawn >= spawnTarget) { spawnPipe(); lastSpawn = 0; }

    for (const p of pipes) p.x -= config.pipeSpeed * dtSec;
    pipes = pipes.filter(p => p.x > -120);

    // ===== Specials population & update =====
    ensureSpecialPopulation(dtMs);

    specials.forEach(s => {
      // horizontal drift always
      s.x += s.vx * dtSec;

      const age = now - s.born;
      const nearBird = (s.x - bird.x) < SPECIAL_NEAR_TRIGGER_X; // ahead & near → start falling

      if (s.mode === 'hover') {
        // if TTL almost up or near bird, switch to fall
        if (nearBird || age > (s.ttl * 0.6)) s.mode = 'fall';

        // hover bob at baseline
        const t = age / 1000;
        s.y = s.baseY + s.amp * Math.sin(s.phase + t * s.omega);
        // slight air resistance
        s.vx *= (1 - 0.12 * dtSec);
      } else {
        // fall
        s.vy += 120 * dtSec;           // gravity
        s.vy = Math.min(s.vy, 280);    // terminal
        s.y  += s.vy * dtSec;
      }
    });
    // Despawn when offscreen or too old
    for (let i = specials.length - 1; i >= 0; i--) {
      const s = specials[i];
      const offscreen = s.x < -60 || s.y > canvas.height + 40;
      const tooOld = (now - s.born) > (s.ttl + 2500);
      if (offscreen || tooOld) specials.splice(i, 1);
    }

    // Collisions & Scoring
    const invulnerable = (now - lastHitTs) < INVULN_MS || now < immunityUntil;
    const bx = bird.x, by = bird.y, br = bird.r;
    const groundY = canvas.height - 20;

    // Bounds -> damage
    if ((by + br >= groundY || by - br <= 0) && !invulnerable) doHit();
    if (by + br >= groundY) { bird.y = groundY - br; bird.vy = Math.min(bird.vy, 0); }
    if (by - br <= 0)       { bird.y = br;           bird.vy = Math.max(bird.vy, 0); }

    for (const p of pipes) {
      const pipeW = p.pipeW || Math.max(40, BASE_PIPE_W * (config.pipeWmul||1));
      const offset = (difficulty==='hard' && p.oscAmp) ? Math.sin(p.phase + now/1000 * p.oscSpeed) * p.oscAmp : 0;
      const gapY = p.baseTop + offset;
      const gapH = p.gap;

      // Collision damage check
      const inPipeX = bx + br > p.x && bx - br < p.x + pipeW;
      const inGapY  = by - br > gapY && by + br < gapY + gapH;
      if (inPipeX && !inGapY && !invulnerable) doHit();

      // Scoring exactly when trailing edge passes the bird
      if (!p.passed && (p.x + pipeW) < (bx - br)) {
        const centerInGap = (by > gapY) && (by < gapY + gapH);
        p.passed = true;
        if (centerInGap) {
          combo = Math.min(COMBO_MAX, combo + 1);
          const awarded = (DIFF[difficulty].pipeScore) * (1 + (combo-1)*0.5);
          score += awarded;
          pipesPassedThisLevel += 1;
        } else {
          if (COMBO_DECAY_ON_HIT) combo = 0;
        }
      }
    }

    // Specials pickup
    for (let i=specials.length-1;i>=0;i--) {
      const s = specials[i];
      const dist = Math.hypot(s.x - bx, s.y - by);
      if (dist < (s.r + br)) { applySpecial(s); specials.splice(i,1); }
    }

    updateParticles(dtSec);

    // ===== Level progression =====
    const levelIsPipes = (levelIndex % 2 === 0);
    if (levelIsPipes) {
      const goal = pipesGoalForLevel(levelIndex);
      if (pipesPassedThisLevel >= goal) nextLevel();
    } else {
      const minPipes = pipesGoalForLevel(levelIndex); // min pipes in time mode
      const pipesLeft = Math.max(0, minPipes - pipesPassedThisLevel);
      // Advance immediately when pipe requirement met
      if (pipesLeft === 0) {
        nextLevel();
      } else {
        // Also allow time expiry + min pipes as a fallback
        const tGoal = timeGoalForLevel(levelIndex);
        if ((now - levelStartTime)/1000 >= tGoal && pipesPassedThisLevel >= minPipes) nextLevel();
      }
    }
  }

  function doHit() {
    const now = performance.now();
    lastHitTs = now; health -= 1; bird.vy = Math.min(bird.vy, -180);
    burstParticles(bird.x, bird.y, 24);
    if (COMBO_DECAY_ON_HIT) combo = 0;
    if (health <= 0) return gameOver();
  }

  function nextLevel() {
    if (state === 'levelup') return; // guard against double-trigger
    state = 'levelup';

    const justCleared = levelIndex + 1;
    const bonus = 10 + pipesPassedThisLevel * 1.5 + levelIndex * 5;
    score += bonus;

    showOverlay(`Level ${justCleared} Clear!`, `Bonus +${Math.floor(bonus)}`);

    setTimeout(() => {
      levelIndex += 1;
      applyLevelMods();
      bird.r = config.birdR || bird.r;
      levelStartTime = performance.now();
      pipesPassedThisLevel = 0; combo = 0;

      showOverlay(`Level ${levelIndex+1} Start!`, `Good luck!`);

      setTimeout(() => {
        overlay.classList.add('hidden');
        state = 'running';
      }, 900);
    }, 900);
  }

  // ===== Draw =====
  function currentLevelGoal() {
    // Even levels = pipes mode, odd = time mode
    const isPipes = (levelIndex % 2 === 0);
    // We use the same pipe-count goal for both modes for HUD display
    return { mode: isPipes ? 'pipes' : 'time', goal: pipesGoalForLevel(levelIndex) };
  }

  function draw() {
    drawBackground();

    // Pipes (with texture)
    const now = performance.now();
    for (const p of pipes) {
      const pipeW = p.pipeW || Math.max(40, BASE_PIPE_W * (config.pipeWmul||1));
      const offset = (difficulty==='hard' && p.oscAmp)
        ? Math.sin(p.phase + now/1000 * p.oscSpeed) * p.oscAmp
        : 0;

      const gapY = p.baseTop + offset;
      const gapH = p.gap;

      // gradient body
      const gradTop = ctx.createLinearGradient(p.x, 0, p.x + pipeW, 0);
      gradTop.addColorStop(0, '#2db565');
      gradTop.addColorStop(1, '#1f9b57');

      const gradBottom = ctx.createLinearGradient(p.x, 0, p.x + pipeW, 0);
      gradBottom.addColorStop(0, '#2db565');
      gradBottom.addColorStop(1, '#1f9b57');

      // top pipe
      ctx.fillStyle = gradTop;
      ctx.fillRect(p.x, 0, pipeW, gapY);

      // bottom pipe
      ctx.fillStyle = gradBottom;
      ctx.fillRect(p.x, gapY + gapH, pipeW, canvas.height - (gapY + gapH) - 20);

      // lips
      ctx.fillStyle = '#218c4f';
      ctx.fillRect(p.x-3, gapY-12, pipeW+6, 12);
      ctx.fillRect(p.x-3, gapY+gapH, pipeW+6, 12);

      // subtle bands (texture)
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 10; y < gapY-10; y += 16) ctx.fillRect(p.x, y, pipeW, 3);
      for (let y = gapY + gapH + 10; y < canvas.height - 30; y += 16) ctx.fillRect(p.x, y, pipeW, 3);

      // bolts
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const boltRowsTop = Math.floor((gapY-20)/40);
      for (let r=0; r<boltRowsTop; r++) {
        const y = 12 + r*40;
        ctx.beginPath(); ctx.arc(p.x + pipeW*0.25, y, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x + pipeW*0.75, y, 2, 0, Math.PI*2); ctx.fill();
      }
      const boltRowsBottom = Math.floor((canvas.height - (gapY+gapH) - 40)/40);
      for (let r=0; r<boltRowsBottom; r++) {
        const y = gapY + gapH + 20 + r*40;
        ctx.beginPath(); ctx.arc(p.x + pipeW*0.25, y, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x + pipeW*0.75, y, 2, 0, Math.PI*2); ctx.fill();
      }
    }

    // Specials
    specials.forEach(drawSpecial);

    // Bird (blink during i-frames)
    const blink = (performance.now() - lastHitTs) < INVULN_MS && Math.floor(performance.now()/100)%2===0;
    if (!blink) {
      ctx.beginPath(); ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI*2);
      ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.strokeStyle = '#e09e3e'; ctx.lineWidth = 3; ctx.stroke();
    }

    drawParticles();

    // HUD — Score & Combo (top-left)
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(14,12,240,44);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(`Score ${Math.floor(score)}`, 24, 44);
    if (combo > 1) { ctx.fillStyle = '#ffd166'; ctx.font = 'bold 16px system-ui'; ctx.fillText(`Combo ×${combo}`, 24, 66); }

    // HUD — Level & Pipes left (top-center) — uses currentLevelGoal()
    const goalInfo = currentLevelGoal();
    const pipesLeft = Math.max(0, goalInfo.goal - pipesPassedThisLevel);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(canvas.width/2 - 180, 12, 360, 48);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(`Level ${levelIndex+1}`, canvas.width/2, 36);
    ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(`Pipes left: ${pipesLeft}`, canvas.width/2, 56);
    ctx.textAlign = 'left';

    // HUD — Health (top-right)
    const pad = 14, barW = 220, barH = 16, x = canvas.width - barW - pad, y = 18;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x-6, y-6, barW+12, barH+12);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = '#2ecc71'; const ratio = Math.max(0, health)/MAX_HEALTH; ctx.fillRect(x, y, Math.floor(barW*ratio), barH);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, barW, barH);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(`HP ${health}/${MAX_HEALTH}`, x, y+barH+14);

    // Damage flash
    const sinceHit = performance.now() - lastHitTs;
    if (sinceHit >= 0 && sinceHit < 120) {
      ctx.fillStyle = `rgba(255,255,255,${1 - sinceHit/120})`;
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }
  }

  function loop(ts) {
    if (lastTs === undefined) lastTs = ts;
    const dt = ts - lastTs; lastTs = ts;
    if (state === 'running') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state = 'gameover';
    showOverlay('Game Over', `Score: ${Math.floor(score)} — Level ${levelIndex+1}`);
    submitBox.classList.remove('hidden'); nameInput.focus();
  }

  function showOverlay(title, text) { overlayTitle.textContent = title; overlayText.textContent = text; overlay.classList.remove('hidden'); }
  function roundedRect(x,y,w,h,r=12){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); }

  // Buttons
  btnStart.addEventListener('click', async () => {
    await loadAllSprites();
    reset(); state = 'awaiting'; overlay.classList.add('hidden'); submitBox.classList.add('hidden'); requestAnimationFrame(loop);
  });
  btnClose.addEventListener('click', () => { overlay.classList.add('hidden'); submitBox.classList.add('hidden'); });

  btnSubmit.addEventListener('click', async () => {
    const raw = (nameInput.value || '').trim();
    const name = raw.replace(/[^\w\s\-_.]/g,'').slice(0,20) || 'Player';
    try {
      await fetch('/api/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score: Math.floor(score), difficulty })
      });
      await loadLeaderboard(); overlayText.textContent = `Saved! Score: ${Math.floor(score)}`; submitBox.classList.add('hidden');
    } catch { overlayText.textContent = 'Error saving score.'; }
  });

  async function loadLeaderboard() {
    if (!lbDiffSel || !lbList) return;
    const d = lbDiffSel.value;
    const res = await fetch(`/api/leaderboard?limit=10${d && d!=='all' ? `&difficulty=${d}` : ''}`);
    const data = await res.json(); lbList.innerHTML = '';
    data.forEach((row, i) => {
      const li = document.createElement('li'); const rank = String(i+1).padStart(2,'0');
      li.innerHTML = `<span>#${rank} <strong>${escapeHtml(row.name)}</strong> <em>(${row.difficulty})</em></span><span>${row.score}</span>`;
      lbList.appendChild(li);
    });
  }
  if (refreshLB) refreshLB.addEventListener('click', loadLeaderboard);
  if (lbDiffSel) lbDiffSel.addEventListener('change', loadLeaderboard);

  function escapeHtml(s){ return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  // Init
  overlayTitle.textContent = 'Flappy Arcade';
  overlayText.textContent  = 'Press Start, then Space/Click/Tap to flap!';
  loadLeaderboard();
})();
