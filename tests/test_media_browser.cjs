// Run against a disposable local Merel instance. No model requests are made.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8787';
const evidence = { base, checks: [] };
const gate = () => { let release; const promise = new Promise(r => release = r); return { promise, release }; };
const launch = (policy) => chromium.launch({
  headless: true,
  ...(process.env.MEREL_CHROME ? { executablePath: process.env.MEREL_CHROME } : {}),
  args: ['--autoplay-policy=' + policy, '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies'],
});
async function music(page) {
  await page.waitForSelector('#background-music', { state: 'attached' });
  await page.waitForFunction(() => {
    const audio = document.querySelector('#background-music');
    return !audio.paused && audio.currentTime > 0 && audio.readyState >= 2;
  });
}

(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const browser = await launch('no-user-gesture-required');
  try {
    // All catalog entries must switch without another click or a page reload.
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    await page.route('**/media-fixture', route => route.fulfill({ contentType: 'text/html', body:
      '<!doctype html><style>body{display:grid;grid-template-columns:repeat(9,145px);gap:8px}img{width:140px;height:190px;object-fit:contain}</style><body></body>' }));
    await page.goto(base + '/media-fixture');
    const full = gate();
    await page.route('**/*.full.webp', async route => { await full.promise; await route.continue(); });
    await page.evaluate(async () => {
      const { progressiveImage } = await import('/assets/progressive-images.js');
      window.catalog = (await import('/assets/image-catalog.js?v=20261128-demo2')).imageCatalog;
      for (const key of Object.keys(catalog)) document.body.append(progressiveImage(key));
    });
    await page.waitForFunction(() => document.images.length === 34 && [...document.images].every(i =>
      i.dataset.quality === 'preview' && i.complete && i.naturalWidth > 0));
    await page.screenshot({ path: 'test-results/media-previews.png' });
    full.release();
    await page.waitForFunction(() => [...document.images].every(i => i.dataset.quality === 'full' &&
      i.complete && i.naturalWidth === catalog[i.dataset.asset].width &&
      i.naturalHeight === catalog[i.dataset.asset].height), null, { timeout: 90000 });
    await page.screenshot({ path: 'test-results/media-full.png' });
    evidence.checks.push('34 matching previews automatically replaced by full images at original dimensions');
    await page.close();

    const app = await browser.newPage();
    const errors = [];
    const second = gate(), third = gate();
    const musicRequests = [];
    app.on('request', r => { if (/pathetique-.*m4a/.test(r.url())) musicRequests.push(r.url()); });
    await app.route('**/pathetique-02-180s.aac-64.m4a', async route => { await second.promise; await route.continue(); });
    await app.route('**/pathetique-03-180s.aac-64.m4a', async route => { await third.promise; await route.continue(); });
    app.on('pageerror', e => errors.push(e.message));
    await app.goto(base);
    await music(app);
    const audioState = await app.locator('audio').evaluate(a => ({
      controls: a.controls, hidden: a.hidden, loop: a.loop, duration: a.duration, src: a.currentSrc,
    }));
    assert.equal(audioState.controls, false);
    assert.equal(audioState.hidden, true);
    assert.equal(audioState.loop, false); // The four-excerpt playlist, rather than one track, loops.
    assert(Math.abs(audioState.duration - 180) < .1);
    assert(audioState.src.endsWith('/pathetique-01-180s.aac-64.m4a'));
    evidence.audio = audioState;
    const range = await app.request.get(base + '/assets/audio/pathetique-01-180s.aac-64.m4a', { headers: { Range: 'bytes=0-1023' } });
    assert.equal(range.status(), 206);
    assert.equal(range.headers()['content-type'], 'audio/mp4');
    assert.equal((await range.body()).length, 1024);
    evidence.checks.push('AAC actually plays with no controls; correct duration, MIME and HTTP byte ranges');
    assert(!musicRequests.some(url => /pathetique-0[34]/.test(url)));
    const thirdRequest = app.waitForRequest('**/pathetique-03-180s.aac-64.m4a');
    second.release();
    await thirdRequest;
    assert(!musicRequests.some(url => url.includes('pathetique-04')));
    const fourthComplete = app.waitForEvent('requestfinished', { predicate: r => r.url().includes('pathetique-04') });
    third.release();
    await fourthComplete;
    assert.deepEqual(musicRequests.map(url => url.match(/pathetique-(\d+)/)[1]), ['01', '02', '03', '04']);
    evidence.checks.push('Remaining excerpts download in movement order with only one prefetch at a time');

    await app.evaluate(() => { window.originalPlayer = document.querySelector('audio'); originalPlayer.currentTime = 35; });
    await app.locator('#message-input').fill('测试草稿');
    await app.evaluate(async () => { (await import('/assets/background-music.js?v=20261128-pathetique1')).initBackgroundMusic(); });
    await app.getByRole('button', { name: '点击 Merel 更换表情并展开空间', exact: true }).click();
    await app.getByRole('button', { name: /设置 SETTINGS/ }).click();
    assert(await app.evaluate(() => document.querySelectorAll('audio').length === 1 &&
      document.querySelector('audio') === originalPlayer && originalPlayer.currentTime >= 35 && !originalPlayer.paused));
    for (const track of [1, 2, 3, 0]) {
      await app.locator('audio').evaluate(a => { a.currentTime = a.duration - .3; });
      await app.waitForFunction(track => {
        const a = document.querySelector('audio');
        return a.dataset.trackIndex === String(track) && a.currentTime > 0 && a.currentTime < 5 && !a.paused;
      }, track);
      assert(Math.abs(await app.locator('audio').evaluate(a => a.duration)-180) < .1);
    }
    assert.equal(musicRequests.filter(url => /pathetique-0[234]/.test(url)).length, 3);
    evidence.checks.push('Navigation keeps one player; all four excerpts advance and wrap to the first without re-downloading prefetched tracks');
    assert.deepEqual(errors, []);
    await app.close();

    const failed = await browser.newPage();
    const failureErrors = [];
    failed.on('pageerror', e => failureErrors.push(e.message));
    let attempts = 0;
    await failed.route('**/pathetique-01-180s.aac-64.m4a', route => { attempts++; return route.abort(); });
    await failed.goto(base);
    await failed.waitForFunction(() => !!document.querySelector('audio')?.error);
    await failed.locator('#message-input').fill('音乐失败也能输入');
    assert.equal(await failed.locator('#message-input').inputValue(), '音乐失败也能输入');
    await failed.unroute('**/pathetique-01-180s.aac-64.m4a');
    await failed.locator('#message-input').click();
    await music(failed);
    assert(attempts > 0);
    assert.deepEqual(failureErrors, []);
    evidence.checks.push('Failed music requests leave input usable; the next interaction recovers playback');
    await failed.close();

    const recover = await browser.newPage();
    const recoverErrors = [];
    recover.on('pageerror', e => recoverErrors.push(e.message));
    await recover.route('**/pathetique-02-180s.aac-64.m4a', route => route.abort());
    const failedPrefetch = recover.waitForEvent('requestfailed', { predicate: r => r.url().includes('pathetique-02') });
    await recover.goto(base);
    await music(recover);
    await failedPrefetch;
    await recover.unroute('**/pathetique-02-180s.aac-64.m4a');
    await recover.locator('audio').evaluate(a => { a.currentTime = a.duration - .3; });
    await recover.waitForFunction(() => document.querySelector('audio').dataset.trackIndex === '1' && document.querySelector('audio').currentTime > 0);
    assert.deepEqual(recoverErrors, []);
    evidence.checks.push('A failed later-track prefetch falls back to a fresh playable request when that movement starts');
    await recover.close();
  } finally { await browser.close(); }

  const restricted = await launch('document-user-activation-required');
  try {
    for (const mobile of [false, true]) {
      const page = await restricted.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      // Playwright evaluation can count as activation: inspect through CDP
      // without a synthetic user gesture before testing the genuine input.
      const cdp = await page.context().newCDPSession(page);
      await page.goto(base, { waitUntil: 'networkidle' });
      const initial = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const a = document.querySelector('audio'); return {
          paused: a?.paused, state: a?.dataset.state, active: navigator.userActivation.hasBeenActive
        }; })()`, returnByValue: true, userGesture: false,
      });
      assert.deepEqual(initial.result.value, { paused: true, state: 'waiting-for-gesture', active: false });
      if (mobile) await page.locator('#message-input').tap();
      else { await page.locator('#message-input').focus(); await page.keyboard.type('hello'); }
      await music(page);
      assert.deepEqual(errors, []);
      evidence.checks.push(mobile ? 'Mobile-sized touch starts music after autoplay denial' : 'Keyboard input starts music after autoplay denial');
      await page.close();
    }
  } finally { await restricted.close(); }
  evidence.passed = true;
  fs.writeFileSync('test-results/media-browser.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
