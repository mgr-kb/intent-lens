import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeChrome, contentSender, optionsSender } from '../../tests/chrome';
import { Engine } from './engine';
import { Storage } from './storage';
import { MockJevClient, type JevClient } from '../jev/client';
import { JevError } from '../jev/errors';
import { DEBOUNCE_MS, CONNECTION_TARGET } from '../shared/constants';
import type { TabState } from '../shared/types';
let fake: ReturnType<typeof fakeChrome>;
beforeEach(() => { fake = fakeChrome(); vi.stubGlobal('chrome', fake); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function enable(engine: Engine): Promise<TabState> {
 await engine.message({ type: 'hello', visible: true }, contentSender);
 return await engine.message({ type: 'set-intent', tabId: 1, intent: 'Jev' }, contentSender) as TabState;
}
const request = (state: TabState) => ({ type: 'analyze', requestId: crypto.randomUUID(), generation: state.generation, targets: [{ id: 't1', text: 'cat', context: '' }] });
async function flush(): Promise<void> {
 for (let i = 0; i < 20; i += 1) await new Promise<void>(resolve => setImmediate(resolve));
}
describe('worker integration', () => {
 it('awaits trusted access restriction before reading or saving a key', async () => {
  let release!: () => void;
  fake.storage.local.setAccessLevel.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const storage = new Storage(); const save = storage.save({ key: 'test' });
  const read = storage.settings(); expect(fake.storage.local.get).not.toHaveBeenCalled(); expect(fake.storage.local.set).not.toHaveBeenCalled();
  release(); await Promise.all([save, read]);
  expect(fake.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
 });
 it('requires settings before ON and never exposes the key in public responses', async () => {
  await fake.storage.local.remove('key');
  const engine = new Engine(new MockJevClient());
  await expect(enable(engine)).rejects.toThrow('settings-required');
  const response = await engine.message({ type: 'get-settings' }, optionsSender);
  expect(response).toEqual({ threshold: 0.6, keyConfigured: false, mock: false });
 });
 it('persists ON across worker instances and invalidates settings generations and cache', async () => {
  const first = new Engine(new MockJevClient()); const before = await enable(first);
  const second = new Engine(new MockJevClient());
  const status = await second.message({ type: 'get-tab-state', tabId: 1 }, contentSender) as { state: TabState };
  expect(status.state.enabled).toBe(true);
  await second.message({ type: 'set-intent', tabId: 1, intent: 'dog' }, contentSender);
  const after = await second.message({ type: 'get-tab-state', tabId: 1 }, contentSender) as { state: TabState };
  expect(after.state.generation.tab).not.toBe(before.generation.tab);
  await expect(second.message(request(before), contentSender)).rejects.toThrow('cancelled');
 });
 it.each(['clear-intent', 'set-intent'] as const)('rejects late results after %s and never caches them', async type => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let resolve!: (value: { t00000000: number }) => void;
  const client: JevClient = { judge: vi.fn(() => new Promise<{ t00000000: number }>(done => { resolve = done; })) };
  const engine = new Engine(client); const state = await enable(engine);
  await engine.message(request(state), contentSender); await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  expect(client.judge).toHaveBeenCalledTimes(1);
  await engine.message(type === 'clear-intent' ? { type, tabId: 1 } : { type, tabId: 1, intent: 'changed' }, contentSender);
  resolve({ t00000000: 1 }); await flush();
  expect(fake.tabs.sendMessage.mock.calls.some(([, payload]) => (payload as { type?: string }).type === 'results')).toBe(false);
  expect((await new Storage().session()).cache).toEqual([]);
 });
 it('publishes mock results, then reuses session cache without another API call', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const client = new MockJevClient(); const spy = vi.spyOn(client, 'judge');
  const engine = new Engine(client); const state = await enable(engine);
  await engine.message(request(state), contentSender); await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
  expect(spy).toHaveBeenCalledTimes(1); expect((await new Storage().session()).cache).toHaveLength(1);
  await engine.message(request(state), contentSender); await flush();
  expect(spy).toHaveBeenCalledTimes(1);
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'results', generation: state.generation }), { documentId: 'doc1' });
 });
 it('persists rate-limit stops without caching failures', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const engine = new Engine({ judge: vi.fn().mockRejectedValue(new JevError('rate-limit')) });
  const state = await enable(engine); await engine.message(request(state), contentSender);
  await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
  const session = await new Storage().session(); expect(session.paused).toBe(true); expect(session.cache).toEqual([]);
  await expect(engine.message(request(state), contentSender)).rejects.toThrow('rate-limit');
 });
 it('checks keys with fixed test data and returns only success', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const client = new MockJevClient(); const spy = vi.spyOn(client, 'judge'); const engine = new Engine(client);
  const promise = engine.message({ type: 'save-key', key: 'test-only-replacement' }, optionsSender);
  await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); expect(await promise).toEqual({ ok: true });
  expect(spy.mock.calls[0]?.[1]).toEqual([CONNECTION_TARGET]);
  expect(await engine.message({ type: 'get-settings' }, optionsSender)).toEqual({ threshold: 0.6, keyConfigured: true, mock: false });
 });
});

