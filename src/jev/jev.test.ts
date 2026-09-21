import { describe, expect, it, vi } from 'vitest';
import { batches, buildRequest, requestSize, splitTarget } from './request';
import { parseResponse } from './response';
import { httpError, retryable, JevError } from './errors';
import { MockJevClient, RealJevClient } from './client';
import { API_URL, REQUEST_CHAR_MAX, TEXT_MAX, PARTS_PER_TARGET_MAX } from '../shared/constants';
const target = { id: 't3', text: 'AI失敗例', context: '見出し' };
describe('Jev contract', () => {
 it('explicitly identifies each target in instructions and selects only allowed fields', () => {
  const request = buildRequest('失敗例', [{ ...target, url: 'https://example.com/?secret=1' } as typeof target]);
  expect(request.questions.t3?.instructions).toContain('対象IDがt3');
  expect(request.state.targets).toEqual([{ id: target.id, text: target.text }]);
  expect(request.state.intent).toBe('失敗例');
  expect(JSON.stringify(request)).not.toContain('見出し');
  expect(JSON.stringify(request)).not.toContain('secret');
 });
 it('splits long text losslessly and bounds every full wire request and batch', () => {
  const text = '👨‍👩‍👧‍👦"日本語\n'.repeat(450);
  const groups = batches('日本語', [{ ...target, text }]);
  expect(groups.flat().map(p => p.target.text).join('')).toBe(text);
  expect(groups.length).toBeGreaterThan(1);
  groups.forEach(group => { expect(group.length).toBeLessThanOrEqual(8); expect(requestSize('日本語', group.map(p => p.target))).toBeLessThanOrEqual(REQUEST_CHAR_MAX); });
 });
 it('requires all answers and valid probabilities while allowing optional metadata', () => {
  const answer = { type: 'noul', noul: 0.8, extra: 'allowed' };
  expect(parseResponse({ model: 'jev-latest', usage: { input_tokens: 1 }, answers: { t3: answer } }, ['t3'])).toEqual({ t3: 0.8 });
  expect(parseResponse({ answers: { t3: answer } }, ['t3'])).toEqual({ t3: 0.8 });
  for (const raw of [{ answers: {} }, { answers: { t3: { ...answer, noul: 2 } } }, { answers: { t3: { noul: 0 } } }]) expect(() => parseResponse(raw, ['t3'])).toThrow('invalid-response');
 });
 it.each([[401, 'auth', false], [403, 'auth', false], [422, 'invalid-input', false], [429, 'rate-limit', false], [529, 'server', true]] as const)('classifies HTTP %s with bounded retry policy', (status, code, retry) => {
  expect(httpError(status).code).toBe(code); expect(retryable(httpError(status))).toBe(retry);
 });
 it('uses a fixed endpoint and refuses redirects in real transport', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ answers: { t3: { type: 'noul', noul: 1, model: 'jev-latest', usage: {} } } })));
  expect(await new RealJevClient(send).judge('AI', [target], 'test-only', new AbortController().signal)).toEqual({ t3: 1 });
  expect(send).toHaveBeenCalledWith(API_URL, expect.objectContaining({ redirect: 'error', method: 'POST' }));
 });
 it('treats malformed JSON and network rejection as failures', async () => {
  const signal = new AbortController().signal;
  await expect(new RealJevClient(vi.fn().mockResolvedValue(new Response('bad'))).judge('AI', [target], 'test', signal)).rejects.toThrow('invalid-response');
  await expect(new RealJevClient(vi.fn().mockRejectedValue(new Error('private text'))).judge('AI', [target], 'test', signal)).rejects.toEqual(new JevError('network'));
 });
 it('returns deterministic mock probabilities based on body vocabulary only', async () => {
  const client = new MockJevClient(); const signal = new AbortController().signal;
  const targets = [{ id: 'a', text: 'cat dog', context: '' }, { id: 'b', text: 'bird', context: 'cat dog' }];
  expect(await client.judge('cat dog', targets, '', signal)).toEqual({ a: 1, b: 0 });
  expect(await client.judge('cat dog', targets, '', signal)).toEqual({ a: 1, b: 0 });
 });
});

describe('real transport cancellation', () => {
 it('aborts a hung request at its timeout and classifies it distinctly', async () => {
  let expired = false;
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => controller.signal);
  const send = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
   init?.signal?.addEventListener('abort', () => { expired = true; reject(new Error('aborted')); });
  }));
  try {
   const request = new RealJevClient(send).judge('AI', [target], 'test', new AbortController().signal);
   controller.abort(); await expect(request).rejects.toThrow('timeout'); expect(expired).toBe(true);
  } finally { timeout.mockRestore(); }
 });
});


describe('bounded linear target splitting', () => {
 it('enforces text and part limits without returning a truncated result', () => {
  expect(() => splitTarget('intent', { ...target, text: 'x'.repeat(TEXT_MAX + 1) })).toThrow('invalid-input');
  const parts = splitTarget('intent', { ...target, text: '\0'.repeat(2000) });
  expect(parts).toHaveLength(PARTS_PER_TARGET_MAX);
  expect(parts.map(p => p.target.text).join('')).toBe('\0'.repeat(2000));
  expect(() => splitTarget('intent', { ...target, text: '\0'.repeat(3000) })).toThrow('invalid-input');
 });
 it('serializes overhead once instead of repeatedly stringifying candidate texts', () => {
  const stringify = vi.spyOn(JSON, 'stringify');
  const text = ('"\\\n\ud800😀').repeat(600);
  const parts = splitTarget('intent', { ...target, text });
  expect(stringify).toHaveBeenCalledTimes(1); stringify.mockRestore();
  expect(parts.map(p => p.target.text).join('')).toBe(text);
  parts.forEach(p => expect(requestSize('intent', [p.target])).toBeLessThanOrEqual(REQUEST_CHAR_MAX));
 });
});

describe('browser fetch receiver regression', () => {
 it('keeps the default transport independent of its caller and delegates arguments to global fetch', async () => {
  const native = vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown, ..._args: Parameters<typeof fetch>) {
   if (this !== globalThis) throw new TypeError('Illegal invocation');
   return Promise.resolve(new Response(JSON.stringify({ answers: { t3: { type: 'noul', noul: 1 } } })));
  });
  try {
   const client = new RealJevClient();
   const send = (client as unknown as { readonly send: typeof fetch }).send;
   const init: RequestInit = { method: 'POST', body: 'test-only' };
   expect((await send(API_URL, init)).status).toBe(200);
   expect((await send.call(client, API_URL, init)).status).toBe(200);
   expect(native).toHaveBeenNthCalledWith(1, API_URL, init);
   expect(native).toHaveBeenNthCalledWith(2, API_URL, init);
   await expect(client.judge('AI', [target], 'test-only', new AbortController().signal)).resolves.toEqual({ t3: 1 });
   expect(native.mock.contexts).toEqual([globalThis, globalThis, globalThis]);
  } finally { native.mockRestore(); }
 });
 it('reports browser HTTP 401 as auth instead of masking an illegal receiver as network', async () => {
  const native = vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown) {
   if (this !== globalThis) throw new TypeError('Illegal invocation');
   return Promise.resolve(new Response(null, { status: 401 }));
  });
  try {
   await expect(new RealJevClient().judge('AI', [target], 'test-only', new AbortController().signal)).rejects.toEqual(new JevError('auth'));
   expect(native.mock.contexts).toEqual([globalThis]);
  } finally { native.mockRestore(); }
 });
});
