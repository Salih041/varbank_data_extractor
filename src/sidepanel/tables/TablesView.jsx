// "Tablolar" sekmesi: grid seçimi, satır/sütun seçimi, önizleme ve dışa aktarma.
// Tüm hücre değerleri React metin düğümü olarak gösterilir (HTML olarak yorumlanmaz).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MSG } from '../../shared/messages.js';
import { LIMITS } from '../../shared/limits.js';
import { errorText, sendToTab } from '../api.js';
import { copyText, downloadJson, toJson } from './exporters.js';

const PREFS_KEY = 'columnPrefs';

function useColumnPrefs() {
  const [prefs, setPrefs] = useState({});
  useEffect(() => {
    chrome.storage.local.get(PREFS_KEY).then((r) => setPrefs(r[PREFS_KEY] || {}));
  }, []);
  const save = useCallback((gridId, keys) => {
    setPrefs((p) => {
      const next = { ...p, [gridId]: keys };
      chrome.storage.local.set({ [PREFS_KEY]: next });
      return next;
    });
  }, []);
  return [prefs, save];
}

function GridLabel({ g }) {
  return (
    <>
      <span className="grid-main">
        <span className="grid-caption">{g.caption}</span>
        <span className={`badge ${g.visible ? 'badge-on' : 'badge-off'}`}>{g.visible ? '● On screen' : 'Hidden'}</span>
      </span>
      <span className="grid-meta">
        {g.tabLabel || g.tabId || '?'} · {g.rowCount} rows
        {g.selectedCount ? ` · ${g.selectedCount} selected` : ''}
        {g.loading ? ' · loading…' : ''}
      </span>
    </>
  );
}

const gridClass = (g) => `${g.visible ? 'on-screen' : 'off-screen'}${g.rowCount ? '' : ' empty'}`;

