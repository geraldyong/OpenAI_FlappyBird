// ui.js — DOM wiring, audio, overlay & leaderboard, reset/start/level/gameover

import { state } from './state.js';
import { DIFF, MAX_HEALTH, applyLevelMods, currentLevelGoal } from './config.js';
import { loadAllSprites } from './assets.js';
import { spawnInitialBackground } from './update.js';
import { escapeHtml } from './utils.js';

export function mountDomRefs() {
  const q = id => document.getElementById(id);
  state.dom.canvas = q('game');
  state.dom.ctx = state.dom.canvas.getContext('2d');

  state.dom.overlay = q('overlay');
  state.dom.overlayTitle = q('overlayTitle');
  state.dom.overlayText = q('overlayText');
  state.dom.submitBox = q('submitScore');
  state.dom.nameInput = q('playerName');
  state.dom.btnSubmit = q('btnSubmit');
  state.dom.btnClose  = q('btnClose');
  state.dom.btnStart  = q('btnStart');
  state.dom.btnSound  = q('btnSound');
  state.dom.diffSel   = q('difficulty');
  state.dom.lbDiffSel = q('lbDifficulty');
  state.dom.lbList    = q('leaderboard');
  state.dom.refreshLB = q('refreshLB');
}

export function mountTopbar() {
  const host = state.dom.diffSel?.parentElement || state.dom.diffSel;
  if (!host) return;
  host.classList.add('topbar-inline');
  if (state.dom.btnSound) {
    state.dom.btnSound.classList.add('inline-sound');
    host.appendChild(state.dom.btnSound);
  }
  if (!state.dom.musicLabel) {
    const span = document.createElement('span');
    span.id = 'musicStatus';
    span.className = 'music-status';
    span.textContent = 'Music: On';
    host.appendChild(span);
    state.dom.musicLabel = span;
  }
}

export function resizeCanvas() {
  const c = state.dom.canvas;
  const parent = c.parentElement;
  const parentW = parent ? parent.clientWidth : window.innerWidth;
  const desiredW = Math.max(800, Math.min(1180, Math.floor(parentW * 0.72)));
  const aspect = 16/9;
  const desiredH = Math.max(450, Math.min(720, Math.floor(desiredW / aspect)));
  c.width = desiredW; c.height = desiredH;
  if (state.bird) state.bird.x = Math.max(140, Math.floor(c.width * 0.22));
  state.resizedOnce = true;
}

export function initAudio() {
  if (state.audio.started) return;
  state.audio.el = new Audio('/audio/loop.mp3');
  state.audio.el.loop = true; state.audio.el.volume = 0.35;
  state.audio.el.play().catch(()=>{});
  state.audio.started = true;
  updateMusicStatus();
}

export function updateMusicStatus() {
  if (state.dom.musicLabel)
    state.dom.musicLabel.textContent = `Music: ${state.audio.enabled ? 'On' : 'Off'}`;
}

export function wireControls(onFlap) {
  state.dom.canvas.addEventListener('mousedown', () => {
    if (state.run.mode === 'awaiting') { state.run.mode = 'running'; initAudio(); }
    if (state.run.mode === 'running') onFlap();
  });
  state.dom.canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state.run.mode === 'awaiting') { state.run.mode = 'running'; initAudio(); }
    if (state.run.mode === 'running') onFlap();
  }, { passive:false });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.run.mode === 'awaiting') { state.run.mode = 'running'; initAudio(); }
      if (state.run.mode === 'running') onFlap();
    }
  });

  if (state.dom.btnSound) {
    state.dom.btnSound.addEventListener('click', () => {
      state.audio.enabled = !state.audio.enabled;
      if (!state.audio.el) return;
      if (state.audio.enabled) { state.audio.el.play().catch(()=>{}); state.dom.btnSound.textContent = '🔊'; }
      else { state.audio.el.pause(); state.dom.btnSound.textContent = '🔈'; }
      updateMusicStatus();
    });
  }
}

