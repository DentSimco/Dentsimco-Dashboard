// DentSimco — restoran doluluk ısı haritası güncelleme aracı. Çalıştırma: node araclar/isi_haritasi.mjs
//
// Sim Companies Times her ~7 haftada bir "Restaurant Occupancy Heatmap" (grafik tipi "H") yayımlar: rating dilimi × fiyat dilimi
// başına döngü sayısı ve doluluk toplamı. Bu araç en yeni sayıyı bulur, public/hesap-restoran.js içindeki ISI_FIYAT ve
// ISI_DOLULUK tablosunu aynı temizlikle üretip ekrana basar; çıktı elle o dosyaya yapıştırılır (dosyayı kendisi değiştirmez).
//
// Temizlik (hesap-restoran.js açıklamasıyla aynı):
//   1. 5'ten az döngülü dilimler yok sayılır; boşluklar satırda doğrusal ara değerle, satırda hiç değer yoksa alt fiyat satırından
//      oranla doldurulur (ilk satır yalnız ara değer);
//   2. her satır rating arttıkça azalmayan yapılır (sonraki satırın doldurulması bu düzeltilmiş satıra oranlanır); en sonda sütunlar
//      fiyat arttıkça artmayan, satırlar yine rating yönünde azalmayan yapılır.
const BASE = 'https://www.simcompanies.com/api/v3/en/0/newspaper';
const MIN_DONGU = 5;
const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

export function tabloUret(veri) {
  const hucre = new Map(veri.filter((r) => r.count > 0).map((r) => [`${r.rating_bracket}:${r.price_bracket}`, { v: (r.sum_occupancy / r.count) * 100, n: r.count }]));
  const fiyatlar = [...new Set(veri.map((r) => r.price_bracket))].sort((a, b) => a - b);
  const R = 11;
  const ara = (guvenilir, r) => { // satırda r için doğrusal ara değer ya da en yakın uç
    const alt = guvenilir.filter(([x]) => x <= r).at(-1);
    const ust = guvenilir.find(([x]) => x >= r);
    if (alt && ust && alt[0] !== ust[0]) return alt[1] + ((ust[1] - alt[1]) * (r - alt[0])) / (ust[0] - alt[0]);
    return (alt || ust)[1];
  };
  const tablo = [];
  fiyatlar.forEach((p, i) => {
    const g = new Map();
    for (let r = 0; r < R; r++) { const h = hucre.get(`${r}:${p}`); if (h && h.n >= MIN_DONGU) g.set(r, h.v); }
    let satir;
    if (i === 0) satir = Array.from({ length: R }, (_, r) => ara([...g], r));
    else {
      const onceki = tablo[i - 1];
      const oranlar = [...g].filter(([r]) => onceki[r] > 0).map(([r, v]) => v / onceki[r]);
      const k = oranlar.length ? oranlar.reduce((a, b) => a + b, 0) / oranlar.length : 0.8;
      satir = Array.from({ length: R }, (_, r) => g.get(r) ?? onceki[r] * k);
    }
    let m = 0;
    tablo.push(satir.map((v) => Math.round((m = Math.max(m, v)) * 10) / 10)); // sonraki satırın oranı düzeltilmiş, yuvarlanmış satırdan
  });
  const rating = () => tablo.forEach((s) => { let m = 0; s.forEach((v, c) => { m = Math.max(m, v); s[c] = m; }); });
  rating();
  for (let c = 0; c < R; c++) { let m = Infinity; tablo.forEach((s) => { m = Math.min(m, s[c]); s[c] = m; }); }
  rating();
  return { fiyatlar, tablo: tablo.map((s) => s.map((v) => Math.round(v * 10) / 10)) };
}

async function main() {
  const sayilar = await get(`${BASE}/`);
  for (const { issueId, published } of sayilar) {
    if (!published) continue;
    const sayi = await get(`${BASE}/${issueId}/`);
    for (const a of sayi.articles || []) {
      const grafik = (a.charts || []).find((c) => c.type === 'H');
      if (!grafik) continue;
      const toplam = grafik.data.reduce((t, r) => t + r.count, 0);
      const { fiyatlar, tablo } = tabloUret(grafik.data);
      console.log(`// Sayı ${issueId} (${published.slice(0, 10)}), makale ${a.id}, ${a.dateRangeFrom?.slice(0, 10)} – ${a.dateRangeTo?.slice(0, 10)}, ${toplam} döngü`);
      console.log(`export const ISI_FIYAT = [${fiyatlar.join(', ')}];`);
      console.log('export const ISI_DOLULUK = [');
      tablo.forEach((s, i) => console.log(`  [${s.join(', ')}]${i < tablo.length - 1 ? ',' : ''} // $${fiyatlar[i]}`));
      console.log('];');
      return;
    }
  }
  throw new Error('Son 10 sayıda ısı haritası yok');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
