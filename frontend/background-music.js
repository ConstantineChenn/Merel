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
  audio.src = '/assets/audio/city-blue.aac-160.m4a';
  audio.dataset.state = 'ready';
  document.body.append(audio);

  function start(event) {
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
  // Give the newly rendered page a chance to paint before requesting music.
  requestAnimationFrame(() => requestAnimationFrame(() => start()));
  return audio;
}