export function resetGame() {
  state.difficulty = state.dom.diffSel ? state.dom.diffSel.value : 'normal';
  state.levelIndex = 0;
  state.config = applyLevelMods(DIFF[state.difficulty], state.levelIndex);
  state._gameOverRequested = false;
  state._nextLevelRequested = false;

  state.score = 0; state.combo = 0;
  state.pipes.length = 0; state.lastSpawn = 0; state.run.lastTs = undefined;

  state.health = MAX_HEALTH; state.lastHitTs = -1e9;
  state.immunityUntil = state.autopilotUntil = state.slowmoUntil = 0;

  state.specials.length = 0; state.particles.length = 0; state._specialCooldown = 0;

  resizeCanvas();
  state.bird = { x: Math.max(140, Math.floor(state.dom.canvas.width * 0.22)), y: state.dom.canvas.height/2, vy: 0, r: state.config.birdR };

  state.backClouds.length = 0; state.midHills.length = 0; state.groundScroll = 0;
  state.skyBirds.length = 0; state.skyBirdTimer = 0;
  state.boats.length = 0; state.islands.length = 0; state.boatTimer = state.islandTimer = 0; state.waterPhase = 0;
  state.volcanoes.length = 0; state.volcanoSmoke.length = 0; state.volcanoLava.length = 0; state.volcanoTimer = 0;

  spawnInitialBackground(state);

  state.levelStartTime = performance.now();
  state.pipesPassedThisLevel = 0;

  // Ensure any previous Game Over form is hidden
  state.dom.submitBox?.classList.add('hidden');
  state.dom.overlay?.classList.add('hidden');
}

export function showOverlay(title, text, opts = {}) {
  const { overlay, overlayTitle, overlayText, submitBox } = state.dom;
  overlayTitle.textContent = title;
  overlayText.textContent  = text;
  // Always start hidden, only show when explicitly requested:
  if (submitBox) submitBox.classList.add('hidden');
  overlay.classList.remove('hidden');
  if (opts.showSubmit === true && submitBox) {
    submitBox.classList.remove('hidden');
  }
}

export function prepareSubmitLayout() {
  const box = state.dom.submitBox; if (!box) return;
  box.style.display = 'grid';
  box.style.gridTemplateColumns = '1fr auto auto';
  box.style.alignItems = 'center';
  box.style.gap = '8px';
  box.style.marginTop = '8px';
}

export function gameOver() {
  state.run.mode = 'gameover';
  prepareSubmitLayout();
  showOverlay('Game Over', `Score: ${Math.floor(state.score)} — Level ${state.levelIndex+1}`, { showSubmit: true });
  state.dom.submitBox.classList.remove('hidden');
  state.dom.nameInput?.focus();
}

export async function wireButtons(loadLeaderboard) {
  state.dom.btnStart.addEventListener('click', async () => {
    await loadAllSprites();
    mountTopbar();
    resetGame();
    state.run.mode = 'awaiting';
    state.dom.overlay.classList.add('hidden');
    state.dom.submitBox.classList.add('hidden');
  });

  state.dom.btnClose.addEventListener('click', () => {
    state.dom.overlay.classList.add('hidden');
    state.dom.submitBox.classList.add('hidden');
  });

  state.dom.btnSubmit.addEventListener('click', async () => {
    const raw = (state.dom.nameInput.value || '').trim();
    const name = raw.replace(/[^\w\s\-_.]/g,'').slice(0,20) || 'Player';
    try {
      await fetch('/api/score', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, score: Math.floor(state.score), difficulty: state.difficulty }) });
      await loadLeaderboard();
      state.dom.overlayText.textContent = `Saved! Score: ${Math.floor(state.score)}`;
      state.dom.submitBox.classList.add('hidden');
    } catch {
      state.dom.overlayText.textContent = 'Error saving score.';
    }
  });

  if (state.dom.refreshLB) state.dom.refreshLB.addEventListener('click', loadLeaderboard);
  if (state.dom.lbDiffSel)  state.dom.lbDiffSel.addEventListener('change', loadLeaderboard);
}

export async function loadLeaderboard() {
  if (!state.dom.lbDiffSel || !state.dom.lbList) return;
  const d = state.dom.lbDiffSel.value;
  const res = await fetch(`/api/leaderboard?limit=10${d && d!=='all' ? `&difficulty=${d}` : ''}`);
  const data = await res.json();
  state.dom.lbList.innerHTML = '';
  data.forEach((row, i) => {
    const li = document.createElement('li'); const rank = String(i+1).padStart(2,'0');
    li.innerHTML = `<span>#${rank} <strong>${escapeHtml(row.name)}</strong> <em>(${row.difficulty})</em></span><span>${row.score}</span>`;
    state.dom.lbList.appendChild(li);
  });
}
