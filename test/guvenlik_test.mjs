// DentSimco — güvenlik sınamaları. Çalıştırma: node test/guvenlik_test.mjs
// 1) firebase.json'daki CSP, index.html'deki her satır içi betiğin özetini (sha256) içermeli; betik değişip özet
//    güncellenmezse tarayıcı betiği engeller ve site açılmaz. Özet nasıl yenilenir: hata mesajındaki 'sha256-...' değerini
//    firebase.json'daki Content-Security-Policy script-src listesine koy (eskisini sil).
// 2) firestore.rules yalnız tek belge okumaya izin vermeli ve sitenin okuduğu her koleksiyonu içermeli.
// Not: site.yml bu klasörü ve kök dosyaları alır; sinyal/ ve bot/ klasörleri orada yoktur, buradan içe aktarılmamalı.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PATHS } from '../public/veri.js';

let pass = 0;
let fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`BAŞARISIZ: ${name}`); } };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- CSP ----
const html = read('../public/index.html');
const config = JSON.parse(read('../firebase.json'));
const headers = Object.fromEntries(config.hosting.headers.flatMap((h) => h.headers.map((x) => [x.key, x.value])));
const csp = headers['Content-Security-Policy'] || '';
const direktif = (ad) => (csp.match(new RegExp(`(?:^|; )${ad} ([^;]*)`)) || [])[1] || '';

ok(csp.length > 0, 'CSP başlığı tanımlı');
ok(/default-src 'none'/.test(csp), "CSP: default-src 'none'");
for (const d of ['object-src', 'frame-ancestors', 'base-uri', 'form-action']) ok(direktif(d) === "'none'", `CSP: ${d} 'none'`);
const scriptSrc = direktif('script-src');
ok(!/unsafe-inline|unsafe-eval|\*|https?:/.test(scriptSrc), 'script-src unsafe-inline, unsafe-eval, joker ve dış adres içermez');
ok(/'self'/.test(scriptSrc), "script-src 'self' içerir");
ok(direktif('connect-src') === 'https://firestore.googleapis.com', 'connect-src yalnız Firestore');
ok(/Permissions-Policy/.test(Object.keys(headers).join()), 'Permissions-Policy tanımlı');

const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(inline.length > 0, 'satır içi betik bulundu');
for (const [i, body] of inline.entries()) {
  const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  ok(scriptSrc.includes(hash), `satır içi betik ${i + 1} özeti CSP'de değil, eklenmeli: ${hash}`);
}
const kullanilan = new Set(inline.map((b) => `'sha256-${createHash('sha256').update(b, 'utf8').digest('base64')}'`));
for (const h of scriptSrc.match(/'sha256-[^']+'/g) || []) ok(kullanilan.has(h), `CSP'de artık kullanılmayan eski özet var, silinmeli: ${h}`);
ok(!/\son[a-z]+\s*=\s*["']/i.test(html), 'index.html satır içi olay işleyicisi (onclick=...) içermez');
ok(!/javascript:/i.test(html), 'index.html javascript: adresi içermez');

// ---- Firestore kuralları ----
const rules = read('../firestore.rules').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const izinler = [...rules.matchAll(/allow\s+([a-z, ]+?)\s*:/g)].map((m) => m[1].trim());
ok(izinler.length === 1 && izinler[0] === 'get', `kurallar yalnız "allow get" içerir (bulunan: ${izinler.join(' | ') || 'yok'})`);
ok(!/if\s+true/.test(rules), 'kurallarda koşulsuz izin (if true) yok');
const izinli = ((rules.match(/col\s+in\s+\[([^\]]*)\]/) || [])[1] || '').split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
ok(izinli.length > 0, 'izinli koleksiyon listesi okunabildi');
ok(!izinli.includes('state'), 'eski state koleksiyonu izinli değil');
const okunan = new Set([PATHS.live(0), PATHS.intraday(0, '2026-01-01', 1), PATHS.daily(0, 1, 2026), PATHS.meta('x'), PATHS.system('x')].map((p) => p.split('/')[0]));
for (const kol of okunan) ok(izinli.includes(kol), `site "${kol}" koleksiyonunu okuyor ama kurallarda izinli değil`);
for (const kol of izinli) ok(okunan.has(kol), `kurallar "${kol}" koleksiyonuna izin veriyor ama site okumuyor (gereksiz izin)`);

console.log(`${pass}/${pass + fail} test geçti.`);
if (fail) process.exit(1);
