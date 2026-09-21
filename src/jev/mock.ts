import type { JevClient } from './client';
import type { Scores, Target } from '../shared/types';
import { JevError } from './errors';
const words = (text: string): readonly string[] => Array.from(new Intl.Segmenter('ja', { granularity: 'word' }).segment(text.normalize('NFKC').toLowerCase())).filter(s => s.isWordLike).map(s => s.segment);
export class MockJevClient implements JevClient {
 readonly mode = 'jev-mock-v1';
 async judge(intent: string, targets: readonly Target[], _key: string, signal: AbortSignal): Promise<Scores> {
  if (signal.aborted) throw new JevError('cancelled');
  const wanted = [...new Set(words(intent))];
  return Object.fromEntries(targets.map(t => {
   const actual = new Set(words(t.text));
   const overlap = wanted.filter(word => actual.has(word)).length;
   return [t.id, wanted.length ? overlap / wanted.length : 0];
  }));
 }
}

export { MockJevClient as Client };
