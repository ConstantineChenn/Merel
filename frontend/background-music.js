import { whenInitialPortraitsReady } from './progressive-images.js?v=20261128-portraits1';
// One player survives view changes; music never blocks the conversation UI.
let player;

export function initBackgroundMusic() {
  if (player) return player;
  const audio = document.createElement('audio');
  player = audio;
  audio.id = 'background-music';
  audio.hidden = true;
  audio.controls = false;
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = 0.3;
  audio.setAttribute('aria-hidden', 'true');
  let ready = false;
  audio.dataset.state = 'waiting-for-portraits';
  document.body.append(audio);

  function start(event) {
    if (!ready) return;
    if (event?.type === 'keydown' && (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Escape')) return;
    if (!audio.paused) return;
    if (audio.error) audio.load();
    // Invoke play synchronously inside the gesture handler for mobile Safari.
    audio.play().catch(error => {
      audio.dataset.state = error.name === 'NotAllowedError' ? 'waiting-for-gesture' : 'retry-on-interaction';
    });
  }

  function listen(enabled) {
    const method = enabled ? 'addEventListener' : 'removeEventListener';
    for (const event of ['click', 'touchend', 'keydown']) {
      document[method](event, start, { capture: true, passive: true });
    }
  }

  audio.addEventListener('playing', () => {
    audio.dataset.state = 'playing';
    listen(false);
  });
  audio.addEventListener('error', () => {
    audio.dataset.state = 'retry-on-interaction';
    listen(true);
  });
  window.addEventListener('online', () => {
    if (audio.error) start();
  });
  listen(true);
  // Give the cover and initial click-through portrait bandwidth before music.
  whenInitialPortraitsReady().then(() => {
    audio.src = '/assets/audio/city-blue.aac-160.m4a';
    ready = true;
    start();
  });
  return audio;
}
