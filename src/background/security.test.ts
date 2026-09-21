import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeChrome, contentSender, optionsSender } from '../../tests/chrome';
import { Engine } from './engine';
import { Storage } from './storage';
import { MockJevClient } from '../jev/client';
import { JevError } from '../jev/errors';
import { DEBOUNCE_MS, REQUESTS_PER_DOCUMENT_MAX, TEXT_MAX } from '../shared/constants';
import { targetSchema } from '../shared/messages';
import type { TabState } from '../shared/types';
let fake: ReturnType<typeof fakeChrome>;
beforeEach(() => { fake = fakeChrome(); vi.stubGlobal('chrome', fake); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function flush() { for (let i = 0; i < 20; i += 1) await new Promise<void>(resolve => setImmediate(resolve)); }
async function seeded(requests: number) {
 const engine = new Engine(new MockJevClient());
 await engine.message({ type: 'hello', visible: true }, contentSender);
 const state = await engine.message({ type: 'set-intent', tabId: 1, intent: 'Jev' }, contentSender) as TabState;
 const storage = new Storage(); const session = await storage.session();
 await storage.persist({ ...session, tabs: { ...session.tabs, 1: { ...state, requests } } });
 return state;
}
const analyze = (state: TabState, text = 'cat') => ({ type: 'analyze', generation: state.generation, requestId: crypto.randomUUID(), targets: [{ id: 'target', text, context: '' }] });
describe('document spending budget', () => {
 it('bounds input at the message boundary', () => {
  expect(targetSchema.safeParse({ id: 't', text: 'a'.repeat(TEXT_MAX) }).success).toBe(true);
  expect(targetSchema.safeParse({ id: 't', text: 'a'.repeat(TEXT_MAX + 1) }).success).toBe(false);
 });
 it('preserves document budget across worker restart, hello and same-document URL changes', async () => {
  const state = await seeded(REQUESTS_PER_DOCUMENT_MAX);
  const engine = new Engine(new MockJevClient());
  await expect(engine.message(analyze(state), contentSender)).rejects.toThrow('rate-limit');
  const hello = await engine.message({ type: 'hello', visible: true }, contentSender) as TabState;
  expect(hello.requests).toBe(REQUESTS_PER_DOCUMENT_MAX);
  await engine.message({ type: 'set-intent', tabId: 1, intent: 'dog' }, contentSender);
  expect((await new Storage().session()).tabs[1]?.requests).toBe(0);
  await seeded(REQUESTS_PER_DOCUMENT_MAX);
  const next = new Engine(new MockJevClient());
  await next.navigation(1, 'https://x.com/user/status/2', false);
  expect((await new Storage().session()).tabs[1]?.requests).toBe(REQUESTS_PER_DOCUMENT_MAX);
  await next.message({ type: 'hello', visible: true }, { ...contentSender, documentId: 'doc2' });
  expect((await new Storage().session()).tabs[1]?.requests).toBe(0);
 });
 it('charges every retry before sending and does not globally pause on budget failure', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const state = await seeded(REQUESTS_PER_DOCUMENT_MAX - 1);
  const client = { judge: vi.fn().mockRejectedValue(new JevError('network')) };
  const engine = new Engine(client);
  await engine.message(analyze(state), contentSender); await flush();
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
  expect(client.judge).toHaveBeenCalledTimes(1);
  const session = await new Storage().session();
  expect(session.tabs[1]?.requests).toBe(REQUESTS_PER_DOCUMENT_MAX);
  expect(session.paused).toBe(false); expect(session.cache).toEqual([]);
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'error', error: 'rate-limit' }), { documentId: 'doc1' });
 });
 it('atomically bounds concurrent batches and never publishes partially judged targets', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const state = await seeded(REQUESTS_PER_DOCUMENT_MAX - 1);
  const client = new MockJevClient(); const spy = vi.spyOn(client, 'judge');
  const engine = new Engine(client);
  await engine.message(analyze(state, 'cat '.repeat(2000)), contentSender); await flush();
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
  expect(spy).toHaveBeenCalledTimes(1);
  expect((await new Storage().session()).cache).toEqual([]);
  expect(fake.tabs.sendMessage.mock.calls.some(([, message]) => (message as { type: string }).type === 'results')).toBe(false);
 });
 it('rejects a target needing too many fragments before any API send or cache write', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const state = await seeded(0); const client = new MockJevClient(); const spy = vi.spyOn(client, 'judge');
  await new Engine(client).message(analyze(state, '\0'.repeat(3000)), contentSender);
  await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
  expect(spy).not.toHaveBeenCalled(); expect((await new Storage().session()).cache).toEqual([]);
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'error', error: 'invalid-input' }), { documentId: 'doc1' });
 });
});
describe('storage fail closed', () => {
 it.each(['missing', 'sync-throw', 'reject'] as const)('rejects operations without trusted access: %s', async mode => {
  if (mode === 'missing') vi.stubGlobal('chrome', { ...fake, storage: { ...fake.storage, local: { ...fake.storage.local, setAccessLevel: undefined } } });
  else fake.storage.local.setAccessLevel.mockImplementation(() => { if (mode === 'sync-throw') throw new TypeError('unsupported'); return Promise.reject(new Error('denied')); });
  const storage = new Storage();
  await flush(); // rejected initialization must already have an unhandled-rejection handler
  await expect(storage.settings()).rejects.toThrow('storage');
  await expect(storage.save({ key: 'test-only-not-saved' })).rejects.toThrow('storage');
  await expect(storage.removeKey()).rejects.toThrow('storage');
  expect(fake.storage.local.get).not.toHaveBeenCalled(); expect(fake.storage.local.set).not.toHaveBeenCalled();
  const engine = new Engine(new MockJevClient());
  await expect(engine.message({ type: 'get-settings' }, optionsSender)).rejects.toThrow('storage');
 });
});

