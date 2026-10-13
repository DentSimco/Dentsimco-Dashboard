// DentSimco — yazı kutularındaki sayıları okuma (Üretim, Perakende, Yönetim, İnşaat ve Optimum Seviye ortak kullanır).
// Üretim sekmesinden buraya taşındı; uretim.js aynı adlarla yeniden dışa aktarır, böylece mevcut içe aktarmalar değişmez.

// Türkçe ya da İngilizce yazılmış sayıyı okur: "1.921.272", "0,3582", "72.65", "4,490,000", "1.234,56", "1,234.56", "%62"
// Tek belirsiz durum: tek nokta + tam 3 hane ("2.345": 2,345 mi, 2345 mi?). Kural:
//   • tamsayı kısmı 0 ile başlıyorsa ("0.123") ondalıktır;
//   • ref verilmişse (fiyat kutularında borsa fiyatı) ona yakın olan okunur;
//   • ref yoksa binlik ayracı sayılır ("2.323" ya da "225,000" maaş → 2323 ve 225000).
export function parseNum(input, { ref = null } = {}) {
  let t = String(input ?? '').trim().replace(/[\s$%₺]/g, '').replace(/\u2212/g, '-'); // ekrandaki "−" işareti de eksi sayılır
  if (!t) return null;
  const commas = (t.match(/,/g) || []).length;
  const dots = (t.match(/\./g) || []).length;
  // Tek ayraç ve ardından tam 3 hane ("2.345", "225,000"): ondalık mı, binlik ayracı mı? Okunan sayı metin olarak döner; belirsiz değilse null.
  const single = (sep) => {
    const m = new RegExp(`^(-?)(\\d{1,3})\\${sep}(\\d{3})$`).exec(t);
    if (!m || m[2].startsWith('0')) return null;
    const decimal = Number(`${m[1]}${m[2]}.${m[3]}`);
    const grouped = Number(`${m[1]}${m[2]}${m[3]}`);
    const target = Number(ref);
    return String(target > 0 && Math.abs(Math.log(decimal / target)) < Math.abs(Math.log(grouped / target)) ? decimal : grouped);
  };
  if (commas && dots) {
    // ikisi birden: sonra gelen ondalık ayracıdır ("1.234,56" Türkçe, "1,234.56" İngilizce)
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (commas > 1) {
    t = t.replace(/,/g, ''); // "4,490,000" (oyunun İngilizce ekranından kopyalanan)
  } else if (commas === 1) {
    t = single(',') ?? t.replace(',', '.'); // "0,3582" ondalık; "225,000" binlik (ref yoksa)
  } else if (dots > 1) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "1.921.272"
  } else if (dots === 1) {
    t = single('.') ?? t;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Fiyat kutusu: parseNum'a ek olarak "795k", "1.2m", "1,2m" (bin, milyon, milyar) kısaltmalarını da okur.
export function parsePrice(input, options) {
  const m = /^\s*\$?\s*(-?[\d.,]+)\s*([kmb])\s*$/i.exec(String(input ?? ''));
  if (!m) return parseNum(input, options);
  const base = parseNum(m[1]);
  return base == null ? null : Math.round(base * { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] * 100) / 100;
}
