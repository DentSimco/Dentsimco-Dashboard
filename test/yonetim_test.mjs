// DentSimco — Yönetim menü yönlendirme sınamaları (eski adresler yeni yerlerine gider).
// Çalıştırma: node test/yonetim_test.mjs

import { yonetimRota, puanMetni, etkiDegerleri } from '../public/yonetim.js';
import * as H from '../public/hesap.js';

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


// ---- Ekip puanı: ham puan → etkili beceri ----
test('Etkili beceri: 66 → 63, 64 → 62, 80,50 → 70, 44,75 → 44, 40 aynı', () => {
  eq([puanMetni(66).ham, puanMetni(66).etkili, puanMetni(66).farkli], ['66', 63, true]);
  eq(puanMetni(64).etkili, 62);
  eq([puanMetni(80.5).ham, puanMetni(80.5).etkili], ['80,50', 70]);
  eq([puanMetni(44.75).ham, puanMetni(44.75).etkili, puanMetni(44.75).farkli], ['44,75', 44, true]);
  eq([puanMetni(40).etkili, puanMetni(40).farkli], [40, false], '60 altı değişmez');
  eq(puanMetni(0).farkli, false);
});

// ---- Ekibinizin etkisi: oyundaki tabloyla aynı sayılar (7 Ekim ekran görüntüsü) ----
test('Oyundaki Ekibinizin etkisi tablosu: yönetim %60, vergi +$14M, satış +%2, restoran +0,060, patent +%1,50, araştırma %48', () => {
  const ex = [
    { position: 'o', active: true, salary: 0, skills: { coo: 60, cfo: 0, cmo: 0, cto: 0 } },
    { position: 'f', active: true, salary: 0, skills: { coo: 0, cfo: 28, cmo: 0, cto: 0 } },
    { position: 'm', active: true, salary: 0, skills: { coo: 0, cfo: 0, cmo: 6, cto: 0 } },
    { position: 't', active: true, salary: 0, skills: { coo: 0, cfo: 0, cmo: 0, cto: 24 } },
  ];
  const E = etkiDegerleri(H.teamEffects(ex, { bankLevel: 0 }), 326, 307665);
  eq(E.brut.toFixed(2), '191.18', 'brüt yönetim gideri');
  eq(E.kazanc.toFixed(2), '114.71', 'yönetim giderinden düşen');
  eq(E.vergiTaban, 3000000);
  eq(E.vergiArtis, 14000000);
  eq(E.satisHizi, 2);
  eq(E.restoran.toFixed(3), '0.060');
  eq(E.patentTaban, 6.25);
  eq(E.patent.toFixed(2), '1.50');
  eq(E.arastirma, 48);
  eq(E.maas, 307665);
});
test('Bina seviyesi bilinmiyorsa yönetim gideri satırı hesaplanmaz (null), diğer satırlar çalışır', () => {
  const E = etkiDegerleri(H.teamEffects([{ position: 't', active: true, skills: { cto: 60 } }]), 0, 0);
  eq([E.brut, E.kazanc], [null, null]);
  eq(E.arastirma, 120);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
console.log(failed.length ? `\n${failed.length} test başarısız.` : `\n${results.length}/${results.length} test geçti.`);
process.exit(failed.length ? 1 : 0);
