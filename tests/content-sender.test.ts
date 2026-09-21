// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
const spies = vi.hoisted(() => ({ start: vi.fn(), receive: vi.fn() }));
vi.mock('../src/content/controller', () => ({ ContentController: class { start = spies.start; receive = spies.receive; } }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('accepts only this extension background, never a tab sender', async () => {
 let listener!: chrome.runtime.MessageListener;
 vi.stubGlobal('chrome', { runtime: { id: 'extension', onMessage: { addListener: (callback: chrome.runtime.MessageListener) => { listener = callback; } } } });
 await import('../src/content/index');
 listener({ type: 'reset' }, { id: 'extension', tab: { id: 1 } }, () => undefined);
 listener({ type: 'reset' }, { id: 'other' }, () => undefined);
 expect(spies.receive).not.toHaveBeenCalled();
 listener({ type: 'reset' }, { id: 'extension' }, () => undefined);
 expect(spies.receive).toHaveBeenCalledTimes(1); expect(spies.start).toHaveBeenCalledTimes(1);
});
