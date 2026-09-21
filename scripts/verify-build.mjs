import { readFile, access, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { checkCode, checkManifest } from './build-checks.mjs';
const mock = process.env.VITE_JEV_MOCK === '1';
const directory = mock ? 'dist-mock' : 'dist';
const read = file => readFile(`${directory}/${file}`, 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
// HTTP(S), top-frame only; no popup in v2.
checkManifest(manifest);
const files = ['bar.html', 'bar-assets/bar.js', manifest.options_page, manifest.background.service_worker,
 ...manifest.content_scripts.flatMap(s => s.js), ...Object.values(manifest.icons)];
await Promise.all(files.map(file => access(`${directory}/${file}`)));
new vm.Script(await read('content.js'));
for (const page of ['bar.html', manifest.options_page]) {
 const html = await read(page);
 assert.doesNotMatch(html, /<style\b|\sstyle=/i, 'Extension CSP requires external stylesheets');
 const refs = Array.from(html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g), match => match[1]);
 assert.ok(refs.some(ref => ref.endsWith('.js')));
 assert.ok(refs.some(ref => ref.endsWith('.css')));
 if (page === 'bar.html') refs.forEach(ref => assert.match(ref.replace(/^\.\//, ''), /^bar-assets\/[^/]+\.(?:js|css)$/, 'Every bar asset must be covered by dynamic WAR')); 
 await Promise.all(refs.map(ref => access(`${directory}/${ref.replace(/^\.\//, '')}`)));
}
const scripts = (await readdir(directory, { recursive: true })).filter(file => file.endsWith('.js'));
checkCode((await Promise.all(scripts.map(read))).join('\n'), mock);
console.info(`${directory}: mode, permissions, CSP, console prohibition and referenced files verified.`);
