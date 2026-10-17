import { describe, expect, it } from 'vitest';
import { cleanText, safeHttpUrl, safeFileName } from '../src/shared/sanitize.js';
import { redact } from '../src/shared/redact.js';
import { validateExtractRequest } from '../src/shared/messages.js';
import { clampAttachmentChars, LIMITS } from '../src/shared/limits.js';

describe('sanitize', () => {
  it('kontrol karakterlerini ve fazla boşlukları temizler, keser', () => {
    expect(cleanText('  a\u0000b​  \n c ')).toBe('ab c');
    expect(cleanText('x'.repeat(10), 5)).toBe('xxxxx…');
    expect(cleanText(null)).toBe('');
  });

  it('yalnızca http/https URL kabul eder', () => {
    expect(safeHttpUrl('https://a.org/x')).toBe('https://a.org/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<b>')).toBeNull();
    expect(safeHttpUrl('https://u:p@a.org')).toBeNull();
    expect(safeHttpUrl('/img/x.jpg', 'https://varbank.ccg.uni-koeln.de/varbank2/')).toBe(
      'https://varbank.ccg.uni-koeln.de/img/x.jpg',
    );
  });

  it('dosya adını güvenli hale getirir', () => {
    expect(safeFileName('../a b/c.json')).toBe('.._a_b_c.json');
  });
});

describe('redact', () => {
  it('API anahtarlarını ve bearer tokenları gizler', () => {
    const s = redact('key gsk_FAKEtest12345 and Authorization: Bearer abcdefghijkl12345');
    expect(s).not.toMatch(/FAKEtest12345/);
    expect(s).not.toMatch(/abcdefghijkl12345/);
    expect(s).toContain('gsk_***');
  });

  it('uzun metni keser', () => {
    expect(redact('a'.repeat(1000), 10)).toHaveLength(11);
  });
});

describe('messages', () => {
  const ok = { type: 'EXTRACT', gridId: 'list10', rowMode: 'selected', columnKeys: ['1'], includeLinks: false };
  it('geçerli isteği kabul eder', () => expect(validateExtractRequest(ok)).toBe(true));
  it('bozuk istekleri reddeder', () => {
    expect(validateExtractRequest({ ...ok, gridId: 'a"]; x' })).toBe(false);
    expect(validateExtractRequest({ ...ok, rowMode: 'all' })).toBe(false);
    expect(validateExtractRequest({ ...ok, columnKeys: [] })).toBe(false);
    expect(validateExtractRequest({ ...ok, rowMode: 'ids', rowIds: ['<x>'] })).toBe(false);
    expect(validateExtractRequest({ ...ok, includeLinks: 'yes' })).toBe(false);
  });
});

describe('limits', () => {
  it('ek boyutu sınırını aralıkta tutar', () => {
    expect(clampAttachmentChars(10)).toBe(LIMITS.MIN_MAX_ATTACHMENT_CHARS);
    expect(clampAttachmentChars(1e9)).toBe(LIMITS.HARD_MAX_ATTACHMENT_CHARS);
    expect(clampAttachmentChars('abc')).toBe(LIMITS.DEFAULT_MAX_ATTACHMENT_CHARS);
  });
});
