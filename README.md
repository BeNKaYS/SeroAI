# SeroAI

Ajan becerilerini, ortak kuralları ve MCP bağlantılarını tek merkezden yönetmeyi amaçlayan, yerel öncelikli ve onay odaklı bir araç.

> **Durum: ilk geliştirme aşaması.** Salt okunur CLI için 59 test geçti (`node --test`). Kurulum aracı, npm paketi veya yayımlanmış sürüm yok; gerçek uygulama entegrasyonları doğrulanmadı.

SeroAI; seçtiğin araçları ve paketleri tek yerden yönetmeyi, değişiklikleri önce göstermeyi, yedek almayı ve yalnızca desteklenen bağlantıları uygulamayı hedefler. Her uygulamanın aynı özellikleri desteklediği varsayılmaz.

## Ne çözer?

- Beceri, kural ve MCP ayarlarının farklı uygulamalara dağılmasını azaltır.
- Bilgisayar değişince veya format sonrasında aynı seçimi yeniden kurmayı kolaylaştırır.
- Değişiklik öncesinde ne yapılacağını gösterir; sessizce ayar değiştirmez.
- Desteklenmeyen bir özelliği “kuruldu” diye göstermez.

## Temel kaynaklar

| Kaynak | Amaçlanan görev |
| --- | --- |
| [Superpowers](https://github.com/obra/superpowers) | Geliştirme süreci |
| [Graphify](https://github.com/Graphify-Labs/graphify) | Kod ve bilgi haritası |
| [Caveman](https://github.com/JuliusBrussee/caveman) | Kısa anlatım; yalnızca skill tarafı |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Sade ve sürdürülebilir çözümler |
| [Karpathy Skills](https://github.com/multica-ai/andrej-karpathy-skills) | Odaklı kodlama ilkeleri |
| [Impeccable](https://github.com/pbakaus/impeccable) | Arayüz tasarımı ve kalite kontrolleri |
| [GitHub MCP](https://github.com/github/github-mcp-server) | Açıkça yetkilendirilmiş GitHub erişimi |

[AgentMemory](https://github.com/rohitg00/agentmemory) ayrı ve deneysel bir adaydır; etkin bağımlılık değildir. Claude-Mem ve ECC etkin temele dahil değildir.

Bunlar SeroAI’a ait uygulamalar değil, dış kaynaklardır. Entegrasyonlarda kaynak bilgisi ve lisanslar korunur. Bu tabloda yer almak; uyumluluk, onay veya başarılı kurulum iddiası değildir.

## Güvenlik sınırları

- Değişiklikler uygulanmadan önce gösterilir; sessiz global kurulum yapılmaz.
- Dosyalar değiştirilmeden önce yedek alınır ve geri alma kaydı tutulur.
- Kullanıcıya ait ayarlar, beceriler ve hook’lar açık karar olmadan ezilmez.
- Şifreler, sohbetler, hafıza verileri, yerel modeller ve uygulamaların kendi bileşenleri korunur.
- Kişisel ayar dökümleri, token’lar ve makineye özel envanter repoya eklenmez.
- Dış paketlerin sürümü sabitlenir; indirilen kod körlemesine çalıştırılmaz.
- Yerel, kısmi, elle yapılacak, deneysel ve desteklenmeyen entegrasyonlar ayrı gösterilir.
- Ücretli hizmetler, bulut senkronizasyonu, model yönlendirme ve telemetri sessizce açılmaz.
- Arayüz düzenlemeleri için ajan onayları veya sandbox atlatılmaz.

## Hedeflenen uygulamalar

OpenChamber/OpenCode, Cursor, Antigravity ve Antigravity IDE, Claude Code ve Claude Desktop, Codex masaüstü/CLI kurulumları, Gemini CLI ve masaüstü, DeepSeek Harness ve Jan.

Her uygulama ayrı değerlendirilir. MCP bağlantısı; otomatik oturum kaydı, hook desteği veya beceri keşfi anlamına gelmez. Masaüstü ve CLI sürümleri birbirinin yerine geçmez.

## Yol haritası

1. **Salt okunur temel:** paket kataloğu, uygulama bilgileri, kurulum önizlemesi, Türkçe/İngilizce mesajlar.
2. **Güvenli değişiklikler:** çakışma tespiti, yedekleme, sahiplik kaydı, yarıda kalan işlemi geri alma.
3. **İncelenmiş uyarlamalar:** doğrulanan uygulamalardan başlayarak kademeli etkinleştirme; desteklenmeyen yolları salt okunur/elle bırakma.
4. **Güncelleme ve geri yükleme:** yerel klasör ve GitHub kaynakları, sürüm sabitleme, indirme doğrulama, onay ve profil geri yükleme.
5. **İsteğe bağlı arayüz:** CLI yaşam döngüsü güvenilir olduktan sonra masaüstü arayüzü.

Tasarım: [docs/design.md](docs/design.md) · İlk plan: [docs/superpowers/plans/2026-11-08-read-only-foundation.md](docs/superpowers/plans/2026-11-08-read-only-foundation.md)

## Kaynak kopyadan kullanım (salt okunur)

Node.js 22 veya üstü gerekir. Harici bağımlılık, `npm install` veya global kurulum gerekmez. Depo kökünden:

```bash
node src/cli/main.mjs help
node src/cli/main.mjs version
node src/cli/main.mjs catalog
node src/cli/main.mjs setup --client opencode --package superpowers
node src/cli/main.mjs setup --client claude-code --client cursor --package impeccable --json
```

`setup` **kurulum yapmaz**: yalnızca seçilen paket/uygulama çiftlerini listeler. Ayar dosyaları ve kimlik bilgileri okunmaz; hiçbir şey indirilmez veya yazılmaz. Uygulama yetenekleri doğrulanmamış, kaynak sürümleri ve lisanslar incelenmemiştir. Bu çıktı uyumluluk kanıtı değildir.

- Her seçim için `--client` veya `--package` bayrağını tekrar kullanın; kimlikleri `catalog` komutundan öğrenin.
- Varsayılan çıktı Türkçedir. `--lang en` İngilizce mesajları seçer; katalogdaki kaynak açıklamaları Türkçe kalır.
- `catalog` ve `setup` için `--json` kullanılabilir. JSON alan adları ve durum kodları dilden bağımsızdır; uyarı ve hata metinleri seçilen dildedir.
- Bilinmeyen kimlikler/bayraklar hata verir. `status`, `update`, `backup`, `restore` ve `uninstall` uygulanmamıştır; başarı döndürmez.
- CLI sürümü yalnızca kök `version.json` dosyasından okunur. `package.json`, yanlışlıkla npm’e yayımlanmayı önlemek için `private: true` içerir.

### Geliştirme testleri

`node --test` kullanıcı onayıyla çalıştırıldı: **59 geçti, 0 başarısız, 0 atlanan**. CLI testleri geçici HOME ve çalışma dizinleri kullanır; testler tamamlandığında yalnızca kendi geçici dosyalarını temizler. Testleri çalıştırmak otomatik kurulum veya canlı sağlayıcı bağlantısı başlatmaz. Bu sonuç gerçek uygulama entegrasyonlarının çalıştığı anlamına gelmez.

Mevcut çalışma durumu ve bekleyen onaylar: [docs/progress.md](docs/progress.md).

## Katkı

Proje tasarım aşamasındadır. Uygulama sınırları, güvenli ayar birleştirme ve geri alınabilir kurulum önerileri memnuniyetle karşılanır. Issue ve örneklerde gerçek şifre, token veya özel sohbet verisi paylaşmayın.

## Lisans

Henüz lisans dosyası eklenmedi. Lisans seçilmeden yeniden dağıtım hakkı verilmiş sayılmaz.
