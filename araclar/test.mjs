// DentSimco — tüm sınamaları çalıştırır: npm test (GitHub Actions'taki site.yml ile aynı kural).
// test/ altındaki her .mjs dosyası ayrı bir Node sürecinde çalışır; veri-ornek.mjs yalnız veri olduğu için atlanır.
// Biri başarısız olursa kalanlar yine çalışır, en sonda özet yazılır ve çıkış kodu 1 olur.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.mjs') && !f.includes('veri-ornek')).sort();
const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join('test', f)], { cwd: root, encoding: 'utf8' });
  const ok = r.status === 0;
  const last = (r.stdout || '').trim().split('\n').pop();
  console.log(`${ok ? '✓' : '✗'} test/${f}: ${last}`);
  if (!ok) { failed.push(f); console.log(`${r.stdout || ''}${r.stderr || ''}`); }
}
console.log(failed.length ? `\n${failed.length}/${files.length} dosya başarısız: ${failed.join(', ')}` : `\n${files.length}/${files.length} test dosyası geçti.`);
process.exitCode = failed.length ? 1 : 0;
