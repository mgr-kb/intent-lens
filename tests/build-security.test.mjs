import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkCode, checkManifest } from '../scripts/build-checks.mjs';
describe('build security assertions', () => {
 it('rejects mixed and inverted build modes and console output', () => {
  expect(() => checkCode('api.typesafe.ai', false)).not.toThrow();
  expect(() => checkCode('jev-mock-v1', true)).not.toThrow();
  for (const mock of [false, true]) {
   expect(() => checkCode('api.typesafe.ai jev-mock-v1', mock)).toThrow();
   expect(() => checkCode('', mock)).toThrow();
   expect(() => checkCode(`${mock ? 'jev-mock-v1' : 'api.typesafe.ai'} console.error()`, mock)).toThrow();
  }
 });
 it('requires no external messaging declaration and restrictive extension CSP', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  expect(() => checkManifest(manifest)).not.toThrow();
  expect(() => checkManifest({ ...manifest, externally_connectable: { ids: [], matches: [] } })).toThrow();
  expect(() => checkManifest({ ...manifest, externally_connectable: { ids: ['*'], matches: [] } })).toThrow();
  expect(() => checkManifest({ ...manifest, content_security_policy: { extension_pages: "script-src 'self'" } })).toThrow();
 });
});

it('requires HTTP(S) top-frame injection without a popup', () => {
 const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
 const script = manifest.content_scripts[0];
 expect(() => checkManifest(manifest)).not.toThrow();
 expect(() => checkManifest({ ...manifest, action: { default_popup: 'popup.html' } })).toThrow();
 expect(() => checkManifest({ ...manifest, content_scripts: [{ ...script, all_frames: true }] })).toThrow();
 for (const matches of [script.matches.filter(match => match !== 'http://*/*'), [...script.matches, 'https://evil.com/*']]) {
  expect(() => checkManifest({ ...manifest, content_scripts: [{ ...script, matches }] })).toThrow();
 }
});

it('requires dynamic WAR restricted to the bar and its assets', () => {
 const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
 expect(() => checkManifest({ ...manifest, web_accessible_resources: undefined })).toThrow();
 expect(() => checkManifest({ ...manifest, web_accessible_resources: [{ ...manifest.web_accessible_resources[0], use_dynamic_url: false }] })).toThrow();
 expect(() => checkManifest({ ...manifest, web_accessible_resources: [{ ...manifest.web_accessible_resources[0], resources: ['*'] }] })).toThrow();
});

it('does not expose shared, options or background assets through WAR', () => {
 const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
 expect(manifest.web_accessible_resources[0].resources).toEqual(['bar.html', 'bar-assets/*']);
 for (const resource of ['assets/*', 'options.js', 'background.js', 'bar.js']) {
  expect(() => checkManifest({ ...manifest, web_accessible_resources: [{ ...manifest.web_accessible_resources[0], resources: ['bar.html', 'bar-assets/*', resource] }] })).toThrow();
 }
});

it('rejects external messaging listeners in both build modes', () => {
 for (const mock of [false, true]) for (const listener of ['onMessageExternal', 'onConnectExternal']) {
  expect(() => checkCode((mock ? 'jev-mock-v1' : 'api.typesafe.ai') + ' chrome.runtime.' + listener, mock)).toThrow();
 }
});
