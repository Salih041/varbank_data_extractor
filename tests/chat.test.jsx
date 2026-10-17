import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { buildAttachment, identifierColumns } from '../src/sidepanel/chat/attachment.js';
import { buildRequestMessages, DATA_OPEN, SYSTEM_PROMPT } from '../src/sidepanel/chat/context.js';
import SafeMarkdown from '../src/sidepanel/chat/SafeMarkdown.jsx';

const data = {
  source: { grid: 'list10', caption: 'Variation Data', tab: 'Variants', page: 'View 1 - 3 of 3' },
  columns: ['Chr', 'Start', 'Sample', 'HGNC'],
  rows: [
    { Chr: '1', Start: '100', Sample: 'P1', HGNC: 'A\tB' },
    { Chr: '2', Start: '200', Sample: 'P2', HGNC: 'C' },
    { Chr: '3', Start: '300', Sample: 'P3', HGNC: 'D' },
  ],
};

describe('buildAttachment', () => {
  it('TSV üretir, sekmeleri kaçırır ve tanımlayıcı sütunları çıkarır', () => {
    expect(identifierColumns(data.columns)).toEqual(['Sample']);
    expect(identifierColumns(['A:PRID946:SID23491:AID116383:NA12878', 'HGNC', 'Sample1', 'Owner'])).toEqual([
      'A:PRID946:SID23491:AID116383:NA12878',
      'Sample1',
      'Owner',
    ]);
    const a = buildAttachment(data, { maxChars: 10_000, excludeColumns: ['Sample'] });
    expect(a.columns).toEqual(['Chr', 'Start', 'HGNC']);
    expect(a.text).toContain('Chr\tStart\tHGNC');
    expect(a.text).toContain('1\t100\tA B');
    expect(a.text).not.toContain('P1');
    expect(a.includedRows).toBe(3);
  });

  it('boyut sınırında satırları kırpar ve not düşer', () => {
    const header = buildAttachment({ ...data, rows: [] }, { maxChars: 10_000 }).text.length;
    const a = buildAttachment(data, { maxChars: header + 20 });
    expect(a.includedRows).toBe(1);
    expect(a.text).toMatch(/only the first 1 of 3 rows/);
  });
});

describe('buildRequestMessages', () => {
  const att = (id) => ({ ...buildAttachment(data, { maxChars: 10_000 }), id });

  it('system prompt + son ek tam, eski ek özet olarak gönderilir', () => {
    const msgs = [
      { role: 'user', content: 'ilk', attachments: [att('a1')] },
      { role: 'assistant', content: 'yanıt', status: 'done' },
      { role: 'user', content: 'ikinci', attachments: [att('a2')] },
    ];
    const r = buildRequestMessages(msgs);
    expect(r.ok).toBe(true);
    expect(r.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(r.messages[1].content).toMatch(/^\[Previously attached data/);
    expect(r.messages[3].content.startsWith(DATA_OPEN)).toBe(true);
    expect(r.droppedCount).toBe(0);
  });

  it('hatalı asistan mesajlarını atlar ve bütçe aşımında eski mesajları düşürür', () => {
    const long = 'x'.repeat(4000);
    const msgs = [
      { role: 'user', content: long },
      { role: 'assistant', content: long, status: 'done' },
      { role: 'user', content: 'soru' },
      { role: 'assistant', content: '', status: 'error' },
      { role: 'user', content: 'son' },
    ];
    const r = buildRequestMessages(msgs, { contextTokens: 1600, responseTokens: 200 });
    expect(r.ok).toBe(true);
    expect(r.messages.at(-1).content).toBe('son');
    expect(r.messages[1].role).toBe('user');
    expect(r.droppedCount).toBeGreaterThan(0);
  });

  it('system prompt veriyi geri tekrar etmemeyi söyler ama açık istekte tabloya izin verir', () => {
    expect(SYSTEM_PROMPT).toMatch(/do not repeat it back/);
    expect(SYSTEM_PROMPT).toMatch(/at most ~10 rows/);
    expect(SYSTEM_PROMPT).toMatch(/explicitly asks for a list, table/);
    expect(SYSTEM_PROMPT).toMatch(/UNTRUSTED/);
  });

  it('son mesaj tek başına sığmıyorsa TOO_LARGE döner', () => {
    const r = buildRequestMessages([{ role: 'user', content: 'x'.repeat(50_000) }], { contextTokens: 4000 });
    expect(r).toMatchObject({ ok: false, error: 'TOO_LARGE' });
  });
});

describe('SafeMarkdown', () => {
  it('ham HTML, script ve javascript: linklerini render etmez', () => {
    const md = [
      '**kalın** <script>window.__x=1</script> <img src=x onerror="window.__y=1">',
      '[kötü](javascript:alert(1)) [iyi](https://www.ncbi.nlm.nih.gov/clinvar/)',
      '![izleme](https://evil.example/p.png)',
      '| a | b |\n|---|---|\n| 1 | 2 |',
    ].join('\n\n');
    const { container } = render(<SafeMarkdown text={md} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('strong').textContent).toBe('kalın');
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://www.ncbi.nlm.nih.gov/clinvar/');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(container.textContent).toContain('[image: izleme]');
    expect(container.querySelector('table')).not.toBeNull();
    expect(window.__x).toBeUndefined();
    expect(window.__y).toBeUndefined();
  });
});
