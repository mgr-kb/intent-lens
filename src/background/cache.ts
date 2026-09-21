import { CACHE_MAX, MODEL, PROMPT_VERSION } from '../shared/constants';
import type { Target } from '../shared/types';
export type CacheEntries = readonly (readonly [string, number])[];
export async function cacheKey(target: Target, intent: string, model = MODEL, version = PROMPT_VERSION): Promise<string> {
 const bytes = new TextEncoder().encode(JSON.stringify([target.text, intent, model, version]));
 const digest = await crypto.subtle.digest('SHA-256', bytes);
 return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
export const lruPut = (entries: CacheEntries, key: string, value: number, max = CACHE_MAX): CacheEntries => [...entries.filter(([k]) => k !== key), [key, value] as const].slice(-max);
export function lruGet(entries: CacheEntries, key: string): { readonly entries: CacheEntries; readonly value: number | undefined } {
 const value = entries.find(([k]) => k === key)?.[1];
 return { value, entries: value === undefined ? entries : lruPut(entries, key, value) };
}
