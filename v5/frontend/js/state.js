// state.js — central game state

import { DIFF, MAX_HEALTH } from './config.js';

export const state = {
  // DOM refs assigned by ui.js
  dom: {
    canvas: null, ctx: null,
    overlay:null, overlayTitle:null, overlayText:null,
    submitBox:null, nameInput:null, btnSubmit:null, btnClose:null,
    btnStart:null, btnSound:null, diffSel:null,
    lbDiffSel:null, lbList:null, refreshLB:null,
    musicLabel:null
  },

  // Audio
  audio: { el:null, enabled:true, started:false },

  // Game state
  run: { mode: 'idle', lastTs: undefined }, // idle | awaiting | running | levelup | gameover
  difficulty: 'normal',
  config: { ...DIFF.normal },

  score: 0,
  combo: 0,

  pipes: [],
  lastSpawn: 0,

  health: MAX_HEALTH,
  lastHitTs: -1e9,

  bird: null,

  levelIndex: 0,
  levelStartTime: 0,
  pipesPassedThisLevel: 0,

  // Background actors
  backClouds: [], midHills: [],
  groundScroll: 0,
  skyBirds: [], skyBirdTimer: 0,
  waterPhase: 0,
  boats: [], islands: [], boatTimer: 0, islandTimer: 0,
  volcanoes: [], volcanoSmoke: [], volcanoLava: [], volcanoTimer: 0,

  // FX
  particles: [],

  // Specials
  specials: [],
  immunityUntil: 0, autopilotUntil: 0, slowmoUntil: 0,

  // sizing cache
  resizedOnce: false,
};
