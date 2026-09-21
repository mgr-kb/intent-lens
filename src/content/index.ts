import { contextInvalidated } from '../shared/context';
import { ContentController } from './controller';
const controller = new ContentController(document, window, message => chrome.runtime.sendMessage(message));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
 if (contextInvalidated()) { controller.destroy(); return; }
 if (sender.id === chrome.runtime.id && sender.tab === undefined) respond(controller.receive(message));
});
// Manifest run_at=document_idle guarantees a live document. The controller also handles BFCache.
controller.start();
