import { URL_POLL_MS } from '../shared/constants';
// A content script has an isolated history object. Page-world calls are covered by
// Navigation API events where available, and URL polling on every supported Chrome.
export function watchNavigation(win: Window, changed: () => void, healthy: () => boolean = () => true): () => void {
 let previous = win.location.href;
 const check = () => {
  if (!healthy()) return;
  if (win.location.href === previous) return;
  previous = win.location.href; changed();
 };
 const push = win.history.pushState;
 const replace = win.history.replaceState;
 const wrappedPush: History['pushState'] = function (...args) { push.apply(win.history, args); check(); };
 const wrappedReplace: History['replaceState'] = function (...args) { replace.apply(win.history, args); check(); };
 win.history.pushState = wrappedPush; win.history.replaceState = wrappedReplace;
 win.addEventListener('popstate', check); win.addEventListener('hashchange', check);
 const navigation = (win as Window & { navigation?: EventTarget }).navigation;
 navigation?.addEventListener('currententrychange', check);
 const timer = win.setInterval(check, URL_POLL_MS);
 return () => {
  win.clearInterval(timer); win.removeEventListener('popstate', check); win.removeEventListener('hashchange', check);
  navigation?.removeEventListener('currententrychange', check);
  if (win.history.pushState === wrappedPush) win.history.pushState = push;
  if (win.history.replaceState === wrappedReplace) win.history.replaceState = replace;
 };
}
