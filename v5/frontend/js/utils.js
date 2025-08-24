// utils.js — general helpers (fixes the missing roundedRect)

export const now = () => performance.now();

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function roundedRectPath(ctx, x,y,w,h,r=12) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
}

export function roundedRect(ctx, x,y,w,h,r=12) {
  roundedRectPath(ctx, x,y,w,h,r);
}

export function escapeHtml(s){
  return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
