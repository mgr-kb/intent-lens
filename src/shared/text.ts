import { INTENT_MAX } from './constants';
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
export const graphemes = (text: string): readonly string[] => Array.from(segmenter.segment(text), x => x.segment);
export const countCharacters = (text: string): number => graphemes(text).length;
export const validIntent = (text: string): boolean => text.trim().length > 0 && countCharacters(text) <= INTENT_MAX;
// Wire limit counts Unicode code points of the entire serialized body (including instructions).
export const wireCharacters = (text: string): number => Array.from(text).length;
