import { vi } from 'vitest';
export function fakeChrome() {
 let local: Record<string, unknown> = { key: 'test-only' };
 let session: Record<string, unknown> = {};
 const localArea = {
  setAccessLevel: vi.fn(async (): Promise<void> => undefined),
  get: vi.fn(async () => structuredClone(local)),
  set: vi.fn(async (value: object) => { local = { ...local, ...value }; }),
  remove: vi.fn(async (key: string) => { local = Object.fromEntries(Object.entries(local).filter(([k]) => k !== key)); }),
 };
 const sessionArea = {
  get: vi.fn(async () => structuredClone(session)),
  set: vi.fn(async (value: object) => { session = { ...session, ...structuredClone(value) }; }),
 };
 return {
  runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` }, storage: { local: localArea, session: sessionArea },
  tabs: { get: vi.fn(async (id: number) => ({ id, active: true, url: 'https://x.com/home' })), query: vi.fn(async () => [{ id: 1, active: true }]), sendMessage: vi.fn(async (_id: number, _payload: unknown, _options?: { documentId: string }): Promise<void> => undefined) },
 };
}
export const optionsSender = { id: 'extension', url: 'chrome-extension://extension/options.html' };
export const contentSender = { id: 'extension', url: 'https://x.com/home', tab: { id: 1 }, frameId: 0, documentId: 'doc1', documentLifecycle: 'active' };
