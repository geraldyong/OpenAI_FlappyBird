(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
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

  // Pipe + physics settings per difficulty
  const DIFF = {
    easy:   { gravity: 1200, flap: -380, pipeGap: 190, pipeSpeed: 160, spawnMs: 1400 },
    normal: { gravity: 1500, flap: -420, pipeGap: 160, pipeSpeed: 200, spawnMs: 1200 },
    hard:   { gravity: 1800, flap: -460, pipeGap: 135, pipeSpeed: 240, spawnMs: 1000 },
  };

  let state = 'idle'; // idle | running | gameover
  let score = 0;
  let pipes = [];
  let lastSpawn = 0;
  let bird, config, lastTs;
  let difficulty = diffSel.value;

  function reset() {
    config = DIFF[difficulty];
    score = 0; pipes = []; lastSpawn = 0; lastTs = undefined;
    bird = {
      x: 120,
      y: canvas.height/2,
      vy: 0,
      r: 16,
    };
  }

  function spawnPipe() {
    const gap = config.pipeGap;
    const minTop = 60;
    const maxTop = canvas.height - gap - 120;
    const top = Math.floor(minTop + Math.random() * (maxTop - minTop));
    pipes.push({ x: canvas.width + 20, top, gap, passed: false });
  }

  function flap() { bird.vy = config.flap; }

  function update(dt) {
    const dtSec = Math.min(dt, 50) / 1000; // clamp large hitches

    // Physics
    bird.vy += config.gravity * dtSec;
    bird.y  += bird.vy * dtSec;

    // Spawn
    lastSpawn += dt;
    if (lastSpawn >= config.spawnMs) { spawnPipe(); lastSpawn = 0; }

    // Move pipes
    for (const p of pipes) p.x -= config.pipeSpeed * dtSec;
    pipes = pipes.filter(p => p.x > -80);

    // Collisions + scoring (unchanged)
    const bx = bird.x, by = bird.y, br = bird.r;
    if (by + br >= canvas.height - 20 || by - br <= 0) return gameOver();

    for (const p of pipes) {
        const pipeW = 60;
        const inPipeX = bx + br > p.x && bx - br < p.x + pipeW;
        const inGapY = by - br > p.top && by + br < p.top + p.gap;
        if (inPipeX && !inGapY) return gameOver();
        if (!p.passed && p.x + pipeW < bx - br) { p.passed = true; score += 1; }
    }
  }


  function draw() {
    // Sky
    const sky = ctx.createLinearGradient(0,0,0,canvas.height);
    sky.addColorStop(0,'#8fd3ff'); sky.addColorStop(1,'#56a8e6');
    ctx.fillStyle = sky; ctx.fillRect(0,0,canvas.width,canvas.height);

    // Ground
    ctx.fillStyle = '#2a8f3b';
    ctx.fillRect(0, canvas.height-20, canvas.width, 20);

    // Bird
    ctx.beginPath(); ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI*2);
    ctx.fillStyle = '#ffd166'; ctx.fill();
    ctx.strokeStyle = '#e09e3e'; ctx.lineWidth = 3; ctx.stroke();

    // Pipes
    for (const p of pipes) {
      const pipeW = 60; const gapY = p.top; const gapH = p.gap;
      ctx.fillStyle = '#2ecc71';
      // Upper pipe
      ctx.fillRect(p.x, 0, pipeW, gapY);
      // Lower pipe
      ctx.fillRect(p.x, gapY + gapH, pipeW, canvas.height - (gapY + gapH) - 20);
      // Caps
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(p.x-3, gapY-12, pipeW+6, 12);
      ctx.fillRect(p.x-3, gapY+gapH, pipeW+6, 12);
    }

    // Score
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(14,12,96,40);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(String(score).padStart(2,'0'), 24, 41);
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
  function handleFlap(e) {
    if (state === 'running') flap();
  }
  canvas.addEventListener('mousedown', (e)=>{ if (state==='awaiting') state='running'; handleFlap(e); });
  canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); if (state==='awaiting') state='running'; handleFlap(); }, { passive:false });
  window.addEventListener('keydown', (e)=>{ if (e.code === 'Space') { e.preventDefault(); if (state==='awaiting') state='running'; handleFlap(); }});

  btnStart.addEventListener('click', () => {
    difficulty = diffSel.value;
    reset();
    state = 'awaiting';
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

  function escapeHtml(s){ return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  // Init
  showOverlay('Flappy Arcade', 'Press Start, then Space/Click/Tap to flap!');
  loadLeaderboard();
})();