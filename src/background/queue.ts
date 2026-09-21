import { CONCURRENT_MAX, DEBOUNCE_MS, QUEUE_MAX, TIMEOUT_MS } from '../shared/constants';
import { JevError, retryable, DocumentBudgetError } from '../jev/errors';
type Job = { readonly tabId: number; readonly ready: () => boolean; readonly run: (signal: AbortSignal) => Promise<unknown>; readonly resolve: (value: unknown) => void; readonly reject: (reason: unknown) => void; readonly controller: AbortController };
export class Queue {
 private waiting: readonly Job[] = [];
 private running: readonly Job[] = [];
 private timer: ReturnType<typeof setTimeout> | undefined;
 private paused = false;
 setPaused(value: boolean): void { this.paused = value; if (value) this.cancelAll('rate-limit'); else this.wake(); }
 add<T>(tabId: number, ready: () => boolean, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (this.paused) return Promise.reject(new JevError('rate-limit'));
  if (this.waiting.length >= QUEUE_MAX) return Promise.reject(new JevError('invalid-input'));
  return new Promise<T>((resolve, reject) => {
   this.waiting = [...this.waiting, { tabId, ready, run, resolve: value => resolve(value as T), reject, controller: new AbortController() }];
   this.wake();
  });
 }
 wake(): void {
  if (this.timer) clearTimeout(this.timer);
  this.timer = setTimeout(() => { this.timer = undefined; this.drain(); }, DEBOUNCE_MS);
 }
 cancel(tabId: number): void {
  const jobs = [...this.waiting, ...this.running].filter(j => j.tabId === tabId);
  this.waiting = this.waiting.filter(j => j.tabId !== tabId);
  jobs.forEach(j => { j.controller.abort(); j.reject(new JevError('cancelled')); });
 }
 cancelAll(code: 'cancelled' | 'rate-limit' = 'cancelled'): void {
  [...this.waiting, ...this.running].forEach(j => { j.controller.abort(); j.reject(new JevError(code)); });
  this.waiting = [];
 }
 private drain(): void {
  if (this.paused) return;
  while (this.running.length < CONCURRENT_MAX) {
   const job = this.waiting.find(j => j.ready());
   if (!job) return;
   this.waiting = this.waiting.filter(j => j !== job);
   this.running = [...this.running, job];
   void this.execute(job).then(job.resolve, job.reject).finally(() => {
    this.running = this.running.filter(j => j !== job); this.drain();
   });
  }
 }
 private async execute(job: Job): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
   if (job.controller.signal.aborted) throw new JevError('cancelled');
   const timeout = AbortSignal.timeout(TIMEOUT_MS);
   const signal = AbortSignal.any([job.controller.signal, timeout]);
   try { return await job.run(signal); }
   catch (error) {
    if (error instanceof JevError && error.code === 'rate-limit' && !(error instanceof DocumentBudgetError)) { this.setPaused(true); throw error; }
    if (job.controller.signal.aborted) throw new JevError('cancelled');
    const failure = timeout.aborted ? new JevError('timeout') : error;
    if (attempt || !retryable(failure) || !job.ready()) throw failure;
   }
  }
  throw new JevError('network');
 }
}
