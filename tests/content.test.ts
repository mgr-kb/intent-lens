// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extract } from '../src/content/extractor';
vi.mock('../src/content/extractor', async importOriginal => {
 const real = await importOriginal<typeof import('../src/content/extractor')>();
 return { ...real, extract: vi.fn(real.extract) };
});
import { ContentController, type Transport } from '../src/content/controller';
import { bodyFingerprint } from '../src/shared/fingerprint';
import { DEBOUNCE_MS, URL_POLL_MS, CONTENT_RESYNC_MS } from '../src/shared/constants';
import type { Message } from '../src/shared/messages';
import type { TabState } from '../src/shared/types';
type Analyze = Extract<Message, { type: 'analyze' }>;
let intersect!: (entries: readonly IntersectionObserverEntry[]) => void;
let observed: readonly Element[] = [];
class FakeIntersectionObserver {
 constructor(callback: (entries: readonly IntersectionObserverEntry[]) => void) { intersect = callback; }
 observe(element: Element): void { observed = [...observed.filter(e => e !== element), element]; }
 unobserve(element: Element): void { observed = observed.filter(e => e !== element); }
 disconnect(): void { observed = []; }
}
let state: TabState;
let controller: ContentController;
let send: ReturnType<typeof vi.fn<Transport>>;
let hidden = false;
let originalPush: History['pushState'];
beforeEach(() => {
 // happy-dom cannot load extension resources; model only the frame container here.
 vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLIFrameElement, value: string) { this.setAttribute('data-test-src', value); });
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
 vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
 vi.stubGlobal('chrome', { runtime: { id: 'extension', getURL: (path: string) => 'chrome-extension://extension/' + path } });
 (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL('https://example.org/page'); originalPush = window.history.pushState;
 document.body.innerHTML = readFileSync('tests/fixtures/page.html', 'utf8');
 hidden = false; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
 state = { enabled: true, intent: 'Jev', visible: true, url: window.location.href,
  generation: { tab: crypto.randomUUID(), document: 'doc', settings: crypto.randomUUID() } };
 send = vi.fn<Transport>(async message => message.type === 'hello' ? { ok: true, data: { ...state, url: window.location.href } } :
  message.type === 'analyze' ? { ok: true, data: { accepted: true } } : { ok: true, data: { ok: true } });
 controller = new ContentController(document, window, send);
});
afterEach(() => { controller?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = ''; });
async function settle(): Promise<void> { for (let i = 0; i < 20; i += 1) await new Promise<void>(resolve => setImmediate(resolve)); }
async function start(): Promise<void> { controller.start(); await settle(); }
function show(elements = observed): void {
 intersect(elements.map(target => ({ target, isIntersecting: true }) as IntersectionObserverEntry));
}
const analyses = () => send.mock.calls.map(([message]) => message).filter((m): m is Analyze => m.type === 'analyze');
async function result(request: Analyze, patch: object = {}): Promise<void> {
 controller.receive({ type: 'results', requestId: request.requestId, generation: request.generation,
  results: await Promise.all(request.targets.map(async t => ({ id: t.id, fingerprint: await bodyFingerprint(t.text), probability: 1, highlighted: true }))), ...patch });
}
async function dispatchVisible(): Promise<Analyze> {
 show(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await settle(); return analyses().at(-1)!;
}
describe('content workflow', () => {
 it('sends hello but no bodies until IntersectionObserver reports viewport entry', async () => {
  await start(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  expect(send.mock.calls[0]?.[0]).toEqual({ type: 'hello', visible: true }); expect(analyses()).toEqual([]);
  const request = await dispatchVisible(); expect(request.targets).toHaveLength(2);
  await result(request); expect(document.querySelectorAll('[class^="h-"]')).toHaveLength(2);
 });
 it('deduplicates identical normalized body fingerprints while highlighting both elements', async () => {
  document.body.innerHTML += '<p>Jev semantic search finds relevant text on arbitrary pages.</p>';
  await start(); const request = await dispatchVisible(); expect(request.targets).toHaveLength(2);
  await result(request); expect(document.querySelectorAll('[class^="h-"]')).toHaveLength(3);
  await controller.scan(); show(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); expect(analyses()).toHaveLength(1);
 });
 it('rejects unknown request IDs, wrong generations and incorrect fingerprints', async () => {
  await start(); const request = await dispatchVisible();
  await result(request, { requestId: crypto.randomUUID() });
  await result(request, { generation: { ...request.generation, settings: crypto.randomUUID() } });
  expect(document.querySelector('[class^="h-"]')).toBeNull();
  await result(request, { results: [{ id: request.targets[0]!.id, fingerprint: 'a'.repeat(64), probability: 1, highlighted: true }] });
  expect(document.querySelector('[class^="h-"]')).toBeNull();
 });
 it('does not apply an old response to a DOM element reused for another post', async () => {
  await start(); const request = await dispatchVisible();
  const first = document.querySelector('p')!;
  first.textContent = 'New replacement paragraph with enough characters.'; document.querySelector('a')!.setAttribute('href', '/other/status/900');
  await result(request); expect(first.className.startsWith('h-')).toBe(false);
  await settle(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await settle(); await dispatchVisible();
  expect(analyses().at(-1)!.targets.some(t => t.text === 'New replacement paragraph with enough characters.')).toBe(true);
 });
 it('removes stale highlights after mutations and analyzes dynamic additions once', async () => {
  await start(); await result(await dispatchVisible());
  const first = document.querySelector('p')!;
  first.textContent = 'Updated paragraph with enough visible characters.';
  document.querySelector('main')!.insertAdjacentHTML('beforeend', '<p>Dynamically added paragraph with sufficient text.</p>');
  await settle(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await settle();
  expect(first.className.startsWith('h-')).toBe(false);
  const request = await dispatchVisible(); expect(request.targets.map(t => t.text)).toEqual(['Updated paragraph with enough visible characters.', 'Dynamically added paragraph with sufficient text.']);
  await result(request); const count = analyses().length;
  await settle(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3); expect(analyses()).toHaveLength(count);
 });
 it('clears style and classes on OFF/reset and ignores responses from before reset', async () => {
  await start(); const request = await dispatchVisible(); await result(request);
  state = { ...state, enabled: false, generation: { ...state.generation, tab: crypto.randomUUID() } };
  controller.receive({ type: 'reset', ...state }); await settle();
  expect(document.querySelector('[class^="h-"]')).toBeNull(); expect(document.head.querySelector('style')).toBeNull();
  await result(request); expect(document.querySelector('[class^="h-"]')).toBeNull();
 });
 it('notifies visibility and delays new submissions while hidden', async () => {
  await start(); hidden = true; document.dispatchEvent(new Event('visibilitychange')); show();
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); expect(analyses()).toHaveLength(0);
  expect(send).toHaveBeenCalledWith({ type: 'visibility', generation: state.generation, visible: false });
  hidden = false; document.dispatchEvent(new Event('visibilitychange')); await settle(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  expect(analyses()).toHaveLength(1);
 });
 it('detects page-world history changes through URL polling when the wrapper is bypassed', async () => {
  await start(); await result(await dispatchVisible());
  originalPush.call(window.history, {}, '', '/messages/2');
  await vi.advanceTimersByTimeAsync(URL_POLL_MS); await settle();
  expect(document.querySelector('[class^="h-"]')).toBeNull(); expect(observed).toHaveLength(2);
 });
});




describe('document synchronization recovery', () => {
 it('recovers real document identity after loading and tab-scoped reset, preserving ON', async () => {
  const { fakeChrome } = await import('./chrome');
  const { Engine } = await import('../src/background/engine');
  const { MockJevClient } = await import('../src/jev/client');
  const { errorCode } = await import('../src/jev/errors');
  const fake = fakeChrome(); vi.stubGlobal('chrome', fake);
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL('https://another.example/article');
  document.body.innerHTML = readFileSync('tests/fixtures/page.html', 'utf8');
  const engine = new Engine(new MockJevClient()); controller.destroy();
  const transport = vi.fn<Transport>(async message => {
   try { return { ok: true, data: await engine.message(message, { id: 'extension', url: window.location.href, tab: { id: 1 }, frameId: 0, documentId: 'real-document', documentLifecycle: 'active' }) }; }
   catch (error) { return { ok: false, error: errorCode(error) }; }
  });
  controller = new ContentController(document, window, transport); await start();
  const sender = { id: 'extension', url: window.location.href, tab: { id: 1 }, frameId: 0, documentId: 'real-document', documentLifecycle: 'active' };
  await engine.message({ type: 'set-intent', tabId: 1, intent: 'Jev' }, sender);
  await engine.navigation(1, window.location.href, true);
  const { Storage } = await import('../src/background/storage');
  const placeholder = { state: (await new Storage().session()).tabs[1]! };
  expect(placeholder.state.generation.document).not.toBe('real-document');
  fake.tabs.sendMessage.mockImplementation(async (_id, payload, options) => {
   if (options && options.documentId !== 'real-document') throw new Error('No receiver');
   controller.receive(payload);
  });
  await engine.navigation(1, window.location.href, true); await settle();
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'reset' }));
  const recovered = await engine.message({ type: 'get-tab-state', tabId: 1 }, sender) as { state: TabState };
  expect(recovered.state.generation.document).toBe('real-document'); expect(recovered.state.enabled).toBe(true);
  show(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await settle();
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await settle();
  const call = transport.mock.calls.findIndex(([m]) => m.type === 'analyze'); expect(call).toBeGreaterThan(-1);
  expect(await transport.mock.results[call]!.value).toEqual({ ok: true, data: { accepted: true } });
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'results' }), { documentId: 'real-document' });
  expect(document.querySelectorAll('[class^="h-"]')).toHaveLength(1);
 });
 it.each(['analyze', 'visibility', 'analysis-status'] as const)('resynchronizes cancelled %s responses without a retry storm', async type => {
  const original = send.getMockImplementation()!;
  send.mockImplementation(async message => message.type === type ? { ok: false, error: 'cancelled' } : original(message));
  await start();
  if (type === 'analyze') await dispatchVisible();
  if (type === 'visibility') { document.dispatchEvent(new Event('visibilitychange')); await settle(); }
  const hellos = () => send.mock.calls.filter(([m]) => m.type === 'hello').length;
  expect(hellos()).toBe(1);
  for (let i = 0; i < 10; i += 1) document.dispatchEvent(new Event('visibilitychange'));
  await settle(); expect(hellos()).toBe(1);
  send.mockImplementation(original);
  await vi.advanceTimersByTimeAsync(CONTENT_RESYNC_MS); await settle();
  expect(hellos()).toBe(2); expect(observed.length).toBeGreaterThan(0);
 });
 it('bounds repeated cancelled hello responses and cancels recovery on destruction', async () => {
  send.mockResolvedValue({ ok: false, error: 'cancelled' }); await start();
  await vi.advanceTimersByTimeAsync(CONTENT_RESYNC_MS * 3); await settle();
  expect(send).toHaveBeenCalledTimes(4);
  controller.destroy(); await vi.advanceTimersByTimeAsync(CONTENT_RESYNC_MS * 3);
  expect(send).toHaveBeenCalledTimes(4);
 });
});


