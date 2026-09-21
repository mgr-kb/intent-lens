// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BarHost } from '../src/content/bar-host';
import { isOwned } from '../src/content/extractor';
import { BAR_REPAIR_MS } from '../src/shared/constants';
import type { TabState } from '../src/shared/types';
let frames: readonly HTMLIFrameElement[];
let roots: readonly ShadowRoot[];
let hosts: readonly BarHost[];
const state: TabState = { enabled: true, barOpen: true, barSession: crypto.randomUUID(), intent: 'private search', visible: true, url: 'https://example.org', generation: { tab: crypto.randomUUID(), document: 'doc', settings: crypto.randomUUID() } };
beforeEach(() => {
 frames = []; roots = []; hosts = [];
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 vi.stubGlobal('chrome', { runtime: { getURL: () => 'chrome-extension://dynamic/bar.html' } });
 vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLIFrameElement) { frames = [...frames, this]; });
 const original = Element.prototype.attachShadow;
 vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) { const root = original.call(this, init); roots = [...roots, root]; return root; });
});
afterEach(() => { hosts.forEach(host => host.remove()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function make(renew?: (state: TabState) => Promise<TabState | undefined>) { const host = new BarHost(document, renew); hosts = [...hosts, host]; return host; }
async function settle() { for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setImmediate(resolve)); }
it('hides the iframe URL in a closed root and scopes all styles to an owned host', () => {
 const bar = make(); bar.sync(state); bar.sync(state);
 const host = roots[0]!.host as HTMLElement;
 expect(host.shadowRoot).toBeNull(); expect(document.querySelector('iframe')).toBeNull();
 expect(host.style.getPropertyValue('all')).toBe('initial'); expect(host.style.position).toBe('fixed'); expect(isOwned(host)).toBe(true);
 expect(HTMLIFrameElement.prototype).toBeTruthy(); expect(frames).toHaveLength(1);
 expect(document.documentElement.innerHTML).not.toContain(state.barSession); expect(document.documentElement.innerHTML).not.toContain(state.intent);
 bar.sync({ ...state, barOpen: false }); expect(host.isConnected).toBe(false);
});
it('rate-limits style repairs, ignores its own changes, and cancels repairs on close', async () => {
 const renew = vi.fn(); const bar = make(renew); bar.sync(state); const host = roots[0]!.host as HTMLElement;
 for (let i = 0; i < 10; i++) host.style.display = 'none';
 host.setAttribute('inert', ''); await settle();
 await vi.advanceTimersByTimeAsync(BAR_REPAIR_MS - 1); expect(host.style.display).toBe('none');
 await vi.advanceTimersByTimeAsync(1); expect(host.style.display).toBe('block'); expect(host.hasAttribute('inert')).toBe(false);
 await settle(); await vi.advanceTimersByTimeAsync(BAR_REPAIR_MS * 3); expect(renew).not.toHaveBeenCalled(); expect(frames).toHaveLength(1);
 host.remove(); await settle(); bar.remove(); await vi.advanceTimersByTimeAsync(BAR_REPAIR_MS); expect(renew).not.toHaveBeenCalled();
});
it('destroys removed frames before rotating the session, including immediate reinsertion', async () => {
 const renew = vi.fn(async () => { expect(frames[0]!.isConnected).toBe(false); return { ...state, barSession: crypto.randomUUID() }; });
 const bar = make(renew); bar.sync(state, true);
 const focus = vi.fn(); Object.defineProperty(frames[0]!, 'contentWindow', { configurable: true, value: { focus } });
 frames[0]!.dispatchEvent(new Event('load')); expect(focus).toHaveBeenCalledOnce();
 const host = roots[0]!.host; host.remove(); document.documentElement.append(host); await settle();
 await vi.advanceTimersByTimeAsync(BAR_REPAIR_MS); await settle();
 expect(renew).toHaveBeenCalledOnce(); expect(frames).toHaveLength(2);
 Object.defineProperty(frames[1]!, 'contentWindow', { configurable: true, value: { focus } });
 frames[1]!.dispatchEvent(new Event('load')); expect(focus).toHaveBeenCalledTimes(1);
 expect(roots[1]!.host.shadowRoot).toBeNull();
});
it('does not recreate a closed bar after a delayed renewal response', async () => {
 let finish!: (value: TabState) => void;
 const bar = make(() => new Promise(resolve => { finish = resolve; })); bar.sync(state);
 roots[0]!.host.remove(); await settle(); await vi.advanceTimersByTimeAsync(BAR_REPAIR_MS);
 bar.remove(); finish({ ...state, barSession: crypto.randomUUID() }); await settle();
 expect(frames).toHaveLength(1); expect(roots[0]!.host.isConnected).toBe(false);
});
it('rotates the session after pagehide-style removal before BFCache restoration', async () => {
 const renew = vi.fn(async () => ({ ...state, barSession: crypto.randomUUID(), barDocument: undefined }));
 const bar = make(renew); bar.sync({ ...state, barDocument: 'old-bar' }); bar.remove();
 bar.sync({ ...state, barDocument: 'old-bar' }); await settle();
 expect(renew).toHaveBeenCalledOnce(); expect(frames).toHaveLength(2);
});
