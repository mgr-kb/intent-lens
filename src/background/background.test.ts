import { describe, expect, it } from 'vitest';
import { cacheKey, lruGet, lruPut, type CacheEntries } from './cache';
import { canApply, navigate } from './state';
import { validateMessage } from './validation';
const token = { tab: crypto.randomUUID(), document: 'doc1', settings: crypto.randomUUID() };
const state = { ...navigate(undefined, 'https://x.com/home', 'doc1', token.settings), enabled: true, intent: 'cat', generation: token };
describe('background boundaries', () => {
 it('hashes each cache input independently but ignores target identifier', async () => {
  const t = { id: 't1', text: 'text', context: '' };
  const key = await cacheKey(t, 'focus');
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(await cacheKey({ ...t, id: 'other' }, 'focus')).toBe(key);
  for (const other of [await cacheKey({ ...t, text: 'new' }, 'focus'), await cacheKey(t, 'new'), await cacheKey(t, 'focus', 'new'), await cacheKey(t, 'focus', undefined, 'v2')]) expect(other).not.toBe(key);
 });
 it('evicts the least recently accessed item without mutating previous entries', () => {
  const start: CacheEntries = Object.freeze([['a', 0], ['b', 1]]);
  const hit = lruGet(start, 'a');
  expect(hit.value).toBe(0);
  expect(lruPut(hit.entries, 'c', 0.9, 2)).toEqual([['a', 0], ['c', 0.9]]);
  expect(start).toEqual([['a', 0], ['b', 1]]);
  expect(lruGet(start, 'missing').value).toBeUndefined();
 });
 it('rejects results after OFF or changes of tab, document and settings generation', () => {
  expect(canApply(state, token)).toBe(true);
  expect(canApply({ ...state, enabled: false }, token)).toBe(false);
  for (const field of ['tab', 'document', 'settings'] as const) expect(canApply(state, { ...token, [field]: 'new' })).toBe(false);
 });
 it('preserves ON across origins without page-type restrictions', () => {
  expect(navigate(state, 'https://x.com/user/status/1', 'doc2', token.settings).enabled).toBe(true);
  expect(navigate(state, 'https://twitter.com/home', 'doc2', token.settings).enabled).toBe(true);
  const dm = navigate(state, 'https://x.com/messages', 'doc2', token.settings);
  expect(dm.enabled).toBe(true); expect(canApply(dm, dm.generation)).toBe(true);
  expect(navigate(undefined, 'https://x.com/home', 'new', token.settings).enabled).toBe(false);
 });
 it('allows key writes only from the exact options page of this extension', () => {
  const sender = { id: 'extension', url: 'chrome-extension://extension/options.html' };
  expect(validateMessage({ type: 'save-key', key: 'test' }, sender, 'extension').type).toBe('save-key');
  for (const url of ['https://x.com/home', 'chrome-extension://extension/popup.html', 'chrome-extension://evil/options.html']) expect(() => validateMessage({ type: 'delete-key' }, { ...sender, url }, 'extension')).toThrow();
 });
 it('rejects foreign senders, subframes, missing tabs and stale documents', () => {
  const sender = { id: 'extension', url: 'https://x.com/home', tab: { id: 1 }, frameId: 0, documentId: 'doc', documentLifecycle: 'active' };
  expect(validateMessage({ type: 'hello', visible: true }, sender, 'extension').type).toBe('hello');
  for (const patch of [{ url: undefined }, { id: 'foreign' }, { frameId: 1 }, { tab: undefined }, { documentLifecycle: 'prerender' }, { documentId: undefined }]) expect(() => validateMessage({ type: 'hello', visible: true }, { ...sender, ...patch }, 'extension')).toThrow();
 });
});

