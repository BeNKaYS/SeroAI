# İstemci destek sınırları — aşama 3–4

Bu liste **SeroAI’ın uyguladığı uyarlamaları** gösterir; uygulamaların kendi yeteneklerini reddetmez. “Manuel” bir istemcinin beceri veya MCP desteklemediği anlamına gelmez; SeroAI’ın o istemcinin ayarına henüz yazmadığı anlamına gelir.

| Hedef | SeroAI durumu | Doğrulama / sınır |
| --- | --- | --- |
| OpenCode V2 | Proje config önizleme, onaylı birleştirme, özel yedek, geri alma | Gerçek `.git` dizinli projeler; JSON/JSONC; geçici projelerde testli; kurulu uygulamayla canlı doğrulama yok |
| OpenChamber | OpenCode V2 sunucu ayarı üzerinden aynı proje uyarlaması | OpenChamber’a özel ayrı ayar, oturum veya kimlik deposu değiştirilmez; çalışan sunucu sürümü tespit edilmez |
| Cursor | Manuel inceleme gerekli | Otomatik config yazımı yok |
| Antigravity | Manuel inceleme gerekli | Otomatik config yazımı yok |
| Antigravity IDE | Manuel inceleme gerekli | Diğer Antigravity hedefiyle eşit sayılmaz |
| Claude Code | Manuel inceleme gerekli | Claude Desktop’ın ayar yolu kullanılmaz |
| Claude Desktop | Manuel inceleme gerekli | Claude Code hook/skill desteği varsayılmaz |
| Codex CLI | Manuel inceleme gerekli | Masaüstüyle eşit sayılmaz |
| Codex masaüstü | Manuel inceleme gerekli | CLI ayarı kopyalanmaz |
| Gemini CLI | Manuel inceleme gerekli | Masaüstüyle eşit sayılmaz |
| Gemini masaüstü | Manuel inceleme gerekli | Uygulamanın veritabanı/kimlik deposuna dokunulmaz |
| DeepSeek Harness | Manuel inceleme gerekli | Profil/sürüm uyumu varsayılmaz |
| Jan | Manuel inceleme gerekli | API anahtarları, yerel modeller ve sohbetler korunur |

## OpenCode proje uyarlamasının desteklediği işler

- Açıkça seçilen yerel beceri kaynaklarının dosya bütünlüğünü doğrulamak; `skills` dizisine tekrar etmeden eklemek.
- Seçilen yerel `.md` kural dosyalarını `instructions` dizisine eklemek; mevcut AGENTS.md dosyalarını değiştirmemek.
- İsteğe bağlı `mcp.servers.seroai-github` kaydını, resmî salt okunur URL ve `disabled: true` ile eklemek.
- JSONC yorumlarını ve ilgisiz ayarları korumak; var olan farklı bir MCP kaydını veya türü üzerine yazmadan reddetmek.
- Projenin eski config baytlarını/izinlerini `.git/seroai/opencode/` altında özel yedeklemek; sadece aynı hedef hâlâ işlem sonrası durumdaysa geri almak.

## Program güncellemesi ve profil (aşama 4)

- Güncelleme yalnızca SeroAI’ın kendi program dosyalarını yazar; üçüncü taraf beceri paketlerini kurmaz, güncellemez veya installer çalıştırmaz.
- Kaynak yerel klasör, GitHub release veya commit SHA’sına sabitlenen daldır. Yalnızca HTTPS ve izinli GitHub alan adları; token ve özel repo desteklenmez.
- Önizleme metadatadan ibarettir; payload onay ve yedekten sonra alınır. Manifest dışındaki hiçbir yol yazılmaz; `.git`, `.env`, istemci ayarları, token, profil, veritabanı, sohbet, hafıza ve yerel model kapsam dışıdır.
- SHA-256 bütünlük sağlar; imzalı yayın veya yayıncı kimliği garantisi değildir. Public release yayımlanmadı; canlı GitHub akışı doğrulanmadı.
- Profil yalnızca mantıksal istemci/paket seçimi ve kaynak anahtarları taşır; mutlak yol, token veya ham config içermez. Geri yükleme yalnızca OpenCode V2 proje uyarlamasını kullanır; diğer istemciler ertelenmiş sayılır ve manuel kalır.
- Yeni bağımlılık otomatik kurulmaz; güncelleme sonrası CLI elle yeniden başlatılır. Servis, oturum veya model zorla yeniden yüklenmez.

## Otomatik yapılmayanlar

Global ayar yazımı; Git dışı projeler ve `.git` dosyalı worktree’ler; V1→V2 göçü; üst dizin/sistem/MDM ayarlarını değiştirme; hesap girişi; GitHub MCP’yi etkinleştirme; upstream paket indirme veya installer çalıştırma; ücretli hizmet/model/proxy/izin/hook değişikliği; sohbet/hafıza/model taşıma. Yerel kaynak hash’i, upstream sürüm/lisans veya becerinin davranış kalitesi incelemesi değildir.

Katalogdaki `unverified` değerleri canlı kurulum doğrulanmadığı için korunur. Bu aşamanın tamamlanması “tüm istemciler otomatik kuruluyor” anlamına gelmez; ilk incelenmiş uyarlamanın kademeli teslimidir.

## Panel (aşama 5)

`seroai ui` yerel web paneli aynı sınırları taşır: yalnızca mevcut OpenCode V2 proje uyarlamasını, güncelleme akışını ve profili kullanır. Diğer istemciler panelde de manueldir. Panel 127.0.0.1'e bağlanır, dış ağa istek atmaz; oturum belirteci olmadan yazma ucu yoktur. Görsel/etkileşim doğrulaması tek bir macOS tarayıcı oturumunda yapıldı.

## Otomatik beceri kurulumu (aşama 6)

Kurulum yalnızca OpenCode keşif klasörlerini hedefler: proje `.opencode/skills/` ve açık `--global` ile `~/.config/opencode/skills/`. Diğer istemciler ve global ayar dosyaları değiştirilmez. Lisansı belirtilmemiş, upstream CLI olan veya ayar kaydı gerektiren paketler otomatik kurulmaz. MCP, hook ve plugin bu komutun kapsamı dışındadır.
