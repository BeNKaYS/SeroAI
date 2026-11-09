# Yerel web arayüzü — tasarım

Tarih: 2026-11-09 · Aşama: 5 · Seçilen yön: `seroai ui` yerel web paneli, sakin/MacPaw çizgisi, onaylı tam akış.

## Amaç

CLI'nin onay, yedek ve geri alma sözleşmesini değiştirmeden aynı çekirdeği tarayıcıda kullanılabilir kılmak. Panel ikinci bir kurulum aracı değildir; mevcut plan/apply/rollback fonksiyonlarını çağırır.

## Kapsam dışı

- Global istemci ayarı yazımı, yeni istemci uyarlaması, upstream paket kurucuları.
- Electron/Tauri paketleme, kod imzalama, otomatik başlatma.
- Sohbet, hafıza, token veya ham config görüntüleme.
- Dış ağ isteği (GitHub kontrolü yalnızca kullanıcı tetiklediğinde, mevcut güncelleme çekirdeğiyle).

## Mimari

```
node src/cli/main.mjs ui [--root <seroai-kökü>] [--port 0] [--no-open]
   └─ src/ui/server.mjs     → 127.0.0.1 üzerinde HTTP/1.1, rastgele bağlantı noktası
        ├─ src/ui/routes.mjs → GET /api/status, /api/catalog, /api/preview/*; POST /api/plan, /api/apply, /api/rollback
        ├─ src/ui/static.mjs → src/ui/public/*.html, *.css, *.js (derleme adımı yok)
        └─ mevcut çekirdek   → katalog, inspection, recovery, opencode-project, updates, profiles
```

- Yeni çalışma zamanı bağımlılığı yok; yalnızca Node.js standart kütüphanesi (`node:http`).
- Statik dosyalar `src/ui/public/` altındadır; bina/bundle adımı yoktur. Tarayıcı ES modülleri kullanılır.
- Varsayılan `--port 0` ile işletim sistemi boş bir bağlantı noktası seçer; komut gerçek adresi yazar. Varsayılan bağlantı yalnızca `127.0.0.1`.
- Oturum başına rastgele bir belirteç (`sessionToken`) üretilir; adres `http://127.0.0.1:<port>/?token=...` biçimindedir. API çağrıları `X-SeroAI-Token` başlığını taşır. Böylece aynı makinedeki başka bir sekme/uygulama, kullanıcı belirteci kopyalamadan yazma uçlarına erişemez.
- `--root` verilmezse depo kökü kullanılır; `applicationRoot` doğrulaması güncelleme hedefi için ayrıca yapılır.

## API

Okuma:

- `GET /api/status` — sürüm (`version.json`), katalog özeti, kökte `.git/seroai/*` durumunun varlığı; sır yok.
- `GET /api/catalog` — paketler ve istemciler, `unverified` durumlarıyla.
- `GET /api/inspect?workspace=<mutlak>` — mevcut `inspectManagedWorkspace` çıktısı.
- `GET /api/project/preview?project=<mutlak>&skill-dir=...&instruction=...&github=1` — `planOpenCodeProject`.
- `GET /api/project/rollback-preview?project=<mutlak>` — `planOpenCodeRollback`.
- `GET /api/update/preview?root=<mutlak>&local=<mutlak>` veya `&repo=<sahip/ad>&ref=<dal>` — `planUpdate` (yalnızca metadata okur).
- `POST /api/profile/preview` — gövde: profil JSON'u + eşlemeler; `planOpenCodeProject` önizlemesi.

Yazma (her biri önizleme kimliği ister):

- `POST /api/project/apply` `{ project, sources, planId }` → `applyOpenCodeProject`
- `POST /api/project/rollback` `{ project, planId }` → `rollbackOpenCodeProject`
- `POST /api/update/apply` `{ root, source, planId }` → `applyUpdate`
- `POST /api/update/rollback` `{ root, planId }` → `rollbackUpdate`
- `POST /api/recover/apply` `{ workspace, planId }` → `recoverWorkspace`
- Profil geri yükleme, proje apply uç noktasını kullanır.

Kurallar:

- Tüm yanıtlar JSON; hata gövdesi `{ error: { code, message } }` ve mevcut Türkçe mesajlar.
- Plan kimliği, uç noktada yeniden hesaplanır; eşleşmezse `STALE_PLAN`.
- Gövde en çok 256 KiB; bilinmeyen alanlar reddedilir.
- `GET` dışındaki yöntemlerde `Origin`/`Sec-Fetch-Site` uyumu ve belirteç zorunludur. `Content-Type: application/json` dışındaki gövdeler reddedilir.
- Hata ayıklama günlüğü tutulmaz; yalnızca başlangıç adresi ve istek yolu (sorgu parametreleri hariç) yazılır.

## Ekranlar

Tek pencere, sol ray, üstte kök/proje seçici. Her ekranda tek birincil aksiyon.

