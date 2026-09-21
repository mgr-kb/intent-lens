import { z } from 'zod';
import { JevError } from '../jev/errors';
import { tabStateSchema } from '../shared/messages';
import type { TabState } from '../shared/types';
import type { CacheEntries } from './cache';
import { thresholdSchema } from '../shared/settings';
import { THRESHOLD_DEFAULT, CACHE_MAX } from '../shared/constants';
const sessionSchema = z.object({ version: z.literal(2), settings: z.string().uuid(), tabs: z.record(z.string(), tabStateSchema), cache: z.array(z.tuple([z.string(), z.number().min(0).max(1)])).max(CACHE_MAX), paused: z.boolean() });
export interface Session { readonly version: 2; readonly settings: string; readonly tabs: Readonly<Record<string, TabState>>; readonly cache: CacheEntries; readonly paused: boolean }
export interface Settings { readonly key: string; readonly threshold: number }
export class Storage {
 private readonly trusted: Promise<void>;
 constructor() {
  this.trusted = this.restrictAccess();
  void this.trusted.catch(() => undefined);
 }
 private async restrictAccess(): Promise<void> {
  try {
   if (typeof chrome.storage.local.setAccessLevel !== 'function') throw new JevError('storage');
   await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch { throw new JevError('storage'); }
 }
 async settings(): Promise<Settings> {
  await this.trusted;
  await chrome.storage.local.remove('focus');
  const raw = await chrome.storage.local.get(['key', 'threshold']);
  return { key: typeof raw.key === 'string' ? raw.key : '', threshold: thresholdSchema.safeParse(raw.threshold).data ?? THRESHOLD_DEFAULT };
 }
 async save(value: Partial<Settings>): Promise<void> { await this.trusted;
  if ('threshold' in value && !thresholdSchema.safeParse(value.threshold).success) throw new JevError('invalid-input');
  await chrome.storage.local.set(value); }
 async removeKey(): Promise<void> { await this.trusted; await chrome.storage.local.remove('key'); }
 async session(): Promise<Session> {
  const raw = await chrome.storage.session.get('session');
  const parsed = sessionSchema.safeParse(raw.session);
  return parsed.success ? parsed.data : { version: 2, settings: crypto.randomUUID(), tabs: {}, cache: [], paused: false };
 }
 async persist(session: Session): Promise<void> { await chrome.storage.session.set({ session }); }
}
