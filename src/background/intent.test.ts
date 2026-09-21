import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeChrome, contentSender } from '../../tests/chrome';
import { Engine } from './engine';
import { Storage } from './storage';
import { MockJevClient } from '../jev/client';
import { validateMessage } from './validation';
import { messageSchema } from '../shared/messages';
import type { TabState } from '../shared/types';
let fake: ReturnType<typeof fakeChrome>;
beforeEach(() => { fake = fakeChrome(); vi.stubGlobal('chrome', fake); });
afterEach(() => vi.unstubAllGlobals());
const status = async (engine: Engine, tabId = 1) => { await engine.exclusive(async () => undefined); return (await new Storage().session()).tabs[tabId] ?? null; };
const hello = (engine: Engine, sender = contentSender) => engine.message({ type: 'hello', visible: true }, sender);
it('sets tab intent, isolates tabs, updates generation and clears only that tab progress', async () => {
 const engine = new Engine(new MockJevClient());
 await hello(engine); await hello(engine, { ...contentSender, tab: { id: 2 }, documentId: 'doc2' });
 const initial = await engine.message({ type: 'set-intent', tabId: 1, intent: 'cats' }, contentSender) as TabState;
 const second = await engine.message({ type: 'set-intent', tabId: 2, intent: 'dogs' }, { ...contentSender, tab: { id: 2 }, documentId: 'doc2' }) as TabState;
 await engine.message({ type: 'analysis-status', generation: initial.generation, progress: { highlighted: 1, visible: 1, analyzed: 1, pending: 0, failed: 0 } }, contentSender);
 fake.tabs.sendMessage.mockClear();
 const changed = await engine.message({ type: 'set-intent', tabId: 1, intent: 'birds' }, contentSender) as TabState;
 expect(changed.intent).toBe('birds'); expect(changed.enabled).toBe(true);
 expect(changed.generation.tab).not.toBe(initial.generation.tab); expect(changed.progress).toBeUndefined(); expect(changed.requests).toBe(0);
 expect(await status(engine, 2)).toEqual(second);
 expect(fake.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(1, expect.objectContaining({ type: 'reset' }));
 await expect(engine.message({ type: 'visibility', generation: initial.generation, visible: true }, contentSender)).rejects.toThrow('cancelled');
});
it('preserves intent and ON across origins and worker restart, but not new or closed tabs', async () => {
 const engine = new Engine(new MockJevClient()); await hello(engine);
 await engine.message({ type: 'set-intent', tabId: 1, intent: 'semantic search' }, contentSender);
 await engine.navigation(1, 'http://arbitrary.example/path', true);
 const sender = { ...contentSender, url: 'http://arbitrary.example/path', documentId: 'new-document' };
 const arrived = await engine.message({ type: 'hello', visible: true }, sender) as TabState;
 expect(arrived.intent).toBe('semantic search'); expect(arrived.enabled).toBe(true);
 const restarted = new Engine(new MockJevClient()); expect(await status(restarted)).toEqual(arrived);
 await hello(restarted, { ...contentSender, tab: { id: 2 } }); expect((await status(restarted, 2))?.intent).toBe('');
 await restarted.message({ type: 'clear-intent', tabId: 1 }, sender);
 expect(await status(restarted)).toMatchObject({ enabled: false, intent: '' });
 await restarted.removed(1); expect(await status(restarted)).toBeNull();
 await fake.storage.session.set({ session: undefined });
 expect(await status(new Engine(new MockJevClient()), 2)).toBeNull();
});
it('rejects stale documents and cross-tab control or reads, while allowing arbitrary origins', async () => {
 const engine = new Engine(new MockJevClient()); const sender = { ...contentSender, url: 'https://arbitrary.example/edit' }; await hello(engine, sender);
 for (const message of [{ type: 'set-intent', tabId: 2, intent: 'cat' }, { type: 'clear-intent', tabId: 2 }, { type: 'get-tab-state', tabId: 2 }]) {
  await expect(engine.message(message, sender)).rejects.toThrow('invalid-input');
 }
 for (const type of ['set-intent', 'clear-intent', 'get-tab-state']) {
  const message = type === 'set-intent' ? { type, tabId: 1, intent: 'cat' } : { type, tabId: 1 };
  await expect(engine.message(message, { ...sender, documentId: 'old-document' })).rejects.toThrow('cancelled');
 }
 expect(validateMessage({ type: 'hello', visible: true }, sender, 'extension').type).toBe('hello');
 await expect(engine.message({ type: 'get-settings' }, sender)).rejects.toThrow('invalid-input');
});
it('validates intent using graphemes and rejects removed contracts', () => {
 for (const intent of ['', ' \n ', 'a'.repeat(301)]) expect(messageSchema.safeParse({ type: 'set-intent', tabId: 1, intent }).success).toBe(false);
 expect(messageSchema.safeParse({ type: 'set-intent', tabId: 1, intent: '👨‍👩‍👧‍👦'.repeat(300) }).success).toBe(true);
 for (const type of ['set-focus','set-enabled','page-status','get-status','get-key']) expect(messageSchema.safeParse({ type }).success).toBe(false);
});
it('discards v1 session and local focus without migrating intent or losing the key', async () => {
 await fake.storage.local.set({ focus: 'old global focus' });
 await fake.storage.session.set({ session: { settings: crypto.randomUUID(), tabs: {}, pending: {}, cache: [], paused: false } });
 const storage = new Storage(); expect(await storage.settings()).toEqual({ key: 'test-only', threshold: 0.6 });
 expect(await fake.storage.local.get()).not.toHaveProperty('focus');
 expect(await storage.session()).toMatchObject({ version: 2, tabs: {}, cache: [] });
});
