import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync('src/shared/ui/base.css', 'utf8');
function luminance(hex: string): number {
 const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
 const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
 return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
it('keeps every text-token pairing at WCAG AA contrast in both color schemes', () => {
 const themes = css.split('@media');
 themes.forEach(theme => {
  const tokens = Object.fromEntries(Array.from(theme.matchAll(/--([\w-]+):\s*(#[a-f0-9]{6})/g), match => [match[1], match[2]]));
  for (const background of ['bg', 'surface', 'accent-soft']) {
   for (const foreground of ['fg', 'muted']) {
    const values = [luminance(tokens[background]!), luminance(tokens[foreground]!)].sort((a, b) => b - a);
    expect((values[0]! + 0.05) / (values[1]! + 0.05), `${foreground} / ${background}`).toBeGreaterThanOrEqual(4.5);
   }
  }
  for (const [foreground, background] of [['accent', 'bg'], ['danger', 'bg'], ['danger', 'surface'], ['on-accent', 'accent']]) {
   const values = [luminance(tokens[foreground!]!), luminance(tokens[background!]!)].sort((a, b) => b - a);
   expect((values[0]! + 0.05) / (values[1]! + 0.05), `${foreground} / ${background}`).toBeGreaterThanOrEqual(4.5);
  }
 });
});
