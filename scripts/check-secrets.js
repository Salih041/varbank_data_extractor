// Basit gizli bilgi taraması: kaynakta veya build çıktısında API anahtarı bulunmamalı.
// Kullanım: npm run check:secrets   (commit öncesi çalıştırın)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'public', 'tests', 'scripts', 'docs', 'dist', 'README.md', 'PRIVACY.md', 'package.json'];
const PATTERNS = [/gsk_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9]{32,}/, /Bearer\s+[A-Za-z0-9._-]{30,}/];

function* walk(p) {
  let st;
  try {
    st = statSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) if (e !== 'node_modules') yield* walk(join(p, e));
  } else if (!/\.(png|jpg|ico)$/i.test(p)) yield p;
}

let found = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const re of PATTERNS) {
      if (re.test(text)) {
        console.error(`Olası gizli bilgi: ${file} (${re.source.slice(0, 12)}…)`);
        found++;
      }
    }
  }
}
if (found) process.exit(1);
console.log('Gizli bilgi bulunamadı.');
