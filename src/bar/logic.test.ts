import { expect, it } from 'vitest';
import { enterAction, intentError, statusText } from './logic';
import type { Status } from '../shared/ui/client';
const base: Status = { state: { intent: 'cat', enabled: true, visible: true, url: 'https://example.org', generation: { tab: crypto.randomUUID(), settings: crypto.randomUUID(), document: 'doc' } }, configured: true, mock: false, paused: false };
it('distinguishes unsearched, pending, parsed-empty, errors and hit navigation', () => {
 expect(statusText(undefined)).toBe('接続中');
 expect(statusText({ ...base, configured: false })).toBe('APIキー未設定');
 expect(statusText({ ...base, configured: false, mock: true })).toBe('判定中');
 const progress = { visible: 1, analyzed: 1, pending: 0, failed: 0, highlighted: 0 };
 const done = { ...base, state: { ...base.state!, progress } };
 expect(statusText(done)).toBe('該当なし');
 expect(statusText({ ...done, hits: { count: 3, index: 2 } })).toBe('3件 2/3');
 expect(statusText({ ...done, state: { ...base.state!, progress: { ...progress, analyzed: 0, failed: 1, error: 'auth' } } })).toBe('認証エラー');
 expect(statusText({ ...base, paused: true })).toBe('利用制限');
});
it('uses Enter to search edited text and navigate only already-submitted hits', () => {
 expect(enterAction('cat', 'cat', 2, false)).toBe('next');
 expect(enterAction('cat', 'cat', 2, true)).toBe('prev');
 expect(enterAction('dog', 'cat', 2, true)).toBe('search');
 expect(enterAction('cat', 'cat', 0, false)).toBe('search');
 expect(intentError('👨‍👩‍👧‍👦'.repeat(300))).toBe('');
 expect(intentError(' '.repeat(5))).not.toBe('');
 expect(intentError('a'.repeat(301))).not.toBe('');
});
