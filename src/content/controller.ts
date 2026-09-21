import { contextInvalidated } from '../shared/context';
import { BarHost } from './bar-host';
import { validIntent } from '../shared/text';
import type { Hits } from '../shared/bar';
import { z } from 'zod';
import { extract, isOwned, type ExtractedTarget } from './extractor';
import { CONTENT_RESULT_TIMEOUT_MS, CONTENT_RESYNC_MS, DEBOUNCE_MS, MESSAGE_TARGET_MAX } from '../shared/constants';
import { tabStateSchema, workerEventSchema, type Message, type WorkerEvent } from '../shared/messages';
import { errorCodeSchema } from '../shared/progress';
import { summarizeProgress, type Decision } from './progress';
import type { ErrorCode, TabState } from '../shared/types';
import { sameGeneration } from '../shared/generation';
import { Highlighter } from './highlight';
import { snapshot, stillMatches, type Snapshot } from './snapshot';
import { watchNavigation } from './lifecycle';
export type Transport = (message: Message) => Promise<unknown>;
interface Pending { readonly id: string; readonly targets: readonly Snapshot[]; readonly timer: ReturnType<typeof setTimeout> }
const helloResponse = z.object({ ok: z.literal(true), data: tabStateSchema });
const cancelledResponse = z.object({ ok: z.literal(false), error: z.literal('cancelled') });
const acceptedResponse = z.object({ ok: z.literal(true), data: z.object({ accepted: z.literal(true) }) });
export class ContentController {
 private readonly bar: BarHost;
 private readonly highlight: Highlighter;
 private readonly intersection: IntersectionObserver;
 private readonly mutation: MutationObserver;
 private state: TabState | undefined;
 private records: readonly Snapshot[] = [];
 private visible: readonly Element[] = [];
 private decisions: Readonly<Record<string, Decision>> = {};
 private requests: readonly Pending[] = [];
 private epoch = 0;
 private scanVersion = 0;
 private url: string;
 private scanTimer: ReturnType<typeof setTimeout> | undefined;
 private sendTimer: ReturnType<typeof setTimeout> | undefined;
 private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
 private unwatch: (() => void) | undefined;
 private lastProgress = '';
 private destroyed = false;
 private focusBar = false;
 constructor(private readonly root: Document, private readonly win: Window, private readonly send: Transport) {
  this.bar = new BarHost(root, state => this.renewBar(state)); this.url = win.location.href; this.highlight = new Highlighter(root);
  this.intersection = new IntersectionObserver(entries => this.intersect(entries));
  this.mutation = new MutationObserver(records => this.mutated(records));
 }
 start(): void {
  this.unwatch = watchNavigation(this.win, () => { void this.synchronize(); }, () => this.checkContext());
  this.root.addEventListener('visibilitychange', this.visibility);
  this.win.addEventListener('pagehide', this.pagehide);
  this.win.addEventListener('pageshow', this.pageshow);
  void this.synchronize();
 }
 private active(): boolean {
  return !this.destroyed && !!this.state?.enabled && validIntent(this.state.intent) && this.url === this.win.location.href;
 }
 private clear(): void {
  this.epoch += 1; this.scanVersion += 1;
  if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
  this.recoveryTimer = undefined;
  if (this.scanTimer) clearTimeout(this.scanTimer);
  if (this.sendTimer) clearTimeout(this.sendTimer);
  this.requests.forEach(request => clearTimeout(request.timer));
  this.requests = []; this.decisions = {}; this.records = []; this.visible = [];
  this.intersection.disconnect(); this.mutation.disconnect(); this.highlight.clear(); this.lastProgress = '';
 }
 private checkContext(error?: unknown): boolean {
  if (!this.destroyed && contextInvalidated(error)) this.destroy();
  return !this.destroyed;
 }
 private async transmit(message: Message): Promise<unknown> {
  if (!this.checkContext()) return undefined;
  const epoch = this.epoch;
  let response: unknown;
  try { response = await this.send(message); }
  catch (error) { if (!this.checkContext(error)) return undefined; throw error; }
  if (!this.checkContext()) return undefined;
  if (epoch === this.epoch && !this.destroyed && cancelledResponse.safeParse(response).success) {
   // Drop stale work now, coalesce concurrent failures, and retry at most once per second.
   this.clear(); this.state = undefined;
   this.recoveryTimer = setTimeout(() => { this.recoveryTimer = undefined; void this.synchronize(); }, CONTENT_RESYNC_MS);
  }
  return response;
 }
 async synchronize(): Promise<void> {
  if (this.destroyed) return;
  this.clear(); this.state = undefined; this.url = this.win.location.href;
  const epoch = this.epoch;
  try {
   const response = helloResponse.safeParse(await this.transmit({ type: 'hello', visible: !this.root.hidden }));
   if (!response.success || epoch !== this.epoch || this.destroyed || this.url !== this.win.location.href) return;
   this.state = response.data.data; this.bar.sync(this.state, this.focusBar); this.focusBar = false;
   this.observe();
  } catch (error) { this.checkContext(error); }
 }
 private observe(): void {
  if (!this.active()) return;
  this.mutation.observe(this.root.documentElement, { subtree: true, childList: true, characterData: true,
   attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class', 'id', 'href', 'role', 'contenteditable', 'hidden', 'aria-hidden', 'inert'] });
  this.requestScan();
 }
 private readonly visibility = (): void => {
  if (!this.state || this.url !== this.win.location.href) {
   if (!this.recoveryTimer || this.url !== this.win.location.href) void this.synchronize();
   return;
  }
  const state = this.state; const epoch = this.epoch;
  void this.transmit({ type: 'visibility', generation: state.generation, visible: !this.root.hidden })
   .then(response => {
    if (epoch !== this.epoch || this.destroyed) return;
    if (!z.object({ ok: z.literal(true) }).safeParse(response).success) { void this.synchronize(); return; }
    if (!this.root.hidden) this.scheduleSend();
   }).catch(() => { if (epoch === this.epoch) { this.clear(); this.state = undefined; } });
 };
 private readonly pagehide = (): void => { this.clear(); this.bar.remove(); this.state = undefined; };
 private readonly pageshow = (event: PageTransitionEvent): void => { if (event.persisted) void this.synchronize(); };
 private mutated(records: readonly MutationRecord[]): void {
  if (this.url !== this.win.location.href) { void this.synchronize(); return; }
  if (!records.some(record => !this.highlight.isOwnMutation(record) && !(record.target instanceof Element && isOwned(record.target))) || !this.active()) return;
  this.scanVersion += 1;
  if (this.scanTimer) clearTimeout(this.scanTimer);
  if (this.sendTimer) clearTimeout(this.sendTimer);
  this.sendTimer = undefined;
  this.scanTimer = setTimeout(() => { this.requestScan(); }, DEBOUNCE_MS);
 }
 private requestScan(): void {
  void this.scan().catch(() => { this.clear(); this.state = undefined; });
 }
 async scan(): Promise<void> {
  if (this.scanTimer) { clearTimeout(this.scanTimer); this.scanTimer = undefined; }
  if (!this.active()) return;
  const version = ++this.scanVersion; const epoch = this.epoch;
  const current = extract(this.root);
  const snapshots = await Promise.all(current.map(snapshot));
  if (version !== this.scanVersion || epoch !== this.epoch || !this.active()) return;
  this.records.filter(old => !snapshots.some(next => next.element === old.element && next.fingerprint === old.fingerprint && next.target.id === old.target.id))
   .forEach(old => { this.highlight.remove(old.element); this.intersection.unobserve(old.element); });
  const previous = this.records; this.records = snapshots;
  this.visible = this.visible.filter(element => snapshots.some(next => next.element === element));
  snapshots.forEach(next => {
   if (!previous.some(old => old.element === next.element && old.fingerprint === next.fingerprint && old.target.id === next.target.id)) this.intersection.observe(next.element);
  });
  this.applyKnown(current); this.scheduleSend();
 }
 private intersect(entries: readonly IntersectionObserverEntry[]): void {
  entries.forEach(entry => {
   this.visible = this.visible.filter(element => element !== entry.target);
   if (entry.isIntersecting) this.visible = [...this.visible, entry.target];
  });
  this.applyKnown(); this.scheduleSend();
 }
 private scheduleSend(): void {
  if (!this.active() || this.root.hidden) return;
  if (this.sendTimer) clearTimeout(this.sendTimer);
  this.sendTimer = setTimeout(() => { this.flush(); }, DEBOUNCE_MS);
 }
 private flush(): void {
  if (!this.active() || this.root.hidden || !this.state) return;
  const current = extract(this.root);
  const candidates = this.records.filter(saved => this.visible.includes(saved.element) && !this.decisions[saved.fingerprint] && stillMatches(saved, current.find(t => t.element === saved.element)));
  const targets = candidates.reduce<readonly Snapshot[]>((all, saved) =>
   all.length < MESSAGE_TARGET_MAX && !all.some(t => t.fingerprint === saved.fingerprint || t.target.id === saved.target.id) ? [...all, saved] : all, []);
  if (!targets.length) return;
  const id = crypto.randomUUID(); const epoch = this.epoch;
  this.decisions = { ...this.decisions, ...Object.fromEntries(targets.map(t => [t.fingerprint, { kind: 'pending', requestId: id } as const])) };
  const timer = setTimeout(() => { this.fail(id, 'timeout'); }, CONTENT_RESULT_TIMEOUT_MS);
  this.requests = [...this.requests, { id, targets, timer }];
  void this.transmit({ type: 'analyze', requestId: id, generation: this.state.generation, targets: targets.map(t => ({ ...t.target, context: '' as const })) })
   .then(response => {
    if (epoch === this.epoch && !acceptedResponse.safeParse(response).success) {
     const error = z.object({ error: errorCodeSchema }).safeParse(response);
     this.fail(id, error.success ? error.data.error : 'network');
    }
   })
   .catch(() => { if (epoch === this.epoch) this.fail(id); });
  this.reportProgress(current); this.scheduleSend();
 }
 private fail(id: string, error: ErrorCode = 'network'): void {
  const request = this.requests.find(r => r.id === id); if (!request) return;
  clearTimeout(request.timer); this.requests = this.requests.filter(r => r.id !== id);
  this.decisions = { ...this.decisions, ...Object.fromEntries(request.targets.map(t => [t.fingerprint, { kind: 'failed', error } as const])) };
  this.reportProgress();
 }
 receive(raw: unknown): Hits | undefined {
  const parsed = workerEventSchema.safeParse(raw); if (!parsed.success || this.destroyed) return;
  const event = parsed.data;
  if (event.type === 'toggle') { void this.toggle(); return; }
  if (event.type === 'reset') { void this.synchronize(); return; }
  if (!this.active() || !this.state || !sameGeneration(this.state.generation, event.generation)) return;
  if (event.type === 'hits' || event.type === 'jump') { this.applyKnown(); return this.highlight.hits(event.type === 'jump' ? event.direction : undefined); }
  if (event.type === 'error') { this.fail(event.requestId, errorCodeSchema.safeParse(event.error).data ?? 'network'); return; }
  this.results(event);
 }
 private async toggle(): Promise<void> {
  if (!this.state) await this.synchronize();
  if (!this.state) return;
  this.focusBar = !this.state.barOpen;
  try { await this.transmit({ type: 'toggle-bar', generation: this.state.generation }); }
  catch { /* Disconnected extension leaves the page untouched. */ }
 }
 private async renewBar(state: TabState): Promise<TabState | undefined> {
  if (this.destroyed || !state.barSession || this.state?.barSession !== state.barSession) return;
  const epoch = this.epoch;
  const response = helloResponse.safeParse(await this.transmit({ type: 'renew-bar', generation: state.generation, session: state.barSession }));
  if (!response.success || this.destroyed || epoch !== this.epoch) return;
  this.state = response.data.data; return this.state;
 }
 private results(event: Extract<WorkerEvent, { type: 'results' }>): void {
  const request = this.requests.find(r => r.id === event.requestId); if (!request) return;
  const complete = request.targets.every(saved => event.results.filter(result => result.id === saved.target.id && result.fingerprint === saved.fingerprint).length === 1);
  if (!complete) { this.fail(request.id, 'invalid-response'); return; }
  clearTimeout(request.timer); this.requests = this.requests.filter(r => r !== request);
  this.decisions = { ...this.decisions, ...Object.fromEntries(request.targets.map(saved => {
   const result = event.results.find(r => r.id === saved.target.id && r.fingerprint === saved.fingerprint)!;
   return [saved.fingerprint, { kind: 'done', highlighted: result.highlighted } as const];
  })) };
  this.applyKnown();
 }
 private applyKnown(targets: readonly ExtractedTarget[] = extract(this.root)): void {
  if (!this.active()) return;
  this.records.forEach(saved => {
   const decision = this.decisions[saved.fingerprint];
   if (!stillMatches(saved, targets.find(t => t.element === saved.element))) { this.highlight.remove(saved.element); return; }
   if (decision?.kind === 'done' && this.visible.includes(saved.element)) this.highlight.apply(saved.element, decision.highlighted);
  });
  this.reportProgress(targets);
 }
 private reportProgress(current: readonly ExtractedTarget[] = extract(this.root)): void {
  if (!this.active() || !this.state) return;
  const records = this.records.filter(saved => stillMatches(saved, current.find(t => t.element === saved.element)));
  const progress = summarizeProgress(records, this.visible, this.decisions, this.highlight);
  const serialized = JSON.stringify(progress);
  if (serialized === this.lastProgress) return;
  this.lastProgress = serialized;
  void this.transmit({ type: 'analysis-status', generation: this.state.generation, progress }).catch(() => { this.lastProgress = ''; });
 }
 destroy(): void {
  this.destroyed = true; this.state = undefined; this.clear(); this.bar.remove(); this.unwatch?.();
  this.root.removeEventListener('visibilitychange', this.visibility);
  this.win.removeEventListener('pagehide', this.pagehide); this.win.removeEventListener('pageshow', this.pageshow);
 }
}
