import { requireContext, contextInvalidated, ContextInvalidated } from '../context';
import type { BarMessage } from '../bar';
import { hitsSchema } from '../bar';
import { z } from 'zod';
import { thresholdSchema } from '../settings';
import { tabStateSchema, type Message } from '../messages';
import { errorCodeSchema } from '../progress';
import type { ErrorCode } from '../types';
export class UiError extends Error {
 constructor(readonly code: ErrorCode) { super(code); }
}
export const settingsSchema = z.object({ keyConfigured: z.boolean(), mock: z.boolean(), threshold: thresholdSchema });
export const statusSchema = z.object({ state: tabStateSchema.nullable(), configured: z.boolean(), paused: z.boolean(), hits: hitsSchema.optional(), mock: z.boolean() });
export type Status = z.infer<typeof statusSchema>;
export const savedSchema = z.object({ ok: z.literal(true) });
export async function request<T>(message: Message | BarMessage, schema: z.ZodType<T>): Promise<T> {
 let raw: unknown;
 try { requireContext(); raw = await chrome.runtime.sendMessage(message); requireContext(); }
 catch (error) { if (contextInvalidated(error)) throw new ContextInvalidated(); throw new UiError('network'); }
 const envelope = z.object({ ok: z.boolean(), data: z.unknown().optional(), error: errorCodeSchema.optional() }).safeParse(raw);
 if (!envelope.success) throw new UiError('invalid-response');
 if (!envelope.data.ok) throw new UiError(envelope.data.error ?? 'network');
 const data = schema.safeParse(envelope.data.data);
 if (!data.success) throw new UiError('invalid-response');
 return data.data;
}
const errors: Readonly<Record<ErrorCode, string>> = {
 auth: '認証エラー：APIキーを確認してください。',
 'rate-limit': '利用制限：時間をおいて再度お試しください。必要に応じて設定を変更するか、タブをOFF→ONにしてください。',
 network: '通信エラー：接続を確認して、もう一度お試しください。',
 server: '通信エラー：サービスが一時的に利用できません。時間をおいてお試しください。',
 timeout: '通信エラー：接続がタイムアウトしました。もう一度お試しください。',
 'invalid-response': '通信エラー：応答を確認できませんでした。もう一度お試しください。',
 'invalid-input': '入力内容を確認してください。',
 cancelled: '操作が取り消されました。現在の設定を確認してください。',
 'settings-required': '設定が必要です。APIキーを設定してください。',
 storage: '保存に失敗しました。拡張機能を再読み込みしてお試しください。',
};
export const errorMessage = (error: unknown): string => errors[error instanceof UiError ? error.code : 'network'];
