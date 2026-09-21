// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Highlighter } from '../src/content/highlight';
import { nextIndex } from '../src/content/hit-order';
afterEach(() => { document.body.innerHTML = ''; document.head.querySelectorAll('style').forEach(element => element.remove()); });
it('wraps next and previous including initial and empty selections', () => {
 expect(nextIndex(-1, 0, 'next')).toBe(-1); expect(nextIndex(-1, 3, 'prev')).toBe(2);
 expect(nextIndex(-1, 3, 'next')).toBe(0); expect(nextIndex(2, 3, 'next')).toBe(0); expect(nextIndex(0, 3, 'prev')).toBe(2);
});
it('uses live internal hits in DOM order and reconciles removal, insertions and forged classes', () => {
 document.body.innerHTML = '<input><p>first</p><p>second</p><p>forged</p>';
 const [first, second, forged] = Array.from(document.querySelectorAll('p'));
 const marker = new Highlighter(document); marker.apply(second!, true); marker.apply(first!, true);
 forged!.classList.add(marker.className);
 const scroll = vi.fn(); first!.scrollIntoView = scroll; second!.scrollIntoView = scroll;
 document.querySelector('input')!.focus(); const focused = document.activeElement;
 expect(marker.hits('next')).toEqual({ count: 2, index: 1 }); expect(first!.classList.contains(marker.currentClass)).toBe(true);
 expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' }); expect(document.activeElement).toBe(focused);
 expect(marker.hits('next')).toEqual({ count: 2, index: 2 });
 first!.before(second!); expect(marker.hits()).toEqual({ count: 2, index: 1 });
 marker.remove(second!); expect(marker.hits()).toEqual({ count: 1, index: 0 });
 expect(marker.hits('prev')).toEqual({ count: 1, index: 1 });
 const inserted = document.createElement('p'); inserted.textContent = 'new hit'; first!.before(inserted); marker.apply(inserted, true);
 expect(marker.hits()).toEqual({ count: 2, index: 2 });
 marker.clear(); expect(first!.className).toBe(''); expect(marker.hits()).toEqual({ count: 0, index: 0 });
});
