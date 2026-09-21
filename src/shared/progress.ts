import { z } from 'zod';
export const errorCodeSchema = z.enum(['auth', 'rate-limit', 'network', 'server', 'timeout', 'invalid-response', 'invalid-input', 'cancelled', 'settings-required', 'storage']);
export const progressSchema = z.object({
 highlighted: z.number().int().nonnegative(),
 total: z.number().int().nonnegative(),
 analyzed: z.number().int().nonnegative(),
 pending: z.number().int().nonnegative(),
 failed: z.number().int().nonnegative(),
 error: errorCodeSchema.optional(),
}).strict().refine(value => value.analyzed + value.pending + value.failed === value.total);
export type Progress = z.infer<typeof progressSchema>;
