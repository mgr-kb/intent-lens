import { afterEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ toggle: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./engine', () => ({ Engine: class { toggle = calls.toggle; } }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('wires real action clicks to the selected tab without a popup or extra permissions', async () => {
 let click!: (tab: chrome.tabs.Tab) => void;
 const listener = { addListener: vi.fn() };
 vi.stubGlobal('chrome', { action: { onClicked: { addListener: (callback: typeof click) => { click = callback; } } },
  runtime: { onMessage: listener }, tabs: { onRemoved: listener, onUpdated: listener, onActivated: listener } });
 await import('./index');
 click({ id: 7 }); expect(calls.toggle).toHaveBeenCalledExactlyOnceWith(7);
 click({}); expect(calls.toggle).toHaveBeenCalledTimes(1);
});
