// DentSimco — Hakkımızda: Nedir, Güncellemeler, Kaynakça.
// Metin ve güncelleme listesi bu dosyanın başındadır; yeni güncelleme eklemek için UPDATES listesinin EN ÜSTÜNE yeni kayıt yazın.
// Metin Türkçedir; İngilizcesi dil-en.js sözlüğündedir. Yeni bir madde eklerseniz İngilizcesini de sözlüğe yazın,
// yoksa İngilizce modda o madde Türkçe görünür.

const TABS = [['nedir', 'Nedir'], ['guncellemeler', 'Güncellemeler'], ['kaynakca', 'Kaynakça']];

// En yeni en üstte. { date: 'gün ay yıl', items: ['...', '...'] }
export const UPDATES = [
  {
    date: '11 Ekim 2026',
    items: [
      'Haberler: İngilizce dilde canlı şeritteki ve grafik başlığındaki ürün adları artık İngilizce görünüyor (önceden Türkçe kalıyordu).',
      'Yönetim: Ekip listesinin altına Tümünü sil düğmesi eklendi; tüm yöneticileri tek dokunuşla siler. Yanlışlıkla basarsanız 8 saniye içinde Geri al ile listeyi geri getirebilirsiniz.',
      'Şirketler: şirket numarası (ID) tabloda adın altında görünür. Bir şirkete dokununca ayrıntı paneli açılır (sıra, EVA, değer, günlük değişim, bina, patent, işçi, bono) ve numara kopyalanabilir.',
      'Şirketler: Ad (A-Z) sıralaması ve İşçi sütunu kaldırıldı; işçi sayısı şirketin ayrıntı panelinde görünür.',
      'Şirketler: "Sıra" ölçütü kaldırıldı; Simcotools sırası şirket değerine göre olduğu için Şirket değeri ölçütüyle aynıydı. Sayfa artık şirket değerine göre açılıyor, sıra numarası tabloda duruyor.',
      'Şirketler: Tahvil sütunu Bono oldu.',
      'Haberler: kayan borsa şeridinde en çok yükselen ve düşen ürünler öne alındı; yükselenlerin fiyatı ve değişimi yeşil, düşenlerinki kırmızı.',
      'Sinyaller artık gün içinde saatte bir yenileniyor (önce iki saatte birdi). Fiyat hedefe ulaşır, son 20 günün zirvesini yukarı ya da dibini aşağı kırarsa sinyal o saatte beklemeden yeniden hesaplanır; kartta "Yeni sinyal" etiketi çıkar.',
      'Sinyaller: +%2 ile +%4 arasındaki zayıf yükseliş beklentileri artık nötr (SAT / AL) gösteriliyor; geçmiş sınamada bu aralığın isabeti düşüktü.',
      'Sinyaller › Karne: gün içinde yenilenen sinyaller de karneye giriyor (Gün içi sütunu). Bir gece hesabı kaçarsa o günün karnesi sonraki gece tamamlanıyor.',
      'Sinyaller: R2\'de geçmiş veri az olduğu için sinyallerin sınırlı olduğu ve piyasa genelinin hesaba katılmadığı açıkça yazılıyor.',
      'Haberler bölümü eklendi (menüde en solda): manşet, iki sütun haber ve köşe yazısı haber masası tarafından DentSimco verileriyle her sabah 08:00\'de (TR) yazılır. En üstte borsadan rastgele ürünlerin canlı fiyatları kayar; sağ sütunun altında şirket değeri ve EVA sıralamasının ilk 3\'ü var, tıklayınca Şirketler o sıralamayla açılır.',
      'Şirketler: EVA sırasına göre sıralama 1\'den (en çok değer katan şirket) başlar; EVA\'sı hesaplanmamış şirketler sonda. Haberler\'deki En iyi EVA kutusu da buna göre.',
      'Borsa menüsünün adı Piyasa oldu. Piyasa altında iki sekme var: Canlı Borsa ve Sinyaller.',
    ],
  },
  {
    date: '10 Ekim 2026',
    items: [
      'Şirketler bölümü eklendi (Kâr Hesaplayıcı\'nın yanında): Simcotools sıralamasındaki tüm şirketler listelenir; sıra, şirket değeri, değişim, EVA sırası, bina, patent, işçi, tahvil ya da ada göre sıralanır ve ada göre aranır. Veri günde bir kez güncellenir.',
    ],
  },
  {
    date: '8 Ekim 2026',
    items: [
      'Dil seçimi eklendi: sağ üstteki TR düğmesine dokununca açılan menüden İngilizceye geçilir. Ürün ve bina adları oyunun İngilizce adlarıyla görünür, sayılar seçili dilin biçimiyle yazılır.',
      'Sinyaller: 14 günlük beklentinin yanında Hedef fiyat gösteriliyor (hesap fiyatı × beklenti).',
      'Sinyaller: likit ürünlerde sinyal gün içinde iki saatte bir canlı fiyatla yeniden hesaplanıyor. Son işlem eskiyse ya da fiyat hesap fiyatından %5 oynadıysa kart soluklaşır ve uyarı çıkar.',
      'Yönetim › Ekip: oyundaki "Ekibinizin etkisi" tablosu eklendi. Ekip puanının yanında etkili beceri gösteriliyor (örneğin 66 → 63).',
      'Üretim › Özet: planda araştırma binası varsa bilimin (CTO) kazandırdığı dolar olarak yazıyor.',
      'Kurulum, Binalar, Alım-Satım ve Özet arasında geçiş düğmeleri eklendi.',
      'Telefonda Üretim › Binalar sayfasının yana taşması düzeltildi.',
    ],
  },
  {
    date: '7 Ekim 2026',
    items: [
      'Sinyaller: Üretim ile Takvim arasına Perakende sekmesi eklendi. Borsadan al, perakende binasında en kârlı fiyatla sat: net marj ve KÂR / ZARAR ayrımı. Yönetim gideri ve satış bonusu hesaba katılmaz; kendi sonucun için Kâr Hesaplayıcı › Perakende\'yi kullan.',
      'Sinyaller: Mevsim ve Olaylar tek bir Takvim sekmesinde birleşti. Tüccar sinyalleri Resell adını aldı.',
      'Sinyaller: en güçlü (üç çubuklu) sinyaller hafifçe yanıp söner; çerçeve rengi aynı kalır. Cihazında hareket azaltma açıksa yanıp sönmez.',
      'Üretim ve Perakende: bina kartlarına İnşaatta düğmesi eklendi. İnşaattaki bina üretmez ya da satmaz ve maaş ödemez; seviyesi yönetim giderine girer, yani diğer binaların kârını etkiler.',
      'Yönetim: bilimin (CTO) günlük katkısı artık Üretim\'deki araştırma binalarının hız artışından hesaplanıyor. Simülasyon › Araştırma altındaki Araştırma üretimi kartı kaldırıldı.',
      'Açılır menüler: açıkken aynı kutuya ya da dışarıya dokunmak menüyü kapatır.',
      'Büyük sayılar kutuya yazılırken binlik noktayla ayrılıyor (20.000.000).',
      'Bina ve ürün adları oyundaki Türkçe adlarla eşleştirildi.',
      'Borsa: araştırma, Taşıma ve İnşaat gereci gibi kalitesi olmayan ürünlerde kalite seçimi gösterilmiyor.',
      'Tema: yalnız Gündüz ve Gece kaldı; Otomatik seçenek kaldırıldı.',
    ],
  },
  {
    date: '6 Ekim 2026',
    items: [
      'Yönetim ayrı bir bölüm oldu (Kâr Hesaplayıcı altında en solda): Ekip ve Simülasyon. Simülasyon altında Araştırma, İnşaat ve Muhasebe var; Satış ve Şirket kaldırıldı.',
      'İnşaat simülatörü eklendi: yeni bina, bina yükseltme, hurda ve seviye düşürme için malzeme, maliyet, süre, bitiş tarihi ve nakit karşılaştırması.',
      'Yönetim gideri artık Üretim ve Perakende binalarının toplamından hesaplanıyor; yönetici değerleri bu bölümlerden otomatik alınıyor. İki bölümü birlikte kullanırken sonuçlar değişebilir.',
      'Göz yormaması için tema güncellendi; gündüz ve gece modu eklendi. Sağ üstten ikisi arasında geçiş yapılır. Gece temasında neon hafifletildi.',
      'Sinyal kartı sadeleştirildi: fiyat yönü ve üretim marjı ayrı başlıklarda; KÂR, ZARAR, AL, SAT adları; belirsiz cümleler düzeltildi.',
      'Perakende: mevsimlik pazarlar ve diğer binalar Türkçe adlarıyla görünüyor.',
      'Hakkımızda bölümü eklendi.',
      'Canlı borsa verisi 5 dakikada bir güncelleniyor (Realm 1 ve Realm 2).',
      'Borsa: fiyat, kalitedeki son işlemin fiyatıdır. Her kalitede son işlemin ne kadar önce olduğu gösteriliyor.',
      'Borsa: Satış Arzı verisi şu an veri kaynağında bulunmadığı için "—" görünür.',
      'Yönetim ve Perakende sekmelerinde iletişim (CMO) yöneticisinin değeri artık aynı formülle hesaplanıyor.',
      'Büyük sayılar (örneğin 225,000) yazı kutularında doğru okunuyor.',
      'Eski tabletlerde bina paneli ve "Olayları yönet" düğmesi düzeltildi.',
    ],
  },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
.hk { max-width: 760px; margin: 0 auto; padding: 8px 14px 40px; display: flex; flex-direction: column; gap: 12px; }
.hk-tabs { display: flex; border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; background: var(--bg); margin: 0 -14px; padding: 0 14px; }
.hk-tabs a { flex: 1 1 0; display: flex; align-items: center; justify-content: center; min-height: 48px; color: var(--muted); font: 600 16px var(--font-c); text-decoration: none; border-bottom: 3px solid transparent; white-space: nowrap; }
.hk-tabs a[aria-current="page"] { color: var(--accent); border-bottom-color: var(--accent); }
.hk h1 { font: 600 22px/1.2 var(--font-c); margin: 0; }
.hk h2 { font: 600 19px/1.2 var(--font-c); margin: 0; }
.hk p { margin: 0; line-height: 1.55; font-size: 16px; }
.hk-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.hk-card.warn { border-color: var(--late-line); }
.hk-chip { align-self: flex-start; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--late); border: 1px solid var(--late-line); border-radius: 999px; padding: 2px 9px; }
.hk-note { color: var(--muted); font-size: 14px; }
.hk-date { color: var(--accent); font: 600 15px var(--font-c); letter-spacing: .02em; }
.hk ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; line-height: 1.5; }
.hk a.hk-link { color: var(--accent); }
.hk dl { margin: 0; display: flex; flex-direction: column; gap: 12px; }
.hk dt { color: var(--muted); font-size: 13px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.hk dd { margin: 2px 0 0; line-height: 1.5; }
`;

function viewNedir() {
  return `
    <h1>Nedir?</h1>
    <section class="hk-card"><p>DentSimco, Sim Companies oyunu için geliştirilen yardımcı araçtır. Hâlâ geliştirme aşamasındadır.</p></section>
    <section class="hk-card" aria-labelledby="hk-kul"><h2 id="hk-kul">Kullanım şekli</h2>
      <p>Bu aracın önemli özelliği, tüm sistemlerin entegre çalışmasıdır. En iyi sonucu almak için şirketinizin tüm bilgilerini, binalarınızı ve özellikle Yönetim bölümünü eksiksiz doldurun. Şirket özetinden çok verim alacaksınız, detaylı incelemeyi unutmayın.</p></section>
    <section class="hk-card" aria-labelledby="hk-sin"><h2 id="hk-sin">Borsa al-sat sinyalleri</h2>
      <p>Borsa al-sat sinyalleri deney aşamasındadır, ancak beklenen doğruluk tahminleri %50 ile %75 arasındadır. Formül özel olarak geliştirilmiştir.</p>
      <p class="hk-note">Tahmin doğruluğu oranı, reel kârın o oranda artacağı anlamına gelmez.</p></section>
    <section class="hk-card warn" aria-labelledby="hk-bil"><span class="hk-chip">Bilinen sorun</span><h2 id="hk-bil">Perakende ve Üretim</h2>
      <p>Şu an için Perakende ve Üretim bölümünü ayrı şekilde hesaplayın. İkisini birlikte kurguladığınızda sistemde hata oluşuyor ve kâr yanlış hesaplanıyor.</p>
      <p class="hk-note">Güncellenecek.</p></section>`;
}

function viewGuncellemeler() {
  return `
    <h1>Güncellemeler</h1>
    ${UPDATES.map((u) => `<section class="hk-card"><span class="hk-date">${esc(u.date)}</span><ul>${u.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('')}`;
}

function viewKaynakca() {
  return `
    <h1>Kaynakça</h1>
    <section class="hk-card"><dl>
      <div><dt>Canlı borsa veri kaynağı</dt><dd>Açık kaynak olarak paylaşılan Simcotools API · <a class="hk-link" href="https://simcotools.com" target="_blank" rel="noopener noreferrer">simcotools.com</a></dd></div>
      <div><dt>Sinyaller</dt><dd>DentSimco formülü ile hesaplanır.</dd></div>
      <div><dt>Kâr Hesaplayıcı</dt><dd>Sim Companies API verileriyle tarafımızca hesaplanır.</dd></div>
    </dl></section>`;
}

export function mountHakkinda(root) {
  let tab = 'nedir'; // üst menüden girince hep "Nedir" açılır
  const fromHash = location.hash.split('/')[1];
  if (TABS.some(([k]) => k === fromHash)) tab = fromHash;
  if (!TABS.some(([k]) => k === tab)) tab = 'nedir';

  const style = document.createElement('style');
  style.dataset.module = 'hakkinda';
  style.textContent = CSS;
  document.head.append(style);
  root.innerHTML = '<div class="hk"></div>';
  const view = root.querySelector('.hk');

  function render() {
    const nav = `<nav class="hk-tabs" aria-label="Hakkımızda bölümleri">${TABS.map(([k, t]) => `<a href="#hakkinda/${k}" ${k === tab ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;
    view.innerHTML = nav + (tab === 'guncellemeler' ? viewGuncellemeler() : tab === 'kaynakca' ? viewKaynakca() : viewNedir());
  }

  function onHash() {
    const [key, sub] = location.hash.slice(1).split('/');
    if (key !== 'hakkinda') return;
    const next = TABS.some(([k]) => k === sub) ? sub : tab;
    if (next === tab) return;
    tab = next;
    render();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', onHash);
  if (location.hash.split('/')[1] !== tab) { try { window.history.replaceState(null, '', `#hakkinda/${tab}`); } catch { /* yok */ } }
  render();

  return {
    setRealm() { /* bu bölüm realm'e bağlı değil */ },
    destroy() {
      window.removeEventListener('hashchange', onHash);
      style.remove();
      root.replaceChildren();
    },
  };
}
