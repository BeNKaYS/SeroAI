# Kurtarma CLI uygulama planı

**Amaç:** Mevcut süreç sonrası kurtarma API’sini varsayılanı salt okunur olan bir CLI komutuyla sunmak.

**Yaklaşım:** Yeni kurtarma motoru yazmak yerine `prepareRecovery` ve `recoverWorkspace` kullanılır. `recover --workspace <mutlak-yol>` sadece dosya bazlı önizleme üretir. `--approve <önizleme-id>` olmadan mutasyon yapılmaz; genel `--yes` yoktur. Önizleme ve onay ayrı CLI süreçlerinde çalışır; onay sırasında yeni plan oluşturulur ve kimlik tekrar eşleştirilir. Bu, kullanıcının son onayladığı sonraki adımdır.

## Adımlar

- [x] CLI regresyon testlerini önce yaz; test çalıştırma onayı al ve eksik komut nedeniyle başarısız olduklarını gör.
- [x] Argüman ayrıştırma, Türkçe/İngilizce ve JSON çıktılarını mevcut motora bağla.
- [x] Yeni testleri ve tüm test takımını çalıştır; gerçek sonucu kaydet ve belgeleri güncelle.

## Sözleşme ve sınırlar

- `recover --workspace <mutlak-yol> [--json] [--lang tr|en] [--approve <64-haneli-id>]`.
- Önizlemede `mode: recovery-preview`, `changesApplied: false`, `recoveryRequired` ve işlem varsa `id`, `transactionId`, `operation`, `items`, `warnings` bulunur. Dosya içerikleri gösterilmez. İşlem yoksa `id: null`, `items: []`.
- Onaylı başarıda `mode: recovery`, `changesApplied: true`, `recovered: true`, `id` bulunur. Daha önce SeroAI’ın oluşturduğu dosya geri alma gereği silinebileceği için önizleme `delete`/`restore`/`leave` ayrımını açıkça gösterir.
- Kurtarma gerekmiyorken onay verilirse eski onayla sessiz başarı döndürmek yerine hata verilir.
- `--approve` yalnızca recover’da kullanılabilir; yinelenen bayrak, bilinmeyen bayrak, geçersiz kimlik veya eksik workspace reddedilir. `--yes` kabul edilmez.
- Kullanıcı düzenlemesi, canlı süreç, mevcut kilit, bozuk günlük/yedek ve eski plan hataları ham içerik veya yerel yolu göstermeden, seçilen dilde ve sıfırdan farklı çıkış koduyla döner.
- CLI artık bütünüyle salt okunur diye tanıtılmaz; yalnızca açık onaylı recover yazabilir. Setup ve inspect davranışları korunur. Gerçek ajan kurulumu, global ayarlar, güncelleme ve yayın açılmaz.
- Testler yalnızca geçici alanlarda gerçek alt süreçlerle yapılır. Test/build/lint ve yeni commit/push için ayrı kullanıcı onayı gerekir.

## Dosyalar ve kanıt

`tests/recovery-cli.test.mjs`: önizlemenin sıfır yazımı, iki CLI süreci arasında açık onayla geri alma, yanlış/eski kimlik, kullanıcı düzenlemesi, işlem yokluğu, Türkçe/İngilizce/JSON ve geçersiz bayraklar.

`src/cli/main.mjs`, `src/cli/messages.mjs`: mevcut kurtarma API’sine ince CLI bağlantısı. `README.md`, `docs/progress.md`: kullanım ve doğrulama kaydı.

Doğrulama: önce `node --test tests/recovery-cli.test.mjs`, sonra `node --test`. Beklenen sıfır hata; gerçek çıktı alınmadan tamamlandı denmez. Önceki 132 test yeni CLI davranışının kanıtı değildir.
