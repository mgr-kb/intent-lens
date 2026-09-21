import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorMessage, request, savedSchema, UiError } from './client';
import { keyError } from '../../options/validation';
afterEach(() => vi.unstubAllGlobals());
describe('UI message boundary', () => {
 it('validates responses and never displays sensitive transport exception messages', async () => {
  vi.stubGlobal('chrome', { runtime: { id: 'extension', openOptionsPage: vi.fn().mockResolvedValue(undefined), sendMessage: vi.fn().mockRejectedValue(new Error('secret body key')) } });
  await expect(request({ type: 'delete-key' }, savedSchema)).rejects.toEqual(new UiError('network'));
  expect(errorMessage(new Error('secret body key'))).not.toContain('secret');
  vi.stubGlobal('chrome', { runtime: { id: 'extension', openOptionsPage: vi.fn().mockResolvedValue(undefined), sendMessage: vi.fn().mockResolvedValue({ ok: true, data: {} }) } });
  await expect(request({ type: 'delete-key' }, savedSchema)).rejects.toEqual(new UiError('invalid-response'));
 });
 it.each(['auth', 'rate-limit', 'timeout', 'server', 'invalid-response'] as const)('maps %s to a Japanese error notice', async code => {
  vi.stubGlobal('chrome', { runtime: { id: 'extension', openOptionsPage: vi.fn().mockResolvedValue(undefined), sendMessage: vi.fn().mockResolvedValue({ ok: false, error: code }) } });
  await expect(request({ type: 'delete-key' }, savedSchema)).rejects.toEqual(new UiError(code));
  expect(errorMessage(new UiError(code))).toMatch(/[ァ-ヶ一-龠]/);
 });
 it('rejects malformed key input', () => {
  expect(keyError('abc def')).not.toBe(''); expect(keyError('test-key')).toBe('');
 });
});
