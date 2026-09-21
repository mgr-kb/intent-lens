// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Highlighter } from '../src/content/highlight';
afterEach(() => { document.body.innerHTML = ''; document.head.querySelectorAll('style').forEach(style => style.remove()); });
describe('highlight treatment', () => {
 it('adds the specified background and outline once without changing links or inline layout', () => {
  document.body.innerHTML = '<p class="site" style="margin: 8px"><a href="/original">文字選択できるリンク</a></p><p>二つ目</p>';
  const marker = new Highlighter(document); const elements = Array.from(document.querySelectorAll('p'));
  const link = document.querySelector('a');
  elements.forEach(element => marker.apply(element, true)); marker.apply(elements[0]!, true);
  const css = document.getElementById(marker.styleId)!.textContent!;
  expect(document.querySelectorAll(`#${marker.styleId}`)).toHaveLength(1);
  expect(css).toContain('rgba(250, 204, 21, 0.16)'); expect(css).toContain('outline: 2px solid rgba(217, 119, 6, 0.85)');
  expect(css).not.toMatch(/pointer-events|user-select|::|display|border:/);
  expect(document.querySelector('a')).toBe(link); expect(elements[0]!.getAttribute('style')).toBe('margin: 8px');
  marker.clear(); expect(elements[0]!.className).toBe('site'); expect(document.getElementById(marker.styleId)).toBeNull();
 });
 it('recognizes only extension mutations, retaining site changes for rescanning', () => {
  document.body.innerHTML = '<p class="site">本文</p>'; const element = document.querySelector('p')!;
  const observer = new MutationObserver(() => undefined);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
  const marker = new Highlighter(document); marker.apply(element, true);
  expect(observer.takeRecords().every(r => marker.isOwnMutation(r))).toBe(true);
  element.classList.add('site-changed'); expect(observer.takeRecords().some(r => !marker.isOwnMutation(r))).toBe(true);
  marker.clear(); expect(observer.takeRecords().every(r => marker.isOwnMutation(r))).toBe(true);
  expect(element.classList.contains(marker.className)).toBe(false); observer.disconnect();
 });
});

describe('highlight observation hardening', () => {
 it('uses independent random identifiers per instance', () => {
  const first = new Highlighter(document); const second = new Highlighter(document);
  expect(first.className).not.toBe(second.className); expect(first.styleId).not.toBe(second.styleId);
  expect(first.className).toMatch(/^h-[a-f0-9-]{36}$/);
  expect(first.className).not.toContain('jev');
 });
 it('counts only internally marked live elements, ignoring forged and removed classes', async () => {
  const { summarizeProgress } = await import('../src/content/progress');
  document.body.innerHTML = '<p>first</p><p>second</p>';
  const [first, second] = Array.from(document.querySelectorAll('p'));
  const marker = new Highlighter(document); marker.apply(first!, true);
  second!.classList.add(marker.className); first!.classList.remove(marker.className);
  const records = [first!, second!].map((element, i) => ({ element, fingerprint: String(i), target: { id: String(i), text: element.textContent!, context: '' } }));
  expect(summarizeProgress(records, {}, marker).highlighted).toBe(1);
  first!.remove(); expect(marker.count([first!, second!])).toBe(0);
  marker.clear(); expect(marker.count([second!])).toBe(0);
 });
});
