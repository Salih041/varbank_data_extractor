// Çıkarılan tablo verisini AI'ya gönderilecek kompakt metne (TSV) dönüştürür ve
// boyut sınırını uygular. JSON yerine TSV: aynı veri için ~%40-60 daha az token.

import { estimateTokens } from '../../shared/tokens.js';

// Kişiyi/numuneyi tanımlayabilecek sütunlar. Varsayılan olarak AI'ya gönderilmez
// (JSON dışa aktarımına dahildir). Kullanıcı onay penceresinde dahil edebilir.
export const IDENTIFIER_COLUMN_RE =
  /^(sample\d*|pedigree|owner|phenotype|subphentypes|comments|project|sid|aid|prid|phenomizer description)(\s\(\d+\))?$/i;

// Variation Data'daki numune başına genotip sütunları başlıkta kimlik taşır:
// ör. "A:PRID946:SID23491:AID116383:NA12878"
const EMBEDDED_ID_RE = /\b(PRID|SID|AID)\d+/i;

export const identifierColumns = (columns) =>
  columns.filter((c) => IDENTIFIER_COLUMN_RE.test(c) || EMBEDDED_ID_RE.test(c));

const cell = (v) => (v == null ? '' : String(v).replace(/[\t\r\n]+/g, ' '));

/**
 * @param {{source:object, columns:string[], rows:object[]}} data  extractGrid çıktısı
 * @param {{maxChars:number, excludeColumns?:string[]}} opts
 */
export function buildAttachment(data, { maxChars, excludeColumns = [] }) {
  const drop = new Set(excludeColumns);
  const columns = data.columns.filter((c) => !drop.has(c));
  const src = data.source || {};
  const header = [
    `Source: Varbank 2.0 / ${src.tab || '-'} / ${src.caption || src.grid}${src.page ? ` (${src.page})` : ''}`,
    `Columns: ${columns.length}, Total rows: ${data.rows.length}`,
    columns.map(cell).join('\t'),
  ].join('\n');

  let text = header;
  let included = 0;
  for (const row of data.rows) {
    const line = '\n' + columns.map((c) => cell(row[c])).join('\t');
    if (text.length + line.length > maxChars) break;
    text += line;
    included++;
  }
  if (included < data.rows.length) {
    text += `\n[Note: due to the size limit only the first ${included} of ${data.rows.length} rows were sent.]`;
  }

  return {
    kind: 'table',
    gridId: src.grid,
    caption: src.caption || src.grid,
    tab: src.tab || null,
    page: src.page || null,
    columns,
    excludedColumns: [...drop].filter((c) => data.columns.includes(c)),
    rowCount: data.rows.length,
    includedRows: included,
    text,
    charCount: text.length,
    tokens: estimateTokens(text),
  };
}

export function attachmentSummary(a) {
  return `${a.caption} · ${a.includedRows}${a.includedRows < a.rowCount ? `/${a.rowCount}` : ''} rows · ${a.columns.length} columns`;
}
