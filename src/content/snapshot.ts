import type { ExtractedTarget } from './extractor';
import { bodyFingerprint, normalizeBody } from '../shared/fingerprint';
import type { Target } from '../shared/types';
export interface Snapshot {
 readonly element: Element;
 readonly target: Target;
 readonly fingerprint: string;
}
export async function snapshot(value: ExtractedTarget): Promise<Snapshot> {
 const text = normalizeBody(value.text);
 const fingerprint = await bodyFingerprint(text);
 return { element: value.element, fingerprint, target: { id: value.id ?? `f_${fingerprint}`, text, context: value.context } };
}
export function stillMatches(saved: Snapshot, current: ExtractedTarget | undefined): boolean {
 return !!current && saved.element.isConnected && saved.element === current.element &&
  saved.target.id === (current.id ?? `f_${saved.fingerprint}`) && saved.target.text === normalizeBody(current.text);
}
