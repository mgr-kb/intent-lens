import { z } from 'zod';
import { validIntent } from './text';
export const barMessageSchema = z.discriminatedUnion('type', [
 z.object({ type: z.literal('get-tab-state') }).strict(),
 z.object({ type: z.literal('set-intent'), intent: z.string().refine(validIntent) }).strict(),
 z.object({ type: z.literal('clear-intent') }).strict(),
 z.object({ type: z.literal('jump'), direction: z.enum(['next', 'prev']) }).strict(),
]);
export type BarMessage = z.infer<typeof barMessageSchema>;
export const hitsSchema = z.object({ count: z.number().int().nonnegative(), index: z.number().int().nonnegative() })
 .refine(value => value.index <= value.count);
export type Hits = z.infer<typeof hitsSchema>;
export const BAR_POLL_MS = 500;
