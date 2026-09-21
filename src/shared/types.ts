import type { Progress } from './progress';
export interface Target { readonly id: string; readonly text: string; readonly context: string }
export interface Generation { readonly tab: string; readonly document: string; readonly settings: string }
export interface TabState {
 readonly enabled: boolean; readonly intent: string; readonly url: string;
 readonly barOpen?: boolean; readonly barSession?: string;
 readonly barDocument?: string;
 readonly windowStartedAt?: number; readonly windowCount?: number;
 readonly requests?: number;
 readonly progress?: Progress;
 readonly visible: boolean;
 readonly generation: Generation;
}
export type Scores = Readonly<Record<string, number>>;
export type ErrorCode = 'auth' | 'rate-limit' | 'network' | 'server' | 'timeout' | 'invalid-response' | 'invalid-input' | 'cancelled' | 'settings-required' | 'storage';
export type AnalysisResult = { readonly type: 'result'; readonly generation: Generation; readonly id: string; readonly probability: number; readonly highlighted: boolean };
