import { imageCatalog } from './image-catalog.js?v=20261128-demo2';

const requests = new WeakMap();
const downloads = new Map();
const fullJobs = new Map();
const queue = [];
let active = 0;
let sequence = 0;
let coverPending = false;
let coverKey;
let selectedPortrait;
let portraitKeys = new Set();
const portraitWaiters = new Set();

function portraitsPending() {
  return coverPending || [...fullJobs.values()].some(job => job.state !== 'complete' && rank(job) < 10);
}

function decodeImage(url, priority) {
  if (!downloads.has(url)) {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    const full = url.endsWith('.full.webp');
    const controller = new AbortController();
    let objectUrl;
    const work = (async () => {
      if (full) {
        const response = await fetch(url, { priority, signal: controller.signal });
        if (!response.ok) throw new Error('Image HTTP ' + response.status);
        const blob = await response.blob();
        if (controller.signal.aborted) throw new Error('Image request aborted');
        objectUrl = URL.createObjectURL(blob);
      }
      image.src = objectUrl || url;
      await image.decode();
      return objectUrl || url;
    })();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        image.src = '';
        reject(new Error('Image download timed out'));
      }, 120000);
    });
    const ready = Promise.race([work, timeout]).catch(error => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      downloads.delete(url);
      throw error;
    }).finally(() => clearTimeout(timer));
    downloads.set(url, ready);
  }
  return downloads.get(url);
}

function rank(job) {
  if (coverPending && job.key === coverKey) return 0;
  if (job.key === selectedPortrait) return 1;
  if (portraitKeys.has(job.key)) return 2;
  return 10;
}

function fullImage(key, needed) {
  let job = fullJobs.get(key);
  if (!job) {
    let resolve;
    const promise = new Promise(r => resolve = r);
    job = { key, order: sequence++, needed: [], state: 'queued', promise, resolve };
    fullJobs.set(key, job);
    queue.push(job);
  }
  if (needed && job.state !== 'complete') job.needed.push(needed);
  return job;
}

function runQueue() {
  queue.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  while (active < 2 && queue.length) {
    const job = queue[0];
    // Let the cover finish before any other high-resolution asset starts.
    if (coverPending && job.key !== coverKey) break;
    if (rank(job) === 10 && [...fullJobs.values()].some(other => other.state === 'loading' && other.portraitPriority)) break;
    queue.shift();
    if (!portraitKeys.has(job.key) && !(coverPending && job.key === coverKey) && !job.needed.some(needed => needed())) {
      fullJobs.delete(job.key);
      job.resolve(null);
      continue;
    }
    job.state = 'loading';
    job.portraitPriority = rank(job) < 10;
    active++;
    decodeImage(imageCatalog[job.key].full, rank(job) < 10 ? 'high' : 'low').then(url => {
      job.state = 'complete';
      job.url = url;
      job.needed = [];
      job.resolve(url);
    }).catch(() => {
      fullJobs.delete(job.key);
      job.resolve(null);
    }).finally(() => {
      if (job.key === coverKey) coverPending = false;
      active--;
      runQueue();
    });
  }
  if (!portraitsPending()) {
    for (const resolve of portraitWaiters) resolve();
    portraitWaiters.clear();
  }
}

// Warm only expressions reachable in the current click-through context.
export function preparePortraits(expressions, { cover = false } = {}) {
  portraitKeys = new Set(expressions.map(name => 'expressions/' + name));
  if (cover && !coverKey) {
    coverKey = 'expressions/neutral';
    portraitKeys.add(coverKey);
    coverPending = true;
  }
  for (const key of portraitKeys) fullImage(key);
  runQueue();
}

export function whenInitialPortraitsReady() {
  if (!portraitsPending()) return Promise.resolve();
  return new Promise(resolve => portraitWaiters.add(resolve));
}

function applyFull(image, request, url) {
  if (!url || requests.get(image) !== request) return;
  image.src = url;
  image.dataset.quality = 'full';
  image.dataset.displayAsset = request.key;
  image.dataset.fullSource = request.asset.full;
  image.alt = request.alt;
  delete image.dataset.pendingAsset;
  request.complete = true;
  observer.unobserve(image);
}

function upgrade(image, request) {
  if (request.loading || request.complete) return;
  request.loading = true;
  const job = fullImage(request.key, () => requests.get(image) === request && image.isConnected && !!image.getClientRects().length);
  job.promise.then(url => applyFull(image, request, url)).finally(() => { request.loading = false; });
  runQueue();
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const image = entry.target;
    const request = requests.get(image);
    if (!image.isConnected) observer.unobserve(image);
    else if (entry.isIntersecting && request) upgrade(image, request);
  }
}, { rootMargin: '0px' });

export function setProgressiveImage(image, key = image.dataset.asset, priority = 'auto') {
  const asset = imageCatalog[key];
  if (!asset) throw new Error('Unknown Merel image: ' + key);
  if (priority === 'high' && key.startsWith('expressions/')) selectedPortrait = key;
  if (requests.get(image)?.key === key) { runQueue(); return; }
  observer.unobserve(image);
  const keepFull = image.dataset.quality === 'full' || image.dataset.quality === 'retained-full';
  const request = { key, asset, loading: false, alt: image.dataset.requestedAlt || image.alt };
  requests.set(image, request);
  image.dataset.asset = key;
  image.decoding = 'async';
  const cached = fullJobs.get(key);
  if (cached?.state === 'complete') {
    applyFull(image, request, cached.url);
    return;
  }
  if (keepFull) {
    image.dataset.quality = 'retained-full';
    image.dataset.pendingAsset = key;
    // Never replace a clear portrait with a preview during expression changes.
    observer.observe(image);
    upgrade(image, request);
    return;
  }
  decodeImage(asset.preview, priority).then(url => {
    if (requests.get(image) !== request) return;
    image.src = url;
    image.dataset.quality = 'preview';
    image.dataset.displayAsset = key;
    image.alt = request.alt;
  }).catch(() => {
    // Full images can still load when a preview is unavailable.
  }).finally(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (requests.get(image) === request && image.isConnected) observer.observe(image);
    }));
  });
}

export function progressiveImage(key, attributes = {}, { deferred = false, priority = 'auto' } = {}) {
  const asset = imageCatalog[key];
  const image = document.createElement('img');
  image.width = asset.width;
  image.height = asset.height;
  image.alt = '';
  image.dataset.asset = key;
  for (const [name, value] of Object.entries(attributes)) image.setAttribute(name, value);
  if (!deferred) setProgressiveImage(image, key, priority);
  return image;
}
