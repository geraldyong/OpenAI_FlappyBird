// assets.js — sprite loading for specials

import { DIAMOND_VALUES } from './config.js';

export const IMAGE_BASES = ['images','/images'];

export const SPECIAL_TYPES = {
  heart:   { file:'heart.png',         frames:6, fps:10 },
  diamondB:{ file:'diamond_blue.png',  frames:6, fps:12, score: DIAMOND_VALUES.blue },
  diamondG:{ file:'diamond_green.png', frames:6, fps:12, score: DIAMOND_VALUES.green },
  diamondR:{ file:'diamond_red.png',   frames:6, fps:12, score: DIAMOND_VALUES.red },
  angel:   { file:'angel.png',         frames:8, fps:8,  durMs:6000 },
  disc:    { file:'disc.png',          frames:8, fps:16, durMs:5000 },
  tortoise:{ file:'tortoise.png',      frames:8, fps:12, durMs:5000 },
};

export const sprites = {}; // filled by loadAllSprites()

function tryLoad(srcs, onload, onerror) {
  if (!srcs.length) { onerror(); return; }
  const src = srcs[0];
  const img = new Image();
  img.onload = () => onload(img, src);
  img.onerror = () => tryLoad(srcs.slice(1), onload, onerror);
  img.src = src;
}

function loadSprite(key, file, frames) {
  const candidates = IMAGE_BASES.map(b => `${b}/${file}`);
  return new Promise(resolve => {
    tryLoad(
      candidates,
      img => { sprites[key] = { img, w: img.width/frames, h: img.height, frames, ok:true }; resolve(); },
      ()  => { sprites[key] = { img:null, w:0, h:0, frames, ok:false }; resolve(); }
    );
  });
}

export async function loadAllSprites() {
  await Promise.all(Object.entries(SPECIAL_TYPES).map(([k,s]) => loadSprite(k, s.file, s.frames)));
}
