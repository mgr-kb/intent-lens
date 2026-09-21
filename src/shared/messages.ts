import { z } from 'zod';
import { thresholdSchema } from './settings';
import { progressSchema } from './progress';
import { API_KEY_MAX, MESSAGE_TARGET_MAX, TEXT_MAX, REQUESTS_PER_DOCUMENT_MAX, REQUESTS_PER_TAB_WINDOW_MAX } from './constants';
import { validIntent } from './text';
export const generationSchema = z.object({ tab: z.string().uuid(), document: z.string().min(1), settings: z.string().uuid() }).strict();
export const targetSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), text: z.string().min(1).max(TEXT_MAX), context: z.literal('').default('') }).strict();
const tabId = z.number().int().nonnegative();
export const messageSchema = z.discriminatedUnion('type', [
 z.object({ type: z.literal('get-tab-state'), tabId }).strict(),
 z.object({ type: z.literal('set-intent'), tabId, intent: z.string().refine(validIntent) }).strict(),
 z.object({ type: z.literal('jump'), tabId, direction: z.enum(['next', 'prev']) }).strict(),
 z.object({ type: z.literal('get-settings') }).strict(),
 z.object({ type: z.literal('set-threshold'), threshold: thresholdSchema }).strict(),
 z.object({ type: z.literal('clear-intent'), tabId }).strict(),
 z.object({ type: z.literal('save-key'), key: z.string().trim().min(1).max(API_KEY_MAX).regex(/^[\x21-\x7e]+$/) }).strict(),
 z.object({ type: z.literal('delete-key') }).strict(),
 z.object({ type: z.literal('hello'), visible: z.boolean() }).strict(),
 z.object({ type: z.literal('renew-bar'), generation: generationSchema, session: z.string().uuid() }).strict(),
 z.object({ type: z.literal('toggle-bar'), generation: generationSchema }).strict(),
 z.object({ type: z.literal('analysis-status'), generation: generationSchema, progress: progressSchema }).strict(),
 z.object({ type: z.literal('visibility'), generation: generationSchema, visible: z.boolean() }).strict(),
 z.object({ type: z.literal('analyze'), requestId: z.string().uuid(), generation: generationSchema, targets: z.array(targetSchema).min(1).max(MESSAGE_TARGET_MAX).refine(xs => new Set(xs.map(x => x.id)).size === xs.length) }).strict(),
]);
export type Message = z.infer<typeof messageSchema>;

export const tabStateSchema = z.object({
 barDocument: z.string().min(1).optional(), windowStartedAt: z.number().finite().nonnegative().optional(),
 windowCount: z.number().int().min(0).max(REQUESTS_PER_TAB_WINDOW_MAX).optional(),
 barOpen: z.boolean().optional(), barSession: z.string().uuid().optional(),
 requests: z.number().int().min(0).max(REQUESTS_PER_DOCUMENT_MAX).optional(),
 enabled: z.boolean(), intent: z.string().refine(value => value === '' || validIntent(value)), url: z.string(), visible: z.boolean(),
 generation: generationSchema, progress: progressSchema.optional(),
});
export const workerEventSchema = z.discriminatedUnion('type', [
 z.object({ type: z.literal('toggle') }).strict(),
 z.object({ type: z.literal('hits'), generation: generationSchema }).strict(),
 z.object({ type: z.literal('jump'), generation: generationSchema, direction: z.enum(['next', 'prev']) }).strict(),
 z.object({ type: z.literal('reset'), generation: generationSchema, enabled: z.boolean() }),
 z.object({ type: z.literal('results'), generation: generationSchema, requestId: z.string().uuid(), results: z.array(z.object({
  id: z.string(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), probability: z.number().min(0).max(1), highlighted: z.boolean(),
 })) }),
 z.object({ type: z.literal('error'), generation: generationSchema, requestId: z.string().uuid(), error: z.string() }),
]);
export type WorkerEvent = z.infer<typeof workerEventSchema>;
