import { CONTEXT_UPDATED, contextInvalidated, requireContext } from '../shared/context';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { BAR_POLL_MS, hitsSchema } from '../shared/bar';
import { tabStateSchema } from '../shared/messages';
import { request, statusSchema, type Status, UiError } from '../shared/ui/client';
import { enterAction, intentError, statusText } from './logic';
export function useBar() {
 const [invalidated, setInvalidated] = useState(false);
 const dead = useRef(false); const stopPolling = useRef<() => void>(() => undefined);
 const invalidate = (error?: unknown): boolean => {
  if (dead.current || contextInvalidated(error)) {
   dead.current = true; stopPolling.current(); setInvalidated(true); return true;
  }
  return false;
 };
 const [draft, setDraft] = useState('');
 const [status, setStatus] = useState<Status>();
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const initialized = useRef(false); const working = useRef(false); const revision = useRef(0);
 const submitted = useRef(''); const edited = useRef(false); const closing = useRef(false);
 usePolling(working, revision, stopPolling, invalidate, next => {
  setStatus(next); setError(previous => previous === '接続エラー' ? '' : previous);
  if (!initialized.current) { initialized.current = true; submitted.current = next.state?.intent ?? ''; if (!edited.current) setDraft(submitted.current); }
 }, () => setError('接続エラー'));
 const perform = async (operation: () => Promise<void>) => {
  if (invalidate() || working.current) return;
  working.current = true; revision.current += 1; setBusy(true); setError('');
  try { await operation(); }
  catch (value) {
   if (invalidate(value)) return;
   const code = value instanceof UiError ? value.code : 'network';
   setError(code === 'auth' ? '認証エラー' : code === 'rate-limit' ? '利用制限' : code === 'settings-required' ? 'APIキー未設定' : '通信エラー');
  } finally { working.current = false; setBusy(false); }
 };
 const search = async () => {
  const validation = intentError(draft); if (validation) { setError(validation); return; }
  await perform(async () => {
   const state = await request({ type: 'set-intent', intent: draft }, tabStateSchema);
   submitted.current = state.intent;
   setStatus(previous => previous ? { ...previous, state, hits: { count: 0, index: 0 } } : previous);
  });
 };
 const jump = async (direction: 'next' | 'prev') => perform(async () => {
  const hits = await request({ type: 'jump', direction }, hitsSchema);
  setStatus(previous => previous ? { ...previous, hits } : previous);
 });
 const close = async () => {
  if (invalidate() || closing.current) return;
  closing.current = true; revision.current += 1;
  try { await request({ type: 'clear-intent' }, tabStateSchema); }
  catch (value) { if (!invalidate(value)) setError('終了できません。再度お試しください'); }
  finally { closing.current = false; }
 };
 const enter = async (shift: boolean) => {
  const action = enterAction(draft, submitted.current, status?.hits?.count ?? 0, shift);
  if (action === 'search') await search(); else await jump(action);
 };
 const openOptions = () => perform(async () => { requireContext(); await chrome.runtime.openOptionsPage(); requireContext(); });
 return { invalidated, openOptions, draft, edit: (value: string) => { edited.current = true; setDraft(value); setError(''); }, status, busy,
  text: invalidated ? CONTEXT_UPDATED : error || (busy ? '判定中' : statusText(status)), search, jump, close, enter };
}

function usePolling(working: RefObject<boolean>, revision: RefObject<number>, stop: RefObject<() => void>, invalid: (error?: unknown) => boolean, success: (value: Status) => void, failure: () => void) {
 const handlers = useRef({ success, failure, invalid });
 useEffect(() => { handlers.current = { success, failure, invalid }; }, [success, failure, invalid]);
 useEffect(() => {
  let alive = true; let polling = false;
  const poll = async () => {
   if (!alive || handlers.current.invalid() || polling || working.current) return;
   polling = true; const token = revision.current;
   try {
    const next = await request({ type: 'get-tab-state' }, statusSchema);
    if (!alive || token !== revision.current) return;
    handlers.current.success(next);
   } catch (error) { if (alive && !handlers.current.invalid(error) && token === revision.current) handlers.current.failure(); }
   finally { polling = false; }
  };
  const timer = setInterval(() => { void poll(); }, BAR_POLL_MS);
  stop.current = () => { alive = false; clearInterval(timer); };
  void poll(); return () => stop.current();
 }, [working, revision, stop]);
 }
