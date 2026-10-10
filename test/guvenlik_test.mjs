// DentSimco — güvenlik sınamaları. Çalıştırma: node test/guvenlik_test.mjs
// 1) firebase.json'daki CSP, index.html'deki her satır içi betiğin özetini (sha256) içermeli; betik değişip özet
//    güncellenmezse tarayıcı betiği engeller ve site açılmaz. 2) Dışarıdan gelen ürün adı HTML kaçıramaz.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { urunAdi } from '../public/urun-adlari.js';

let pass = 0;
let fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`BAŞARISIZ: ${name}`); } };

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries(config.hosting.headers.flatMap((h) => h.headers.map((x) => [x.key, x.value])));
const csp = headers['Content-Security-Policy'] || '';

ok(csp.length > 0, 'CSP başlığı tanımlı');
ok(/default-src 'none'/.test(csp) && /object-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /base-uri 'none'/.test(csp), 'CSP temel kısıtlar');
const scriptSrc = (csp.match(/script-src ([^;]*)/) || [])[1] || '';
ok(!/unsafe-inline|unsafe-eval/.test(scriptSrc), 'script-src unsafe-inline/unsafe-eval içermez');

const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(inline.length > 0, 'satır içi betik bulundu');
for (const [i, body] of inline.entries()) {
  const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  ok(scriptSrc.includes(hash), `satır içi betik ${i + 1} özeti CSP'de (${hash})`);
}
ok(!/\son[a-z]+\s*=\s*["']/i.test(html), 'index.html satır içi olay işleyicisi (onclick=...) içermez');

for (const kotu of ['<img src=x onerror=alert(1)>', 'a"><script>x</script>', 'ad`${1}`']) {
  const ad = urunAdi(9999, kotu);
  ok(!/[<>"`]/.test(ad), `ürün adı temizlenir: ${kotu}`);
}
ok(urunAdi(9999, 'x'.repeat(500)).length <= 80, 'ürün adı 80 karakterle sınırlı');

console.log(`${pass}/${pass + fail} test geçti.`);
if (fail) process.exit(1);
