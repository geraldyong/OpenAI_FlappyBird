// config.js — game constants & level goals

export const DIFF = {
  easy:   { gravity:1200, flap:-380, pipeGap:190, pipeSpeed:160, spawnMs:1400, pipeScore:5 },
  normal: { gravity:1500, flap:-420, pipeGap:160, pipeSpeed:200, spawnMs:1200, pipeScore:8 },
  hard:   { gravity:1800, flap:-460, pipeGap:135, pipeSpeed:240, spawnMs:1000, pipeScore:12, oscAmp:32, oscSpeed:1.2 },
};

export const MAX_HEALTH = 5;
export const INVULN_MS = 800;
export const BASE_PIPE_W = 60;

export const DIAMOND_VALUES = { blue:25, green:50, red:100 };
export const COMBO_MAX = 5;
export const COMBO_DECAY_ON_HIT = true;

export function pipesGoalForLevel(idx) { return 10 + Math.floor(idx * 4); }
export function timeGoalForLevel(idx)  { return 20 + Math.floor(idx * 8); }

export function applyLevelMods(base, levelIndex) {
  const speedMul   = 1 + Math.min(0.28, levelIndex * 0.03);
  const gravityMul = 1 + (((levelIndex % 2) === 0) ? -0.06 : 0.08) * Math.min(1, levelIndex/10);
  const spawnScale = 1 / (1 + Math.min(0.6, levelIndex * 0.08));
  return {
    ...base,
    pipeSpeed: base.pipeSpeed * speedMul,
    gravity:   Math.max(800, base.gravity * gravityMul),
    pipeWmul:  Math.max(0.72, 1 - levelIndex*0.02),
    birdR:     Math.max(12, 16 + ((levelIndex%3)-1)*2),
    spawnMsNow: Math.max(700, base.spawnMs * spawnScale),
  };
}

export function currentLevelGoal(levelIndex) {
  const isPipes = (levelIndex % 2 === 0);
  return { mode: isPipes ? 'pipes' : 'time', goal: pipesGoalForLevel(levelIndex) };
}

// Specials population & behavior parameters
export function maxSpecialsForLevel(levelIndex) { return Math.min(3 + Math.floor(levelIndex/2), 8); }
export function minSpecialsForLevel() { return 4; }
export const SPECIAL_NEAR_TRIGGER_X = 50;
