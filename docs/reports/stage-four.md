# Aşama 4 kabulü — güncelleme ve taşınabilir profil

Tarih: 2026-11-09 · Sürüm: `0.1.0-dev.3` · Plan: `docs/superpowers/plans/2026-11-08-stage-four.md`

Bu aşama iki yetenek ekler: (1) SeroAI program dosyalarını yerel klasörden veya GitHub’dan onay, yedek ve geri alma ile güncellemek; (2) makineye bağlı yollar ve sırlar içermeyen bir seçim profilini dışa aktarıp yeni bir Git projesinde mevcut OpenCode V2 uyarlamasıyla geri yüklemek.

## Kapsam ve dosyalar

- `src/updates/manifest.mjs` — sürüm ayrıştırma/karşılaştırma, sürüm dosyası doğrulaması, açık dosya manifesti ve SHA-256 doğrulaması.
- `src/updates/source.mjs` — yerel klasör, GitHub release ve commit’e sabitlenen dal modu; HTTPS/alan adı/yönlendirme denetimi.
- `src/updates/state.mjs` — `.git/seroai/updates/` altında özel durum, yedek, işlem işaretçisi ve kilitler.
- `src/updates/update.mjs` — önizleme, onay→yedek→payload→doğrulama→yazım→gerekirse geri alma akışı ve ayrı rollback.
- `src/profiles/profile.mjs` — profil doğrulama, dışa aktarma, eşleme ve kaynak çözümleme.
- `src/cli/stage-four.mjs`, `src/cli/main.mjs`, `src/cli/messages.mjs` — `update`, `update-rollback`, `profile-export`, `profile-restore`; Türkçe/İngilizce metinler.
- `tests/update-source.test.mjs` (17), `tests/update.test.mjs` (12), `tests/profile.test.mjs` (5), `tests/stage-four-cli.test.mjs` (9), `tests/helpers/update-fixture.mjs`.

## Sözleşme

### Güncelleme

- Kaynakta `version.json` ve `update-manifest.json` bulunur. Manifest `{ schema: 1, application: "seroai", version, files: [{ path, sha256, size }] }`; `version.json` ve `src/cli/main.mjs` zorunludur, en çok 100 dosya, dosya başına 1 MiB, toplam 16 MiB.
- İzinli yollar program kodu, katalog, paket/README dosyaları ve profil modülüdür. `.git`, `.seroai`, `.env`, istemci ayarları, token, veritabanı, sohbet, hafıza, yedek ve yerel model yolları reddedilir. Mutlak yol, `..`, ters bölü, gizli segment ve tekrarlı/çakışan yollar kabul edilmez.
- Yönetici yalnızca `package.json` adı `seroai` olan ve `src/cli/main.mjs` bulunan gerçek `.git` dizinli kurulumu günceller. SeroAI’a ait olmayan mevcut dosyanın üzerine yazılmaz.
- GitHub varsayılanı release’tir: `version.json`, `update-manifest.json` ve katı base64 JSON paketi `seroai-update.json`. `--ref` dal modu önce commit SHA’sına sabitlenir. Yalnızca HTTPS ve izinli GitHub indirme alan adları; yönlendirmeler de aynı denetimden geçer. Token okunmaz, özel repo desteklenmez.
- **Önizleme** yalnızca sürüm/manifest metadatasını ve mevcut hedefleri okur. İçerik onaydan **ve** yedekten sonra alınır. Plan kimliği; kurulum kökü, mevcut sürüm, kaynak parmak izi, hedef önceki hash’leri ve durum kaydına bağlıdır.
- Aynı veya eski sürüm yazılmaz; prerelease parçaları sayısal karşılaştırılır (`dev.10 > dev.2`).
- Tüm eski hedefler tek JSON yedeğinde 0600 olarak `.git/seroai/updates/backups/` altında saklanır; işaretçi önce `pending` yazılır. Payload boyut/hash/sürüm doğrulamasından geçmeden hiçbir hedef yazılmaz. `version.json` en son yazılır.
- Hata halinde yalnızca işlem hash’leriyle eşleşen dosyalar geri alınır. Ayrı `update-rollback` yeni süreçte yedeği doğrular, tüm hedefleri önce kontrol eder ve kullanıcı düzenlemesinde durur.
- İndirilen kod, npm script’i veya test çalıştırılmaz; yeni bağımlılık otomatik kurulmaz. CLI yenilemesi bir sonraki elle başlatmadır; servis zorla yeniden başlatılmaz.
- Kilitler otomatik kırılmaz. Çöken yazıcının kilidi ancak süreç durmuşsa ve güncel rollback onayıyla ele alınır.

