import { useKeyForm, type KeyFormProps } from './useKeyForm';
export function KeySection(props: KeyFormProps) {
 const { configured, busy, ready } = props;
 const { editing, setEditing, key, setKey, validation, setValidation, confirming, setConfirming, input, changeButton, deleteButton, confirmBox, submit, cancelDelete, confirmDelete, cancelEdit } = useKeyForm(props);
 return <section aria-labelledby="key-heading">
  <h2 id="key-heading">Jev APIキー</h2>
  {configured && <div className="registered-key"><p>APIキー設定済み</p>
   {!editing && <div className="actions">
    <button ref={changeButton} type="button" disabled={busy || confirming} onClick={() => setEditing(true)}>変更</button>
    <button ref={deleteButton} type="button" className="danger-button" disabled={busy} aria-expanded={confirming} onClick={() => setConfirming(true)}>削除</button>
   </div>}
  </div>}
  {(!configured || editing) && <form onSubmit={event => { void submit(event); }} noValidate>
   <label htmlFor="api-key">{configured ? '新しいAPIキー' : 'APIキー'}</label>
   <input ref={input} id="api-key" type="password" autoComplete="off" spellCheck={false} value={key}
    disabled={!ready || busy} aria-invalid={!!validation} aria-describedby="key-note key-error"
    onChange={event => { setKey(event.target.value); setValidation(''); }} />
   <p id="key-note" className="help">接続確認で少量のAPI利用が発生します。保存済みキーは再表示しません。</p>
   <p id="key-error" className="error" aria-live="polite">{validation}</p>
   <div className="actions"><button type="submit" className="primary" disabled={!ready || busy}>保存して接続</button>
    {editing && <button type="button" disabled={busy} onClick={cancelEdit}>キャンセル</button>}
   </div>
  </form>}
  {confirming && <div ref={confirmBox} className="delete-confirmation" role="group" aria-labelledby="delete-question" tabIndex={-1}
   onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); cancelDelete(); } }}>
   <p id="delete-question">APIキーを削除しますか？</p><p className="help">再接続するには、キーを入力し直す必要があります。</p>
   <div className="actions"><button type="button" className="danger-button" disabled={busy} onClick={() => { void confirmDelete(); }}>削除する</button>
    <button type="button" disabled={busy} onClick={cancelDelete}>キャンセル</button></div>
  </div>}
 </section>;
}
