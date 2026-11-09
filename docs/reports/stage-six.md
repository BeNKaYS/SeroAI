# Aşama 6 kabulü — otomatik beceri kurulumu

Tarih: 2026-11-09 · Sürüm: `0.1.0-dev.6` · Tasarım: `docs/superpowers/specs/2026-11-09-auto-install-design.md` · Plan: `docs/superpowers/plans/2026-11-09-stage-six-auto-install.md`

## Ne eklendi

Pinlenmiş GitHub commit'lerinden beceri dosyalarını OpenCode keşif klasörüne kuran; önizleme, onay, sahiplik kaydı, doctor, geri alma ve kaldırma sunan motor. Upstream `install.sh`, `npx` veya indirilen kod çalıştırılmaz.

Dosyalar:

- `catalog/sources.json` — 7 paketin commit pini, lisansı ve kurulum türü.
- `src/install/sources.mjs` — katalog doğrulama, GitHub ağaç metadatası, sınırlı HTTPS indirme.
- `src/install/tar.mjs` — katı, bağımlılıksız tar.gz okuyucu (PAX/GNU uzun ad, yol/symlink/limit denetimi).
- `src/install/state.mjs` — hedef bağlamı, sahiplik kaydı, önceki durum yedeği, kilit.
- `src/install/plan.mjs` — plan, çakışma, doctor, rollback ve uninstall önizlemesi.
- `src/install/apply.mjs` — indirme, doğrulama, geçici alan, rename ile yazım, geri alma.
- `src/cli/install.mjs` + `src/cli/main.mjs` + `src/cli/messages.mjs` — `install`, `install-doctor`, `install-rollback`, `uninstall`; Türkçe/İngilizce.
- Testler: `install-sources`, `install-tar`, `install-plan`, `install-apply`, `install-cli` (26 test) + tar fixture yardımcısı.

## Kapsam ve pinler

| Paket | Commit | Lisans | Sonuç |
| --- | --- | --- | --- |
| superpowers | `22f0b463e7a5e579904dd6211a520321035526f7` | MIT | Kurulur |
| caveman | `3dc497a7f858c774d6e15b25e8c6120ef3a0eda8` | Apache-2.0 | Kurulur |
| ponytail | `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` | MIT | Kurulur |
| impeccable | `cf7ea4a8fe56f3e186e9ffaca3124937e36e6430` | Apache-2.0 | Kurulur |
| karpathy-skills | `2c606141936f1eeef17fa3043a72095b4765b9c2` | yok | Kurulmaz: lisans yok |
| graphify | `6c8002eca4acad58db6160eabcb466e61fc35afb` | Apache-2.0 | Kurulmaz: upstream CLI |
| github-mcp | `6fbcd00b2034502ba3001a49dfaf93593aee7069` | MIT | Kurulmaz: `opencode-project --github` |

`--profile core` uygun 4 paketi kurar; dışlananları gerekçesiyle listeler. `--package` ile açık seçim yapılır; lisanssız/araç/ayar paketi seçilirse `INSTALL_NOT_ALLOWED`.

## Sözleşme

- Varsayılan proje hedefi: `<proje>/.opencode/skills/<beceri>`; global hedef yalnızca `--global`: `~/.config/opencode/skills/<beceri>`. Ek `skills` config dizisi yazılmaz; OpenCode bu klasörleri keşfeder.
- Durum: proje `.git/seroai/install/`, global `~/.seroai/install/` (0700/0600). `state.json` sahipli dosyaları SHA-256 ile kaydeder; `latest.json` son işlemi izler.
- Önizleme yalnızca GitHub ağaç metadatasını ve mevcut durumu okur; tarball onaydan sonra indirilir. Her dosya Git blob SHA-1 + boyut ile doğrulanır.
- Terminalde `install` komutu planı yazdırır ve yalnızca `evet` sözcüğüyle uygular. `--json` veya TTY dışı çalıştırmada yalnızca önizleme üretir; betikler `--approve <id>` kullanır. `--yes` yoktur.
- Tarball yalnızca `codeload.github.com` ve ağaç `api.github.com`; HTTPS, yönlendirme denetimi, 24 MiB indirme / 64 MiB açılmış / 5000 girdi / 2 MiB dosya sınırı.
- Tar okuyucu symlink, hardlink, aygıt, mutlak yol, `..`, ters bölü ve yinelenen yolu reddeder; checksum doğrular.
- Yazım: tüm paketler önce geçici alanda doğrulanır; hedefler rename ile taşınır; durum en son yazılır. Hata halinde taşınan klasörler ve önceki durum geri getirilir.
- Sahiplik: sahipsiz hedef, aynı adda iki beceri veya kullanıcı tarafından değiştirilmiş dosya işlemi durdurur. Rollback/uninstall yalnızca değişmemiş sahipli dosyaları ele alır.
- MCP, hook, plugin, komut ve diğer istemciler bu aşamada kurulmaz.

