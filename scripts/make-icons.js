// Bağımlılıksız basit PNG ikon üreticisi: sarı (#ffd15b) zemin üzerinde koyu tablo simgesi.
// Kullanım: node scripts/make-icons.js
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size) {
  const bg = [255, 209, 91, 255]; // #ffd15b — arayüzün vurgu rengi
  const ink = [26, 22, 8, 255]; // koyu çizgi (yüksek kontrast)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const r = Math.max(2, Math.round(size * 0.2)); // köşe yuvarlaklığı
  const pad = Math.round(size * 0.22);
  const end = size - 1 - pad;
  const step = (end - pad) / 3; // 3×3 tablo
  const half = Math.max(0.5, size / 40); // çizgi yarı kalınlığı
  const near = (v, p) => Math.abs(v - p) <= half;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const cx = x < r ? r - x : x >= size - r ? x - (size - r - 1) : 0;
      const cy = y < r ? r - y : y >= size - r ? y - (size - r - 1) : 0;
      let px = cx * cx + cy * cy > r * r ? [0, 0, 0, 0] : bg;
      const inTable = x >= pad - half && x <= end + half && y >= pad - half && y <= end + half;
      if (px === bg && inTable) {
        const header = y <= pad + step; // başlık satırı dolu
        let onLine = false;
        for (let i = 0; i <= 3; i++) {
          const p = pad + i * step;
          if (near(x, p) || near(y, p)) onLine = true;
        }
        if (header || onLine) px = ink;
      }
      raw.set(px, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(`public/icons/icon${s}.png`, icon(s));
console.log('ikonlar üretildi: public/icons');
