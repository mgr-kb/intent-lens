import type { Scores, Target } from '../shared/types';
export interface JevClient { judge(intent: string, targets: readonly Target[], key: string, signal: AbortSignal): Promise<Scores> }
export { RealJevClient } from './real';
export { MockJevClient } from './mock';
