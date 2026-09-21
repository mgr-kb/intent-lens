import { afterEach, describe, expect, it, vi } from 'vitest';
import { Queue } from './queue';
import { DEBOUNCE_MS } from '../shared/constants';
import { JevError } from '../jev/errors';
afterEach(() => vi.useRealTimers());
describe('judgement queue', () => {
 it('debounces work and restricts concurrency to two requests', async () => {
  vi.useFakeTimers(); const queue = new Queue();
  let complete: readonly (() => void)[] = [];
  const run = vi.fn(() => new Promise<void>(resolve => { complete = [...complete, resolve]; }));
  const promises = Array.from({ length: 3 }, () => queue.add(1, () => true, run));
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1); expect(run).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(run).toHaveBeenCalledTimes(2);
  complete[0]!(); await vi.advanceTimersByTimeAsync(0); expect(run).toHaveBeenCalledTimes(3);
  complete.slice(1).forEach(resolve => resolve()); await Promise.all(promises);
 });
 it('leaves hidden-tab work pending and resumes after visibility changes', async () => {
  vi.useFakeTimers(); const queue = new Queue(); let visible = false;
  const run = vi.fn().mockResolvedValue(1); const promise = queue.add(1, () => visible, run);
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); expect(run).not.toHaveBeenCalled();
  visible = true; queue.wake(); await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  await expect(promise).resolves.toBe(1);
 });
 it('retries network failures only once and never retries auth failures', async () => {
  vi.useFakeTimers();
  for (const code of ['network', 'auth'] as const) {
   const queue = new Queue(); const run = vi.fn().mockRejectedValue(new JevError(code));
   const result = queue.add(1, () => true, run).catch(e => e);
   await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
   expect(await result).toEqual(new JevError(code)); expect(run).toHaveBeenCalledTimes(code === 'network' ? 2 : 1);
  }
 });
 it('stops all new work on rate limits until explicitly resumed', async () => {
  vi.useFakeTimers(); const queue = new Queue();
  const result = queue.add(1, () => true, async () => { throw new JevError('rate-limit'); }).catch(e => e);
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); expect(await result).toEqual(new JevError('rate-limit'));
  await expect(queue.add(1, () => true, async () => 1)).rejects.toThrow('rate-limit');
  queue.setPaused(false); const resumed = queue.add(1, () => true, async () => 2);
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); expect(await resumed).toBe(2);
 });
 it('cancels waiting and inflight work on OFF', async () => {
  vi.useFakeTimers(); const queue = new Queue(); let signal: AbortSignal | undefined;
  const running = queue.add(1, () => true, async s => { signal = s; return new Promise(resolve => s.addEventListener('abort', () => resolve(0))); }).catch(e => e);
  const pending = queue.add(1, () => false, async () => 2).catch(e => e);
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); queue.cancel(1);
  expect(signal?.aborted).toBe(true); expect(await running).toEqual(new JevError('cancelled')); expect(await pending).toEqual(new JevError('cancelled'));
 });
});
