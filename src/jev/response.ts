import { z } from 'zod';
import { JevError } from './errors';
import type { Scores } from '../shared/types';
const answer = z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) });
const schema = z.object({ answers: z.record(z.string(), answer), model: z.unknown().optional(), usage: z.unknown().optional() });
export function parseResponse(raw: unknown, ids: readonly string[]): Scores {
 const parsed = schema.safeParse(raw);
 if (!parsed.success || ids.some(id => !Object.hasOwn(parsed.data.answers, id))) throw new JevError('invalid-response');
 return Object.fromEntries(ids.map(id => [id, parsed.data.answers[id]!.noul]));
}
