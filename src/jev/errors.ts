import type { ErrorCode } from '../shared/types';
export class JevError extends Error {
 constructor(readonly code: ErrorCode) { super(code); }
}
export const httpError = (status: number): JevError => new JevError(
 status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate-limit' : status >= 500 ? 'server' : 'invalid-input');
export const retryable = (error: unknown): boolean => error instanceof JevError && ['network', 'server', 'timeout'].includes(error.code);
export const errorCode = (error: unknown): ErrorCode => error instanceof JevError ? error.code : 'storage';

// A local document budget must not pause other tabs like an API 429.
export class DocumentBudgetError extends JevError {
 constructor() { super('rate-limit'); }
}
