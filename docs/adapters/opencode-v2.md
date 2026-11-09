# OpenCode V2 uyarlaması: ilk ayar önizlemesi

## Kapsam

İlk istemci OpenCode V2’dir; OpenChamber bu sunucu üzerinden değerlendirilir. Yerel OpenCode sürümü, OpenChamber sürümü ve bağlantı durumu tespit edilmez. Belgeden desteklenen yapı ile bu bilgisayarda çalışan entegrasyon birbirinden ayrılır. Genel katalogdaki `unverified` durumları bu incelemeyle değiştirilmez.

Kapsam kararı: önce **yalnızca ayar parçası** üretmek. Mevcut JSON/JSONC dosyasını okumak/birleştirmek, kişisel sırları önizlemeye taşıma ve yorumları kaybetme riski getirir; otomatik kurulum ise incelenmemiş kaynak sürümlerine dayanır. Bu adım ikisini de yapmaz. Çıktı tam ayar dosyasının yerine geçirilmez.

## Resmî kaynak incelemesi — 8 Kasım 2026

- [V2 yapılandırma](https://opencode.ai/v2/docs/config): `opencode.json(c)` ve `.opencode/opencode.json(c)` proje ayarlarıdır. `.opencode` altındaki keşfedilmiş ayarlar doğrudan dosyalardan yüksek öncelik taşır. Sistem/MDM ayarları da çıktıyı geçersiz kılabilir.
- [V2 beceriler](https://opencode.ai/v2/docs/skills): proje `.opencode/skills`, global `~/.config/opencode/skills` ve belgelenmiş uyumluluk yolları keşfedilir. Ek kaynaklar `skills: ["..."]` dizisidir. Göreli kaynak yolu etkin çalışma dizininden çözülür; bu yüzden bu ilk önizleme yalnızca açık mutlak yerel yollar kabul eder.
- [V2 talimatlar](https://opencode.ai/v2/docs/instructions): `AGENTS.md` yüklenir; `CLAUDE.md` yedek kural dosyası değildir. Ek dosyalar `instructions` dizisine girer. SeroAI mevcut `AGENTS.md` dosyalarını değiştirmez; yalnızca seçilen ek `.md` dosyalarını önerir.
- [V2 MCP](https://opencode.ai/v2/docs/mcp-servers): sunucular `mcp.servers` altındadır. Otomatik bağlantıyı durdurmak için `disabled: true` kullanılır; `enabled: false` önerilmez. Kimlik doğrulama ayrıca tamamlanmalıdır.
- [GitHub uzak sunucu](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md): resmî salt okunur uç nokta `https://api.githubcopilot.com/mcp/readonly`. Önizlemede sunucu adı `seroai-github`, bağlantı kapalıdır. Kimlik doğrulama yöntemi ve erişim kapsamı bu adımda varsayılmaz.

Bu kaynaklar bir uygulama sürümünün canlı testi veya dış paket lisans/sürüm incelemesi değildir. Hook, ücretli hizmet, model yönlendirme, plugin veya izin politikası etkinleştirilmez.

## Sözleşme

`createOpenCodePreview({ clientMajor: 2, skillDirectories: [], instructionFiles: [], includeGitHub: false })` saf bir fonksiyondur. En az bir açık seçim gerekir. Yolların varlığı, içeriği veya symlink durumu incelenmez; bunlar uygulanmadan önce doğrulanmalıdır. Ağ kaynakları, glob’lar, değişken ikamesi ve yol kaçışı kabul edilmez. Mutlak yollar normalize edilip tekilleştirilir.

Çıktı `mode: adapter-preview`, `changesApplied: false`, `readyToApply: false`, `documentationStatus: reviewed`, `runtimeStatus: unverified` ve `configFragment` içerir. Hedef yalnızca proje düzeyinde `opencode.jsonc` için elle birleştirme önerisidir. Mevcut ayarla çakışma, üst dizin/MDM önceliği, kaynak sürümleri/lisansları ve kimlik doğrulama ayrıca incelenmelidir.

CLI: `opencode-preview --skill-dir <mutlak-yol> --instruction <mutlak-md-yolu> --github [--json] [--lang tr|en]`. Kaynak seçenekleri bağımsız ve isteğe bağlıdır; en az biri seçilir. `--skill-dir` ve `--instruction` tekrar kullanılabilir. `--approve` veya `--yes` yoktur; bu komut dosyaya yazmaz.

## Kabul ve sınırlar

V2 anahtarları, tekilleştirme, bozuk seçenekler, güvensiz yollar, değişmeyen girdiler, kapalı GitHub bağlantısı ve izole CLI çalışma alanında sıfır yazım testlerle sınanır. Adım sonu testlerini çalıştırmak için kullanıcı sürekli onay verdi. Gerçek ajan ayarı değişikliği, canlı bağlantı, kurulum ve yayın bu onaya dahil değildir.
