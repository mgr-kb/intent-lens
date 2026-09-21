import { markOwned } from './extractor';
import { BAR_REPAIR_MS } from '../shared/constants';
import type { TabState } from '../shared/types';
const HOST_STYLE = 'all:initial!important;position:fixed!important;top:16px!important;right:16px!important;width:min(420px,calc(100vw - 32px))!important;height:64px!important;z-index:2147483647!important;display:block!important;';
const FRAME_STYLE = 'all:initial;display:block;width:100%;height:100%;border:0;border-radius:8px;box-shadow:0 4px 18px #0003;color-scheme:light dark;';
export class BarHost {
 private host: HTMLElement | undefined;
 private state: TabState | undefined;
 private style = '';
 private readonly observer: MutationObserver;
 private timer: ReturnType<typeof setTimeout> | undefined;
 private removed = false;
 private revision = 0;
 private retiredSession: string | undefined;
 private renewal: string | undefined;
 constructor(private readonly root: Document, private readonly renew: (state: TabState) => Promise<TabState | undefined> = async () => undefined) {
  this.observer = new MutationObserver(records => this.changed(records));
 }
 sync(state: TabState, userOpened = false): void {
  if (!state.barOpen || !state.barSession) { this.remove(); return; }
  if (this.host && this.state?.barSession === state.barSession) { this.state = state; return; }
  if (!this.host && this.retiredSession === state.barSession) { void this.recreate(state); return; }
  this.remove(); this.state = state;
  const host = this.root.createElement('div'); markOwned(host); host.style.cssText = HOST_STYLE;
  this.style = host.style.cssText;
  const shadow = host.attachShadow({ mode: 'closed' });
  const frame = this.root.createElement('iframe'); markOwned(frame);
  frame.title = 'Jev Focus ページ内検索'; frame.style.cssText = FRAME_STYLE;
  frame.src = `${chrome.runtime.getURL('bar.html')}${userOpened ? '?focus=1' : ''}#${state.barSession}`;
  if (userOpened) frame.addEventListener('load', () => { if (frame.isConnected) frame.contentWindow?.focus(); }, { once: true });
  shadow.append(frame); this.host = host; this.root.documentElement.append(host);
  this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'inert', 'class', 'id', 'aria-hidden'] });
 }
 private changed(records: readonly MutationRecord[]): void {
  if (!this.host || !this.state) return;
  // Removal + immediate reinsertion also destroys the iframe document.
  if (records.some(record => Array.from(record.removedNodes).some(node => node === this.host || node.contains(this.host!)))) this.removed = true;
  if (!this.removed && this.healthy()) return; // Includes our own style repairs.
  if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.repair(); }, BAR_REPAIR_MS);
 }
 private healthy(): boolean {
  return !!this.host?.isConnected && this.host.getAttribute('style') === this.style &&
   !['hidden', 'inert', 'class', 'id', 'aria-hidden'].some(name => this.host!.hasAttribute(name));
 }
 private async repair(): Promise<void> {
  if (!this.host || !this.state) return;
  if (!this.removed && this.host.isConnected) {
   this.host.style.cssText = HOST_STYLE;
   ['hidden', 'inert', 'class', 'id', 'aria-hidden'].forEach(name => this.host!.removeAttribute(name));
   return;
  }
  await this.recreate(this.state);
 }
 private async recreate(state: TabState): Promise<void> {
  if (this.renewal === state.barSession) return;
  this.remove(); const revision = this.revision; this.renewal = state.barSession;
  // Destroy the old frame before permitting a new document binding.
  try {
   const next = await this.renew(state);
   if (revision === this.revision && next) this.sync(next, false);
  } catch { /* Fail closed: do not reuse an old session after failed renewal. */ }
  finally { if (this.renewal === state.barSession) this.renewal = undefined; }
 }
 remove(): void {
  if (this.host) this.retiredSession = this.state?.barSession;
  this.renewal = undefined; this.revision += 1; this.observer.disconnect();
  if (this.timer) clearTimeout(this.timer);
  this.timer = undefined; this.host?.remove(); this.host = undefined; this.state = undefined; this.removed = false;
 }
}
