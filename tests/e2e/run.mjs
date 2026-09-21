import { chromium } from 'playwright';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const extension = resolve('dist-mock');
const screenshots = resolve('artifacts/screenshots');
const profile = await mkdtemp(join(tmpdir(), 'jev-v2-e2e-'));
const firstURL = 'https://first.example.test/reading';
const secondURL = 'https://second.example.test/reading';
const html = await readFile('tests/fixtures/search-page.html', 'utf8');
await mkdir(screenshots, { recursive: true });
const completed = [];
const files = [];
let context;
async function until(read, check, label) {
 const end = Date.now() + 20_000;
 while (Date.now() < end) {
  const value = await read(); if (check(value)) return value;
  await new Promise(resolve => setTimeout(resolve, 100));
 }
 throw new Error(`Timed out: ${label}`);
}
// DevTools frame enumeration can inspect a closed root; page DOM cannot.
const frames = page => page.frames().filter(frame => { try { return new URL(frame.url()).pathname === '/bar.html'; } catch { return false; } });
const bar = page => { const frame = frames(page)[0]; assert.ok(frame, 'live extension bar frame'); return frame; };
const waitBar = page => until(() => Promise.resolve(frames(page).length), count => count === 1, 'bar frame');
const input = page => bar(page).getByRole('textbox', { name: 'このページで探したい内容' });
async function highlights(page) {
 return page.locator('p').evaluateAll(elements => elements.filter(element => {
  const css = getComputedStyle(element);
  return css.backgroundColor === 'rgba(250, 204, 21, 0.16)' && ['2px', '3px'].includes(css.outlineWidth) && css.outlineStyle === 'solid';
 }).map(element => ({ id: element.id, current: getComputedStyle(element).outlineWidth === '3px' })));
}
async function shot(locator, name) {
 const path = join(screenshots, name); await locator.screenshot({ path }); files.push(path);
}
try {
 context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: process.env.E2E_HEADLESS !== '0', viewport: { width: 1280, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
 });
 // Every HTTP(S) request is either a known fixture or aborted: no real sites or API.
 await context.route(/^https?:\/\//, route => [firstURL, secondURL].includes(route.request().url())
  ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : route.abort());
 await context.addInitScript(() => {
  window.capturedKeys = 0;
  document.addEventListener('keydown', () => { window.capturedKeys += 1; }, true);
 });
 const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
 const extensionId = new URL(worker.url()).host;
 const page = await context.newPage(); await page.goto(firstURL); await page.bringToFront();
 const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
 const toggle = () => worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'toggle' }), tabId);
 // Equivalent to the notification sent by the production action.onClicked handler.
 await until(async () => { try { await toggle(); return true; } catch { return false; } }, Boolean, 'content ready');
 await waitBar(page); await input(page).waitFor(); await input(page).fill('cat'); await input(page).press('Enter');
 await until(() => highlights(page), hits => hits.length === 2, 'two highlighted paragraphs');
 await until(() => bar(page).getByRole('status').innerText(), text => text.includes('2件'), 'bar count');
 assert.equal(await page.locator('#excluded').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
 assert.equal(await page.evaluate(() => window.capturedKeys), 0, 'page capture must not receive iframe typing');
 assert.equal(await page.locator('iframe').count(), 0, 'closed shadow hides the frame from the page');
 assert.equal(await page.evaluate(() => window.scrollY), 0, 'search must not scroll');
 assert.ok(await page.locator('#hit-two').evaluate(el => el.getBoundingClientRect().top > innerHeight), 'second hit is below viewport but already counted');
 completed.push('a: full loaded page search counts offscreen hits without scrolling');
 await page.emulateMedia({ colorScheme: 'light' }); await shot(bar(page).locator('main.bar'), 'v2-bar-light.png');
 await page.emulateMedia({ colorScheme: 'dark' }); await shot(bar(page).locator('main.bar'), 'v2-bar-dark.png');
 await page.emulateMedia({ colorScheme: 'light' });
 await input(page).press('Enter');
 await until(() => highlights(page), hits => hits.find(hit => hit.current)?.id === 'hit-one', 'Enter next');
 await bar(page).getByRole('button', { name: '次へ', exact: true }).click();
 await until(() => highlights(page), hits => hits.find(hit => hit.current)?.id === 'hit-two', 'next button');
 await until(() => page.locator('#hit-two').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), Boolean, 'smooth jump brings offscreen hit into viewport');
 await bar(page).getByRole('button', { name: '前へ', exact: true }).click();
 await until(() => highlights(page), hits => hits.find(hit => hit.current)?.id === 'hit-one', 'previous button');
 await input(page).press('Shift+Enter');
 await until(() => highlights(page), hits => hits.find(hit => hit.current)?.id === 'hit-two', 'Shift Enter wraps');
 await shot(page, 'v2-highlight-current.png'); completed.push('b: Enter/buttons/Shift+Enter current-hit navigation');
 const actualFrame = bar(page);
 assert.ok(actualFrame);
 const denied = await actualFrame.evaluate(() => chrome.runtime.sendMessage({ type: 'save-key', key: 'e2e-must-not-save' }));
 assert.deepEqual(denied, { ok: false, error: 'invalid-input' }); completed.push('f: iframe key writes rejected');
 await input(page).press('Escape');
 await until(() => Promise.resolve(frames(page).length), count => count === 0, 'bar closes');
 assert.deepEqual(await highlights(page), []);
 const cleared = await worker.evaluate(async id => (await chrome.storage.session.get('session')).session.tabs[id], tabId);
 assert.equal(cleared.intent, ''); assert.equal(cleared.enabled, false); assert.equal(cleared.barOpen, false);
 completed.push('c: Escape clears bar, state and all highlights');
 await toggle(); await waitBar(page); await input(page).fill('cat'); await input(page).press('Enter');
 await until(() => highlights(page), hits => hits.length === 2, 'search before cross-origin navigation');
 const href = await page.locator('#article-link').getAttribute('href'); assert.equal(href, secondURL);
 const selected = await page.locator('#hit-one').evaluate(element => {
  const range = document.createRange(); range.selectNodeContents(element);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  return selection.toString();
 });
 assert.ok(selected.includes('cat')); completed.push('e: unchanged link href and selectable highlighted text');
 await page.locator('#article-link').click(); await page.waitForURL(secondURL);
 await waitBar(page); await input(page).waitFor(); await until(() => input(page).inputValue(), value => value === 'cat', 'restored intent');
 await until(() => highlights(page), hits => hits.length === 2, 'automatic cross-domain search');
 await page.reload(); await waitBar(page); await input(page).waitFor();
 await until(() => highlights(page), hits => hits.length === 2, 'reload restores search');
 completed.push('d: link navigates across domains, restoring bar/search; reload also restores');
 const options = await context.newPage(); await options.goto(`chrome-extension://${extensionId}/options.html`);
 await options.getByText('モックモードです。実APIには接続しません。').waitFor();
 await options.emulateMedia({ colorScheme: 'light' }); await shot(options, 'v2-options-light.png');
 await options.emulateMedia({ colorScheme: 'dark' }); await shot(options, 'v2-options-dark.png');
 await writeFile('artifacts/e2e-v2-result.json', JSON.stringify({ passed: true, completed, screenshots: files }, null, 2));
 process.stdout.write(`v2 E2E: ${completed.length} scenarios passed; ${files.length} screenshots\n`);
} catch (error) {
 await writeFile('artifacts/e2e-v2-result.json', JSON.stringify({ passed: false, completed, screenshots: files, error: String(error) }, null, 2));
 throw error;
} finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