it('coalesces mutation bursts without immediate extraction and scans at most once per hits poll', async () => {
 await start(); await result(await dispatchVisible()); await settle();
 vi.mocked(extract).mockClear();
 for (let i = 0; i < 20; i++) document.querySelector('p')!.textContent = `A changed paragraph with enough text ${i}`;
 await settle(); expect(extract).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await settle();
 expect(extract).toHaveBeenCalledTimes(1);
 vi.mocked(extract).mockClear();
 controller.receive({ type: 'hits', generation: state.generation });
 expect(extract).toHaveBeenCalledTimes(1);
});

it.each(['poll', 'visibility', 'hello'] as const)('removes highlights and bar and stops all work on missing runtime id: %s', async trigger => {
 state = { ...state, barOpen: true, barSession: crypto.randomUUID() };
 await start(); const request = await dispatchVisible(); await result(request); await settle();
 expect(document.querySelector('[class^="h-"]')).not.toBeNull();
 expect(document.documentElement.children.length).toBeGreaterThan(2);
 vi.stubGlobal('chrome', { runtime: { id: undefined } });
 const calls = send.mock.calls.length;
 if (trigger === 'visibility') document.dispatchEvent(new Event('visibilitychange'));
 if (trigger === 'hello') await controller.synchronize();
 await vi.advanceTimersByTimeAsync(URL_POLL_MS); await settle();
 expect(document.querySelector('[class^="h-"]')).toBeNull();
 expect(document.documentElement.children.length).toBe(2);
 expect(observed).toEqual([]); expect(vi.getTimerCount()).toBe(0);
 window.history.pushState({}, '', '/after-update');
 document.body.append(document.createElement('p'));
 document.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(5000); await settle();
 expect(send).toHaveBeenCalledTimes(calls); expect(vi.getTimerCount()).toBe(0);
 expect(window.history.pushState).toBe(originalPush);
});
it.each(['sync-throw', 'rejection'] as const)('stops after invalidated transport errors without escaping: %s', async mode => {
 if (mode === 'sync-throw') send.mockImplementation(() => { throw new Error('Extension context invalidated.'); });
 else send.mockRejectedValue(new Error('Extension context invalidated.'));
 await start(); await vi.advanceTimersByTimeAsync(5000);
 expect(send).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0); expect(observed).toEqual([]);
});
