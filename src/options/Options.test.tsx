// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Options } from './Options';
import type { Message } from '../shared/messages';
let send: ReturnType<typeof vi.fn<(message: Message) => Promise<unknown>>>;
beforeEach(() => {
 send = vi.fn(async (message: Message) => message.type === 'get-settings' ?
  { ok: true, data: { threshold: 0.6, keyConfigured: false, mock: false } } : { ok: true, data: { ok: true } });
 vi.stubGlobal('chrome', { runtime: { id: 'extension', openOptionsPage: vi.fn().mockResolvedValue(undefined), sendMessage: send } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function ready() { render(<Options />); await waitFor(() => expect(screen.getByRole('status').textContent).toBe('')); }
describe('options settings UI', () => {
 it('offers key and threshold settings and describes tab-local intent transmission', async () => {
  await ready(); expect(document.querySelector('textarea')).toBeNull();
  expect(screen.getByText('検索中のタブの表示テキストと検索意図をJev APIへ送信します。')).toBeTruthy();
  expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'get-settings' });
 });
 it('discloses that the page can observe rendered highlights', async () => {
  await ready();
  expect(screen.getByText('強調は閲覧中のページ上に描画されるため、そのサイトで動作するスクリプトから判定結果を観測される可能性があります')).toBeTruthy();
 });
 it('clears the password immediately after dispatch even when the connection fails', async () => {
  let resolve!: (result: unknown) => void;
  send.mockImplementation(async message => message.type === 'get-settings' ? { ok: true, data: { threshold: 0.6, keyConfigured: false, mock: false } } : new Promise(done => { resolve = done; }));
  await ready(); const input = screen.getByLabelText('APIキー') as HTMLInputElement;
  expect(input.type).toBe('password'); expect(input.autocomplete).toBe('off');
  fireEvent.change(input, { target: { value: 'test-only-key' } }); fireEvent.click(screen.getByRole('button', { name: '保存して接続' }));
  expect(send).toHaveBeenCalledWith({ type: 'save-key', key: 'test-only-key' }); expect(input.value).toBe('');
  await act(async () => resolve({ ok: false, error: 'auth' }));
  expect(screen.getByRole('status').textContent).toContain('認証エラー'); expect(input.value).toBe('');
 });
 it('replaces successful key entry with a configured indicator and an empty change field', async () => {
  await ready(); fireEvent.change(screen.getByLabelText('APIキー'), { target: { value: 'test-only' } });
  fireEvent.click(screen.getByRole('button', { name: '保存して接続' })); await screen.findByText('APIキー設定済み');
  expect(screen.queryByLabelText('APIキー')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '変更' }));
  const changed = screen.getByLabelText('新しいAPIキー') as HTMLInputElement;
  expect(changed.value).toBe(''); expect(document.activeElement).toBe(changed);
 });
 it('confirms deletion in its own UI, focuses confirmation, and restores cancel focus', async () => {
  send.mockImplementation(async message => message.type === 'get-settings' ? { ok: true, data: { threshold: 0.6, keyConfigured: true, mock: false } } : { ok: true, data: { ok: true } });
  await ready(); const user = userEvent.setup(); const button = screen.getByRole('button', { name: '削除' });
  await user.click(button); expect(document.activeElement).toBe(screen.getByRole('group', { name: 'APIキーを削除しますか？' }));
  expect(send.mock.calls.some(([m]) => m.type === 'delete-key')).toBe(false);
  await user.keyboard('{Escape}'); expect(document.activeElement).toBe(button); expect(screen.queryByRole('group')).toBeNull();
  await user.click(button); await user.click(screen.getByRole('button', { name: '削除する' }));
  await screen.findByText('APIキーを削除しました。'); expect(send).toHaveBeenCalledWith({ type: 'delete-key' });
  expect(screen.queryByText('APIキー設定済み')).toBeNull();
 });
 it('shows mock mode, persistent explanations and a polite operation status', async () => {
  send.mockResolvedValue({ ok: true, data: { threshold: 0.6, keyConfigured: false, mock: true } }); await ready();
  expect(screen.getByText('モックモードです。実APIには接続しません。')).toBeTruthy();
  expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  expect(screen.getByText('暗号化された専用保管庫への保存ではありません。')).toBeTruthy();
 });
});

it('discloses cross-site continuation and page observation/spoofing limits', async () => {
 await ready();
 expect(screen.getByText('検索を終了するまで、同じタブで別サイトへ移動しても、そのページの表示テキストを送信し続けます')).toBeTruthy();
 expect(screen.getByText('ページ側スクリプトはバーの存在・位置や強調結果を観測でき、偽装UIの設置を完全には防げません')).toBeTruthy();
});
