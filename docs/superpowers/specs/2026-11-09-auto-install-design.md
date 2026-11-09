# Otomatik kurulum — tasarım

Tarih: 2026-11-09 · Aşama: 6 · Yön: ECC benzeri tek komut, kendi güvenlik sözleşmemizle.

## Amaç

Seçilen kaynak paketlerinin beceri dosyalarını, istemcinin keşfettiği klasöre tek komutla, pinlenmiş sürümden ve doğrulanarak kurmak. Kurulum; önizleme → açık onay → yedek → yazım → sahiplik kaydı → geri alma sırasını izler. Upstream `install.sh`, `npx` veya indirilen kod çalıştırılmaz.

## Kapsam

- OpenCode V2 keşif yolları: proje `.opencode/skills/<beceri>` ve global `~/.config/opencode/skills/<beceri>`. Ek `skills` dizisi yazımı gerekmez.
- Varsayılan **proje** kurulumu; global yalnızca `--global` bayrağı ve aynı onay kimliğiyle.
- Proje hedefi gerçek `.git` dizini ister (mevcut proje sözleşmesi). Global hedefte `~/.config/opencode` yoksa oluşturulmaz; kullanıcı önce istemciyi kurmalıdır.
- Durum: proje `.git/seroai/install/`, global `~/.seroai/install/` (0700/0600).
- Kapsam dışı: hook, plugin, model yönlendirme, MCP canlı bağlantısı, upstream CLI kurulumu, zip, imzalı yayın.

## Kaynak kataloğu

`catalog/sources.json` her paket için `id`, `repository`, `ref` (tam commit SHA), `license`, `kind`, `skillsRoot`, `installable` ve gerekçe taşır. İlk pinler (2026-11-09):

| Paket | Commit | Lisans | Kurulum |
| --- | --- | --- | --- |
| superpowers | `22f0b463e7a5e579904dd6211a520321035526f7` | MIT | `skills/` altındaki her beceri |
| caveman | `3dc497a7f858c774d6e15b25e8c6120ef3a0eda8` | Apache-2.0 | `skills/` altındaki her beceri |
| ponytail | `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` | MIT | `skills/` altındaki her beceri |
| impeccable | `cf7ea4a8fe56f3e186e9ffaca3124937e36e6430` | Apache-2.0 | `.agents/skills/impeccable` |
| karpathy-skills | `2c606141936f1eeef17fa3043a72095b4765b9c2` | yok | **Kurulmaz**: lisans belirtilmemiş |
| graphify | `6c8002eca4acad58db6160eabcb466e61fc35afb` | Apache-2.0 | **Kurulmaz**: upstream CLI/araç |
| github-mcp | `6fbcd00b2034502ba3001a49dfaf93593aee7069` | MIT | **Dosya kurulmaz**: mevcut `opencode-project --github` |

`karpathy-skills` lisanssız olduğu için otomatik kopyalanmaz; kullanıcı isterse ayrı ve açık bir kararla yerel klasörden ekleyebilir. `--profile core` uygun paketleri kurar ve dışlananları gerekçesiyle raporlar.

## Kaynak indirme ve doğrulama

- Tarball: `https://codeload.github.com/<sahip>/<depo>/tar.gz/<sha>`; yalnızca HTTPS ve izinli alan adları; yönlendirmeler aynı denetimden geçer.
- Sınırlar: sıkıştırılmış 24 MiB, açılmış 64 MiB, 5000 girdi, dosya başına 2 MiB. Aşılırsa işlem durur.
- Kendi katı tar okuyucumuz (`node:zlib` + 512 baytlık başlık ayrıştırma): mutlak yol, `..`, ters bölü, symlink/hardlink/aygıt, PAX/GNU uzun ad desteği; yalnızca normal dosya ve dizin kabul edilir. Yeni bağımlılık yok.
- Önizleme yalnızca GitHub ağaç metadatasını (`git/trees/<sha>?recursive=1`) ve mevcut sahiplik kaydını okur; tarball onaydan sonra indirilir.
- Uygulamada her dosyanın Git blob SHA-1'i ağaçtaki `sha` ile, boyutu da ağaçtaki `size` ile karşılaştırılır. Seçilen beceri klasörleri geçici alana çıkarılır; hedefe yalnızca doğrulanmış içerik yazılır.

## Plan ve onay

- Plan: paket, commit, beceri adları, hedef yollar, dosya sayısı/boyutu, mevcut hedef durumu (`yok`/`SeroAI'ya ait`/`çakışma`).
- Onay kimliği: hedef türü + kök + kaynak pinleri + planlanan dosyaların hash'leri + durum kaydı.
- Çakışma: var olan hedef SeroAI'ya ait değilse veya sahipli dosya kullanıcı tarafından değiştirilmişse işlem durur; üzerine yazılmaz.
- Uygulama sırası: tüm paketleri indir/doğrula → hedefte yer aç (yedek) → her beceri klasörünü geçici ada yazıp rename ile taşı → durum kaydını en son yaz.
- Hata halinde yalnızca bu işlemde yazılan yollar geri alınır; kullanıcı dosyaları korunur.

## Sahiplik, doctor, kaldırma

- Durum dosyası: `{ schema, target, root, packages: [{ id, ref, license, skills: [{ name, files: [{ path, sha256, size }] }] }], createdAt }`.
- `install-doctor`: kayıtlı dosyaları diskle karşılaştırır; `unchanged`/`modified`/`missing`/`unsafe` raporlar, yazmaz.
- `uninstall`: yalnızca sahipli ve değişmemiş dosyaları kaldırır; değişmiş dosya varsa durur. Önizleme + onay zorunlu.
- `install-rollback`: son başarılı kurulumu veya yarım kalan işlemi geri alır; kullanıcı değişikliğinde durur.

## CLI

```bash
node src/cli/main.mjs install --project /abs/proje --profile core --json
node src/cli/main.mjs install --project /abs/proje --profile core --approve PLAN_ID
node src/cli/main.mjs install --global --profile core [--approve PLAN_ID]
node src/cli/main.mjs install-doctor --project /abs/proje [--json]
node src/cli/main.mjs install-rollback --project /abs/proje [--approve PLAN_ID]
node src/cli/main.mjs uninstall --project /abs/proje --package superpowers [--approve PLAN_ID]
```

`install --package <id>` tek tek seçim için; `--profile core` uygun tüm paketler. `--project` ve `--global` birlikte kullanılmaz. Onay yoksa hiçbir dosya yazılmaz; `--yes` yoktur.

## Sınırlar

- Yalnızca beceri dosyaları; MCP, hook, plugin, komut ve ajan tanımları bu sürümde otomatik kurulmaz.
- GitHub API/ağaç metadatası ve codeload indirmesi canlı testte kullanıcı onayı ister; testler sahte taşıyıcı ve yerel tar fixture'larıyla çalışır.
- Aynı beceri adı iki pakette geçerse plan reddedilir.
- Kullanıcı tarafından sonradan değiştirilen beceri dosyaları güncellemede ezilmez.
- Aynı kullanıcı altındaki kötü niyetli süreçlere karşı tam koruma iddia edilmez.
