import type { JevClient } from './client';
import { API_URL, BATCH_MAX, REQUEST_CHAR_MAX, TIMEOUT_MS } from '../shared/constants';
import type { Scores, Target } from '../shared/types';
import { buildRequest, requestSize } from './request';
import { parseResponse } from './response';
import { httpError, JevError } from './errors';
export class RealJevClient implements JevClient {
 // ブラウザのfetchは正しいthisバインディングが必須（Illegal invocationを防ぐ）。
 constructor(private readonly send: typeof fetch = (...args: Parameters<typeof fetch>) => globalThis.fetch(...args)) {}
 async judge(intent: string, targets: readonly Target[], key: string, signal: AbortSignal): Promise<Scores> {
  if (!targets.length || targets.length > BATCH_MAX || requestSize(intent, targets) > REQUEST_CHAR_MAX) throw new JevError('invalid-input');
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
   const response = await this.send(API_URL, { method: 'POST', redirect: 'error', credentials: 'omit',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequest(intent, targets)), signal: AbortSignal.any([signal, timeout]) });
   if (!response.ok) throw httpError(response.status);
   let raw: unknown;
   try { raw = await response.json(); } catch { throw new JevError('invalid-response'); }
   return parseResponse(raw, targets.map(t => t.id));
  } catch (error) {
   if (signal.aborted) throw new JevError('cancelled');
   if (timeout.aborted) throw new JevError('timeout');
   if (error instanceof JevError) throw error;
   throw new JevError('network');
  }
 }
}
export { RealJevClient as Client };
