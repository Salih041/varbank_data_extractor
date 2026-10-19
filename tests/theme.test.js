// Paletin okunabilirlik sözleşmesi: styles.css'teki :root renkleri değişirse kritik metin/zemin
// çiftlerinin kontrastı WCAG eşiklerinin altına düşmemeli. Tema bilerek "soft" olduğu için
// gövde metni için üst sınır da kontrol edilir (saf siyah/beyaz kadar sert olmasın).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '../src/sidepanel/styles.css'), 'utf8');
const root = css.match(/:root\s*\{([\s\S]*?)\}/)[1];
const vars = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(vars[a]), luminance(vars[b])];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('aydınlık tema paleti', () => {
  it('beklenen renkleri tanımlar', () => {
    expect(vars.bg.toLowerCase()).toBe('#faf8f1');
    expect(vars.accent.toLowerCase()).toBe('#66bfff');
    expect(vars.highlight.toLowerCase()).toBe('#ffd15b');
    expect(css).toMatch(/color-scheme:\s*light/);
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it.each([
    ['fg', 'bg', 7],
    ['fg', 'surface', 7],
    ['fg', 'surface-raised', 7],
    ['fg', 'accent-soft', 7],
    ['muted', 'bg', 4.5],
    ['muted', 'surface', 4.5],
    ['accent-text', 'bg', 4.5],
    ['accent-text', 'surface', 4.5],
    ['accent-text', 'accent-soft', 4.5],
    ['accent-fg', 'accent', 4.5],
    ['highlight-fg', 'highlight', 4.5],
    ['highlight-soft-fg', 'highlight-soft', 4.5],
    ['danger', 'surface', 4.5],
  ])('%s / %s kontrastı en az %s:1', (fgName, bgName, min) => {
    expect(contrast(fgName, bgName)).toBeGreaterThanOrEqual(min);
  });

  it('gövde metni göz yormayacak kadar yumuşak (≤ 12:1)', () => {
    expect(contrast('fg', 'bg')).toBeLessThanOrEqual(12);
  });

  it('büyük yazıda taşmayı önleyen düzen kuralları yerinde', () => {
    // fieldset varsayılan min-content genişliği uzun tek satırla paneli taşırıyordu.
    expect(css).toMatch(/fieldset\.box\s*\{\s*min-inline-size:\s*0;\s*\}/);
    // Kompakt düzen: panel container'ı ve rem tabanlı eşik (yazı büyüdükçe eşik de büyür).
    expect(css).toMatch(/\.app\s*\{[^}]*container:\s*panel\s*\/\s*inline-size/);
    expect(css).toMatch(/@container panel \(max-width:\s*[\d.]+rem\)/);
  });

  it('yazı boyutları rem cinsinden (ölçeklenebilir); px yalnızca kök varsayılanda', () => {
    // html { font-size: 13.5px } JS yazı boyutunu uygulamadan önceki varsayılan köktür.
    expect(css).toMatch(/html\s*\{\s*font-size:\s*13\.5px;\s*\}/);
    const withoutRoot = css.replace(/html\s*\{\s*font-size:[^}]*\}/, '');
    const pxFontSizes = [...withoutRoot.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => m[0]);
    expect(pxFontSizes).toEqual([]);
  });
});
