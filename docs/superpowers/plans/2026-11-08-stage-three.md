# Aşama 3 — incelenmiş istemci uyarlaması

**Amaç:** Mevcut önizlemeyi OpenCode V2 için proje düzeyinde, onaylı ve geri alınabilir gerçek ayar uygulamasına bağlamak. Önceki yol haritasındaki kademeli destek korunur: incelenmeyen istemciler otomatik kurulmuş sayılmaz, manuel/inceleme gerekli olarak kalır.

**Kapsam:** Gerçek `.git` dizini bulunan Git projelerinde yerel beceri kaynakları ve ek `.md` kuralları; isteğe bağlı kapalı, salt okunur GitHub MCP kaydı. Git dışı klasörler ve `.git` dosyası kullanan worktree’ler manuel kalır. Dış paket indirip çalıştırma, global ayarlar, V1 göçü, canlı OpenCode/hesap bağlantısı, güncelleme ve yayın yok. Kullanıcı 3. aşama kodu bitene kadar ilerlemeyi ve otomatik testleri onayladı; kendi ajan ayarlarını değiştirmek ayrıca onay ister.

## Adımlar

- [x] JSONC yorumlarını ve ilgisiz ayarları koruyan, çakışmayı reddeden birleştirmeyi ekle ve test et.
- [x] Yerel kaynakları doğrulayan proje planı, özel yedek, açık onaylı uygulama ve süreçler arası geri almayı ekle ve test et.
- [x] Türkçe/İngilizce CLI bağlantısını, destek sınırlarını ve kullanım belgelerini tamamla.
- [x] Tüm regresyon takımını çalıştır; kabul ölçütlerini ve kalan sınırları raporla.

## Tasarım kararları

- `jsonc-parser@3.3.1`, Microsoft, MIT; lockfile bütünlüğü sabitlenir. Kurulumda `--ignore-scripts` kullanılır. Özel bir JSONC ayrıştırıcısı yazılmaz.
- `src/adapters/opencode-merge.mjs`: yalnızca seçilen skills/instructions dizilerine yeni öğe ekler ve çakışmayan `mcp.servers.seroai-github` kaydını önerir. Var olan model, sağlayıcı, izin, hook, token ve yorumlar korunur. Yinelenen JSON anahtarları, bozuk JSONC, V1 MCP şekli veya başka değerle çakışma reddedilir.
- `src/adapters/opencode-project.mjs`: `planOpenCodeProject(options)`, `applyOpenCodeProject(plan, approval)`, `planOpenCodeRollback(project)`, `rollbackOpenCodeProject(plan, approval)`. Gerçek plan nesnesi ve güncel kimlik gerekir. Proje mutlak, var olan gerçek dizindir. `opencode.json`/`opencode.jsonc` ikisi birden veya `.opencode` altında proje config varsa öncelik belirsizliği nedeniyle işlem durur.
- `src/adapters/opencode-sources.mjs`: açıkça seçilen yerel kaynakların symlink/hardlink, dosya türü ve boyutlarını kontrol edip içerik hash’lerini alır. İçerik çıktıya girmez. Yalnızca yerel dosya bütünlüğü kanıtıdır; upstream sürüm/lisans veya skill kalitesi onayı değildir. Sınırlar: dosya başına 1 MiB, toplam 16 MiB, en çok 500 dosya, 12 dizin seviyesi. Gizli alanlar ve node_modules takip edilmez.
- `.git/seroai/opencode/` özel durum alanı: sahibi/projesi belirli marker, değişmez işlem yedeği, son işlem işaretçisi ve özel kilitler. Yedekler böylece çalışma ağacına ve Git yayınına girmez. Dizin 0700, dosyalar 0600; eski config yedeği içerik ve orijinal izinleriyle saklanır. İlk hedef yazımından önce yedek ve pending işaretçisi kalıcılaştırılır.
- Uygulama yalnızca onaylı beforeHash hâlâ geçerliyse yazılır. Hata halinde güvenle mümkünse önceki dosya geri getirilir; üçüncü içerik veya geri alma hatası varsa yedek korunup durulur. Kısmi işlem için aynı proje rollback komutu kullanılabilir. Canlı yazıcı ve mevcut kurtarma kilidi reddedilir; ölü yazıcının kilidi sadece doğrulanmış geri alma onayıyla kaldırılabilir.
- Geri alma bütün config dosyasını eski baytlarına döndürür; sonradan herhangi bir kullanıcı düzenlemesi varsa uygulanmaz. Böylece ilgisiz yeni ayarlar ezilmez. Yeni config geri alınırken yalnızca işlem dosyası kaldırılır. Yedekler korunur.
- CLI `opencode-project --project <mutlak-yol> ... [--approve <id>]` ve `opencode-rollback --project <mutlak-yol> [--approve <id>]` varsayılan olarak önizleme yapar. Tam config ve sırlar gösterilmez. Genel `setup` değişmez; diğer istemciler otomatik etkinleştirilmez.

## Kabul ölçütleri

Yorum/ayar korunumu, idempotent birleştirme, çakışmalar, hatalı kaynaklar, onaysız sıfır yazım, eski plan, yedek hatası, normal uygulama, yeni süreçte rollback, kullanıcı düzenlemesi, süreç kesintisi ve kaynak değişikliği testleri geçmeli. Nihai rapor canlı bağlantı yapılmadığını ve hangi istemcilerin manuel kaldığını açıkça belirtmeli. Bu sınırlar bir “bütün uygulamalar hazır” iddiası değildir.
