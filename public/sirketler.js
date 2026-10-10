// DentSimco — Şirketler sayfası (sıralama). Veri toplayıcı hazır olunca doldurulacak; şimdilik yer tutucu.

export function mountSirketler(root) {
  root.innerHTML = '<section class="soon"><h1>Şirket sıralaması</h1><p>Şirket sıralaması yakında burada olacak. Veriler günde bir kez güncellenir.</p></section>';
  return {
    setRealm() { /* veri gelince realm'e göre yenilenecek */ },
    destroy() { root.replaceChildren(); },
  };
}
