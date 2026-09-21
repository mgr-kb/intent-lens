import { Client } from '../jev/runtime-client';
import { errorCode } from '../jev/errors';
import { Engine } from './engine';
const engine = new Engine(new Client());
chrome.runtime.onMessage.addListener((message, sender, respond) => {
 void engine.message(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: errorCode(error) }));
 return true;
});
// No external message listener. Failures are reported through request responses; no sensitive logs.
chrome.tabs.onRemoved.addListener(id => { void engine.removed(id).catch(() => undefined); });
chrome.tabs.onUpdated.addListener((id, change, tab) => {
 if (change.url || change.status === 'loading') void engine.navigation(id, change.url ?? tab.url ?? '', change.status === 'loading').catch(() => undefined);
});
chrome.tabs.onActivated.addListener(() => { void engine.activated().catch(() => undefined); });

chrome.action.onClicked.addListener(tab => { if (tab.id !== undefined) void engine.toggle(tab.id).catch(() => undefined); });
