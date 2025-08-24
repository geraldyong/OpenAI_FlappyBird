// main.js — entrypoint: init, loop, wiring

import { state } from './state.js';
import { DIFF, currentLevelGoal, applyLevelMods } from './config.js';
import { mountDomRefs, mountTopbar, resizeCanvas, wireControls, wireButtons, loadLeaderboard, initAudio, updateMusicStatus, showOverlay, resetGame, gameOver } from './ui.js';
import { updateGame, burstParticles } from './update.js';
import { drawScene } from './render.js';

function flap() { state.bird.vy = state.config.flap; }

function startLoopOnce() {
  if (state._loopStarted) return;
  state._loopStarted = true;
  requestAnimationFrame(loop);
}

function loop(ts) {
  try {
    if (state.run.lastTs === undefined) state.run.lastTs = ts;
    const dt = ts - state.run.lastTs; state.run.lastTs = ts;

    // compute current goal for HUD
    state.goal = currentLevelGoal(state.levelIndex);

    if (state.run.mode === 'running') {
      updateGame(state, dt);

      if (state._gameOverRequested) {
        state._gameOverRequested = false;
        gameOver();
      }
      if (state._nextLevelRequested) {
        state._nextLevelRequested = false;
        doNextLevel();
      }
    }
    drawScene(state);
  } catch (e) {
    console.error('Frame error:', e);
  }
  requestAnimationFrame(loop);
}

function doNextLevel() {
  if (state.run.mode === 'levelup') return;
  state.run.mode = 'levelup';

  const justCleared = state.levelIndex + 1;
  const bonus = 10 + state.pipesPassedThisLevel * 1.5 + state.levelIndex * 5;
  state.score += bonus;

  if (state.difficulty === 'hard') state.health = Math.min(5, state.health + 2);
  else state.health = 5;

  showOverlay(`Level ${justCleared} Clear!`, `Bonus +${Math.floor(bonus)}`, { showSubmit: false });

  setTimeout(() => {
    state.levelIndex += 1;
    state.config = applyLevelMods(DIFF[state.difficulty], state.levelIndex);
    state.bird.r = state.config.birdR || state.bird.r;
    state.levelStartTime = performance.now();
    state.pipesPassedThisLevel = 0; state.combo = 0;

    showOverlay(`Level ${state.levelIndex+1} Start!`, 'Good luck!', { showSubmit: false });
    setTimeout(() => { state.dom.overlay.classList.add('hidden'); state.run.mode = 'running'; }, 900);
  }, 900);
}

function mountInitUi() {
  state.dom.overlayTitle.textContent = 'Flappy Arcade';
  state.dom.overlayText.textContent  = 'Press Start, then Space/Click/Tap to flap!';
}

function main() {
  mountDomRefs();
  resizeCanvas();
  mountTopbar();
  wireControls(() => { if (state.run.mode==='running') flap(); });
  wireButtons(loadLeaderboard);
  mountInitUi();
  loadLeaderboard();
  // seed a visible scene pre-start
  if (!state.bird) {
    state.config = applyLevelMods(DIFF[state.difficulty], state.levelIndex);
    state.bird = { x: Math.max(140, Math.floor((state.dom.canvas?.width||900) * 0.22)), y: (state.dom.canvas?.height||540)/2, vy:0, r: 16 };
  }
  startLoopOnce();

  window.addEventListener('resize', resizeCanvas);
}

document.addEventListener('DOMContentLoaded', main);
