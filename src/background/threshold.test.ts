import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeChrome, optionsSender, contentSender } from '../../tests/chrome';
import { Engine } from './engine';
import { Storage } from './storage';
import { validateMessage } from './validation';
import { thresholdSchema } from '../shared/settings';
import { DEBOUNCE_MS } from '../shared/constants';
import type { Target, TabState } from '../shared/types';
let fake: ReturnType<typeof fakeChrome>;
beforeEach(() => { fake = fakeChrome(); vi.stubGlobal('chrome', fake); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function flush() { for (let i = 0; i < 20; i++) await new Promise<void>(resolve => setImmediate(resolve)); }
it('defaults to 0.6, persists valid numeric thresholds with trusted access and rejects invalid writes', async () => {
 const storage = new Storage();
 expect((await storage.settings()).threshold).toBe(0.6);
 for (const threshold of [0.3, 0.6, 0.95]) {
  await storage.save({ threshold });
  expect((await new Storage().settings()).threshold).toBe(threshold);
 }
 for (const threshold of [0.29, 0.96, NaN, Infinity, '0.6', null, undefined]) {
  expect(thresholdSchema.safeParse(threshold).success).toBe(false);
  await expect(storage.save({ threshold } as never)).rejects.toThrow('invalid-input');
  expect(() => validateMessage({ type: 'set-threshold', threshold }, optionsSender, 'extension')).toThrow('invalid-input');
 }
 expect((await storage.settings()).threshold).toBe(0.95);
 await fake.storage.local.set({ threshold: '0.5' });
 expect((await storage.settings()).threshold).toBe(0.6);
 expect(fake.storage.local.setAccessLevel.mock.invocationCallOrder[0]).toBeLessThan(fake.storage.local.set.mock.invocationCallOrder[0]!);
});
it('permits threshold changes only from the exact options URL', () => {
 const message = { type: 'set-threshold', threshold: 0.6 };
 expect(validateMessage(message, optionsSender, 'extension')).toEqual(message);
 for (const sender of [contentSender, { ...optionsSender, url: optionsSender.url + '?x' },
  { ...contentSender, frameId: 1, url: 'chrome-extension://extension/bar.html#' + crypto.randomUUID() }]) {
  expect(() => validateMessage(message, sender, 'extension')).toThrow('invalid-input');
 }
});
it('re-highlights cached scores without API calls, preserves pause and cache across generations/restart', async () => {
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 const client = { judge: vi.fn(async (_intent: string, targets: readonly Target[]) => Object.fromEntries(targets.map(t => [t.id, 0.7]))) };
 let engine = new Engine(client);
 await engine.message({ type: 'hello', visible: true }, contentSender);
 let state = await engine.message({ type: 'set-intent', tabId: 1, intent: 'test' }, contentSender) as TabState;
 const analyze = (s: TabState) => ({ type: 'analyze', generation: s.generation, requestId: crypto.randomUUID(), targets: [{ id: 'target', text: 'test body', context: '' }] });
 await engine.message(analyze(state), contentSender); await flush();
 await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
 expect(client.judge).toHaveBeenCalledTimes(1);
 expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'results', results: [expect.objectContaining({ highlighted: true })] }), { documentId: 'doc1' });
 const storage = new Storage(); const previous = await storage.session();
 await storage.persist({ ...previous, paused: true });
 engine = new Engine(client);
 for (const threshold of [0.8, 0.6]) {
  fake.tabs.sendMessage.mockClear();
  await engine.message({ type: 'set-threshold', threshold }, optionsSender);
  const session = await storage.session();
  expect(session.cache).toEqual(previous.cache); expect(session.paused).toBe(true);
  expect(session.tabs[1]?.generation.settings).not.toBe(state.generation.settings);
  expect(session.tabs[1]?.progress).toBeUndefined();
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'reset', enabled: true }));
  await expect(engine.message(analyze(state), contentSender)).rejects.toThrow('cancelled');
  state = await engine.message({ type: 'hello', visible: true }, contentSender) as TabState;
  await engine.message(analyze(state), contentSender); await flush();
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
  expect(client.judge).toHaveBeenCalledTimes(1);
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'results', results: [expect.objectContaining({ highlighted: threshold === 0.6 })] }), { documentId: 'doc1' });
 }
 expect(await new Engine(client).message({ type: 'get-settings' }, optionsSender)).toMatchObject({ threshold: 0.6 });
});

it('resets every enabled tab but preserves inactive tabs and rejects uncached work while paused', async () => {
 const client = { judge: vi.fn() }; const storage = new Storage();
 let engine = new Engine(client);
 const other = { ...contentSender, tab: { id: 2 }, documentId: 'doc2' };
 const off = { ...contentSender, tab: { id: 3 }, documentId: 'doc3' };
 for (const sender of [contentSender, other, off]) {
  await engine.message({ type: 'hello', visible: true }, sender);
  if (sender !== off) await engine.message({ type: 'set-intent', tabId: sender.tab.id, intent: 'test' }, sender);
 }
 const session = await storage.session();
 await storage.persist({ ...session, paused: true }); engine = new Engine(client);
 fake.tabs.sendMessage.mockClear();
 await engine.message({ type: 'set-threshold', threshold: 0.9 }, optionsSender);
 expect(fake.tabs.sendMessage.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
 const next = await storage.session(); expect(next.tabs[3]?.enabled).toBe(false);
 await expect(engine.message({ type: 'analyze', generation: next.tabs[1]!.generation,
  requestId: crypto.randomUUID(), targets: [{ id: 'uncached', text: 'new body', context: '' }] }, contentSender)).rejects.toThrow('rate-limit');
 expect(client.judge).not.toHaveBeenCalled(); expect(next.paused).toBe(true);
});
