import type { Generation } from './types';
export const sameGeneration = (a: Generation, b: Generation): boolean => a.tab === b.tab && a.document === b.document && a.settings === b.settings;