### Profil

- Şema: `schema`, `application`, `name`, `clients`, `packages`, `sources`, `includeGitHub`. Kaynaklar yalnızca mantıksal anahtar ve tür (`skill`/`instruction`) taşır.
- Mutlak yol, ham config, token, sohbet, hafıza, bilinmeyen alan ve katalog dışı seçim reddedilir.
- `profile-export` stdout’a JSON yazar; dosya oluşturmaz. `profile-restore` profil dosyası ve `anahtar=/yeni/mutlak/yol` eşlemeleri ister; eksik, fazla veya göreli eşleme hata verir.
- Kaynaklar indirilmez. Geri yükleme mevcut OpenCode proje planı üzerinden yürür; profil+eşleme+config durumuna bağlı ayrı onay gerekir. OpenCode dışındaki istemciler “ertelendi” olarak raporlanır, uygulanmış sayılmaz.

## Doğrulama

Gerçek çalıştırmalar (yalnızca geçici klasörler; gerçek kullanıcı ayarına yazım yok):

| Aşama | Komut | Sonuç |
| --- | --- | --- |
| Kaynak katmanı | `node --test tests/update-source.test.mjs` | 17/17 geçti |
| Kaynak sonrası tam takım | `node --test` | 235/235 geçti |
| Güncelleme çekirdeği | `node --test tests/update.test.mjs` | 12/12 geçti |
| Profil + CLI | `node --test tests/profile.test.mjs tests/stage-four-cli.test.mjs` | 14/14 geçti |
| **Son tam takım** | `node --test` | **261/261 geçti, 0 başarısız, 0 atlanan** (yaklaşık 4,8 sn) |

Sınanan davranışlar: önizlemede sıfır yazım/yedek; yedek öncesi payload okunmaması; onaylı artan sürüm; aynı/eski sürümün atlanması; onaydan sonra bozulan kaynak; kısmi yazımda eski dosyaların geri gelmesi; kullanıcı düzenlemesinde rollback’in durması; sahipsiz dosya ve symlink hedefinin reddi; taklit plan/yanlış onay; yerel/GitHub kaynak metadata’sının önceden okunup payload’ın alınmaması; dal modunun commit’e sabitlenmesi; HTTP, güvensiz yönlendirme ve 404; `.env` dosyasının korunması; sır/yol alanlı profil reddi; eksik/fazla eşleme; OpenCode dışı istemcinin ertelenmesi; ayrı CLI süreçlerinde uygulama ve geri alma.

## Sınırlar

- Canlı GitHub API/release çağrısı ve gerçek indirme **yapılmadı**; testler sahte taşıyıcı kullanır. Public release henüz yayımlanmadı; release akışı bu bilgisayarda uçtan uca doğrulanmadı.
- SHA-256 bütünlük sağlar; imzalı yayın, yayıncı kimliği veya güven zinciri garantisi değildir.
- Zip açılmaz. Kötü niyetli aynı kullanıcı yarışına, güç kesintisine ve dosya sistemi düzeyinde tam atomikliğe karşı garanti verilmez.
- `update` üçüncü taraf beceri paketlerini kurmaz/güncellemez; yalnızca SeroAI program dosyalarını günceller. İstemci uyarlamaları ve global ayar yazımı hâlâ kapalıdır.
- Profil geri yükleme yalnızca mevcut OpenCode V2 proje uyarlamasını kullanır; diğer istemciler manueldir.
- Gerçek depoda commit/push, npm yayını, release, gerçek ajan ayarı veya canlı servis çağrısı yapılmadı.
