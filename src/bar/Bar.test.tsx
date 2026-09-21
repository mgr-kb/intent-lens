// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Bar } from './Bar';
import type { BarMessage } from '../shared/bar';
import type { Status } from '../shared/ui/client';
const token = { tab: crypto.randomUUID(), document: 'doc', settings: crypto.randomUUID() };
let status: Status;
let send: ReturnType<typeof vi.fn<(message: BarMessage) => Promise<unknown>>>;
beforeEach(() => {
 (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL('chrome-extension://extension/bar.html?focus=1#session');
 status = { state: { intent: '', enabled: true, barOpen: true, visible: true, url: 'https://example.org', generation: token }, configured: true, paused: false, mock: true, hits: { count: 0, index: 0 } };
 send = vi.fn(async (message: BarMessage) => {
  if (message.type === 'get-tab-state') return { ok: true, data: status };
  if (message.type === 'set-intent') {
   status = { ...status, state: { ...status.state!, intent: message.intent }, hits: { count: 2, index: 0 } };
   return { ok: true, data: status.state };
  }
  return { ok: true, data: message.type === 'jump' ? { count: 2, index: 1 } : { ...status.state, intent: '', enabled: false } };
 });
 vi.stubGlobal('chrome', { runtime: { id: 'extension', openOptionsPage: vi.fn().mockResolvedValue(undefined), sendMessage: send, getURL: (path: string) => `chrome-extension://extension/${path}` } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('focuses the isolated input, searches via Enter, validates text and closes on Escape without a tabId', async () => {
 render(<Bar />); await waitFor(() => expect(screen.getByRole('status').textContent).toBe('検索意図を入力'));
 const input = screen.getByLabelText('このページで探したい内容'); expect(document.activeElement).toBe(input);
 fireEvent.keyDown(input, { key: 'Enter' }); expect(screen.getByRole('status').textContent).toBe('1〜300字で入力');
 fireEvent.change(input, { target: { value: 'cat' } }); fireEvent.keyDown(input, { key: 'Enter' });
 await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'set-intent', intent: 'cat' }));
 await act(async () => undefined);
 fireEvent.keyDown(input, { key: 'Escape' });
 await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'clear-intent' }));
 expect(send.mock.calls.every(([message]) => !('tabId' in message))).toBe(true);
});
it('restores a submitted intent, navigates with Enter/Shift+Enter and exposes a polite count', async () => {
 status = { ...status, state: { ...status.state!, intent: 'cat', progress: { total: 2, analyzed: 2, pending: 0, failed: 0, highlighted: 2 } }, hits: { count: 2, index: 0 } };
 render(<Bar />); await screen.findByText('2件'); const input = screen.getByLabelText('このページで探したい内容') as HTMLInputElement;
 expect(input.value).toBe('cat'); expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
 fireEvent.keyDown(input, { key: 'Enter' }); await screen.findByText('2件 1/2');
 expect(send).toHaveBeenCalledWith({ type: 'jump', direction: 'next' });
 fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
 await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'jump', direction: 'prev' }));
});
it('provides a permanent settings button, including for a missing production key', async () => {
 status = { ...status, configured: false, mock: false }; render(<Bar />);
 await screen.findByText('APIキー未設定');
 fireEvent.click(screen.getByRole('button', { name: '設定を開く' }));
 await act(async () => undefined);
 expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
 expect(screen.queryByText('mock')).toBeNull();
});
it('lets Escape close even while a search response is still pending', async () => {
 let release!: (value: unknown) => void;
 const normal = send.getMockImplementation()!;
 send.mockImplementation((message: BarMessage) => message.type === 'set-intent' ? new Promise(resolve => { release = resolve; }) : normal(message));
 render(<Bar />); await screen.findByText('検索意図を入力');
 const input = screen.getByLabelText('このページで探したい内容');
 fireEvent.change(input, { target: { value: 'cat' } }); fireEvent.keyDown(input, { key: 'Enter' });
 fireEvent.keyDown(input, { key: 'Escape' });
 await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'clear-intent' }));
 await act(async () => release({ ok: false, error: 'cancelled' }));
});

it('does not focus the input on recovery or automatic restoration', async () => {
 (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL('chrome-extension://extension/bar.html#session');
 render(<Bar />); await screen.findByText('検索意図を入力');
 expect(document.activeElement).not.toBe(screen.getByLabelText('このページで探したい内容'));
});

it('places permanent settings before close in the visual/tab order', async () => {
 render(<Bar />); await screen.findByText('検索意図を入力');
 expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['検索', '前へ', '次へ', '設定を開く', '検索を終了']);
 fireEvent.click(screen.getByRole('button', { name: '設定を開く' }));
 await act(async () => undefined);
 expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
});
it.each(['missing-id', 'sync-throw', 'rejection'] as const)('stops timers and all sends after context invalidation: %s', async mode => {
 vi.useFakeTimers();
 render(<Bar />); await act(async () => undefined);
 if (mode === 'missing-id') vi.stubGlobal('chrome', { runtime: { id: undefined, sendMessage: send } });
 else if (mode === 'sync-throw') send.mockImplementation(() => { throw new Error('Extension context invalidated.'); });
 else send.mockRejectedValue(new Error('Extension context invalidated.'));
 await act(async () => vi.advanceTimersByTimeAsync(1000));
 expect(screen.getByRole('status').textContent).toBe('拡張が更新されました。ページを再読み込みしてください');
 expect(vi.getTimerCount()).toBe(0);
 const calls = send.mock.calls.length;
 fireEvent.keyDown(screen.getByRole('main'), { key: 'Escape' });
 await act(async () => vi.advanceTimersByTimeAsync(5000));
 expect(send).toHaveBeenCalledTimes(calls);
 expect((document.querySelector('input') as HTMLInputElement).disabled).toBe(true);
});
it('handles context invalidation from openOptionsPage without leaking an exception', async () => {
 render(<Bar />); await screen.findByText('検索意図を入力');
 vi.mocked(chrome.runtime.openOptionsPage).mockImplementation(() => { throw new Error('Extension context invalidated.'); });
 fireEvent.click(screen.getByRole('button', { name: '設定を開く' }));
 await act(async () => undefined);
 expect(screen.getByRole('status').textContent).toContain('拡張が更新されました');
});
