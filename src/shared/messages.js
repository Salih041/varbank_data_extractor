// Bileşenler arası mesaj sözleşmesi. Bilinmeyen tip veya bozuk şema reddedilir.

export const MSG = Object.freeze({
  // content -> panel
  GRIDS_CHANGED: 'GRIDS_CHANGED',
  // panel -> content (chrome.tabs.sendMessage)
  PING: 'PING',
  LIST_GRIDS: 'LIST_GRIDS',
  PREVIEW_ROWS: 'PREVIEW_ROWS',
  EXTRACT: 'EXTRACT',
  // panel -> background
  GET_KEY_STATUS: 'GET_KEY_STATUS',
  SET_API_KEY: 'SET_API_KEY',
  CLEAR_API_KEY: 'CLEAR_API_KEY',
  LIST_MODELS: 'LIST_MODELS',
});

export const PORT_CHAT = 'chat-stream';

const GRID_ID_RE = /^[A-Za-z][\w-]{0,63}$/;
const COL_KEY_RE = /^[\w-]{1,64}$/;
const ROW_ID_RE = /^[\w.:-]{1,64}$/;

const isStrArray = (a, re, max) =>
  Array.isArray(a) && a.length <= max && a.every((x) => typeof x === 'string' && re.test(x));

export function validateExtractRequest(msg) {
  if (!msg || msg.type !== MSG.EXTRACT) return false;
  if (typeof msg.gridId !== 'string' || !GRID_ID_RE.test(msg.gridId)) return false;
  if (!['selected', 'visible', 'ids'].includes(msg.rowMode)) return false;
  if (msg.rowMode === 'ids' && !isStrArray(msg.rowIds, ROW_ID_RE, 5000)) return false;
  if (!isStrArray(msg.columnKeys, COL_KEY_RE, 200) || msg.columnKeys.length === 0) return false;
  if (typeof msg.includeLinks !== 'boolean') return false;
  return true;
}

export function isValidGridId(id) {
  return typeof id === 'string' && GRID_ID_RE.test(id);
}
