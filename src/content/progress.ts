import type { Highlighter } from './highlight';
import type { ErrorCode } from '../shared/types';
import type { Progress } from '../shared/progress';
import type { Snapshot } from './snapshot';
export type Decision = { readonly kind: 'pending'; readonly requestId: string } |
 { readonly kind: 'done'; readonly highlighted: boolean } | { readonly kind: 'failed'; readonly error?: ErrorCode };
export function summarizeProgress(records: readonly Snapshot[], visible: readonly Element[], decisions: Readonly<Record<string, Decision>>, highlighter: Highlighter): Progress {
 const live = records.filter(record => record.element.isConnected);
 const viewed = live.filter(record => visible.includes(record.element));
 const analyzed = viewed.filter(record => decisions[record.fingerprint]?.kind === 'done').length;
 const failures = viewed.flatMap(record => {
  const decision = decisions[record.fingerprint]; return decision?.kind === 'failed' ? [decision] : [];
 });
 return { highlighted: highlighter.count(live.map(record => record.element)),
  visible: viewed.length, analyzed, failed: failures.length, pending: viewed.length - analyzed - failures.length,
  ...(failures.length ? { error: failures[0]?.error ?? 'network' } : {}),
 };
}
