import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Engine } from './engine';
import { validateMessage } from './validation';
import { MockJevClient } from '../jev/client';
import type { TabState } from '../shared/types';
import { fakeChrome, contentSender, optionsSender } from '../../tests/chrome';
let fake: ReturnType<typeof fakeChrome>;
beforeEach(() => { fake = fakeChrome(); vi.stubGlobal('chrome', fake); });
afterEach(() => vi.unstubAllGlobals());
async function open(engine: Engine) {
 const state = await engine.message({ type: 'hello', visible: true }, contentSender) as TabState;
 return await engine.message({ type: 'toggle-bar', generation: state.generation }, contentSender) as TabState;
}
const bar = (state: TabState) => ({ ...contentSender, frameId: 3, documentId: 'bar-document', url: `chrome-extension://extension/bar.html#${state.barSession}` });
it('takes bar tab ID only from Chrome and rejects all non-bar messages and claimed tab IDs', async () => {
 const engine = new Engine(new MockJevClient()); const state = await open(engine); const sender = bar(state);
 expect(validateMessage({ type: 'set-intent', intent: 'cat' }, sender, 'extension')).toEqual({ type: 'set-intent', intent: 'cat', tabId: 1 });
 for (const raw of [{ type: 'save-key', key: 'test-only-secret' }, { type: 'delete-key' }, { type: 'get-settings' }, { type: 'hello', visible: true }, { type: 'toggle-bar', generation: state.generation }, { type: 'get-tab-state', tabId: 2 }]) {
  await expect(engine.message(raw, sender)).rejects.toThrow('invalid-input');
 }
 for (const patch of [{ tab: undefined }, { tab: { id: -1 } }, { frameId: 0 }, { documentId: undefined }, { documentLifecycle: 'prerender' }, { id: 'other' }, { url: 'https://example.org/bar.html' }]) {
  await expect(engine.message({ type: 'get-tab-state' }, { ...sender, ...patch })).rejects.toThrow('invalid-input');
 }
 expect(fake.storage.local.set).not.toHaveBeenCalled();
});
it('binds iframe operations to a live bar session, supports navigation restoration, and closes by clearing intent', async () => {
 const engine = new Engine(new MockJevClient()); const initial = await open(engine); const sender = bar(initial);
 expect(initial).toMatchObject({ enabled: true, barOpen: true, intent: '' });
 const searched = await engine.message({ type: 'set-intent', intent: 'cat' }, sender) as TabState;
 expect(searched.barSession).toBe(initial.barSession);
 fake.tabs.sendMessage.mockResolvedValue({ count: 2, index: 1 } as never);
 expect(await engine.message({ type: 'jump', direction: 'next' }, sender)).toEqual({ count: 2, index: 1 });
 expect(fake.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'jump', direction: 'next', generation: searched.generation }, { documentId: 'doc1' });
 const status = await engine.message({ type: 'get-tab-state' }, sender);
 expect(JSON.stringify(status)).not.toContain('test-only');
 await engine.navigation(1, 'https://second.example/', true);
 await expect(engine.message({ type: 'clear-intent' }, sender)).rejects.toThrow('cancelled');
 const arrived = await engine.message({ type: 'hello', visible: true }, { ...contentSender, url: 'https://second.example/', documentId: 'new-document' }) as TabState;
 expect(arrived).toMatchObject({ intent: 'cat', enabled: true, barOpen: true });
 const cleared = await engine.message({ type: 'clear-intent' }, bar(arrived)) as TabState;
 expect(cleared).toMatchObject({ intent: '', enabled: false, barOpen: false });
 await expect(engine.message({ type: 'set-intent', intent: 'cat' }, bar(arrived))).rejects.toThrow('cancelled');
});
it('sends the action toggle only to the selected tab and requires top-frame generation for its reply', async () => {
 const engine = new Engine(new MockJevClient()); const state = await open(engine);
 await engine.toggle(1); expect(fake.tabs.sendMessage).toHaveBeenLastCalledWith(1, { type: 'toggle' });
 await expect(engine.message({ type: 'toggle-bar', generation: state.generation }, optionsSender)).rejects.toThrow('invalid-input');
 await expect(engine.message({ type: 'toggle-bar', generation: { ...state.generation, tab: crypto.randomUUID() } }, contentSender)).rejects.toThrow('cancelled');
 const closed = await engine.message({ type: 'toggle-bar', generation: state.generation }, contentSender) as TabState;
 expect(closed.barOpen).toBe(false); expect(closed.intent).toBe('');
});
it('recognizes a dynamic resource origin without accepting an arbitrary extension origin', async () => {
 vi.stubGlobal('chrome', { ...fake, runtime: { ...fake.runtime, getURL: () => 'chrome-extension://dynamic-id/bar.html' } });
 const state = await open(new Engine(new MockJevClient()));
 expect(validateMessage({ type: 'get-tab-state' }, { ...bar(state), url: `chrome-extension://dynamic-id/bar.html#${state.barSession}` }, 'extension').type).toBe('get-tab-state');
 expect(() => validateMessage({ type: 'get-tab-state' }, { ...bar(state), url: `chrome-extension://foreign/bar.html#${state.barSession}` }, 'extension')).toThrow('invalid-input');
});
it('binds exactly one bar document across SW restart and rejects a clone until trusted recreation rotates the session', async () => {
 const first = new Engine(new MockJevClient()); const state = await open(first); const sender = bar(state);
 await first.message({ type: 'get-tab-state' }, sender);
 const engine = new Engine(new MockJevClient());
 const clone = { ...sender, documentId: 'cloned-document', frameId: 4 };
 for (const message of [{ type: 'get-tab-state' }, { type: 'set-intent', intent: 'hijack' }, { type: 'clear-intent' }]) await expect(engine.message(message, clone)).rejects.toThrow('cancelled');
 await expect(engine.message({ type: 'renew-bar', generation: state.generation, session: state.barSession }, clone)).rejects.toThrow('invalid-input');
 const renewed = await engine.message({ type: 'renew-bar', generation: state.generation, session: state.barSession }, contentSender) as TabState;
 expect(renewed.barSession).not.toBe(state.barSession); expect(renewed.barDocument).toBeUndefined();
 await expect(engine.message({ type: 'get-tab-state' }, sender)).rejects.toThrow('cancelled');
 await engine.message({ type: 'get-tab-state' }, { ...bar(renewed), documentId: 'recreated-document' });
 await expect(engine.message({ type: 'get-tab-state' }, bar(renewed))).rejects.toThrow('cancelled');
});
it('rejects options-page tab controls while keeping only key settings access', async () => {
 const engine = new Engine(new MockJevClient()); await open(engine);
 for (const message of [{ type: 'set-intent', tabId: 1, intent: 'cat' }, { type: 'get-tab-state', tabId: 1 }, { type: 'clear-intent', tabId: 1 }, { type: 'jump', tabId: 1, direction: 'next' }]) {
  await expect(engine.message(message, optionsSender)).rejects.toThrow('invalid-input');
 }
 expect(await engine.message({ type: 'get-settings' }, optionsSender)).toMatchObject({ keyConfigured: true });
});
