(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI elements
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

  // Difficulty tuning (time-based physics: px/s and px/s^2)
  const DIFF = {
    easy:   { gravity: 1200, flap: -380, pipeGap: 190, pipeSpeed: 160, spawnMs: 1400 },
    normal: { gravity: 1500, flap: -420, pipeGap: 160, pipeSpeed: 200, spawnMs: 1200 },
    // HARD: moving pipes enabled below (oscillation)
    hard:   { gravity: 1800, flap: -460, pipeGap: 135, pipeSpeed: 240, spawnMs: 1000, oscAmp: 32, oscSpeed: 1.2 },
  };

  // Health system
  const MAX_HEALTH = 5;
  const INVULN_MS = 800;

  // Game state
  let state = 'idle'; // idle | awaiting | running | gameover
  let score = 0;
  let pipes = [];
  let lastSpawn = 0;
  let bird, config, lastTs, difficulty, health, lastHitTs;

  // Soundtrack
  let audio, audioEnabled = true, audioStarted = false;
  function initAudio() {
    if (audioStarted) return;
    audio = new Audio('/audio/loop.mp3'); // add this file, see notes below
    audio.loop = true;
    audio.volume = 0.35;
    // Play on first user gesture; browsers block autoplay without gesture
    audio.play().catch(() => {/* user may have sound off; ignore */});
    audioStarted = true;
  }
  btnSound.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    if (!audio) return;
    if (audioEnabled) { audio.play().catch(()=>{}); btnSound.textContent = '🔊'; }
    else { audio.pause(); btnSound.textContent = '🔈'; }
  });

  function reset() {
    config = DIFF[difficulty];
    score = 0; pipes = []; lastSpawn = 0; lastTs = undefined;
    health = MAX_HEALTH; lastHitTs = -1e9;
    bird = { x: 160, y: canvas.height/2, vy: 0, r: 16 };
  }

  function spawnPipe() {
    const gap = config.pipeGap;
    const minTop = 60;
    const maxTop = canvas.height - gap - 120;
    const baseTop = Math.floor(minTop + Math.random() * (maxTop - minTop));
    // For HARD, include oscillation parameters
    const oscAmp = difficulty === 'hard' ? (config.oscAmp ?? 28) : 0;
    const oscSpeed = difficulty === 'hard' ? (config.oscSpeed ?? 1.0) : 0;
    const phase = Math.random() * Math.PI * 2;
    pipes.push({
      x: canvas.width + 20,
      baseTop,
      gap,
      passed: false,
      oscAmp, oscSpeed, phase
    });
  }

  function flap() { bird.vy = config.flap; }

  function update(dt) {
    const dtSec = Math.min(dt, 50) / 1000; // clamp for hitches

    // Physics
    bird.vy += config.gravity * dtSec;
    bird.y  += bird.vy * dtSec;

    // Spawn
    lastSpawn += dt;
    if (lastSpawn >= config.spawnMs) { spawnPipe(); lastSpawn = 0; }

    // Move pipes (x) and compute y oscillation for hard
    for (const p of pipes) {
      p.x -= config.pipeSpeed * dtSec;
    }
    pipes = pipes.filter(p => p.x > -80);

    // Collisions + scoring
    const now = performance.now();
    const invulnerable = (now - lastHitTs) < INVULN_MS;

    const bx = bird.x, by = bird.y, br = bird.r;
    const groundY = canvas.height - 20;

    // World bounds (treat as a hit, not instant death)
    if ((by + br >= groundY || by - br <= 0) && !invulnerable) {
      registerHit();
    }
    // Prevent sinking below ground
    if (by + br >= groundY) {
      bird.y = groundY - br;
      bird.vy = Math.min(bird.vy, 0);
    }
    if (by - br <= 0) {
      bird.y = br;
      bird.vy = Math.max(bird.vy, 0);
    }

    for (const p of pipes) {
      const pipeW = 60;

      // Oscillation for HARD
      const offset = p.oscAmp ? Math.sin(p.phase + now/1000 * p.oscSpeed) * p.oscAmp : 0;
      const top = p.baseTop + offset;
      const gapY = top, gapH = p.gap;

      const inPipeX = bx + br > p.x && bx - br < p.x + pipeW;
      const inGapY = by - br > gapY && by + br < gapY + gapH;

      if (inPipeX && !inGapY && !invulnerable) {
        registerHit();
        // Small knockback for feedback
        bird.vy = Math.min(bird.vy, -120);
      }

      if (!p.passed && p.x + pipeW < bx - br) {
        p.passed = true; score += 1;
      }
    }
  }

  function registerHit() {
    health -= 1;
    lastHitTs = performance.now();
    if (health <= 0) return gameOver();
  }

  function draw() {
    // Sky
    const sky = ctx.createLinearGradient(0,0,0,canvas.height);
    sky.addColorStop(0,'#8fd3ff'); sky.addColorStop(1,'#56a8e6');
    ctx.fillStyle = sky; ctx.fillRect(0,0,canvas.width,canvas.height);

    // Ground
    ctx.fillStyle = '#2a8f3b';
    ctx.fillRect(0, canvas.height-20, canvas.width, 20);

    // Pipes
    for (const p of pipes) {
      const pipeW = 60;
      const now = performance.now();
      const offset = p.oscAmp ? Math.sin(p.phase + now/1000 * p.oscSpeed) * p.oscAmp : 0;
      const gapY = p.baseTop + offset;
      const gapH = p.gap;

      ctx.fillStyle = '#2ecc71';
      // Upper
      ctx.fillRect(p.x, 0, pipeW, gapY);
      // Lower
      ctx.fillRect(p.x, gapY + gapH, pipeW, canvas.height - (gapY + gapH) - 20);
      // Caps
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(p.x-3, gapY-12, pipeW+6, 12);
      ctx.fillRect(p.x-3, gapY+gapH, pipeW+6, 12);
    }

    // Bird (blink when invulnerable)
    const blink = (performance.now() - lastHitTs) < INVULN_MS && Math.floor(performance.now()/100)%2===0;
    if (!blink) {
      ctx.beginPath(); ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI*2);
      ctx.fillStyle = '#ffd166'; ctx.fill();
      ctx.strokeStyle = '#e09e3e'; ctx.lineWidth = 3; ctx.stroke();
    }

    // Score
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(14,12,110,40);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(String(score).padStart(2,'0'), 24, 41);

    // Health bar (top-right)
    const pad = 14;
    const barW = 180, barH = 16;
    const x = canvas.width - barW - pad, y = 18;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x-6, y-6, barW+12, barH+12);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = '#2ecc71';
    const ratio = Math.max(0, health) / MAX_HEALTH;
    ctx.fillRect(x, y, Math.floor(barW * ratio), barH);
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, barW, barH);

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(`HP ${health}/${MAX_HEALTH}`, x, y + barH + 14);
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
    showOverlay('Game Over', `Score: ${score}`);
    submitBox.classList.remove('hidden');
    nameInput.focus();
  }

  function showOverlay(title, text) {
    overlayTitle.textContent = title; overlayText.textContent = text;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  // Controls
  function handleFlap() { if (state === 'running') flap(); }
  canvas.addEventListener('mousedown', (e)=>{ if (state==='awaiting') { state='running'; initAudio(); } handleFlap(e); });
  canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); if (state==='awaiting') { state='running'; initAudio(); } handleFlap(); }, { passive:false });
  window.addEventListener('keydown', (e)=>{ if (e.code === 'Space') { e.preventDefault(); if (state==='awaiting') { state='running'; initAudio(); } handleFlap(); }});

  btnStart.addEventListener('click', () => {
    difficulty = diffSel.value;
    reset();
    state = 'awaiting'; // wait for first flap so it doesn't insta-drop
    hideOverlay(); submitBox.classList.add('hidden');
    requestAnimationFrame(loop);
  });

  btnClose.addEventListener('click', () => { hideOverlay(); submitBox.classList.add('hidden'); });

  btnSubmit.addEventListener('click', async () => {
    const raw = (nameInput.value || '').trim();
    const name = raw.replace(/[^\w\s\-_.]/g,'').slice(0,20) || 'Player';
    try {
      await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score, difficulty })
      });
      await loadLeaderboard();
      overlayText.textContent = `Saved! Score: ${score}`;
      submitBox.classList.add('hidden');
    } catch (e) {
      overlayText.textContent = 'Error saving score.';
    }
  });

  async function loadLeaderboard() {
    const d = lbDiffSel.value;
    const res = await fetch(`/api/leaderboard?limit=10${d && d!=='all' ? `&difficulty=${d}` : ''}`);
    const data = await res.json();
    lbList.innerHTML = '';
    data.forEach((row, i) => {
      const li = document.createElement('li');
      const rank = String(i+1).padStart(2,'0');
      li.innerHTML = `<span>#${rank} <strong>${escapeHtml(row.name)}</strong> <em>(${row.difficulty})</em></span><span>${row.score}</span>`;
      lbList.appendChild(li);
    });
  }
  refreshLB.addEventListener('click', loadLeaderboard);
  lbDiffSel.addEventListener('change', loadLeaderboard);

  function escapeHtml(s){ return s.replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  // Init
  showOverlay('Flappy Arcade', 'Press Start, then Space/Click/Tap to flap!');
  loadLeaderboard();
})();
