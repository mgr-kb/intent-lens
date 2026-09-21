import { messageSchema, type Message } from '../shared/messages';
import { barMessageSchema } from '../shared/bar';
import { JevError } from '../jev/errors';
export function barSession(sender: chrome.runtime.MessageSender, extensionId: string): string | undefined {
 try {
  const url = new URL(sender.url ?? '');
  const base = `${url.protocol}//${url.host}${url.pathname}`;
  // Chrome may report the canonical extension ID after resolving a dynamic WAR URL.
  const urls = [`chrome-extension://${extensionId}/bar.html`, chrome.runtime.getURL('bar.html')];
  if (!urls.includes(base) || (url.search !== '' && url.search !== '?focus=1') || !url.hash) return undefined;
  return url.hash.slice(1);
 } catch { return undefined; }
}
export function validateMessage(raw: unknown, sender: chrome.runtime.MessageSender, extensionId: string): Message {
 if (sender.id !== extensionId) throw new JevError('invalid-input');
 if (barSession(sender, extensionId)) {
  const bar = barMessageSchema.safeParse(raw);
  if (!bar.success || sender.tab?.id === undefined || !Number.isInteger(sender.tab.id) || sender.tab.id < 0 ||
   !sender.frameId || sender.frameId < 0 || !sender.documentId || sender.documentLifecycle !== 'active') throw new JevError('invalid-input');
  return { ...bar.data, tabId: sender.tab.id };
 }
 const parsed = messageSchema.safeParse(raw);
 if (!parsed.success) throw new JevError('invalid-input');
 const message = parsed.data;
 const options = sender.url === `chrome-extension://${extensionId}/options.html`;
 if (['save-key', 'delete-key', 'get-settings', 'set-threshold'].includes(message.type)) {
  if (!options) throw new JevError('invalid-input');
  return message;
 }
 if (message.type === 'jump') throw new JevError('invalid-input');
 const control = 'tabId' in message;
 if (sender.tab?.id === undefined || !Number.isInteger(sender.tab.id) || sender.tab.id < 0 ||
  sender.frameId !== 0 || !sender.url || !sender.documentId || sender.documentLifecycle !== 'active') throw new JevError('invalid-input');
 if (control && message.tabId !== sender.tab.id) throw new JevError('invalid-input');
 return message;
}
