// Normalize Unicode composition and presentation whitespace, without changing letter case or meaning.
export const normalizeBody = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
export async function bodyFingerprint(text: string): Promise<string> {
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeBody(text)));
 return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
