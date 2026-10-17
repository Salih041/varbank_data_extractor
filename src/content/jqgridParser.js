// Varbank 2.0 jqGrid (4.5.4) DOM ayrıştırıcısı.
//
// DOM sözleşmesi (gerçek sitede doğrulandı):
//   div.ui-jqgrid#gbox_<id>
//     .ui-jqgrid-title                         -> başlık
//     table.ui-jqgrid-htable tr.ui-jqgrid-labels > th#<id>_<col>
//         div#jqgh_<id>_<col>                  -> sütun adı
//     table.ui-jqgrid-btable#<id> tr.jqgrow    -> veri satırları
//         td[aria-describedby="<id>_<col>"]    -> hücre (indeks DEĞİL, bu nitelik ile eşlenir)
//     .ui-paging-info                          -> "View 1 - 200 of 674"
//   Seçili satır: tr.ui-state-highlight veya aria-selected="true"
//
// Güvenlik: yalnızca textContent ve getAttribute okunur. innerHTML okunmaz/yazılmaz,
// sayfadaki hiçbir fonksiyon çağrılmaz.

import { LIMITS } from '../shared/limits.js';
import { cleanText, safeHttpUrl } from '../shared/sanitize.js';

const SKIP_COLUMNS = new Set(['cb', 'rn', 'subgrid']);
const COL_KEY_RE = /^[\w-]{1,64}$/;

