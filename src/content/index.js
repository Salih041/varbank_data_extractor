// Content script: yalnızca https://varbank.ccg.uni-koeln.de/varbank2/* üzerinde çalışır.
// Sayfaya UI enjekte etmez, sayfa JS'ine dokunmaz, sayfanın postMessage'ını dinlemez.
// Tek görevi: istek geldiğinde jqGrid tablolarını DOM'dan okuyup düz veri döndürmek.

import { MSG, validateExtractRequest, isValidGridId } from '../shared/messages.js';
import { listGrids, extractGrid, findGridBoxes, previewRows } from './jqgridParser.js';
import { watchGrids } from './gridWatcher.js';

const isLoginPage = () => !!document.querySelector('input[name="lg_password"]');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Yalnızca kendi eklentimizden gelen mesajlar.
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string') return false;
  try {
    switch (msg.type) {
      case MSG.PING:
        sendResponse({ ok: true, site: 'varbank2' });
        break;
      case MSG.LIST_GRIDS:
        sendResponse({
          ok: true,
          loggedIn: !isLoginPage(),
          grids: listGrids(document).map((g) => ({ ...g, generation: generationOf(document.getElementById(g.gridId)) })),
        });
        break;
      case MSG.PREVIEW_ROWS:
        sendResponse(
          isValidGridId(msg.gridId)
            ? { ok: true, preview: previewRows(document, msg.gridId) }
            : { ok: false, error: 'BAD_REQUEST' },
        );
        break;
      case MSG.EXTRACT:
        sendResponse(validateExtractRequest(msg) ? extractGrid(document, msg) : { ok: false, error: 'BAD_REQUEST' });
        break;
      default:
        break;
    }
  } catch {
    sendResponse({ ok: false, error: 'PARSE_FAILED' });
  }
  return false;
});

// --- Değişiklik bildirimi -------------------------------------------------
// Grid yüklenince/yeniden oluşturulunca, sekme değişince veya satır seçimi değişince panele
// haber ver. Ayrıntılar: gridWatcher.js.

let lastSignature = '';

// Yeniden oluşturulan grid tablosu, satır sayıları aynı kalsa bile farklı imza üretsin diye
// her tablo öğesine bir nesil numarası verilir.
const generations = new WeakMap();
let nextGeneration = 1;
function generationOf(el) {
  if (!el) return 0;
  if (!generations.has(el)) generations.set(el, nextGeneration++);
  return generations.get(el);
}

function signature() {
  return listGrids(document)
    .map((g) => {
      const btable = document.getElementById(g.gridId);
      const selectedIds = btable
        ? Array.from(btable.querySelectorAll('tr.jqgrow.ui-state-highlight, tr.jqgrow[aria-selected="true"]'), (tr) => tr.id).join(',')
        : '';
      return [g.gridId, generationOf(btable), g.visible, g.loading, g.rowCount, selectedIds, g.pagingInfo, g.columns.length].join('|');
    })
    .join(';');
}

let stopWatching = () => {};

// Eklenti yeniden yüklenince/kaldırılınca açık sekmedeki bu script "yetim" kalır:
// chrome.runtime.id kaybolur ve sendMessage SENKRON olarak "Extension context invalidated"
// fırlatır (.catch bunu yakalamaz). Bu durumda izlemeyi kalıcı olarak durdur.
const contextAlive = () => {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

function notifyIfChanged() {
  if (!contextAlive()) {
    stopWatching();
    return;
  }
  let sig;
  try {
    sig = signature();
  } catch {
    return;
  }
  if (sig === lastSignature) return;
  lastSignature = sig;
  try {
    // Panel kapalıyken alıcı yoktur; bu beklenen bir durumdur (asenkron red).
    chrome.runtime.sendMessage({ type: MSG.GRIDS_CHANGED }).catch(() => {});
  } catch {
    stopWatching();
  }
}

// Giriş sayfasında (grid yok) hiç izleme yapılmaz; giriş tam sayfa yenilemesiyle olduğu için
// giriş sonrası content script yeniden çalışır.
if (findGridBoxes(document).length > 0) {
  lastSignature = signature();
  stopWatching = watchGrids(document.body, notifyIfChanged);
}
