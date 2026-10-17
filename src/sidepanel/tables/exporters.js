import { safeFileName } from '../../shared/sanitize.js';

export function toJson(data) {
  return JSON.stringify(data, null, 2);
}

export function exportFileName(data) {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return safeFileName(`varbank_${data.source?.grid || 'table'}_${ts}.json`);
}

// "downloads" izni gerektirmeden, kullanıcı tıklamasıyla indirme.
export function downloadJson(data) {
  const blob = new Blob([toJson(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(data);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}
