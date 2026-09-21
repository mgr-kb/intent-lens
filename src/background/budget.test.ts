import { expect, it } from 'vitest';
import { budgetWindow, chargeBudget } from './budget';
import { navigate } from './state';
import { REQUESTS_PER_TAB_WINDOW_MAX, TAB_WINDOW_MS } from '../shared/constants';
const settings = crypto.randomUUID();
const state = { ...navigate(undefined, 'https://a.example/', 'doc', settings), requests: 100, windowStartedAt: Date.now(), windowCount: 20 };
it('resets document counters only for a different document or settings generation and carries window counters', () => {
 const url = navigate(state, 'https://a.example/other#hash', 'doc', settings);
 expect(url.requests).toBe(100); expect(url.windowCount).toBe(20);
 const next = navigate(state, 'https://b.example/', 'new-doc', settings);
 expect(next.requests).toBe(0); expect(next.windowStartedAt).toBe(state.windowStartedAt); expect(next.windowCount).toBe(20);
 expect(navigate(state, state.url, 'doc', crypto.randomUUID()).requests).toBe(0);
});
it('charges both counters without mutation and bounds the window independently from document spending', () => {
 expect(chargeBudget(state)).toMatchObject({ requests: 101, windowCount: 21 }); expect(state.windowCount).toBe(20);
 expect(() => chargeBudget({ ...state, requests: 0, windowCount: REQUESTS_PER_TAB_WINDOW_MAX })).toThrow('rate-limit');
 expect(budgetWindow(state, state.windowStartedAt + TAB_WINDOW_MS)).toEqual({ windowStartedAt: state.windowStartedAt + TAB_WINDOW_MS, windowCount: 0 });
 expect(budgetWindow(state, state.windowStartedAt - 1).windowCount).toBe(20);
});