function isRendered(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (n.hidden || n.getAttribute('aria-hidden') === 'true') return false;
    const view = n.ownerDocument.defaultView;
    const style = view ? view.getComputedStyle(n) : n.style;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function tabInfo(gbox) {
  const panel = gbox.closest('[id^="tabs-"]');
  if (!panel) return { tabId: null, tabLabel: null };
  const link = gbox.ownerDocument.querySelector(`a[href="#${CSS.escape(panel.id)}"]`);
  return { tabId: panel.id, tabLabel: link ? cleanText(link.textContent, 60) : null };
}

function bodyTable(gbox) {
  return gbox.querySelector('table.ui-jqgrid-btable');
}

function dataRows(btable) {
  return Array.from(btable.rows).filter((tr) => tr.classList.contains('jqgrow'));
}

function isSelected(tr) {
  return tr.classList.contains('ui-state-highlight') || tr.getAttribute('aria-selected') === 'true';
}

function cellMap(tr) {
  const map = new Map();
  for (const td of tr.cells) {
    const k = td.getAttribute('aria-describedby');
    if (k && !map.has(k)) map.set(k, td);
  }
  return map;
}

function gboxFor(doc, gridId) {
  const btable = doc.getElementById(gridId);
  if (!btable || !btable.classList.contains('ui-jqgrid-btable')) return null;
  return btable.closest('div.ui-jqgrid');
}

function firstSafeLink(td, base) {
  for (const a of td.querySelectorAll('a[href]')) {
    const url = safeHttpUrl(a.getAttribute('href'), base);
    if (url) return url;
  }
  return null;
}

export function readColumns(gbox, gridId) {
  const prefix = gridId + '_';
  const ths = gbox.querySelectorAll('table.ui-jqgrid-htable tr.ui-jqgrid-labels > th');
  const columns = [];
  const seen = new Map();
  for (const th of ths) {
    if (!th.id || !th.id.startsWith(prefix)) continue;
    const key = th.id.slice(prefix.length);
    if (!COL_KEY_RE.test(key) || SKIP_COLUMNS.has(key)) continue;
    const labelEl = th.querySelector(`#jqgh_${CSS.escape(th.id)}`) || th;
    let label = cleanText(labelEl.textContent, LIMITS.MAX_HEADER_CHARS) || key;
    // Aynı adlı sütunları tekilleştir: "Ad", "Ad (2)", ...
    const count = (seen.get(label) || 0) + 1;
    seen.set(label, count);
    if (count > 1) label = `${label} (${count})`;
    columns.push({ key, label, hidden: th.style.display === 'none' });
    if (columns.length >= LIMITS.MAX_COLUMNS) break;
  }
  return columns;
}

export function describeGrid(gbox) {
  const btable = bodyTable(gbox);
  if (!btable || !btable.id) return null;
  const gridId = btable.id;
  const rows = dataRows(btable);
  const loadEl = gbox.ownerDocument.getElementById(`load_${gridId}`);
  const { tabId, tabLabel } = tabInfo(gbox);
  return {
    gridId,
    caption: cleanText(gbox.querySelector('.ui-jqgrid-title')?.textContent, 80) || gridId,
    tabId,
    tabLabel,
    visible: isRendered(gbox),
    loading: !!loadEl && isRendered(loadEl),
    rowCount: rows.length,
    selectedCount: rows.filter(isSelected).length,
    multiselect: !!gbox.querySelector(`#cb_${CSS.escape(gridId)}`),
    pagingInfo: cleanText(gbox.querySelector('.ui-paging-info')?.textContent, 80) || null,
    columns: readColumns(gbox, gridId),
  };
}

export function findGridBoxes(doc = document) {
  return Array.from(doc.querySelectorAll('div.ui-jqgrid')).filter((g) => bodyTable(g));
}

export function listGrids(doc = document) {
  return findGridBoxes(doc).map(describeGrid).filter(Boolean);
}

// Panelde elle satır seçimi için hafif satır özeti (ilk birkaç görünür sütun).
export function previewRows(doc, gridId, maxCols = 6) {
  const gbox = gboxFor(doc, gridId);
  if (!gbox) return null;
  const columns = readColumns(gbox, gridId).filter((c) => !c.hidden).slice(0, maxCols);
  const rows = dataRows(bodyTable(gbox))
    .slice(0, LIMITS.MAX_EXTRACT_ROWS)
    .map((tr) => {
      const cells = cellMap(tr);
      return {
        id: tr.id,
        selected: isSelected(tr),
        values: columns.map((c) => cleanText(cells.get(`${gridId}_${c.key}`)?.textContent, 60)),
      };
    });
  return { columns, rows };
}

/**
 * @param {Document} doc
 * @param {{gridId:string,rowMode:'selected'|'visible'|'ids',rowIds?:string[],columnKeys:string[],includeLinks:boolean}} req
 */
export function extractGrid(doc, req) {
  const gbox = gboxFor(doc, req.gridId);
  if (!gbox) return { ok: false, error: 'GRID_NOT_FOUND' };
  const info = describeGrid(gbox);
  const byKey = new Map(info.columns.map((c) => [c.key, c]));
  const columns = req.columnKeys.map((k) => byKey.get(k)).filter(Boolean);
  if (columns.length === 0) return { ok: false, error: 'NO_COLUMNS' };

  let rows = dataRows(bodyTable(gbox));
  if (req.rowMode === 'selected') rows = rows.filter(isSelected);
  else if (req.rowMode === 'ids') {
    const wanted = new Set(req.rowIds);
    rows = rows.filter((tr) => wanted.has(tr.id));
  }
  const totalMatched = rows.length;
  rows = rows.slice(0, LIMITS.MAX_EXTRACT_ROWS);

  const base = doc.location ? doc.location.href : undefined;
  const outRows = rows.map((tr) => {
    const cells = cellMap(tr);
    const obj = {};
    for (const c of columns) {
      const td = cells.get(`${req.gridId}_${c.key}`);
      obj[c.label] = td ? cleanText(td.textContent) : '';
      if (req.includeLinks) obj[`${c.label} (link)`] = td ? firstSafeLink(td, base) : null;
    }
    return obj;
  });

  let outColumns = [];
  for (const c of columns) {
    outColumns.push(c.label);
    if (req.includeLinks) outColumns.push(`${c.label} (link)`);
  }
  // Hiç link içermeyen "(link)" sütunlarını çıktıdan at.
  if (req.includeLinks) {
    const drop = new Set(
      outColumns.filter((col) => col.endsWith(' (link)') && outRows.every((r) => r[col] == null)),
    );
    outColumns = outColumns.filter((c) => !drop.has(c));
    for (const r of outRows) for (const col of drop) delete r[col];
  }

  return {
    ok: true,
    data: {
      source: {
        site: 'varbank2',
        grid: req.gridId,
        caption: info.caption,
        tab: info.tabLabel,
        page: info.pagingInfo,
        extractedAt: new Date().toISOString(),
      },
      columns: outColumns,
      rows: outRows,
    },
    totalMatched,
    truncated: totalMatched > outRows.length,
  };
}
