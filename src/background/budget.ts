import { REQUESTS_PER_DOCUMENT_MAX, REQUESTS_PER_TAB_WINDOW_MAX, TAB_WINDOW_MS } from '../shared/constants';
import type { TabState } from '../shared/types';
import { DocumentBudgetError } from '../jev/errors';
export function budgetWindow(state: TabState, now = Date.now()) {
 const expired = state.windowStartedAt === undefined || now - state.windowStartedAt >= TAB_WINDOW_MS;
 return { windowStartedAt: expired ? now : state.windowStartedAt!, windowCount: expired ? 0 : state.windowCount ?? 0 };
}
export function checkBudget(state: TabState): void {
 if ((state.requests ?? 0) >= REQUESTS_PER_DOCUMENT_MAX || budgetWindow(state).windowCount >= REQUESTS_PER_TAB_WINDOW_MAX) throw new DocumentBudgetError();
}
export function chargeBudget(state: TabState): TabState {
 checkBudget(state);
 const window = budgetWindow(state);
 return { ...state, ...window, requests: (state.requests ?? 0) + 1, windowCount: window.windowCount + 1 };
}
