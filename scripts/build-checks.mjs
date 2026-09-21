import assert from 'node:assert/strict';
export function checkCode(code, mock) {
 assert.equal(code.includes('api.typesafe.ai'), !mock, 'Real API code must exist only in production JS');
 assert.equal(code.includes('jev-mock-v1'), mock, 'Mock client must exist only in mock JS');
 assert.doesNotMatch(code, /onMessageExternal|onConnectExternal/, 'No external messaging listeners in extension JS');
 assert.doesNotMatch(code, /console\s*\./, 'No console calls in extension JS');
}
export function checkManifest(manifest) {
 assert.deepEqual(manifest.permissions, ['storage']);
 assert.deepEqual(manifest.host_permissions, ['https://api.typesafe.ai/*']);
 assert.equal(manifest.externally_connectable, undefined);
 assert.deepEqual(manifest.web_accessible_resources, [{ resources: ['bar.html', 'bar-assets/*'], matches: ['http://*/*', 'https://*/*'], use_dynamic_url: true }]);
 assert.equal(manifest.action.default_popup, undefined);
 assert.equal(manifest.background.type, 'module');
 assert.deepEqual(manifest.content_scripts, [{
  matches: ['http://*/*', 'https://*/*'],
  all_frames: false, js: ['content.js'], run_at: 'document_idle',
 }]);
 assert.equal(manifest.content_security_policy.extension_pages,
  "default-src 'none'; script-src 'self'; object-src 'none'; connect-src https://api.typesafe.ai; style-src 'self'; img-src 'self'; frame-ancestors http: https:");
}
