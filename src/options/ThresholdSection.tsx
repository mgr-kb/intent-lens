import { THRESHOLD_DEFAULT, THRESHOLD_MIN, THRESHOLD_MAX, THRESHOLD_STEP } from '../shared/constants';
import { useThreshold } from './useThreshold';
export function ThresholdSection({ initial }: { readonly initial: number }) {
 const model = useThreshold(initial);
 return <section aria-labelledby="threshold-heading">
  <h2 id="threshold-heading">強調のしきい値</h2>
  <label htmlFor="threshold">しきい値 <span>{model.value.toFixed(2)}</span></label>
  <input id="threshold" type="range" min={THRESHOLD_MIN} max={THRESHOLD_MAX} step={THRESHOLD_STEP}
   value={model.value} aria-valuetext={model.value.toFixed(2)} aria-describedby="threshold-help threshold-guide"
   onChange={event => model.change(event.currentTarget.valueAsNumber)} />
  <p id="threshold-help" className="help">高いほど厳選され、低いほど広く強調されます。変更してもAPIの再利用は発生しません(判定済みの結果に対して基準だけを引き直します)</p>
  <ul id="threshold-guide" className="help threshold-guide">
   <li>0.30〜0.45: 関連しそうなものまで幅広く拾う</li>
   <li>0.55〜0.65: 標準(既定 0.60)</li>
   <li>0.75〜0.95: 確度の高いものだけ厳選</li>
  </ul>
  <div className="actions"><button type="button" onClick={() => model.change(THRESHOLD_DEFAULT)}>既定値に戻す</button></div>
  <p aria-live="polite" aria-atomic="true" className={model.failed ? 'error' : 'help'}>{model.notice}</p>
 </section>;
}