describe('URL churn and tab time-window budget', () => {
 it('stops unique bodies after repeated pushState/hash navigation exhausts the same-document budget', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await seeded(REQUESTS_PER_DOCUMENT_MAX - 2);
  const client = new MockJevClient(); const spy = vi.spyOn(client, 'judge'); const engine = new Engine(client);
  for (let i = 0; i < 8; i++) {
   const sender = { ...contentSender, url: `https://x.com/new-path-${i}#${i}` };
   await engine.navigation(1, sender.url, false);
   const state = await engine.message({ type: 'hello', visible: true }, sender) as TabState;
   if (i < 2) {
    await engine.message(analyze(state, `unique body ${i}`), sender); await flush();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
   } else await expect(engine.message(analyze(state, `unique body ${i}`), sender)).rejects.toThrow('rate-limit');
  }
  expect(spy).toHaveBeenCalledTimes(2);
  expect((await new Storage().session()).tabs[1]?.requests).toBe(REQUESTS_PER_DOCUMENT_MAX);
 });
 it('carries the tab window across reload, intent change, OFF/ON and SW restart, then resets only after time elapses', async () => {
  const { REQUESTS_PER_TAB_WINDOW_MAX, TAB_WINDOW_MS } = await import('../shared/constants');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  try {
   await seeded(0); const storage = new Storage(); const session = await storage.session();
   await storage.persist({ ...session, tabs: { ...session.tabs, 1: { ...session.tabs[1]!, windowStartedAt: Date.now(), windowCount: REQUESTS_PER_TAB_WINDOW_MAX - 1 } } });
   const client = new MockJevClient(); const spy = vi.spyOn(client, 'judge'); const engine = new Engine(client);
   const state = await engine.message({ type: 'hello', visible: true }, contentSender) as TabState;
   await engine.message(analyze(state), contentSender); await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
   expect(spy).toHaveBeenCalledTimes(1);
   const sender = { ...contentSender, url: 'https://other.example/', documentId: 'new-document' };
   await engine.navigation(1, sender.url, true); await engine.message({ type: 'hello', visible: true }, sender);
   await engine.message({ type: 'clear-intent', tabId: 1 }, sender);
   const changed = await engine.message({ type: 'set-intent', tabId: 1, intent: 'changed' }, sender) as TabState;
   expect(changed.requests).toBe(0); expect(changed.windowCount).toBe(REQUESTS_PER_TAB_WINDOW_MAX);
   const restarted = new Engine(client);
   await expect(restarted.message(analyze(changed, 'uncached'), sender)).rejects.toThrow('rate-limit');
   now.mockReturnValue(1_000_000 + TAB_WINDOW_MS);
   await restarted.message(analyze(changed, 'uncached'), sender); await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
   expect(spy).toHaveBeenCalledTimes(2); expect((await storage.session()).tabs[1]?.windowCount).toBe(1);
   expect((await storage.session()).paused).toBe(false);
  } finally { now.mockRestore(); }
 });
});
