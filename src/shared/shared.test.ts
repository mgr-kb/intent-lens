import { describe, expect, it } from 'vitest';
import { countCharacters, validIntent } from './text';
import { messageSchema } from './messages';
describe('shared validation', () => {
 it('counts joined emoji and combining marks as one character', () => {
  expect(countCharacters('👨‍👩‍👧‍👦🇯🇵か\u3099')).toBe(3);
  expect(validIntent(' ')).toBe(false);
  expect(validIntent('あ'.repeat(300))).toBe(true);
  expect(validIntent('あ'.repeat(301))).toBe(false);
 });
 it('rejects unrecognized key-reading messages and extra payload fields', () => {
  expect(messageSchema.safeParse({ type: 'get-key' }).success).toBe(false);
  expect(messageSchema.safeParse({ type: 'hello', visible: true, key: 'x' }).success).toBe(false);
 });
});


