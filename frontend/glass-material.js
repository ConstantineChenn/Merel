// A local light reflection. No animation loop, tilt, canvas, or input interception.
const surfaces = '.header-actions,.chat-heading,.composer,.character-hint,.radial-item,.conversation-tools-toggle';
const pointer = matchMedia('(hover:hover) and (pointer:fine)');
const reduced = matchMedia('(prefers-reduced-motion:reduce)');
const contrast = matchMedia('(prefers-contrast:more), (prefers-reduced-transparency:reduce)');
let current = null;
let frame = 0;
let point = null;

function clear() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  if (current) {
    current.style.removeProperty('--glass-hover');
    current.style.removeProperty('--glass-x');
    current.style.removeProperty('--glass-y');
  }
  current = null;
}

document.addEventListener('pointermove', event => {
  if (!pointer.matches || reduced.matches || contrast.matches || event.pointerType !== 'mouse') return;
  const surface = event.target instanceof Element ? event.target.closest(surfaces) : null;
  if (surface !== current) {
    clear();
    current = surface;
  }
  if (!current) return;
  point = [event.clientX, event.clientY];
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!current?.isConnected) return clear();
    const rect = current.getBoundingClientRect();
    if (!rect.width || !rect.height) return clear();
    const x = Math.max(0,Math.min(100,(point[0]-rect.left)/rect.width*100));
    const y = Math.max(0,Math.min(100,(point[1]-rect.top)/rect.height*100));
    current.style.setProperty('--glass-x',x.toFixed(1)+'%');
    current.style.setProperty('--glass-y',y.toFixed(1)+'%');
    current.style.setProperty('--glass-hover','1');
  });
}, {passive:true});

document.addEventListener('pointerout', event => {
  if (current && (!(event.relatedTarget instanceof Node) || !current.contains(event.relatedTarget))) clear();
}, {passive:true});
window.addEventListener('blur',clear);
for (const media of [pointer,reduced,contrast]) media.addEventListener('change',clear);
