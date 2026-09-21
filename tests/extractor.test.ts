// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { extract, markOwned } from '../src/content/extractor';
import { snapshot, stillMatches } from '../src/content/snapshot';
import { BLOCK_MIN } from '../src/shared/constants';
const text = 'A long visible paragraph about semantic search.';
afterEach(() => { document.body.innerHTML = ''; });
it('adopts outer blocks once and includes near-leaf containers without aggregating the page', () => {
 document.body.innerHTML = `<main><blockquote><p>${text}</p><p>${text}</p></blockquote><div><div>${text}</div></div><p>short</p></main>`;
 const targets = extract(document);
 expect(targets.map(t => t.element.tagName)).toEqual(['BLOCKQUOTE', 'DIV']);
 expect(targets[0]!.text).toContain(text);
});
it('extracts every supported generic block and applies normalized grapheme minimum', () => {
 for (const tag of ['p','li','blockquote','h1','h2','h3','h4','h5','h6','dd','td','pre','figcaption']) {
  document.body.replaceChildren(Object.assign(document.createElement(tag), { textContent: text }));
  expect(extract(document)).toHaveLength(1);
 }
 document.body.innerHTML = `<p>${'👨‍👩‍👧‍👦'.repeat(BLOCK_MIN - 1)}   </p><div>${'a'.repeat(BLOCK_MIN)}</div>`;
 expect(extract(document).map(t => t.text)).toEqual(['a'.repeat(BLOCK_MIN)]);
});
it('excludes inputs, editing surfaces, hidden descendants and owned extension roots', () => {
 document.body.innerHTML = `<p>${text}<span hidden>secret hidden data</span><span aria-hidden="true">secret aria</span></p>`;
 for (const markup of [`<input value="${text}">`, `<textarea>${text}</textarea>`, `<div contenteditable>${text}</div>`, `<div role="textbox">${text}</div>`, `<script>${text}</script>`, `<style>${text}</style>`, `<div hidden><p>${text}</p></div>`, `<div style="display:none"><p>${text}</p></div>`, `<div style="visibility:hidden"><p>${text}</p></div>`, `<div aria-hidden="true"><p>${text}</p></div>`]) document.body.insertAdjacentHTML('beforeend', markup);
 const own = document.createElement('aside'); own.innerHTML = `<p>${text}</p>`; markOwned(own); document.body.append(own);
 expect(extract(document).map(t => t.text)).toEqual([text]);
});
it('normalizes fingerprints and invalidates reused elements when text changes', async () => {
 document.body.innerHTML = `<p>${text}</p><p>  ${text.replaceAll(' ', '  ')}  </p>`;
 const targets = extract(document); const [a,b] = await Promise.all(targets.map(snapshot));
 expect(a!.fingerprint).toBe(b!.fingerprint);
 expect(stillMatches(a!, targets[0])).toBe(true);
 targets[0]!.element.textContent = 'A completely different paragraph that reuses this element.';
 expect(stillMatches(a!, extract(document)[0])).toBe(false);
});
it('excludes ARIA inputs, output, inert and content-visibility hidden surfaces', () => {
 document.body.innerHTML = `<p>${text}</p>`;
 for (const attrs of ['role="searchbox"', 'role="combobox"', 'role="spinbutton"', 'inert', 'style="content-visibility: hidden"']) {
  document.body.insertAdjacentHTML('beforeend', `<div ${attrs}><p>${text} excluded</p></div>`);
 }
 document.body.insertAdjacentHTML('beforeend', `<output>${text}</output>`);
 expect(extract(document).map(target => target.text)).toEqual([text]);
});
it('does not extract a document in designMode', () => {
 document.body.innerHTML = `<p>${text}</p>`;
 const old = document.designMode;
 try { document.designMode = 'on'; expect(extract(document)).toEqual([]); }
 finally { document.designMode = old; }
});
