export const CONTEXT_UPDATED = '拡張が更新されました。ページを再読み込みしてください';
export class ContextInvalidated extends Error {
 constructor() { super(CONTEXT_UPDATED); }
}
export function contextInvalidated(error?: unknown): boolean {
 try {
  return !globalThis.chrome?.runtime?.id || error instanceof ContextInvalidated ||
   (error instanceof Error && /extension context invalidated/i.test(error.message));
 } catch { return true; }
}
export function requireContext(): void {
 if (contextInvalidated()) throw new ContextInvalidated();
}
