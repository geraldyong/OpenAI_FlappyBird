/* Full updated game.js with:
   - Damage flash
   - Knockback particles
   - Parallax background (clouds/hills/ground)
   - Levels (pipes/time modes, >=20 pipes requirement, per-level mods: size/speed/pipe width/weight)
   - Specials: heart (+HP), diamonds (+10/20/30), angel (immunity 6s), disc (autopilot 5s), tortoise (slowmo 5s)
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

  // Music
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

  // Base difficulty (time-based physics)
  const DIFF = {
    easy:   { gravity: 1200, flap: -380, pipeGap: 190, pipeSpeed: 160, spawnMs: 1400 },
    normal: { gravity: 1500, flap: -420, pipeGap: 160, pipeSpeed: 200, spawnMs: 1200 },
    hard:   { gravity: 1800, flap: -460, pipeGap: 135, pipeSpeed: 240, spawnMs: 1000, oscAmp: 32, oscSpeed: 1.2 },
  };
  const MAX_HEALTH = 5;
  const INVULN_MS = 800;
  const BASE_PIPE_W = 60;

  // Levels (>=20 pipes minimum per level)
  // mode: 'pipes' or 'time' (seconds). mods change size/speed/pipe width/weight (gravity)
  const LEVELS = [
    { mode:'pipes', goal:20, mods:{ birdR:16, pipeW:1.00, speed:1.00, gravity:1.00 } },
    { mode:'time',  goal:30, mods:{ birdR:16, pipeW:0.95, speed:1.05, gravity:1.00 } },
    { mode:'pipes', goal:24, mods:{ birdR:14, pipeW:0.90, speed:1.08, gravity:0.95 } },
    { mode:'time',  goal:35, mods:{ birdR:18, pipeW:0.88, speed:1.12, gravity:1.05 } },
    { mode:'pipes', goal:28, mods:{ birdR:15, pipeW:0.85, speed:1.16, gravity:1.10 } },
    { mode:'time',  goal:40, mods:{ birdR:17, pipeW:0.82, speed:1.20, gravity:0.98 } },
  ];
  const SPECIAL_TYPES = {
    heart:   { color:'#ff5d73' },            // +1HP up to 5
    diamondB:{ color:'#1e90ff', score:10 },
    diamondG:{ color:'#2ecc71', score:20 },
    diamondR:{ color:'#ff7675', score:30 },
    angel:   { color:'#ffd166', durMs:6000 },// immunity
    disc:    { color:'#a29bfe', durMs:5000 },// autopilot
    tortoise:{ color:'#9b7653', durMs:5000 },// slow motion
  };

  // State
  let state = 'idle'; // idle | awaiting | running | levelup | gameover
  let difficulty = 'normal';
  let config;
  let score = 0;
  let pipes = [];
  let lastSpawn = 0;
  let lastTs;
  let health, lastHitTs;

  // Bird
  let bird;

  // Level tracking
  let levelIndex = 0;
  let levelStartTime = 0;
  let pipesPassedThisLevel = 0;

  // Parallax background
  const backClouds = [], midHills = [];
  let groundScroll = 0;

  // FX
  const particles = [];

  // Specials
  const specials = [];
  let immunityUntil = 0;
  let autopilotUntil = 0;
  let slowmoUntil = 0;

  function levelDef() { return LEVELS[Math.min(levelIndex, LEVELS.length-1)]; }
  function applyLevelMods() {
    const mods = levelDef().mods;
    const base = DIFF[difficulty];
    config = {
      ...base,
      pipeSpeed: base.pipeSpeed * (mods.speed ?? 1),
      gravity:   base.gravity   * (mods.gravity ?? 1),
    };
  }

  function reset() {
    difficulty = diffSel ? diffSel.value : 'normal';
    levelIndex = 0;
    applyLevelMods();

    score = 0; pipes = []; lastSpawn = 0; lastTs = undefined;
    health = MAX_HEALTH; lastHitTs = -1e9;
    immunityUntil = autopilotUntil = slowmoUntil = 0;
    specials.length = 0; particles.length = 0;

    const r = levelDef().mods.birdR || 16;
    bird = { x: 160, y: canvas.height/2, vy: 0, r };

    // Background
    backClouds.length = 0; midHills.length = 0; groundScroll = 0;
    spawnInitialBackground();

    levelStartTime = performance.now();
    pipesPassedThisLevel = 0;
  }

  // Background
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

  // Pipes
  function spawnPipe() {
    const gap = config.pipeGap;
    const minTop = 60;
    const maxTop = canvas.height - gap - 120;
    const baseTop = Math.floor(minTop + Math.random() * (maxTop - minTop));
    const oscAmp = difficulty === 'hard' ? (config.oscAmp ?? 28) : 0;
    const oscSpeed = difficulty === 'hard' ? (config.oscSpeed ?? 1.0) : 0;
    const phase = Math.random() * Math.PI * 2;
    const pipeW = Math.max(40, BASE_PIPE_W * (levelDef().mods.pipeW ?? 1));
    pipes.push({ x: canvas.width + 20, baseTop, gap, passed:false, oscAmp, oscSpeed, phase, pipeW });
  }

  // Specials
  function maybeSpawnSpecial(dtMs) {
    const lvl = levelIndex+1;
    const baseRate = 0.00045; // per ms
    const chance = baseRate * (1 + 0.25*lvl) * dtMs;
    if (Math.random() > chance) return;

    const pool = ['heart','diamondB'];
    if (lvl >= 2) pool.push('diamondG');
    if (lvl >= 3) pool.push('diamondR');
    if (lvl >= 4) pool.push('angel');
    if (lvl >= 5) pool.push('disc');
    if (lvl >= 6) pool.push('tortoise');

    const typeKey = pool[Math.floor(Math.random()*pool.length)];
    const spec = SPECIAL_TYPES[typeKey];
    specials.push({
      type:typeKey, color:spec.color,
      x:canvas.width+30, y:60+Math.random()*(canvas.height-160),
      r:12, vx:- (120+Math.random()*80), vy:(Math.random()*30-15),
      born:performance.now(), ttl:12000
    });
  }
  function applySpecial(s) {
    const now = performance.now();
    switch (s.type) {
      case 'heart':    if (health < MAX_HEALTH) health += 1; break;
      case 'diamondB': score += 10; break;
      case 'diamondG': score += 20; break;
      case 'diamondR': score += 30; break;
      case 'angel':    immunityUntil = Math.max(immunityUntil, now + SPECIAL_TYPES.angel.durMs); break;
      case 'disc':     autopilotUntil = Math.max(autopilotUntil, now + SPECIAL_TYPES.disc.durMs); break;
      case 'tortoise': slowmoUntil = Math.max(slowmoUntil, now + SPECIAL_TYPES.tortoise.durMs); break;
    }
  }

  // Particles
  function burstParticles(x,y,count=18) {
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

  // Controls
  function flap() { bird.vy = config.flap; }
  function handleFlap() { if (state === 'running') flap(); }
  canvas.addEventListener('mousedown', ()=>{ if (state==='awaiting') { state='running'; initAudio(); } handleFlap(); });
  canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); if (state==='awaiting') { state='running'; initAudio(); } handleFlap(); }, { passive:false });
  window.addEventListener('keydown', (e)=>{ if (e.code === 'Space') { e.preventDefault(); if (state==='awaiting') { state='running'; initAudio(); } handleFlap(); }});

  // Loop
  function update(dt) {
    const now = performance.now();
    let dtMs = Math.min(dt, 50);
    if (slowmoUntil > now) dtMs *= 0.5;
    const dtSec = dtMs / 1000;

    updateBackground(dtSec);

    // Autopilot (center toward next gap)
    if (autopilotUntil > now) {
      const next = pipes.find(p => p.x + (p.pipeW||BASE_PIPE_W) > bird.x);
      if (next) {
        const offset = next.oscAmp ? Math.sin(next.phase + now/1000 * next.oscSpeed) * next.oscAmp : 0;
        const targetY = next.baseTop + offset + next.gap/2;
        const dy = targetY - bird.y;
        bird.vy = Math.max(-420, Math.min(420, dy*4));
      }
      score += 0.03;
    }

    // Physics
    bird.vy += config.gravity * dtSec;
    bird.y  += bird.vy * dtSec;

    // Spawns
    lastSpawn += dtMs;
    if (lastSpawn >= config.spawnMs) { spawnPipe(); lastSpawn = 0; }

    for (const p of pipes) p.x -= config.pipeSpeed * dtSec;
    pipes = pipes.filter(p => p.x > -120);

    maybeSpawnSpecial(dtMs);
    specials.forEach(s => { s.x += s.vx*dtSec; s.y += s.vy*dtSec; s.vy += 30*dtSec; });
    for (let i=specials.length-1;i>=0;i--) if (specials[i].x < -40 || now - specials[i].born > specials[i].ttl) specials.splice(i,1);

    // Collisions
    const invulnerable = (now - lastHitTs) < INVULN_MS || now < immunityUntil;
    const bx = bird.x, by = bird.y, br = bird.r;
    const groundY = canvas.height - 20;

    if ((by + br >= groundY || by - br <= 0) && !invulnerable) doHit();
    if (by + br >= groundY) { bird.y = groundY - br; bird.vy = Math.min(bird.vy, 0); }
    if (by - br <= 0)       { bird.y = br;           bird.vy = Math.max(bird.vy, 0); }

    for (const p of pipes) {
      const pipeW = p.pipeW || BASE_PIPE_W;
      const offset = p.oscAmp ? Math.sin(p.phase + now/1000 * p.oscSpeed) * p.oscAmp : 0;
      const gapY = p.baseTop + offset;
      const gapH = p.gap;
      const inPipeX = bx + br > p.x && bx - br < p.x + pipeW;
      const inGapY  = by - br > gapY && by + br < gapY + gapH;
      if (inPipeX) {
        if (!inGapY && !invulnerable) doHit();
        else if (!p.passed && p.x + pipeW < bx - br) { p.passed = true; score += 1; pipesPassedThisLevel += 1; }
      }
    }

    // Specials pickup
    for (let i=specials.length-1;i>=0;i--) {
      const s = specials[i];
      const dist = Math.hypot(s.x - bx, s.y - by);
      if (dist < (s.r + br)) { applySpecial(s); specials.splice(i,1); }
    }

    updateParticles(dtSec);

    // Level progression
    const lv = levelDef();
    if (lv.mode === 'pipes') {
      if (pipesPassedThisLevel >= Math.max(20, lv.goal)) nextLevel();
    } else {
      if ((now - levelStartTime)/1000 >= lv.goal && pipesPassedThisLevel >= 20) nextLevel();
    }
  }

  function doHit() {
    const now = performance.now();
    lastHitTs = now; health -= 1; bird.vy = Math.min(bird.vy, -180);
    burstParticles(bird.x, bird.y, 22);
    if (health <= 0) return gameOver();
  }

  function nextLevel() {
    state = 'levelup';
    levelIndex += 1;
    applyLevelMods();
    bird.r = levelDef().mods.birdR || bird.r;
    levelStartTime = performance.now();
    pipesPassedThisLevel = 0;
    score = Math.floor(score + 5);
    showOverlay(`Level ${levelIndex+1}`, `New mods active!`);
    setTimeout(()=>{ overlay.classList.add('hidden'); state = 'running'; }, 1200);
  }

  function draw() {
    drawBackground();

    // Pipes
    const now = performance.now();
    for (const p of pipes) {
      const pipeW = p.pipeW || BASE_PIPE_W;
      const offset = p.oscAmp ? Math.sin(p.phase + now/1000 * p.oscSpeed) * p.oscAmp : 0;
      const gapY = p.baseTop + offset, gapH = p.gap;
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(p.x, 0, pipeW, gapY);
      ctx.fillRect(p.x, gapY + gapH, pipeW, canvas.height - (gapY + gapH) - 20);
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(p.x-3, gapY-12, pipeW+6, 12);
      ctx.fillRect(p.x-3, gapY+gapH, pipeW+6, 12);
    }

    // Specials
    specials.forEach(s => {
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
      if (s.type.startsWith('diamond')) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    });

    // Bird (blink during invulnerability)
    const blink = (performance.now() - lastHitTs) < INVULN_MS && Math.floor(performance.now()/100)%2===0;
    if (!blink) {
      ctx.beginPath(); ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI*2);
      ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.strokeStyle = '#e09e3e'; ctx.lineWidth = 3; ctx.stroke();
    }

    drawParticles();

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(14,12,160,40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(`Score ${Math.floor(score)}`, 24, 41);

    const pad = 14, barW = 200, barH = 16, x = canvas.width - barW - pad, y = 18;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x-6, y-6, barW+12, barH+12);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = '#2ecc71'; const ratio = Math.max(0, health)/MAX_HEALTH; ctx.fillRect(x, y, Math.floor(barW*ratio), barH);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, barW, barH);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(`HP ${health}/${MAX_HEALTH}  L${levelIndex+1}`, x, y+barH+14);

    // Damage flash
    const sinceHit = performance.now() - lastHitTs;
    if (sinceHit >=0 && sinceHit < 120) {
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
  btnStart.addEventListener('click', () => {
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
    const d = lbDiffSel ? lbDiffSel.value : 'all';
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
