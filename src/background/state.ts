import type { Generation, TabState } from '../shared/types';
import { validIntent } from '../shared/text';
import { sameGeneration } from '../shared/generation';
export { sameGeneration } from '../shared/generation';
export const canApply = (state: TabState | undefined, token: Generation): boolean => !!state?.enabled && validIntent(state.intent) && sameGeneration(state.generation, token);
export function navigate(previous: TabState | undefined, url: string, document: string, settings: string): TabState {
 return { barOpen: previous?.barOpen ?? false,
  barSession: previous?.generation.document === document ? previous.barSession : crypto.randomUUID(),
  barDocument: previous?.generation.document === document ? previous.barDocument : undefined,
  windowStartedAt: previous?.windowStartedAt ?? Date.now(), windowCount: previous?.windowCount ?? 0,
  enabled: !!previous?.enabled, intent: previous?.intent ?? '', url,
  requests: previous?.generation.document === document && previous.generation.settings === settings ? previous.requests ?? 0 : 0,
  visible: false, generation: { tab: previous?.generation.tab ?? crypto.randomUUID(), document, settings } };
}
