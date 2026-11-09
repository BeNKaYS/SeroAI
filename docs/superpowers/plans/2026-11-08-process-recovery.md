# Süreç sonrası kurtarma uygulama planı

> Uygulama ana ajan tarafından, mevcut klasörde ve mevcut değişiklikler korunarak yapılır. Kullanıcının devam talebi geliştirmeyi kapsar; test ve yeni commit/push ayrı onay ister.

**Amaç:** Süreç kapandıktan sonra yarım kalan özel çalışma klasörü işlemini tanımak ve ayrı onayla geri almak.

**Mimari:** Doğrulanmış yedek + exclusive pending günlüğü + yeniden doğrulanan kurtarma önizlemesi. CLI’de mutasyon açılmaz.

**Teknoloji:** Node.js >=22, ESM, yerleşik crypto/fs/test. **Tasarım:** `docs/superpowers/specs/2026-11-08-process-recovery-design.md`.

## Adımlar

- [x] Süreç çıkışı ve kurtarma sınırı testlerini yaz.
- [x] Ortak sahiplik okuyucusu, boyut sınırları ve kalıcı pending günlüğünü ekle.
- [x] Salt okunur kurtarma planı ve ayrı onaylı kurtarma fonksiyonunu uygula.
- [x] Belgeleri güncelle, kullanıcıdan test onayı al ve gerçek sonuçları kaydet.

## Dosyalar ve arayüzler

- `src/core/workspace-state.mjs`: ortak sahiplik okuma/doğrulama ve SHA-256; inceleme ve kurtarma aynı kayıt sözleşmesini kullanır.
- `src/core/journal.mjs`: günlüğü yazma/kaldırma, snapshot doğrulama; göreli yol ve içerik hash’leri kontrol edilir.
- `src/core/workspace.mjs`: apply/rollback yazımından önce kalıcı günlük; hata halinde günlüğü koruma. Önceki API imzaları korunur.
- `src/core/safe-files.mjs`: sınırlandırılmış büyük yedek okuma seçeneği; normal hedefler 1 MiB kalır.
- `src/core/recovery.mjs`: `prepareRecovery(root)` → donmuş plan veya null; `recoverWorkspace(plan, { approvedPlanId })` → `{ recovered: true, id }`. Plan nesnesi ve güncel disk izi birlikte doğrulanır.
- `src/core/inspection.mjs`: ortak sahiplik okuyucusunu kullanır; CLI inceleme davranışı değişmez.
- `tests/recovery.test.mjs`: geçici dizinlerde gerçek alt süreç çıkışıyla yarıda bırakma; yeni süreç mantığıyla kurtarma.

## Genel kısıtlar ve inceleme odağı

- Gerçek HOME/ajan ayarlarında çalıştırma; testlerde yalnızca oluşturulan geçici alanları kullan.
- Pending veya yedek bozuksa hiçbir hedefe dokunma. İçerik hata mesajına sızmasın.
- Kullanıcı düzenlemesi varsa tüm hedefleri değiştirmeden önce reddet.
- Canlı yazıcı, eski plan ve eşzamanlı kurtarma kilidi reddedilsin.
- Apply, rollback ve sahiplik yazımının iki tarafındaki kesintiler sınansın.
- Süreç içi önceki 110 testin davranışları korunsun. Eski yedeklere otomatik yeni yetki verilmesin.

## Test sözleşmesi

- [x] Günlük oluşmadan hedef yazılmadığını ve normal işlemden sonra pending kalmadığını sına.
- [x] İkinci dosyada süreç çıkışı, sahiplik yazımı öncesi/sonrası çıkış ve yarım rollback sonrası geri alma testlerini yaz.
- [x] Onaysız sıfır yazma, taklit/eski plan, canlı PID, bozuk yedek/base64/yol/hash, yabancı sahiplik revizyonu, kullanıcı düzenlemesi ve kilit testlerini yaz.
- [x] Kullanıcı onayından sonra `node --test` çalıştır; beklenen sıfır hata, gerçek sonucu belgede kaydet. Onay yoksa doğrulanmadı olarak bırak.
- [ ] Yeni değişiklikler için dosya listesi ve commit/push onayı sun; izinsiz yayın yapma.
