import { validIntent } from '../shared/text';
import type { Status } from '../shared/ui/client';
export function enterAction(draft: string, submitted: string, count: number, shift: boolean): 'search' | 'next' | 'prev' {
 return draft === submitted && count > 0 ? shift ? 'prev' : 'next' : 'search';
}
export function intentError(intent: string): string {
 return validIntent(intent) ? '' : '1〜300字で入力';
}
export function statusText(status: Status | undefined): string {
 if (!status) return '接続中';
 if (!status.configured && !status.mock) return 'APIキー未設定';
 const progress = status.state?.progress;
 if (status.paused || progress?.error === 'rate-limit') return '利用制限';
 if (progress?.error === 'auth') return '認証エラー';
 if (progress?.failed) return '通信エラー';
 if (!status.state?.intent) return '検索意図を入力';
 if (!progress || progress.pending) return '判定中';
 const hits = status.hits ?? { count: progress.highlighted, index: 0 };
 if (hits.count) return hits.index ? `${hits.count}件 ${hits.index}/${hits.count}` : `${hits.count}件`;
 return progress.analyzed > 0 ? '該当なし' : '表示範囲は未解析';
}
