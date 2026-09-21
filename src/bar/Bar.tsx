import { useEffect, useRef } from 'react';
import { useBar } from './useBar';
import './bar.css';
export function Bar() {
 const model = useBar(); const input = useRef<HTMLInputElement>(null);
 useEffect(() => { if (new URL(window.location.href).searchParams.get('focus') === '1') input.current?.focus(); }, []);
 return <main className={model.invalidated ? 'bar invalidated' : 'bar'} aria-label="ページ内検索" onKeyDown={event => {
  if (event.key === 'Escape') { event.preventDefault(); void model.close(); }
 }}>
  <form onSubmit={event => { event.preventDefault(); void model.search(); }}>
   <input disabled={model.invalidated} ref={input} value={model.draft} onChange={event => model.edit(event.target.value)}
    aria-label="このページで探したい内容" aria-describedby="search-status" placeholder="意味で探す…" autoComplete="off" spellCheck={false}
    onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void model.enter(event.shiftKey); } }} />
   <button type="submit" aria-label="検索" disabled={model.invalidated || model.busy}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg></button>
  </form>
  <div id="search-status" className="status" role="status" aria-live="polite" aria-atomic="true">
   {model.text === '判定中' && <span className="spinner" aria-hidden="true" />}{model.text}
  </div>
  <button type="button" aria-label="前へ" disabled={model.invalidated || !model.status?.hits?.count || model.busy} onClick={() => { void model.jump('prev'); }}>↑</button>
  <button type="button" aria-label="次へ" disabled={model.invalidated || !model.status?.hits?.count || model.busy} onClick={() => { void model.jump('next'); }}>↓</button>
  <button type="button" aria-label="設定を開く" disabled={model.invalidated || model.busy} onClick={() => { void model.openOptions(); }}><span aria-hidden="true">⚙</span></button>
  <button type="button" disabled={model.invalidated} aria-label="検索を終了" onClick={() => { void model.close(); }}>×</button>
  {model.status?.mock && <span className="mock">mock</span>}
 </main>;
}
