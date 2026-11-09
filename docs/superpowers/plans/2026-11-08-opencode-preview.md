# OpenCode V2 ayar önizlemesi planı

**Amaç:** İlk istemci uyarlamasını resmî V2 belgelerine dayanan, ayarlara dokunmayan bir önizleme olarak sunmak.

**Tasarım:** `docs/adapters/opencode-v2.md`. Node.js >=22, ESM, harici bağımlılık yok. Uygulama ana ajan tarafından yapılır; alt ajan kullanılmaz.

## Adımlar

- [x] Saf uyarlama ve izole CLI testlerini yaz; eksik davranış nedeniyle başarısız olduklarını gör.
- [x] `src/adapters/opencode.mjs` içinde `createOpenCodePreview(options)` uygula.
- [x] `opencode-preview` komutunu ve Türkçe/İngilizce mesajları ekle.
- [x] İlgili testleri ve tüm takımı çalıştır; gerçek sonucu belgelere kaydet.

## Arayüz ve dosyalar

- `src/adapters/opencode.mjs`: saf ve deterministik ayar parçası üretir. Seçenekler yalnızca `clientMajor`, `skillDirectories`, `instructionFiles`, `includeGitHub` olur; bilinmeyen alanlar reddedilir. Hedef V2, proje kapsamı, uygulama hazır değil. Paths: mutlak, yerel, glob/ikame/üst dizin kaçışı yok; kurallar `.md` dosyaları. En çok 100’er yol.
- `src/cli/main.mjs`, `src/cli/messages.mjs`: `opencode-preview`, `--skill-dir`, `--instruction`, `--github`. Bayraklar sadece bu komutta geçerli. Boş seçim, bilinmeyen bayrak ve onayla yazma denemesi hata verir.
- `tests/opencode.test.mjs`: V2 `skills`/`instructions`/`mcp.servers`, `disabled: true`, idempotent tekilleştirme, girdi korunumu, hatalı tür/sürüm/yol ve hazır/kuruldu iddiası olmaması.
- `tests/opencode-cli.test.mjs`: JSON/metin ve dil, geçerli bayrak kapsamı, izole HOME/cwd dosyalarının korunması. Dış ağ veya gerçek ayar dosyası kullanılmaz.
- `README.md`, `docs/progress.md`: örnek komut ve sınırlar.

## Kapılar

Adım sonu testleri kullanıcı tarafından sürekli onaylandı: önce hedefli `node --test tests/opencode.test.mjs tests/opencode-cli.test.mjs`, sonra `node --test`. Build/lint, gerçek uygulama bağlantısı, kurulum, commit/push ayrıca izin gerektirir. Genel katalog desteği bu belge incelemesiyle `supported` yapılmaz; dış kaynak sürümleri ve lisanslar incelenmiş sayılmaz.
