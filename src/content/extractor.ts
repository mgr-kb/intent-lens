import { normalizeBody } from '../shared/fingerprint';
import { countCharacters } from '../shared/text';
import { BLOCK_MIN } from '../shared/constants';
const BLOCKS = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,td,pre,figcaption';
const EXCLUDED = 'form,input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="searchbox"],[role="combobox"],[role="spinbutton"],output,[inert],script,style,noscript,[hidden],[aria-hidden="true"]';
const STRUCTURAL = 'html,body,main,article,section,nav,header,footer,ul,ol,dl,table,tbody,tr';
const owned = new WeakSet<Element>();
export function markOwned(element: Element): void { owned.add(element); }
export function isOwned(element: Element): boolean {
 return owned.has(element) || !!element.parentElement && isOwned(element.parentElement);
}
export interface ExtractedTarget { readonly element: Element; readonly id: null; readonly text: string; readonly context: '' }
function excluded(element: Element): boolean {
 const style = element.ownerDocument.defaultView?.getComputedStyle(element);
 return element.ownerDocument.designMode?.toLowerCase() === 'on' || style?.contentVisibility === 'hidden' || element.matches(EXCLUDED) || isOwned(element) || style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.opacity === '0';
}
function textOf(node: Node): string {
 if (node.nodeType === 3) return node.textContent ?? '';
 if (node.nodeType !== 1 || excluded(node as Element)) return '';
 if ((node as Element).tagName === 'BR') return ' ';
 const text = Array.from(node.childNodes, textOf).join('');
 return (node as Element).matches(`${BLOCKS},div,section`) ? ` ${text} ` : text;
}
export function extract(root: Document): readonly ExtractedTarget[] {
 const walk = (element: Element): readonly ExtractedTarget[] => {
  if (excluded(element)) return [];
  const explicit = element.matches(BLOCKS);
  const leaf = !element.matches(STRUCTURAL) && !element.querySelector(`${BLOCKS},div,section,article,main,ul,ol,table`);
  if (explicit || leaf) {
   const text = normalizeBody(textOf(element));
   if (countCharacters(text) >= BLOCK_MIN) return [{ element, id: null, text, context: '' }];
  }
  return Array.from(element.children).flatMap(walk);
 };
 return root.body ? walk(root.body) : [];
}