1. **Genel bakış** — sürüm, kaynak/istemci sayısı, son işlem ve bekleyen kurtarma durumu; "Yeni proje ayarla" birincil aksiyonu.
2. **Kaynaklar** — paket ve istemci tabloları; her satırda durum rozeti (`unverified`, `unreviewed` kaynağı). Seçim yalnızca yerel taslak; yazma yok.
3. **Proje** — proje yolu, beceri klasörleri, kural dosyaları, GitHub anahtarı; "Önizle" → değişiklik defteri; "Uygula" → onay sayfası; "Geri al" ayrı akış.
4. **Güncelleme** — mevcut/kaynak sürüm, kaynak türü (yerel/GitHub), dosya listesi ve hash'ler; "Kontrol et" (metadata) ve "Uygula".
5. **Profil** — dışa aktarma formu (istemci/paket/kaynak anahtarları) ve geri yükleme (dosya seç + eşleme). Profil JSON'u tarayıcıda indirilir; sunucu dosya yazmaz.
6. **Hakkında** — sürüm, lisans durumu, geliştirici satırı (sade).

Onay, ayrı bir katman değil, değişiklik defterinin altındaki tek birincil düğmedir: kimlik, etkilenen dosyalar ve geri alma noktası görünür; düğme ancak kullanıcı listeyi gördükten sonra etkinleşir.

## Görsel yön

Sakin, tek işe odaklı (MacPaw çizgisi), Operate modu.

- **Zemin:** sıcak nötr `#F6F4EF` (açık), `#14171A` (koyu); kartlar beyaz/`#1D2125`. Tek vurgu: derin çivit `#2F4BD8`; durum renkleri yalnızca anlam taşıdığında (yeşil uygulandı, amber bekliyor, kırmızı hata).
- **Tipografi:** sistem yığını (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`); 15–16 px gövde, 28–34 px ekran başlığı, satır aralığı 1.5. Monospace yalnızca hash ve yol için.
- **Şekil:** 12 px pencere/kart, 8 px düğme; yumuşak, dağınık gölge; 1 px çizgi yerine boşluk ve ton farkı.
- **Boşluk:** 24 px dış, 16–20 px kart içi; satır yüksekliği en az 44 px.
- **İmza hareketi:** değişiklik defteri — dikey zaman çizgisi; her satırda dosya, eylem (`create`/`replace`/`delete`), eski/yeni hash'in kısaltılmışı ve yedek işareti. Onay düğmesi defterin sonunda.
- **Hareket:** tek, kısa (150–220 ms) ease-out; sayfa geçişinde içerik kaymaz.
- **Kaçınılanlar:** eyebrow/kicker etiket, gradient metin, süs camı, emoji ikon, her bölüme aynı giriş animasyonu, kart ızgarası iskeleti.

## Erişilebilirlik ve performans

- Tam klavye dolaşımı, görünür odak halkası, `aria-live` ile onay/hata duyurusu.
- Kontrast en az 4.5:1; hareket `prefers-reduced-motion` ile kapanır.
- Toplam statik varlık < 150 KiB; ağ fontu yok; dış kaynak yok.
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'`.

## Hata ve durumlar

- Boş durumlar: "Henüz kayıt yok" + tek birincil aksiyon.
- Bekleyen işlem: `RECOVERY_REQUIRED` / `WORKSPACE_BUSY` ayrı, açıklamalı kart; otomatik kurtarma yok.
- Kullanıcı düzenlemesi: `CONFLICT` mesajı dosyayı ve korunan değişikliği adlandırır; düğme tekrar denemeye zorlamaz.
- Kaynak yok/erişilemiyor: `UPDATE_SOURCE_UNAVAILABLE`, yeniden dene ve yerel klasör önerisi.

## Test stratejisi

- Sunucu ve API: geçici köklerde `node --test`; belirteçsiz/yanlış Origin/yanlış yöntem reddi, plan kimliği eşleşmesi, boyut sınırı, statik yol kaçışı.
- Mutasyon uçları: mevcut çekirdek testlerindeki fixture'larla; onaysız istekte sıfır yazım.
- Tarayıcı görsel kontrolü ve etkileşim testi **ayrı onay** gerektirir; onaylanmadan çalıştırılmaz.

## Güncelleme ve geliştirici bilgisi

- Program güncellemesi mevcut `update` çekirdeğini kullanır; arayüz yeni bir güncelleme yolu açmaz. `version.json` tek kaynaktır.
- Hakkında bölümü `~/.agents/gelistirici-karti/gelistirici.md` verisinden sade tek satır kullanır; kart/animasyon/QR yok.

## Yön sözleşmesi

THESIS: Onayı görünür bir değişiklik defterine dönüştüren sakin bir kontrol paneli; sekmeler ve kart ızgarası yerine tek iş akışı ve tek birincil düğme.

OWN-WORLD: Sıcak nötr zemin, beyaz kartlar, çivit tek vurgu, sistem fontu, 12 px yumuşak yüzeyler; monospace yalnızca hash/yol. Durum renkleri anlam taşıdığında.

STORY: Kullanıcı neyin değişeceğini, neyin yedeklendiğini ve nasıl geri alınacağını görür; yazmadan önce onaylar; doğrulanmamış olanı doğrulanmış sanmaz.

FIRST VIEWPORT: Sol 232 px ray (5 bölüm + Hakkında), üstte kök rozeti ve sürüm; ana alanda "Genel bakış" başlığı, üç durum satırı (sürüm, kayıt, bekleyen işlem) ve tek birincil "Yeni proje ayarla" düğmesi. Sağ üstte dil değil, yalnızca koyu/açık mod anahtarı.

FORM: Operate paneli, code-led; kullanıcı yönü sabitlediği için `seed: none (unavailable)`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
