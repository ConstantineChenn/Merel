import { imageCatalog } from './image-catalog.js?v=20261128-demo2';

const requests = new WeakMap();
const downloads = new Map();
const queue = [];
let active = 0;

function decodeImage(url, priority) {
  if (!downloads.has(url)) {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    image.src = url;
    const ready = image.decode().then(() => url).catch(error => {
      downloads.delete(url);
      throw error;
    });
    downloads.set(url, ready);
  }
  return downloads.get(url);
}

function runQueue() {
  while (active < 2 && queue.length) {
    const { image, request } = queue.shift();
    request.queued = false;
    if (requests.get(image) !== request || !image.isConnected || !image.getClientRects().length) continue;
    request.loading = true;
    active++;
    decodeImage(request.asset.full, 'low').then(url => {
      if (requests.get(image) !== request) return;
      image.src = url;
      image.dataset.quality = 'full';
      request.complete = true;
      observer.unobserve(image);
    }).catch(() => {
      // Keep the already painted preview when the full-size download fails.
    }).finally(() => {
      active--;
      request.loading = false;
      runQueue();
    });
  }
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const image = entry.target;
    const request = requests.get(image);
    if (!image.isConnected) {
      observer.unobserve(image);
      continue;
    }
    if (!entry.isIntersecting || !request || request.queued || request.loading || request.complete) continue;
    request.queued = true;
    queue.push({ image, request });
  }
  runQueue();
}, { rootMargin: '0px' });

export function setProgressiveImage(image, key = image.dataset.asset, priority = 'auto') {
  const asset = imageCatalog[key];
  if (!asset) throw new Error('Unknown Merel image: ' + key);
  if (requests.get(image)?.key === key) return;
  observer.unobserve(image);
  const request = { key, asset, queued: false };
  requests.set(image, request);
  image.dataset.asset = key;
  image.decoding = 'async';
  decodeImage(asset.preview, priority).then(url => {
    if (requests.get(image) !== request) return;
    image.src = url;
    image.dataset.quality = 'preview';
  }).catch(() => {
    // The full image can still be displayed if its preview is unavailable.
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
