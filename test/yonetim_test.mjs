// DentSimco — Yönetim menü yönlendirme sınamaları (eski adresler yeni yerlerine gider).
// Çalıştırma: node test/yonetim_test.mjs

import { yonetimRota } from '../public/yonetim.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
const eq = (a, b, label = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${label} beklenen ${JSON.stringify(b)}, bulunan ${JSON.stringify(a)}`); };
const rota = (hash, kayitli) => yonetimRota(hash.split('/'), kayitli);

test('Yeni adresler olduğu gibi açılır', () => {
  eq(rota('yonetim/ekip'), { tab: 'ekip', sim: 'arastirma', yonlendir: false });
  eq(rota('yonetim/simulasyon/insaat'), { tab: 'simulasyon', sim: 'insaat', yonlendir: false });
  eq(rota('yonetim/simulasyon/muhasebe').sim, 'muhasebe');
});

test('Eski Muhasebe ve Araştırma adresleri Simülasyon altına yönlenir', () => {
  eq(rota('yonetim/muhasebe'), { tab: 'simulasyon', sim: 'muhasebe', yonlendir: true });
  eq(rota('yonetim/arastirma'), { tab: 'simulasyon', sim: 'arastirma', yonlendir: true });
});

test('Kaldırılan Satış ve Şirket adresleri Ekip sayfasına gider', () => {
  eq(rota('yonetim/satis').tab, 'ekip');
  eq(rota('yonetim/sirket').tab, 'ekip');
  eq(rota('yonetim/satis').yonlendir, true);
});

test('Simülasyon alt sekmesi yoksa ya da bozuksa kayıtlı olan, o da yoksa Araştırma açılır', () => {
  eq(rota('yonetim/simulasyon', { sim: 'insaat' }).sim, 'insaat');
  eq(rota('yonetim/simulasyon/xyz', { sim: 'muhasebe' }), { tab: 'simulasyon', sim: 'muhasebe', yonlendir: true });
  eq(rota('yonetim/simulasyon').sim, 'arastirma');
  eq(rota('yonetim', { sim: 'bozuk' }).sim, 'arastirma');
});

test('Adres yalnız #yonetim ise son açılan sekme açılır (Ekip varsayılan)', () => {
  eq(rota('yonetim', { tab: 'simulasyon', sim: 'insaat' }).tab, 'simulasyon');
  eq(rota('yonetim', {}).tab, 'ekip');
  eq(rota('yonetim', { tab: 'satis' }).tab, 'ekip');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