## Doğrulama

| Dosya | Test | Sonuç |
| --- | --- | --- |
| `tests/install-sources.test.mjs` | Katalog + ağaç metadatası | 4/4 |
| `tests/install-tar.test.mjs` | Katı tar okuyucu | 6/6 |
| `tests/install-plan.test.mjs` | Plan/çakışma | 7/7 |
| `tests/install-apply.test.mjs` | Uygulama/rollback/uninstall | 7/7 |
| `tests/install-cli.test.mjs` | CLI + rehberli onay | 5/5 |
| **Tam takım** | `node --test` | **314/314 geçti, 0 başarısız, 0 atlanan** (yaklaşık 5,3 sn) |

Sınananlar: onaysız sıfır yazım; yanlış/eski kimlik; lisanssız ve araç paketi reddi; core dışlamaları; symlink/hardlink/traversal/bozuk checksum/limit; aynı beceri adı çakışması; sahipsiz hedef; bozulmuş tarball’da kısmi durum bırakmama; ikinci paket kurulumu ve yalnızca onu geri alma; kullanıcı düzenlemesinde durma; uninstall; hedef sonradan belirirse stale; global kurulum; bayrak/komut doğrulaması.

## Canlı doğrulama

Kullanıcı onayıyla geçici bir Git projesinde gerçek GitHub ağaçları ve tarbalları kullanıldı:

- Önizleme: 4 paket, **44 beceri**, 201 dosya (`superpowers` 15, `caveman` 22, `ponytail` 6, `impeccable` 1). Dışlananlar gerekçeleriyle listelendi.
- Uygulama: 44 beceri `.opencode/skills/` altına yazıldı; `install-doctor` tüm becerileri `unchanged` bildirdi.
- Geri alma: 44 beceri kaldırıldı, önceki durum geri geldi; doctor `installed: false`.
- Rehberli mod: bir pty üzerinde `install --package superpowers` planı yazdırdı, `evet` onayıyla 15 beceri kurdu. `--json` ve TTY dışı çalıştırmada yalnızca önizleme üretir.

Canlı denemede bulunan ve düzeltilen gerçek dünya sorunları:

1. `impeccable` tarball'ı 26,7 MB olduğu için 24 MB sınırına takıldı; indirme 32 MB'a, açılmış içerik 112 MB'a çıkarıldı ve yalnızca seçilen beceri yolları bellekte tutulacak şekilde `include` filtresi eklendi.
2. `.cmd` dosyası `.gitattributes` nedeniyle CRLF ile arşivleniyor; Git blob SHA-1'i LF içerikle eşleşiyordu. Doğrulama, CRLF→LF normalizasyonunu da kabul edecek şekilde düzeltildi; diğer dönüşümler reddedilir.
3. 20 saniyelik indirme zaman aşımı büyük arşivde yetmedi; 120 saniyeye çıkarıldı.
4. Çalıştırılabilir dosya izni (`scripts/impeccable` gibi) korunacak şekilde tar modu taşındı.
5. Doctor, 1 MB üzerindeki beceri dosyasını güvensiz sayıyordu; okuma sınırı 2 MB'a çıkarıldı.

## Sınırlar

- Canlı doğrulama tek bir macOS makinesinde ve geçici projede yapıldı; global kurulum, Windows/Linux ve yavaş/kopuk ağ koşulları denenmedi. Gerçek kullanıcı projesine kurulum yapılmadı.
- Yalnızca 4 uygun beceri paketi kurulur. Karpathy-skills lisanssız olduğu için otomatik kurulmaz. Graphify kendi CLI kurulumunu, GitHub MCP mevcut `opencode-project --github` akışını gerektirir.
- Güncelleme (aynı becerinin yeni commit'e yükseltilmesi) bu sürümde yoktur; farklı pin `CONFLICT` verir. Önce uninstall, sonra install.
- Çöken bir yazıcının bıraktığı kilit otomatik kırılmaz; elle inceleme gerekir. Aynı kullanıcı altındaki kötü niyetli süreçlere karşı tam koruma iddia edilmez.
- Arayüzde kurulum ekranı yoktur; bu aşama CLI'dir.
