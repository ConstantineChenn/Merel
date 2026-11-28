const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8787';
const gate = () => { let release; const promise = new Promise(r => release = r); return { promise, release }; };
const evidence = { base, checks: [] };
const coverPath = '/expressions/neutral.full.webp';
const nextPath = '/expressions/curious.full.webp';
const portrait = page => page.locator('.character-portrait');
async function full(page, expression) {
  await page.waitForFunction(expression => {
    const p = document.querySelector('.character-portrait');
    return p?.dataset.quality === 'full' && p.dataset.displayAsset === 'expressions/' + expression && p.complete && p.naturalWidth === 1789;
  }, expression, { timeout: 90000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.MEREL_CHROME || undefined, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    let page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const cover = gate(), next = gate(), nextStarted = gate(), requested = [];
    page.on('request', r => { if (/full\.webp|\.m4a/.test(r.url())) requested.push(r.url()); });
    await page.route('**' + coverPath, async route => { await cover.promise; await route.continue(); });
    await page.route('**' + nextPath, async route => { nextStarted.release(); await next.promise; await route.continue(); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#message-input').waitFor();
    await page.waitForFunction(() => document.querySelector('.character-portrait')?.dataset.quality === 'preview');
    assert.equal(requested.length, 1);
    assert(requested[0].endsWith(coverPath));
    assert.equal(await page.locator('audio').count(), 0);
    evidence.checks.push('The cover is the first and only full-resolution request; no background player is created');

    cover.release();
    await full(page, 'neutral');
    await nextStarted.promise;
    assert.equal(requested.length, 2);
    assert(requested[1].endsWith(nextPath));
    await page.evaluate(() => {
      window.downgrades = [];
      const p = document.querySelector('.character-portrait');
      new MutationObserver(() => { if (p.src.includes('.preview.') || p.dataset.quality === 'preview') downgrades.push(p.src); })
        .observe(p, { attributes: true, attributeFilter: ['src', 'data-quality'] });
    });
    await page.locator('.character-trigger').click();
    assert.equal(await portrait(page).getAttribute('data-quality'), 'retained-full');
    assert.equal(await portrait(page).getAttribute('data-pending-asset'), 'expressions/curious');
    assert((await portrait(page).getAttribute('data-full-source')).endsWith(coverPath));
    assert.equal(requested.length, 2);
    evidence.checks.push('Clicking a not-yet-ready expression retains the clear cover; menu images wait');
    await page.locator('.character-trigger').click();
    await full(page, 'neutral');
    await page.locator('.character-trigger').click();
    assert.equal(await portrait(page).getAttribute('data-quality'), 'retained-full');
    next.release();
    await full(page, 'curious');
    assert.equal(await page.locator('audio').count(), 0);
    assert.deepEqual(await page.evaluate(() => downgrades), []);
    for (let i = 0; i < 8; i++) await page.locator('.character-trigger').click();
    await full(page, 'curious');
    assert.deepEqual(await page.evaluate(() => downgrades), []);
    assert.equal(requested.filter(url => url.endsWith(coverPath)).length, 1);
    assert.equal(requested.filter(url => url.endsWith(nextPath)).length, 1);
    assert.deepEqual(errors, []);
    evidence.checks.push('Ready portraits switch without preview flashes or duplicate downloads during repeated clicks');
    evidence.request_order = requested;
    await page.close();

    page = await browser.newPage();
    let failures = 0;
    await page.route('**' + nextPath, route => { failures++; return route.abort(); });
    await page.goto(base);
    await page.locator('#message-input').waitFor();
    await full(page, 'neutral');
    assert.equal(await page.locator('audio').count(), 0);
    const failedAgain = page.waitForEvent('requestfailed', { predicate: r => r.url().endsWith(nextPath) });
    await page.locator('.character-trigger').click();
    await failedAgain;
    assert((await portrait(page).getAttribute('data-full-source')).endsWith(coverPath));
    assert.equal(await portrait(page).getAttribute('data-quality'), 'retained-full');
    assert(failures >= 1);
    await page.locator('#message-input').fill('高清请求失败仍然可以输入');
    await page.unroute('**' + nextPath);
    await page.locator('.character-trigger').click();
    await page.locator('.character-trigger').click();
    await full(page, 'curious');
    evidence.checks.push('A failed next portrait keeps the clear image and usable input; a later click retries successfully');
    await page.close();

    page = await browser.newPage();
    await page.route('**' + coverPath, route => route.abort());
    await page.goto(base);
    await page.locator('#message-input').waitFor();
    assert.equal(await page.locator('audio').count(), 0);
    assert.equal(await portrait(page).getAttribute('data-quality'), 'preview');
    await page.locator('.character-trigger').click();
    await full(page, 'curious');
    evidence.checks.push('Cover failure releases the queue; the next expression can still load');
    await page.close();

    page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const slowCover = gate(), plans = gate();
    await page.route('**' + coverPath, async route => { await slowCover.promise; await route.continue(); });
    await page.route('**/expressions/serious.full.webp', async route => { await plans.promise; await route.continue(); });
    await page.route('**/expressions/talk.full.webp', async route => { await plans.promise; await route.continue(); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#message-input').waitFor();
    await page.locator('#message-input').waitFor();
    await page.locator('.character-hint').click();
    await page.locator('.radial-item[data-page="plans"]').click();
    await page.waitForFunction(() => document.querySelector('.character-portrait')?.dataset.asset === 'expressions/serious');
    slowCover.release();
    assert.equal(await page.locator('audio').count(), 0);
    plans.release();
    await full(page, 'serious');
    assert.equal(await page.locator('audio').count(), 0);
    evidence.checks.push('Navigating before the cover finishes reprioritizes the new expression pair while background music stays disabled');
    await page.close();

    page = await browser.newPage();
    await page.clock.install();
    const stalled = gate();
    await page.route('**' + coverPath, async route => { await stalled.promise; await route.continue().catch(() => {}); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#message-input').waitFor();
    await page.waitForFunction(() => document.querySelector('.character-portrait')?.dataset.quality === 'preview');
    await page.clock.fastForward(120500);
    assert.equal(await page.locator('audio').count(), 0);
    stalled.release();
    await page.locator('.character-trigger').click();
    await full(page, 'curious');
    evidence.checks.push('A stalled cover times out and releases later portrait requests without blocking the page');
    await page.close();
    evidence.passed = true;
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/portrait-priority.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
