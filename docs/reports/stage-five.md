# Aşama 5 kabulü — yerel web paneli

Tarih: 2026-11-09 · Sürüm: `0.1.0-dev.4` · Tasarım: `docs/superpowers/specs/2026-11-09-local-web-ui-design.md` · Plan: `docs/superpowers/plans/2026-11-09-stage-five-web-ui.md`

## Ne eklendi

`node src/cli/main.mjs ui` ile 127.0.0.1'e bağlanan, oturum belirteçli bir panel. Panel mevcut çekirdeği çağırır; yeni bir yazma yolu açmaz. Altı ekran: Genel bakış, Kaynaklar, Proje, Güncelleme, Profil, Hakkında. Tasarım yönü: sakin, tek işe odaklı; sıcak nötr zemin, çivit tek vurgu, sistem fontu, değişiklik defteri imza hareketi.

Dosyalar:

- `src/ui/server.mjs` — HTTP çekirdeği, belirteç/origin/tür/boyut denetimi, güvenlik başlıkları.
- `src/ui/routes.mjs` — okuma ve onaylı yazma uçları; plan kimliği her istekte yeniden hesaplanır.
- `src/ui/static.mjs` — yalnızca beyaz listedeki beş statik dosya.
- `src/ui/public/{index.html,app.css,app.js,views.js}` — derlemesiz arayüz; dış varlık yok.
- `src/cli/ui.mjs` — komut, tarayıcı açma, SIGINT/SIGTERM ile temiz kapanış.
- Testler: `tests/ui-server`, `ui-api-read`, `ui-api-write`, `ui-static`, `ui-cli` (25 test).

## Sözleşme

- Varsayılan `127.0.0.1`, `--port 0` ile işletim sistemi boş bağlantı noktası seçer. Adres `?token=<64 hex>` taşır; API `X-SeroAI-Token` ister.
- `GET` dışı isteklerde `Origin` panelin kendi kökeni olmalı ve `Sec-Fetch-Site` `same-origin`/`none` olmalı. Gövde `application/json`, en çok 256 KiB; bilinmeyen alan reddedilir.
- Her yazma ucu planı aynı girdilerle yeniden üretir; `planId` eşleşmezse `STALE_PLAN` (HTTP 409). Onaysız istek `APPROVAL_REQUIRED`.
- Statik dosyalar beyaz listededir; yol kaçışı 404. CSP `default-src 'self'`, ağ fontu ve dış betik yok.
- Panel token, ham config, sohbet veya hafıza göstermez; hata metinleri mevcut Türkçe sözlükten gelir.
- Koyu/açık mod, görünür odak, `aria-live` bildirim, tablo `caption`, `prefers-reduced-motion` desteği.

## Doğrulama

| Dosya | Test | Sonuç |
| --- | --- | --- |
| `tests/ui-server.test.mjs` | Çekirdek/güvenlik | 5/5 |
| `tests/ui-api-read.test.mjs` | Okuma uçları | 6/6 |
| `tests/ui-api-write.test.mjs` | Onaylı yazma | 6/6 |
| `tests/ui-static.test.mjs` | Statik/a11y sözleşmesi | 5/5 |
| `tests/ui-cli.test.mjs` | CLI + canlı sunucu | 3/3 |
| **Tam takım** | `node --test` | **286/286 geçti, 0 başarısız, 0 atlanan** (yaklaşık 5,4 sn) |

Sınananlar: belirteçsiz/yabancı kaynaklı/yanlış türde istek; 300 KiB gövde; bozuk JSON; bilinmeyen uç; symlink kaynak; göreli proje yolu; önizlemede sıfır yazım; eski kimlikle yazmama; kullanıcı düzenlemesinde durma; güncelleme uygulama/geri alma; profil geri yükleme ve ertelenen istemciler; statik dosya beyaz listesi; satır içi betik/olay yokluğu; dış URL yokluğu; SIGTERM ile temiz çıkış.

## Tarayıcı doğrulaması

Kullanıcı onayıyla panel geçici bir klasörde çalıştırıldı ve OpenChamber tarayıcı panelinde incelendi:

- Masaüstü 1440 px ve mobil 390 px; açık ve koyu mod.
- Genel bakış, Kaynaklar, Proje, Güncelleme, Profil, Hakkında ekranları.
- Geçici bir Git projesinde önizleme → **Uygula** → **Geri al** akışı: `opencode.jsonc` içindeki kullanıcı `model` değeri korundu, beceri/kural eklendi, yedek oluştu; geri alma dosyayı önceki baytlarına döndürdü.
- Gezinme, seçili bölüm vurgusu, tema anahtarı, defter satırları ve yığın bildirim gözlendi.

Kontrol sırasında bulunan ve düzeltilen kusurlar:

1. Uygulama sonrası `refresh`, başarı bildirimini hemen temizliyor ve formu sıfırlıyordu. Artık defter ve form korunur, düğme “Uygulandı/Geri alındı” olur, bildirim görünür kalır.
2. Geri alma planı `changes` taşımadığı için defter “Değişiklik yok” diyordu. `restore`/`delete` eylemi artık hedef dosyayla tek satır olarak gösterilir.
3. Profil istemci/paket listesi tek sütunda aşırı uzuyordu; masaüstünde iki sütuna, mobilde tek sütuna alındı.

Ekran görüntüleri kişisel yollar içerdiği için repoya eklenmedi; `.openchamber/` yoksayılır.

## Sınırlar

- Görsel kontrol tek bir macOS tarayıcı oturumunda yapıldı; Safari/Firefox ve Windows/Linux tarayıcıları doğrulanmadı.
- Panel tek kullanıcı ve tek makine içindir. Aynı kullanıcı altında kötü niyetli süreçlere karşı tam koruma iddia edilmez; belirteç URL'dedir, paylaşılmamalıdır.
- Yalnızca mevcut OpenCode V2 proje uyarlaması, güncelleme ve profil akışları vardır. Diğer istemciler manueldir.
- Electron/Tauri paketleme, kod imzalama, otomatik başlatma ve sistem tepsisi yoktur.
- Canlı GitHub/release ve gerçek kullanıcı ayarına yazım yapılmadı; commit/push ayrıca onay ister.