describe('worker configuration races', () => {
 it('does not resurrect a key deleted during connection verification', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let complete!: (value: { test: number }) => void;
  const client: JevClient = { judge: vi.fn(() => new Promise<{ test: number }>(resolve => { complete = resolve; })) };
  const engine = new Engine(client);
  const save = engine.message({ type: 'save-key', key: 'test-only-new-key' }, optionsSender).catch(e => e);
  await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  await engine.message({ type: 'delete-key' }, optionsSender); complete({ test: 1 });
  expect(await save).toEqual(new JevError('cancelled'));
  expect((await new Storage().settings()).key).toBe('');
 });
 it('persists a rate limit reached by the connection test', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const engine = new Engine({ judge: vi.fn().mockRejectedValue(new JevError('rate-limit')) });
  const save = engine.message({ type: 'save-key', key: 'test-only-new-key' }, optionsSender).catch(e => e);
  await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  expect(await save).toEqual(new JevError('rate-limit')); expect((await new Storage().session()).paused).toBe(true);
 });
});

describe('whole-target completion', () => {
 it('does not cache or publish a long target when one fragment fails', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let calls = 0;
  const client: JevClient = { judge: vi.fn<JevClient['judge']>(async (_focus, targets) => {
   calls += 1;
   if (calls === 2) throw new JevError('invalid-response');
   return Object.fromEntries(targets.map(t => [t.id, 1]));
  }) };
  const engine = new Engine(client); const state = await enable(engine);
  await engine.message({ ...request(state), targets: [{ id: 'long', text: 'cat '.repeat(2000), context: '' }] }, contentSender);
  await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
  expect(calls).toBeGreaterThan(1); expect((await new Storage().session()).cache).toEqual([]);
  expect(fake.tabs.sendMessage.mock.calls.some(([, payload]) => (payload as { type?: string }).type === 'results')).toBe(false);
 });
});

describe('tab status contract', () => {
 it('persists generation-guarded DOM counts and returns tab intent without a key', async () => {
  const engine = new Engine(new MockJevClient()); const state = await enable(engine);
  const progress = { highlighted: 2, total: 3, analyzed: 2, pending: 0, failed: 1, error: 'auth' };
  await engine.message({ type: 'analysis-status', generation: state.generation, progress }, contentSender);
  const result = await engine.message({ type: 'get-tab-state', tabId: 1 }, contentSender) as { state: TabState };
  expect(result.state.progress).toEqual(progress); expect(result.state.intent).toBe('Jev');
  expect(JSON.stringify(result)).not.toContain('test-only');
  await expect(engine.message({ type: 'analysis-status', generation: { ...state.generation, tab: crypto.randomUUID() }, progress }, contentSender)).rejects.toThrow('cancelled');
  await engine.message({ type: 'set-intent', tabId: 1, intent: 'new focus' }, contentSender);
  const updated = await engine.message({ type: 'get-tab-state', tabId: 1 }, contentSender) as { state: TabState };
  expect(updated.state.progress).toBeUndefined();
 });
 it('rejects invalid count totals and count reports from options senders', async () => {
  const engine = new Engine(new MockJevClient()); const state = await enable(engine);
  const message = { type: 'analysis-status', generation: state.generation, progress: { highlighted: 0, total: 1, analyzed: 0, pending: 0, failed: 0 } };
  await expect(engine.message(message, contentSender)).rejects.toThrow('invalid-input');
  await expect(engine.message({ ...message, progress: { ...message.progress, pending: 1 } }, optionsSender)).rejects.toThrow('invalid-input');
 });
});

describe('document-scoped result isolation', () => {
 it.each(['results', 'error'] as const)('never sends stale %s after navigation changes the document', async outcome => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let complete!: (value: { t00000000: number }) => void;
  let fail!: (error: Error) => void;
  const client: JevClient = { judge: vi.fn(() => new Promise<{ t00000000: number }>((resolve, reject) => { complete = resolve; fail = reject; })) };
  const engine = new Engine(client); const state = await enable(engine);
  await engine.message(request(state), contentSender); await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  await engine.navigation(1, contentSender.url, true);
  if (outcome === 'results') complete({ t00000000: 1 }); else fail(new JevError('auth'));
  await flush();
  expect(fake.tabs.sendMessage.mock.calls.some(([, payload]) => ['results', 'error'].includes((payload as { type: string }).type))).toBe(false);
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'reset' }));
 });
 it('keeps current error notifications restricted to the real document', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const engine = new Engine({ judge: vi.fn().mockRejectedValue(new JevError('auth')) }); const state = await enable(engine);
  await engine.message(request(state), contentSender); await flush(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); await flush();
  expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'error', error: 'auth' }), { documentId: 'doc1' });
 });
});


