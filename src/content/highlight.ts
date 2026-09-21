import { documentOrder, nextIndex } from './hit-order';
import type { Hits } from '../shared/bar';
import { markOwned } from './extractor';
const css = (className: string) => `.${className} {
 background-color: rgba(250, 204, 21, 0.16) !important;
 outline: 2px solid rgba(217, 119, 6, 0.85) !important;
 outline-offset: -2px !important;
 border-radius: inherit;
}`;
export class Highlighter {
 readonly className = `h-${crypto.randomUUID()}`;
 readonly currentClass = `c-${crypto.randomUUID()}`;
 private current: Element | undefined;
 readonly styleId = `s-${crypto.randomUUID()}`;
 private readonly style: HTMLStyleElement;
 private marked: readonly Element[] = [];
 constructor(private readonly root: Document) {
  this.style = root.createElement('style'); markOwned(this.style); this.style.id = this.styleId; this.style.textContent = css(this.className) + `.${this.currentClass} { outline: 3px solid #92400e !important; outline-offset: -3px !important; }`;
 }
 apply(element: Element, highlighted: boolean): void {
  if (!highlighted) { this.remove(element); return; }
  if (!this.style.isConnected) (this.root.head ?? this.root.documentElement).append(this.style);
  element.classList.add(this.className);
  if (!this.marked.includes(element)) this.marked = [...this.marked, element];
 }
 count(elements: readonly Element[]): number {
  return this.marked.filter(element => element.isConnected && elements.includes(element)).length;
 }
 remove(element: Element): void {
  element.classList.remove(this.className, this.currentClass);
  if (this.current === element) this.current = undefined;
  this.marked = this.marked.filter(node => node !== element);
  if (!this.marked.length) this.style.remove();
 }
 clear(): void {
  this.marked.forEach(node => node.classList.remove(this.className, this.currentClass));
  this.marked = []; this.current = undefined; this.style.remove();
 }
 hits(direction?: 'next' | 'prev'): Hits {
  const live = documentOrder(this.marked);
  if (this.current && !live.includes(this.current)) this.current = undefined;
  if (direction) {
   const index = nextIndex(this.current ? live.indexOf(this.current) : -1, live.length, direction);
   this.current?.classList.remove(this.currentClass); this.current = live[index];
   this.current?.classList.add(this.currentClass);
   this.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return { count: live.length, index: this.current ? live.indexOf(this.current) + 1 : 0 };
 }
 isOwnMutation(record: MutationRecord): boolean {
  if (record.type === 'attributes' && record.attributeName === 'class' && record.target instanceof Element) {
   const without = (value: string) => value.split(/\s+/).filter(v => v && v !== this.className && v !== this.currentClass).sort().join(' ');
   return without(record.oldValue ?? '') === without(record.target.getAttribute('class') ?? '');
  }
  if (record.target === this.style || record.target.parentElement === this.style) return true;
  const changed = [...record.addedNodes, ...record.removedNodes];
  return record.type === 'childList' && changed.length > 0 && changed.every(node => node === this.style);
 }
}
