import { whenInitialPortraitsReady } from './progressive-images.js?v=20261128-portraits1';
const tracks = [1, 2, 3, 4].map(index => `/assets/audio/pathetique-0${index}-180s.aac-64.m4a`);
// One player survives view changes; failures never block the conversation UI.
let player;

export function initBackgroundMusic() {
  if (player) return player;
  const audio = document.createElement('audio');
  player = audio;
  audio.id = 'background-music';
  audio.hidden = true;
  audio.controls = false;
  audio.preload = 'auto';
  audio.volume = 0.6;
  audio.setAttribute('aria-hidden', 'true');
  let ready = false;
  let index = 0;
  let selection = 0;
  let prefetchStarted = false;
  const sources = new Map();
  const jobs = new Map();
  audio.dataset.state = 'waiting-for-portraits';
  audio.dataset.playlistLength = String(tracks.length);
  document.body.append(audio);

  function start(event) {
    if (!ready) return;
    if (event?.type === 'keydown' && (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Escape')) return;
    if (!audio.paused) return;
    if (audio.error) {
      audio.src = tracks[index];
      audio.load();
    }
    // Invoke play synchronously inside the gesture handler for mobile Safari.
    audio.play().catch(error => {
      audio.dataset.state = error.name === 'NotAllowedError' ? 'waiting-for-gesture' : 'retry-on-interaction';
      listen(true);
    });
  }

  function listen(enabled) {
    const method = enabled ? 'addEventListener' : 'removeEventListener';
    for (const event of ['click', 'touchend', 'keydown']) {
      document[method](event, start, { capture: true, passive: true });
    }
  }

  function download(track) {
    if (jobs.has(track)) return jobs.get(track);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const job = fetch(tracks[track], { priority: 'low', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Audio HTTP ' + response.status);
        return response.blob();
      }).then(blob => {
        const url = URL.createObjectURL(blob);
        sources.set(track, url);
        return url;
      }).catch(() => null).finally(() => clearTimeout(timer));
    jobs.set(track, job);
    return job;
  }

  async function prefetchRemaining() {
    if (prefetchStarted) return;
    prefetchStarted = true;
    // Wait for new portraits too; download remaining excerpts one at a time.
    for (let track = 1; track < tracks.length; track++) {
      await whenInitialPortraitsReady();
      await download(track);
    }
  }

  async function selectTrack(track) {
    const current = ++selection;
    index = track;
    ready = false;
    audio.dataset.state = 'buffering';
    // Reuse in-flight prefetches instead of downloading the same excerpt twice.
    if (jobs.has(track)) await jobs.get(track);
    if (current !== selection) return;
    audio.dataset.trackIndex = String(track);
    audio.dataset.trackSource = tracks[track];
    audio.src = sources.get(track) || tracks[track];
    ready = true;
    start();
  }

  audio.addEventListener('playing', () => {
    audio.dataset.state = 'playing';
    listen(false);
    void prefetchRemaining();
  });
  audio.addEventListener('ended', () => { void selectTrack((index + 1) % tracks.length); });
  audio.addEventListener('error', () => {
    audio.dataset.state = 'retry-on-interaction';
    listen(true);
  });
  window.addEventListener('online', () => {
    if (audio.error) start();
  });
  listen(true);
  // Cover -> current click-through portraits -> first excerpt -> remaining excerpts.
  whenInitialPortraitsReady().then(() => { void selectTrack(0); });
  return audio;
}
