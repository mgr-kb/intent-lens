import { checkBudget, chargeBudget } from './budget';
import { CONNECTION_INTENT, CONNECTION_TARGET, MOCK } from '../shared/constants';
import type { Generation, TabState, Target } from '../shared/types';
import type { Message } from '../shared/messages';
import { bodyFingerprint } from '../shared/fingerprint';
import type { JevClient } from '../jev/client';
import { errorCode, JevError, DocumentBudgetError } from '../jev/errors';
import { batches } from '../jev/request';
import { cacheKey, lruGet, lruPut } from './cache';
import { canApply, navigate, sameGeneration } from './state';
import { Queue } from './queue';
import { Storage, type Session, type Settings } from './storage';
import { hitsSchema } from '../shared/bar';
import { barSession, validateMessage } from './validation';
export class Engine {
 private session!: Session;
 private settings!: Settings;
 private readonly queue = new Queue();
 private serial: Promise<unknown>;
 private readonly ready: Promise<void>;
 private keyOperation = 0;
 constructor(private readonly client: JevClient, private readonly storage = new Storage()) {
  this.ready = this.initialize(); this.serial = this.ready.catch(() => undefined);
 }
 private async initialize(): Promise<void> {
  this.settings = await this.storage.settings(); this.session = await this.storage.session();
  await this.commit(this.session);
  this.queue.setPaused(this.session.paused);
 }
 exclusive<T>(run: () => Promise<T>): Promise<T> {
  const next = this.serial.then(async () => { await this.ready; return run(); });
  this.serial = next.catch(() => undefined);
  return next;
 }
 private async commit(next: Session): Promise<void> {
  await this.storage.persist(next); this.session = next;
 }
 private async tab(id: number, state: TabState): Promise<void> {
  await this.commit({ ...this.session, tabs: { ...this.session.tabs, [id]: state } });
 }
 private async notify(id: number, payload: unknown, document: string): Promise<void> {
  try { await chrome.tabs.sendMessage(id, payload, { documentId: document }); } catch { /* No live content receiver (navigation or phase 1). */ }
 }
 private async resetNotice(id: number, state: TabState): Promise<void> {
  // A loading placeholder is not a routable Chrome document ID. Synchronize the live tab.
  try { await chrome.tabs.sendMessage(id, { type: 'reset', enabled: state.enabled, generation: state.generation }); }
  catch { /* The next document's hello will synchronize if no receiver is present yet. */ }
 }
 async message(raw: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const m = validateMessage(raw, sender, chrome.runtime.id);
  if (m.type === 'save-key') return this.saveKey(m.key);
  return this.exclusive(() => this.route(m, sender));
 }
 private async route(m: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (m.type === 'get-settings') return { keyConfigured: !!this.settings.key, mock: MOCK, threshold: this.settings.threshold };
  if (m.type === 'set-threshold') { await this.thresholdChanged(m.threshold); return { ok: true }; }
  if (m.type === 'save-key') throw new JevError('invalid-input');
  if (m.type === 'delete-key') {
   this.keyOperation += 1; await this.storage.removeKey(); await this.settingsChanged(); return { ok: true };
  }
  if ('tabId' in m) {
   let state = this.session.tabs[m.tabId];
   const session = barSession(sender, chrome.runtime.id);
   if (session) state = await this.bindBar(m.tabId, state, session, sender.documentId!);
   if (!session && sender.tab && (!state || sender.documentId !== state.generation.document || sender.url !== state.url)) throw new JevError('cancelled');
   if (m.type === 'get-tab-state') return { state: state ?? null, configured: this.configured(), paused: this.session.paused, mock: MOCK, ...(session && state ? { hits: await this.hits(m.tabId, state) } : {}) };
   if (m.type === 'jump') return this.hits(m.tabId, state!, m.direction);
   return this.setIntent(m.tabId, m.type === 'clear-intent' ? '' : m.intent);
  }
  const id = sender.tab!.id!;
  if (m.type === 'hello') return this.hello(id, sender, m.visible);
  const state = this.session.tabs[id];
  if (!state || sender.documentId !== state.generation.document || sender.url !== state.url || !sameGeneration(state.generation, m.generation)) throw new JevError('cancelled');
  if (m.type === 'renew-bar') {
   if (!state.barOpen || state.barSession !== m.session) throw new JevError('cancelled');
   const next = { ...state, barDocument: undefined, barSession: crypto.randomUUID() };
   await this.tab(id, next); return next;
  }
  if (m.type === 'toggle-bar') return this.toggleState(id, state);
  if (m.type === 'analysis-status') {
   if (!canApply(state, m.generation)) throw new JevError('cancelled');
   await this.tab(id, { ...state, progress: m.progress }); return { ok: true };
  }
  if (m.type === 'visibility') {
   await this.tab(id, { ...state, visible: m.visible && !!(await chrome.tabs.get(id)).active });
   this.queue.wake(); return { ok: true };
  }
  if (!canApply(state, m.generation) || !state.visible || !(await chrome.tabs.get(id)).active || !this.configured()) throw new JevError('cancelled');
  const keys = await Promise.all(m.targets.map(t => cacheKey(t, state.intent)));
  const cached = keys.every(key => lruGet(this.session.cache, key).value !== undefined);
  if (!cached) {
   if (this.session.paused) throw new JevError('rate-limit');
   checkBudget(state);
  }
  void this.analyze(id, m.generation, m.targets, { key: this.settings.key, intent: state.intent }, m.requestId).catch(() => undefined);
  return { accepted: true };
 }
 private async bindBar(id: number, state: TabState | undefined, session: string, document: string): Promise<TabState> {
  if (!state?.barOpen || state.barSession !== session || state.barDocument && state.barDocument !== document) throw new JevError('cancelled');
  if (state.barDocument) return state;
  const next = { ...state, barDocument: document }; await this.tab(id, next); return next;
 }
 private configured(): boolean { return MOCK || !!this.settings.key; }
 private async hello(id: number, sender: chrome.runtime.MessageSender, visible: boolean): Promise<TabState> {
  const old = this.session.tabs[id];
  const navigated = navigate(old, sender.url!, sender.documentId!, this.session.settings);
  const state = old && old.url !== sender.url ? { ...navigated, generation: { ...navigated.generation, tab: crypto.randomUUID() } } : navigated;
  if (!old || old.generation.document !== state.generation.document || old.url !== state.url) this.queue.cancel(id);
  const next = { ...state, visible: visible && !!(await chrome.tabs.get(id)).active };
  await this.commit({ ...this.session, tabs: { ...this.session.tabs, [id]: next } }); return next;
 }
 private async setIntent(id: number, intent: string): Promise<TabState> {
  const state = this.session.tabs[id];
  if (!state) throw new JevError('cancelled');
  if (intent && !this.configured()) throw new JevError('settings-required');
  this.queue.cancel(id);
  const next = { ...state, intent, barOpen: !!intent, barDocument: intent ? state.barDocument : undefined, barSession: intent ? state.barSession ?? crypto.randomUUID() : undefined, enabled: !!intent, requests: state.intent === intent ? state.requests : 0, progress: undefined, generation: { ...state.generation, tab: crypto.randomUUID() } };
  await this.tab(id, next);
  if (intent && this.session.paused) { await this.commit({ ...this.session, paused: false }); this.queue.setPaused(false); }
  await this.resetNotice(id, next); return next;
 }
 private async hits(id: number, state: TabState, direction?: 'next' | 'prev') {
  try {
   const response = await chrome.tabs.sendMessage(id, { type: direction ? 'jump' : 'hits', generation: state.generation, ...(direction ? { direction } : {}) }, { documentId: state.generation.document });
   return hitsSchema.parse(response);
  } catch { return { count: 0, index: 0 }; }
 }
 async toggle(id: number): Promise<void> {
  try { await chrome.tabs.sendMessage(id, { type: 'toggle' }); } catch { /* Chrome internal / restricted pages have no receiver. */ }
 }
 private async toggleState(id: number, state: TabState): Promise<TabState> {
  if (state.barOpen) return this.setIntent(id, '');
  const next = { ...state, barOpen: true, enabled: true, barDocument: undefined, barSession: crypto.randomUUID() };
  await this.tab(id, next); await this.resetNotice(id, next); return next;
 }
 private async thresholdChanged(threshold: number): Promise<void> {
  if (threshold === this.settings.threshold) return;
  await this.storage.save({ threshold });
  this.queue.cancelAll();
  this.settings = { ...this.settings, threshold };
  const settings = crypto.randomUUID();
  const tabs = Object.fromEntries(Object.entries(this.session.tabs).map(([id, t]) =>
   [id, { ...t, requests: 0, progress: undefined, generation: { ...t.generation, settings } }]));
  // Keep scores and rate-limit pause; only the highlighting criterion changes.
  await this.commit({ ...this.session, settings, tabs });
  await Promise.all(Object.entries(tabs).filter(([, t]) => t.enabled).map(([id, t]) => this.resetNotice(Number(id), t)));
 }
 private async settingsChanged(): Promise<void> {
  this.queue.cancelAll();
  this.settings = await this.storage.settings();
  const settings = crypto.randomUUID();
  const tabs = Object.fromEntries(Object.entries(this.session.tabs).map(([id, t]) => [id, { ...t, requests: 0, progress: undefined, enabled: t.enabled && this.configured(), generation: { ...t.generation, settings } }]));
  await this.commit({ ...this.session, settings, tabs, cache: [], paused: false });
  this.queue.setPaused(false);
  await Promise.all(Object.entries(tabs).map(([id, t]) => this.resetNotice(Number(id), t)));
 }
 private async saveKey(key: string): Promise<unknown> {
  const operation = await this.exclusive(async () => {
   this.keyOperation += 1;
   return this.keyOperation;
  });
  try { await this.queue.add(-1, () => true, signal => this.client.judge(CONNECTION_INTENT, [CONNECTION_TARGET], key, signal)); }
  catch (error) {
   if (errorCode(error) === 'rate-limit') await this.exclusive(() => this.commit({ ...this.session, paused: true }));
   throw error;
  }
  return this.exclusive(async () => {
   if (operation !== this.keyOperation) throw new JevError('cancelled');
   await this.storage.save({ key }); await this.settingsChanged();
   return { ok: true };
  });
 }
 private async analyze(id: number, token: Generation, targets: readonly Target[], settings: { readonly key: string; readonly intent: string }, requestId: string): Promise<void> {
  try {
   const keys = await Promise.all(targets.map(t => cacheKey(t, settings.intent)));
   const cached = await this.exclusive(async () => {
    if (!canApply(this.session.tabs[id], token)) throw new JevError('cancelled');
    let entries = this.session.cache;
    const values = keys.map(key => { const hit = lruGet(entries, key); entries = hit.entries; return hit.value; });
    await this.commit({ ...this.session, cache: entries }); return values;
   });
   const missing = targets.filter((_, i) => cached[i] === undefined);
   const results = await Promise.all(batches(settings.intent, missing).map(parts => this.queue.add(id,
    () => canApply(this.session.tabs[id], token) && !!this.session.tabs[id]?.visible,
    async signal => {
     await this.consumeBudget(id, token);
     if (signal.aborted) throw new JevError('cancelled');
     return { parts, scores: await this.client.judge(settings.intent, parts.map(p => p.target), settings.key, signal) };
    })));
   const probabilities = targets.map((t, i) => cached[i] ?? Math.max(...results.flatMap(r => r.parts.filter(p => p.originalId === t.id).map(p => r.scores[p.target.id]!))));
   await this.exclusive(() => this.publish(id, token, targets, keys, probabilities, requestId));
  } catch (error) { await this.exclusive(() => this.analysisError(id, token, error, requestId)); }
 }
 private async consumeBudget(id: number, token: Generation): Promise<void> {
  await this.exclusive(async () => {
   const state = this.session.tabs[id];
   if (!state || !canApply(state, token)) throw new JevError('cancelled');
   checkBudget(state);
   await this.tab(id, chargeBudget(state));
  });
 }
 private async publish(id: number, token: Generation, targets: readonly Target[], keys: readonly string[], probabilities: readonly number[], requestId: string): Promise<void> {
  if (!canApply(this.session.tabs[id], token)) return;
  const cache = keys.reduce((entries, key, i) => lruPut(entries, key, probabilities[i]!), this.session.cache);
  await this.commit({ ...this.session, cache });
  const fingerprints = await Promise.all(targets.map(t => bodyFingerprint(t.text)));
  await this.notify(id, { type: 'results', requestId, generation: token, results: targets.map((t, i) => ({ id: t.id, fingerprint: fingerprints[i], probability: probabilities[i], highlighted: probabilities[i]! >= this.settings.threshold })) }, token.document);
 }
 private async analysisError(id: number, token: Generation, error: unknown, requestId: string): Promise<void> {
  const code = errorCode(error);
  if (code === 'rate-limit' && !(error instanceof DocumentBudgetError)) await this.commit({ ...this.session, paused: true });
  if (canApply(this.session.tabs[id], token) && code !== 'cancelled') await this.notify(id, { type: 'error', requestId, generation: token, error: code }, token.document);
 }
 async navigation(id: number, url: string, loading: boolean): Promise<void> {
  return this.exclusive(async () => {
   const old = this.session.tabs[id]; if (!old) return;
   this.queue.cancel(id);
   const state = navigate(old, url || old.url, loading ? crypto.randomUUID() : old.generation.document, this.session.settings);
   const next = { ...state, generation: { ...state.generation, tab: crypto.randomUUID() } };
   await this.tab(id, next); await this.resetNotice(id, next);
  });
 }
 async activated(): Promise<void> {
  return this.exclusive(async () => {
   const active = new Set((await chrome.tabs.query({ active: true })).map(t => t.id));
   await this.commit({ ...this.session, tabs: Object.fromEntries(Object.entries(this.session.tabs).map(([id, t]) => [id, { ...t, visible: active.has(Number(id)) }])) });
   this.queue.wake();
  });
 }
 async removed(id: number): Promise<void> {
  return this.exclusive(async () => {
   this.queue.cancel(id);
   await this.commit({ ...this.session, tabs: Object.fromEntries(Object.entries(this.session.tabs).filter(([key]) => key !== String(id))) });
  });
 }
}
