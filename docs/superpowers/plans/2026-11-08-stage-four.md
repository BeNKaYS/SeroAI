# Aşama 4 — güncelleme ve taşınabilir profil

**Amaç:** SeroAI’ın uygulama dosyalarını yerel/GitHub kaynaklarından ayrı onay ve özel yedekle güncellemek; seçim profilini sır içermeden dışa aktarıp yeni projede mevcut OpenCode uyarlamasıyla geri yüklemek.

**Kapsam kararları:** Mevcut Node.js/ESM ve Git proje sınırı korunur. GUI/ayarlar ekranı aşama 5’tir; bu aşamada CLI vardır. Program güncellemesi ile üçüncü taraf beceri paketlerinin güncellenmesi aynı şey değildir. Sürüm sadece kök `version.json` üzerinden okunur. Testler otomatik; gerçek ajan ayarlarında canlı işlem, yayın ve servis yenileme yapılmaz.

## Adımlar

- [x] Sürüm karşılaştırma, açık dosya manifesti ve güvenli yerel/GitHub kaynak okuyucularını test ederek ekle.
- [x] Uygulama güncelleme önizlemesi, onay → yedek → içerik alma/doğrulama → yazma → hata halinde geri alma ve ayrı rollback akışını ekle.
- [x] Taşınabilir profil oluşturma/doğrulama ve yerel kaynak eşlemesiyle OpenCode proje geri yüklemesini ekle.
- [x] Türkçe/İngilizce CLI, kullanım/sınırlar ve son test raporunu tamamla.

## Güncelleme sözleşmesi

- Kaynakta `version.json` ve `update-manifest.json` bulunur. Manifest `{ schema: 1, application: 'seroai', version: '<surum>', files: [{ path, sha256, size }] }`; en az `version.json` ve `src/cli/main.mjs` gerekir. En çok 100 dosya, dosya başına 1 MiB, toplam 16 MiB.
- İzinli hedefler SeroAI program kodu, kaynak katalogları, package/lock ve README’dir. `.git`, `.seroai`, `.env`, kullanıcı ayarları/profilleri, token’lar, veritabanları, sohbetler, yedekler ve yerel modeller kapsam dışıdır. Mutlak yol, `..`, backslash, gizli segment, tekrarlı/büyük-küçük harf çakışmalı yollar reddedilir. Zip açılmaz; yerel dosyalar veya release için katı base64 JSON paketi kullanılır.
- GitHub varsayılanı release’tir: `version.json`, `update-manifest.json`, `seroai-update.json` asset’leri gerekir. Açık `--ref` dal modu önce commit SHA’sına sabitlenir. Yalnızca HTTPS ve GitHub’ın izinli indirme alan adları; yönlendirmeler de kontrol edilir. Token okunmaz, özel repo desteği yoktur. Testler sahte taşıyıcıyla yapılır; canlı release kontrolü izni varsayılmaz.
- Önizleme yalnızca sürüm/manifest metadatasını ve mevcut hedefleri okur. Payload onaydan ve yedekten sonra alınır. Kimlik metadata, kaynak ve hedef hash’lerine bağlıdır. Aynı/eski sürüm yazılmaz; prerelease sayıları sayısal karşılaştırılır.
- Yedekler `.git/seroai/updates/` içindedir; tüm eski hedefler yazımdan önce kaydedilir. Payload boyut/hash/version/imza dosyaları doğrulanmadan hedef yazılmaz. Kod, npm script’i veya indirilen testler çalıştırılmaz. Yeni bağımlılıklar otomatik kurulmaz; kullanıcı ayrıca `npm ci --ignore-scripts` çalıştırır. CLI yenilemesi bir sonraki elle başlatmadır; servis zorla yeniden başlatılmaz.
- Yarım yazımda yalnızca işlem hash’leriyle eşleşen dosyalar geri alınır. Ayrı rollback yeni süreçte disk kaydını doğrular, tüm hedefleri önce kontrol eder, kullanıcı düzenlemesinde durur. Kilitler otomatik kırılmaz; çöken yazıcının kilidi ancak durmuş süreç ve güncel geri alma onayıyla ele alınır. Güç kesintisi veya kötü niyetli aynı kullanıcı yarışına karşı tam atomiklik iddia edilmez.
- Son kullanılan kaynak başarılı/pending işlem kaydında saklanır; sır içermez. SHA-256 bütünlük sağlar, imzalı yayın veya yayıncı kimliği garantisi değildir. Henüz public release yayımlanmadığı açıkça belirtilir.

## Profil sözleşmesi

- Profil şeması: ad, katalogdaki istemci/paket seçimleri, yerel kaynaklar için mantıksal anahtarlar ve kapalı GitHub MCP seçimi. Mutlak yol, ham config, token, sohbet veya hafıza verisi içermez. Bilinmeyen alanlar reddedilir.
- Dışa aktarma stdout’a JSON verir; dosya konumunu kullanıcı seçer. Geri yüklemede profil dosyası ve `anahtar=/yeni/mutlak/yol` eşlemeleri açıkça verilir. Kaynaklar otomatik indirilmez; eksik eşleme hata verir.
- Geri yükleme mevcut `planOpenCodeProject`/`applyOpenCodeProject` üzerinden yapılır; profil+eşleme+config kimliğine bağlı ayrı onay gerekir. Diğer istemciler uygulanmış sayılmaz; ertelenenler raporlanır. Paketler seçim olarak korunur, upstream installer çalıştırılmaz.

## Kanıt

Yerel sürüm artışı, aynı/eski sürüm, bozuk manifest/payload, symlink/yol kaçışı, 404/ağ/HTTPS/redirect, yedek hatası, kısmi yazım, rollback, kullanıcı dosyasının korunması, gizli alanlı profil reddi, eksik eşleme ve CLI süreçleri sınanır. Her alt adım sonunda ilgili testler ve tüm takım; finalde toplu test ve rapor. Yeni commit/push yapılmaz.