// Açılır tablo listesi (yerleşik <select> seçeneklerinde etiket/renk gösterilemediği için özel).
// Sitede şu an ekranda olan tablo vurgulu ("On screen") ve en üstte; diğer sekmelerdeki
// tablolar soluk ve "Hidden" etiketli; satırı olmayanlar en altta.
// Klavye: Enter/Space/↓ açar, ↑/↓ gezinir, Enter seçer, Esc kapatır.
function GridPicker({ grids, gridId, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const rank = (g) => (g.visible ? 0 : g.rowCount ? 1 : 2);
  const ordered = [...grids].sort((a, b) => rank(a) - rank(b));
  const current = grids.find((g) => g.gridId === gridId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    listRef.current?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, ordered.findIndex((g) => g.gridId === gridId)));
    setOpen(true);
  };
  const choose = (g) => {
    onChange(g.gridId);
    setOpen(false);
  };
  const onListKey = (e) => {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(ordered.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter' || e.key === ' ') choose(ordered[active]);
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
    else return;
    e.preventDefault();
  };

  return (
    <div className="field grid-picker" ref={rootRef}>
      <span className="field-label" id="grid-picker-label">Table</span>
      <button
        type="button"
        className={`grid-trigger ${current ? gridClass(current) : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="grid-picker-label"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span className="grid-trigger-body">{current ? <GridLabel g={current} /> : 'Select a table'}</span>
        <span className="caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ul
          className="grid-options"
          role="listbox"
          tabIndex={-1}
          ref={listRef}
          aria-labelledby="grid-picker-label"
          aria-activedescendant={`grid-opt-${ordered[active]?.gridId}`}
          onKeyDown={onListKey}
        >
          {ordered.map((g, i) => (
            <li
              key={g.gridId}
              id={`grid-opt-${g.gridId}`}
              role="option"
              aria-selected={g.gridId === gridId}
              className={`grid-option ${gridClass(g)}${g.gridId === gridId ? ' chosen' : ''}${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(g)}
            >
              <GridLabel g={g} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RowSelector({ grid, rowMode, setRowMode, manualIds, setManualIds, preview }) {
  return (
    <fieldset className="box">
      <legend>Rows</legend>
      <div className="radio-row">
        <label>
          <input type="radio" checked={rowMode === 'selected'} onChange={() => setRowMode('selected')} />
          Selected on site ({grid.selectedCount})
        </label>
        <label>
          <input type="radio" checked={rowMode === 'visible'} onChange={() => setRowMode('visible')} />
          All visible ({grid.rowCount})
        </label>
        <label>
          <input type="radio" checked={rowMode === 'ids'} onChange={() => setRowMode('ids')} />
          Pick manually ({manualIds.size})
        </label>
      </div>
      {grid.pagingInfo && <p className="hint">Paging: {grid.pagingInfo}. Only the page currently shown on the site is extracted.</p>}
      {rowMode === 'ids' && preview && (
        <div className="manual-rows">
          <div className="row-actions">
            <button type="button" className="link" onClick={() => setManualIds(new Set(preview.rows.map((r) => r.id)))}>
              All
            </button>
            <button type="button" className="link" onClick={() => setManualIds(new Set())}>
              None
            </button>
            <button
              type="button"
              className="link"
              onClick={() => setManualIds(new Set(preview.rows.filter((r) => r.selected).map((r) => r.id)))}
            >
              Use site selection
            </button>
          </div>
          <div className="scroll-table">
            <table>
              <thead>
                <tr>
                  <th />
                  {preview.columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Row ${r.id}`}
                        checked={manualIds.has(r.id)}
                        onChange={(e) => {
                          const next = new Set(manualIds);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          setManualIds(next);
                        }}
                      />
                    </td>
                    {r.values.map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </fieldset>
  );
}

function ColumnPicker({ columns, selected, onChange }) {
  const [filter, setFilter] = useState('');
  const shown = columns.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (key, on) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    onChange(next);
  };
  // Varsayılan açık, liste yüksekliği sınırlı (CSS .column-list); istenirse katlanır ve
  // kapalıyken yalnızca seçili sütun adlarının özeti görünür.
  const [open, setOpen] = useState(true);
  const chosen = columns.filter((c) => selected.has(c.key)).map((c) => c.label);
  return (
    <fieldset className="box columns-box">
      <legend>
        <button type="button" className="link legend-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} Columns ({selected.size}/{columns.length})
        </button>
      </legend>
      {!open ? (
        <p className="hint ellipsis" title={chosen.join(', ')}>
          {chosen.length ? chosen.join(', ') : 'No columns selected'}
        </p>
      ) : (
        <>
          <div className="row-actions">
            <input type="search" placeholder="Search columns…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button type="button" className="link" onClick={() => onChange(new Set(columns.filter((c) => !c.hidden).map((c) => c.key)))}>
              Visible
            </button>
            <button type="button" className="link" onClick={() => onChange(new Set())}>
              None
            </button>
          </div>
          <div className="column-list">
            {shown.map((c) => (
              <label key={c.key} className={c.hidden ? 'muted' : ''} title={c.label}>
                <input type="checkbox" checked={selected.has(c.key)} onChange={(e) => toggle(c.key, e.target.checked)} />
                <span>
                  {c.label}
                  {c.hidden ? ' (hidden)' : ''}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}

function PreviewTable({ data }) {
  const rows = data.rows.slice(0, 50);
  return (
    <div className="scroll-table">
      <table>
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {data.columns.map((c) => (
                <td key={c}>{r[c] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length > rows.length && <p className="hint">Preview: first {rows.length} of {data.rows.length} rows.</p>}
    </div>
  );
}

const EMPTY_SET = new Set();
const MODE_LABEL = { selected: 'Selected on site:', visible: 'Visible:', ids: 'Manually picked:' };

function defaultColumns(grid, prefs) {
  const keys = new Set(grid.columns.map((c) => c.key));
  const saved = prefs[grid.gridId];
  return new Set(saved ? saved.filter((k) => keys.has(k)) : grid.columns.filter((c) => !c.hidden).map((c) => c.key));
}

export default function TablesView({ tab, onAttach }) {
  const [state, setState] = useState({ status: 'loading' });
  const [gridId, setGridId] = useState(null);
  // Seçimler grid bazında saklanır: { [gridId]: { mode, manual:Set, cols:Set } }.
  // Grid listesi yenilendiğinde veya bir an boş geldiğinde kullanıcının seçimi KAYBOLMAZ;
  // yalnızca başka bir Varbank sekmesine geçilince sıfırlanır.
  const [selByGrid, setSelByGrid] = useState({});
  const [preview, setPreview] = useState(null); // { gridId, columns, rows }
  const [includeLinks, setIncludeLinks] = useState(false);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState(null);
  const [prefs, savePrefs] = useColumnPrefs();

  const lastTabId = useRef(null);
  useEffect(() => {
    if (tab?.id == null) return;
    if (lastTabId.current != null && lastTabId.current !== tab.id) {
      setSelByGrid({});
      setPreview(null);
      setResult(null);
      setGridId(null);
    }
    lastTabId.current = tab.id;
  }, [tab?.id]);

  const refresh = useCallback(async () => {
    if (!tab) {
      setState({ status: 'no-tab' });
      return;
    }
    const res = await sendToTab(tab.id, { type: MSG.LIST_GRIDS });
    if (!res.ok) setState({ status: 'error', error: res.error });
    else if (!res.loggedIn) setState({ status: 'login' });
    else setState({ status: 'ready', grids: res.grids });
  }, [tab]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Content script'ten gelen değişiklik bildirimleri.
  useEffect(() => {
    const onMsg = (msg, sender) => {
      if (msg?.type === MSG.GRIDS_CHANGED && sender.id === chrome.runtime.id && sender.tab?.id === tab?.id) refresh();
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, [refresh, tab]);

  const grids = state.grids || [];
  const grid = grids.find((g) => g.gridId === gridId);

  // Varsayılan grid: görünür ve satırı olan ilk grid.
  useEffect(() => {
    if (!grids.length || grid) return;
    const pick = grids.find((g) => g.visible && g.rowCount) || grids.find((g) => g.rowCount) || grids[0];
    setGridId(pick.gridId);
  }, [grids, grid]);

  const gs = (grid && selByGrid[grid.gridId]) || {};
  // Kullanıcı mod seçmediyse: sitede seçili satır varsa "seçili", yoksa "görünen tümü".
  const rowMode = gs.mode || (grid?.selectedCount ? 'selected' : 'visible');
  // Site grid'i yeniden oluşturduysa (ör. Show variations) satır kimlikleri artık başka
  // satırları gösterir: eski elle seçim geçersizdir.
  const manualValid = gs.manual && gs.manualGen === grid?.generation;
  const manualIds = manualValid ? gs.manual : EMPTY_SET;
  const colSel = useMemo(() => gs.cols || (grid ? defaultColumns(grid, prefs) : EMPTY_SET), [gs.cols, grid, prefs]);

  const patchGrid = useCallback(
    (id, patch) => setSelByGrid((s) => ({ ...s, [id]: { ...s[id], ...patch } })),
    [],
  );
  const setRowMode = (mode) => patchGrid(grid.gridId, { mode });
  const setManualIds = (manual) => patchGrid(grid.gridId, { manual, manualGen: grid.generation });
  const setColSel = (cols) => patchGrid(grid.gridId, { cols });

  const selectGrid = (id) => {
    setGridId(id);
    setResult(null);
  };

  // Elle seçim modunda satır özetini yükle. İlk açılışta elle seçim, sitede seçili satırlarla başlar.
  useEffect(() => {
    if (rowMode !== 'ids' || !grid || !tab) return;
    const id = grid.gridId;
    const gen = grid.generation;
    sendToTab(tab.id, { type: MSG.PREVIEW_ROWS, gridId: id }).then((r) => {
      if (!r.ok || !r.preview) return;
      setPreview({ gridId: id, generation: gen, ...r.preview });
      setSelByGrid((s) =>
        s[id]?.manual && s[id].manualGen === gen
          ? s
          : {
              ...s,
              [id]: { ...s[id], manual: new Set(r.preview.rows.filter((x) => x.selected).map((x) => x.id)), manualGen: gen },
            },
      );
    });
  }, [rowMode, grid?.gridId, grid?.generation, grid?.rowCount, tab]);

  const columnKeys = useMemo(() => grid?.columns.filter((c) => colSel.has(c.key)).map((c) => c.key) || [], [grid, colSel]);

  const rowCountForMode = rowMode === 'selected' ? grid?.selectedCount : rowMode === 'visible' ? grid?.rowCount : manualIds.size;
  const canExtract = grid && columnKeys.length > 0 && rowCountForMode > 0 && !grid.loading;

  const flash = (text, kind = 'ok') => {
    setNotice({ text, kind });
    setTimeout(() => setNotice(null), 3000);
  };

  async function extract() {
    savePrefs(grid.gridId, columnKeys);
    const res = await sendToTab(tab.id, {
      type: MSG.EXTRACT,
      gridId: grid.gridId,
      rowMode,
      rowIds: rowMode === 'ids' ? [...manualIds] : undefined,
      columnKeys,
      includeLinks,
    });
    if (!res.ok) {
      flash(errorText(res.error), 'error');
      return;
    }
    setResult({ ...res, rowMode });
    if (res.truncated) flash(`At most ${LIMITS.MAX_EXTRACT_ROWS} rows can be extracted; took the first of ${res.totalMatched} rows.`, 'warn');
  }

  if (state.status === 'loading') return <p className="empty">Loading…</p>;
  if (state.status === 'no-tab')
    return (
      <div className="empty">
        <p>No Varbank 2.0 page in the active tab.</p>
        <p className="hint">
          Switch to a Varbank tab. If the extension was just installed or updated, reload the Varbank tab (F5).
        </p>
      </div>
    );
  if (state.status === 'login') return <p className="empty">Log in to Varbank; tables are listed after login.</p>;
  if (state.status === 'error')
    return (
      <div className="empty">
        <p>{errorText(state.error)}</p>
        <button type="button" onClick={refresh}>
          Try again
        </button>
      </div>
    );
  if (!grids.length) return <p className="empty">No tables found on the page.</p>;

  return (
    <div className="tables-view">
      <div className="row-actions">
        <GridPicker grids={grids} gridId={gridId} onChange={selectGrid} />
        <button type="button" className="icon" title="Refresh list" aria-label="Refresh list" onClick={refresh}>
          ⟳
        </button>
      </div>
      {grid && (
        <>
          {grid.loading && <p className="hint">Table is loading…</p>}
          {!grid.visible && <p className="hint">This table is not on the currently visible site tab (“{grid.tabLabel}”).</p>}
          <RowSelector
            grid={grid}
            rowMode={rowMode}
            setRowMode={setRowMode}
            manualIds={manualIds}
            setManualIds={setManualIds}
            preview={preview?.gridId === grid.gridId && preview.generation === grid.generation ? preview : null}
          />
          <ColumnPicker columns={grid.columns} selected={colSel} onChange={setColSel} />
          <label className="check">
            <input type="checkbox" checked={includeLinks} onChange={(e) => setIncludeLinks(e.target.checked)} />
            Include cell links (http/https only)
          </label>
          <button type="button" className="primary" disabled={!canExtract} onClick={extract}>
            Extract data ({rowCountForMode || 0} rows × {columnKeys.length} columns)
          </button>
        </>
      )}
      {notice && <p className={`notice ${notice.kind}`} role="status">{notice.text}</p>}
      {result && (
        <section className="result">
          <div className="row-actions">
            <strong>
              {MODE_LABEL[result.rowMode] || ''} {result.data.rows.length} rows × {result.data.columns.length} columns
            </strong>
            <span className="spacer" />
            <button type="button" onClick={() => downloadJson(result.data)}>
              Download JSON
            </button>
            <button
              type="button"
              onClick={() =>
                copyText(toJson(result.data)).then(
                  () => flash('Copied to clipboard.'),
                  () => flash('Could not copy.', 'error'),
                )
              }
            >
              Copy
            </button>
            <button type="button" className="primary" onClick={() => onAttach(result.data)}>
              Add to chat
            </button>
          </div>
          <PreviewTable data={result.data} />
        </section>
      )}
    </div>
  );
}
