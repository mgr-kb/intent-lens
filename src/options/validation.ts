import { API_KEY_MAX } from '../shared/constants';
export function keyError(value: string): string {
 return value.trim().length > 0 && value.trim().length <= API_KEY_MAX && /^[\x21-\x7e]+$/.test(value.trim()) ? '' : 'APIキーを半角英数字・記号で入力してください（空白・改行は含めません）。';
}
