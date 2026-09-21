import { useOptions } from './useOptions';
import { ThresholdSection } from './ThresholdSection';
import { KeySection } from './KeySection';
import './options.css';
export function Options() {
 const model = useOptions();
 return <main className="options">
  <header><p className="eyebrow">Jev Focus</p><h1>設定</h1><p className="intro">ページ内の表示テキストを、検索意図に沿って探します。</p></header>
  {model.mock && <p className="mock-note">モックモードです。実APIには接続しません。</p>}
  {model.ready && <ThresholdSection initial={model.threshold} />}
  <KeySection configured={model.keyConfigured} busy={model.busy} ready={model.ready} save={model.saveKey} remove={model.deleteKey} />
  <div role="status" aria-live="polite" aria-atomic="true" className={model.failed ? 'operation-status error' : 'operation-status'}>{model.notice}</div>
  {!model.ready && model.failed && <button type="button" onClick={() => { void model.load(); }}>再読み込み</button>}
  <section className="privacy" aria-labelledby="privacy-heading">
   <h2 id="privacy-heading">保存と送信について</h2>
   <ul><li>APIキーはこの端末の拡張内に保存されます。</li><li>暗号化された専用保管庫への保存ではありません。</li><li>検索中のタブの表示テキストと検索意図をJev APIへ送信します。</li><li>強調は閲覧中のページ上に描画されるため、そのサイトで動作するスクリプトから判定結果を観測される可能性があります</li><li>検索を終了するまで、同じタブで別サイトへ移動しても、そのページの表示テキストを送信し続けます</li><li>ページ側スクリプトはバーの存在・位置や強調結果を観測でき、偽装UIの設置を完全には防げません</li></ul>
  </section>
 </main>;
}
