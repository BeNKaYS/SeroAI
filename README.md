# SeroAI

Ajan becerilerini, ortak kuralları ve MCP bağlantılarını tek merkezden yönetmeyi amaçlayan, yerel öncelikli ve onay odaklı bir araç.

> **Durum: `0.1.0-dev.4`, geliştirme sürümü.** Yerel web paneli eklendi: katalog, proje, güncelleme ve profil akışları; her yazma önizleme kimliği ister, değişiklik defteri gösterilir ve panel yalnızca `127.0.0.1` üzerinde çalışır. **286 test geçti.** Canlı istemci bağlantıları doğrulanmadı; npm paketi veya release yayımlanmadı. [Aşama 5 raporu](docs/reports/stage-five.md).

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
4. **Güncelleme ve geri yükleme:** yerel klasör ve GitHub kaynakları, sürüm sabitleme, indirme doğrulama, onay ve profil geri yükleme. Güncelleme çekirdeği ve profil aşaması tamamlandı; release yayımı ve canlı GitHub doğrulaması bekliyor.
5. **Arayüz:** yerel web paneli (`seroai ui`) tamamlandı; masaüstü paketleme ve imzalama sonraki adımdır.

Tasarım: [docs/design.md](docs/design.md) · İlk plan: [docs/superpowers/plans/2026-11-08-read-only-foundation.md](docs/superpowers/plans/2026-11-08-read-only-foundation.md)

## Kaynak kopyadan kullanım

Node.js 22 veya üstü gerekir. Global kurulum gerekmez. JSONC yorumlarını korumak için sürümü sabitlenmiş tek çalışma bağımlılığı `jsonc-parser` kullanılır ([lisans ve gerekçe](docs/third-party.md)). Kaynak kopyada önce:

```bash
npm ci --ignore-scripts
```

Ardından depo kökünden:

```bash
node src/cli/main.mjs help
node src/cli/main.mjs version
node src/cli/main.mjs catalog
node src/cli/main.mjs setup --client opencode --package superpowers
node src/cli/main.mjs setup --client claude-code --client cursor --package impeccable --json
```

### OpenCode V2 ayar parçası önizlemesi

İncelediğin yerel beceri klasörünü ve ek kural dosyasını açıkça seçerek:

```bash
node src/cli/main.mjs opencode-preview --skill-dir /absolute/path/to/reviewed-skills --instruction /absolute/path/to/rules.md --github --json
```

En az bir `--skill-dir`, `--instruction` veya `--github` seçilir; yol bayrakları tekrarlanabilir. Örnekteki yolları kendi kaynaklarınla değiştir. Bu komut yolları okumaz; dosyaların varlığı ve güvenliği henüz kontrol edilmez.

Çıktı yalnızca proje `opencode.jsonc` dosyası için **ayar parçasıdır**; mevcut ayar dosyasının tamamının yerine koyma. V2 `skills`, `instructions` ve `mcp.servers` alanları kullanılır. GitHub önerisi `seroai-github` adıyla, resmî salt okunur uç noktada ve **`disabled: true`** olarak gelir; bağlantı veya kimlik doğrulama başlatılmaz. `--github` seçilmezse MCP kaydı üretilmez.

Bu adım paket indirmez, sürüm/lisans incelemesi yapmaz, ayar yazmaz ve entegrasyona “çalışıyor” demez: `readyToApply: false`, `runtimeStatus: unverified`. OpenCode V2 belge incelemesi ile bu bilgisayarda doğrulanmış kurulum ayrı tutulur. Ayrıntılar ve resmî kaynaklar: [OpenCode V2 uyarlaması](docs/adapters/opencode-v2.md).

### OpenCode V2 proje ayarını güvenli uygulama

Bu ilk otomatik uyarlama, gerçek `.git` dizini olan bir proje için geçerlidir. Global ayarlar, Git dışı klasörler, `.git` dosyalı worktree’ler ve diğer istemciler otomatik değiştirilmez. [Destek sınırlarına bakın](docs/support-matrix.md).

Önce, üzerinde işlem yapmayı seçtiğin projenin ve önceden incelediğin yerel kaynakların mutlak yollarını ver:

```bash
node src/cli/main.mjs opencode-project --project /absolute/path/to/project --skill-dir /absolute/path/to/skills --instruction /absolute/path/to/rules.md --github --json
```

Bu komut proje config dosyasını ve seçilen kaynakları **okur**, fakat yazmaz. Tam config veya token’lar çıktıya konmaz. Değişiklik özeti ve kaynak hash’leri incelendikten sonra, çıktının `id` değerini aşağıdaki `PREVIEW_ID` yerine elle koy:

```bash
node src/cli/main.mjs opencode-project --project /absolute/path/to/project --skill-dir /absolute/path/to/skills --instruction /absolute/path/to/rules.md --github --approve PREVIEW_ID
```

**İkinci komut ayara yazar.** Var olan `opencode.json` veya `opencode.jsonc` kullanılır; ikisi birden varsa veya `.opencode` altında yüksek öncelikli config varsa çakışma nedeniyle işlem durur. JSONC yorumları, mevcut model/sağlayıcı/izin/kimlik alanları korunur; sadece seçilen yeni kayıtlar eklenir. GitHub bağlantısı kapalı kalır. Kaynaklar veya config değişmişse önizleme kimliği eskir.

Yedekler, sahiplik kaydı ve işlem kilitleri `.git/seroai/opencode/` içinde 0700/0600 izinleriyle saklanır; Git çalışma ağacının parçası değildir. Yedek sır içerebilir, dışarı paylaşma. Uygulama hata verirse işlem öncesi dosya güvenli biçimde geri getirilmeye çalışılır; kullanıcı değişikliği veya ikinci hata varsa yedek korunup işlem durur.

### Proje ayarını geri alma

```bash
node src/cli/main.mjs opencode-rollback --project /absolute/path/to/project --json
```

Önizlemeyi inceleyip kendi `id` değerini kullanarak:

```bash
node src/cli/main.mjs opencode-rollback --project /absolute/path/to/project --approve PREVIEW_ID
```

Geri alma, son işlemin config dosyasını önceki baytlarına ve izinlerine döndürür; yeni oluşturulmuş config dosyasını silebilir. **Sonradan kullanıcı düzenlemesi varsa geri alma reddedilir**, ilgisiz değişiklikler ezilmez. İşlem sırasında kapanmış bir sürecin pending kaydı da bu komutla ele alınabilir; canlı süreç veya mevcut kurtarma kilidi otomatik geçilmez. Yedekler silinmez. Bu proje akışı, aşağıdaki deneysel özel klasör `recover` komutundan ayrıdır.

### SeroAI programını güncelleme

Bu akış yalnızca SeroAI’ın kendi program dosyalarını günceller; üçüncü taraf beceri paketlerini kurmaz veya güncellemez. Gerçek `.git` dizini olan bir SeroAI kurulumu gerekir. Önce salt okunur önizleme al:

```bash
# Yerel bir çalışma kopyasından
node src/cli/main.mjs update --root /absolute/path/to/seroai --local /absolute/path/to/newer-copy --json

# GitHub release'inden
node src/cli/main.mjs update --root /absolute/path/to/seroai --repo BeNKaYS/SeroAI --json

# Belirli bir daldan (önce commit SHA'sına sabitlenir)
node src/cli/main.mjs update --root /absolute/path/to/seroai --repo BeNKaYS/SeroAI --ref main --json
```

Kaynakta `version.json` ve `update-manifest.json` bulunmalıdır; release modunda ayrıca `seroai-update.json` paketi gerekir. Önizleme yalnızca mevcut durumu ve manifest metadatasını okur; içerik indirilmez. Çıktıdaki `id` değerini `PREVIEW_ID` yerine koyarak onayla:

```bash
node src/cli/main.mjs update --root /absolute/path/to/seroai --local /absolute/path/to/newer-copy --approve PREVIEW_ID
```

**Bu komut önce yedek alır, sonra yalnızca manifestte listelenen dosyaları doğrulayıp yazar.** `.git`, `.env`, istemci ayarları, token’lar, profiller, veritabanları ve yerel modeller kapsam dışıdır. Aynı veya eski sürüm yazılmaz; onaydan sonra kaynak değişirse işlem eskir. İndirilen kod veya npm script’i çalıştırılmaz; yeni bağımlılıklar otomatik kurulmaz. Gerekirse ayrıca `npm ci --ignore-scripts` çalıştır ve CLI’yi elle yeniden başlat.

Son güncellemeyi geri alma önizlemesi ve uygulaması:

```bash
node src/cli/main.mjs update-rollback --root /absolute/path/to/seroai --json
node src/cli/main.mjs update-rollback --root /absolute/path/to/seroai --approve PREVIEW_ID
```

Geri alma, sonradan kullanıcı tarafından düzenlenmiş bir dosyayı ezmez. Yedekler ve durum kaydı `.git/seroai/updates/` içinde 0700/0600 izinleriyle tutulur; paylaşma. İndirilen paket içindeki kod veya npm script’i çalıştırılmaz. Canlı GitHub release akışı bu sürümde yalnızca sahte taşıyıcıyla test edildi; public release yayımlanana kadar yerel klasör kaynağını kullan.

### Profil dışa aktarma ve geri yükleme

Seçimin; mutlak yol, token, ham config, sohbet veya hafıza verisi içermeyen bir JSON olarak dışa aktarılır:

```bash
node src/cli/main.mjs profile-export --client opencode --client cursor --package superpowers --package github-mcp --source superpowers:skill --source rules:instruction --github --name "Ev ofis" > seroai-profile.json
```

`--source` yalnızca mantıksal anahtar ve tür (`skill` veya `instruction`) kaydeder; gerçek yol dosyaya girmez. Komut stdout’a yazar, başka dosya oluşturmaz. Dosya adını ve konumunu kendin seç.

Yeni makinede veya projede kaynakları açıkça eşleyerek geri yükle:

```bash
node src/cli/main.mjs profile-restore --profile /absolute/path/seroai-profile.json --project /absolute/path/to/project --map superpowers=/absolute/path/to/skills --map rules=/absolute/path/to/rules.md --json
```

Her profil kaynağı için bir eşleme gerekir; eksik, fazla veya göreli yol kabul edilmez. Önizlemedeki `id` ile `--approve PREVIEW_ID` verilmeden yazılmaz. Uygulama mevcut OpenCode proje akışını kullanır: yedek `.git/seroai/opencode/` altında tutulur, yorumlar korunur, GitHub MCP kapalı kalır. OpenCode dışındaki istemciler “ertelendi” olarak raporlanır; uygulanmış sayılmaz. Kaynaklar otomatik indirilmez.

### Yerel panel (`ui`)

Aynı çekirdeği tarayıcıda kullanmak için:

```bash
node src/cli/main.mjs ui
```

Komut rastgele bir boş bağlantı noktasında yalnızca `127.0.0.1`'e bağlanır, adresi yazar ve tarayıcıyı açar. Adres bir oturum belirteci (`?token=...`) taşır; **paylaşmayın**. `--no-open` tarayıcıyı açmaz, `--port <0-65535>` sabit bağlantı noktası seçer, `--root <mutlak-yol>` panelin katalog kökünü belirler (varsayılan: SeroAI deposu). Durdurmak için `Ctrl+C`.

Panel altı bölüm sunar: Genel bakış, Kaynaklar, Proje, Güncelleme, Profil, Hakkında. Her yazma önce “değişiklik defteri” gösterir; onay düğmesi aynı önizleme kimliğini kullanır. Panelde `--yes` yoktur; kimlik eskirse işlem `STALE_PLAN` ile durur.

Güvenlik sınırı: panel dış ağa istek atmaz, ağ fontu veya üçüncü taraf betik yüklemez, ham config/token/sohbet göstermez. API çağrıları belirteç, aynı köken (`Origin`) ve `application/json` gövde ister; gövde 256 KiB ile sınırlıdır. Statik dosyalar beyaz listededir. Bu, aynı kullanıcı altındaki kötü niyetli süreçlere karşı tam koruma iddiası değildir; belirteç adres çubuğundadır. [Aşama 5 raporu](docs/reports/stage-five.md).

SeroAI çekirdeğinin daha önce oluşturduğu özel bir klasörü, ayrı bir süreçte salt okunur incelemek için:

```bash
node src/cli/main.mjs inspect --workspace /absolute/path/to/seroai-workspace --json
```

Bu örnekteki yolu kendi yönetilen klasörünün **mutlak yoluyla** değiştir. `inspect`, sahiplik kaydındaki dosyaları `unchanged`, `modified`, `missing` veya `unsafe` olarak raporlar; içeriklerini göstermez ve hiçbir dosyayı düzeltmez. Sahipsiz dosyaları taramaz. Kayıt eksikse kurulumun temiz olduğunu varsaymaz. Yarıda kalan işlemleri ve yedek tutarlılığını doğrulamaz; otomatik kurtarma yapmaz.

### Yarım kalan özel klasör işlemini kurtarma

Önce yalnızca önizlemeyi al:

```bash
node src/cli/main.mjs recover --workspace /absolute/path/to/seroai-workspace --json
```

`items` içindeki `delete` dosyanın silineceğini, `restore` önceki içeriğin geri yükleneceğini, `leave` zaten önceki durumda olduğunu belirtir. **İçeriği inceleyip etkileri onaylamadan sonraki komutu çalıştırma.** Komutlar yalnızca SeroAI çekirdeğinin oluşturduğu özel çalışma klasörünün pending günlüğünü kullanır; rastgele bir uygulama ayarını geri yükleme aracı değildir.

Önizlemedeki `id` değerini elle kopyalayıp aşağıdaki `PREVIEW_ID` yerine koy. **Bu komut dosyalara yazar ve işlem tarafından oluşturulmuş dosyaları silebilir:**

```bash
node src/cli/main.mjs recover --workspace /absolute/path/to/seroai-workspace --approve PREVIEW_ID
```

Onay kimliği güncel dosya durumuyla eşleşmelidir; eski veya yanlış kimlikle işlem yapılmaz. `--yes` desteklenmez. Bekleyen günlük yoksa varsayılan komut yalnızca bunu bildirir; eski bir onayla tekrar kurtarma denenirse hata verir. Yedekler ve işlem dışındaki dosyalar korunur. Genel `restore` komutu hâlâ uygulanmamıştır.

`setup` **kurulum yapmaz**: yalnızca seçilen paket/uygulama çiftlerini listeler. Ayar dosyaları ve kimlik bilgileri okunmaz; hiçbir şey indirilmez veya yazılmaz. Uygulama yetenekleri doğrulanmamış, kaynak sürümleri ve lisanslar incelenmemiştir. Bu çıktı uyumluluk kanıtı değildir.

- Her seçim için `--client` veya `--package` bayrağını tekrar kullanın; kimlikleri `catalog` komutundan öğrenin.
- Varsayılan çıktı Türkçedir. `--lang en` İngilizce mesajları seçer; katalogdaki kaynak açıklamaları Türkçe kalır.
- `catalog`, `setup`, `inspect`, `recover`, OpenCode uyarlama, güncelleme, profil ve `ui` komutları için `--json` kullanılabilir. JSON alan adları ve durum kodları dilden bağımsızdır; uyarı ve hata metinleri seçilen dildedir.
- Bilinmeyen kimlikler/bayraklar hata verir. `status`, `backup`, `restore` ve `uninstall` uygulanmamıştır; başarı döndürmez.
- CLI sürümü yalnızca kök `version.json` dosyasından okunur. `package.json`, yanlışlıkla npm’e yayımlanmayı önlemek için `private: true` içerir.

### Geliştirme testleri

Son tam takım sonucu: **286 geçti, 0 başarısız, 0 atlanan** (`node --test`, yaklaşık 5,4 saniye). CLI testleri geçici HOME ve çalışma dizinleri kullanır; testler tamamlandığında yalnızca kendi geçici dosyalarını temizler. Kurtarma ve güncelleme testleri, oluşturdukları alt süreçleri kontrollü biçimde kapatıp yeni süreç mantığıyla diskten geri almayı sınar. Güncelleme kaynak testleri sahte taşıyıcı kullanır; gerçek GitHub/release çağrısı yapmaz. Panel testleri belirteç, köken, gövde sınırı, statik beyaz liste ve onay kimliğini sınar; görsel/etkileşim kontrolü macOS tarayıcı panelinde masaüstü ve mobil genişlikte, açık/koyu modda yapıldı. Testleri çalıştırmak gerçek ajan kurulumu veya canlı sağlayıcı bağlantısı başlatmaz.

Mevcut çalışma durumu ve bekleyen onaylar: [docs/progress.md](docs/progress.md).

## Deneysel güvenlik çekirdeği

`src/core/workspace.mjs`, yalnızca açıkça seçilen bir üst dizin altında **yeni oluşturduğu özel klasörde** çalışacak deneysel bir kütüphanedir. Yeni klasör oluşturma ve normal apply akışı CLI’de açık değildir; `setup` hâlâ sadece önizleme yapar. Ayrı `recover` komutu mevcut özel klasörün pending günlüğünü açık onayla geri alabilir.

- Klasör oluşturma, planı uygulama ve geri alma ayrı onaylar gerektirir.
- Yalnızca kendi yazdığı tek seviyeli `.md`, `.txt`, `.json` dosyalarını yönetir; sahipsiz dosyaları ezmez.
- Önizleme ve uygulama arasında değişen dosyaları reddeder. Sonradan kullanıcı tarafından düzenlenen dosyaları geri alma sırasında da korur.
- Hedef yazımından önce özel yedek alır. İşlem sırasında yazma hatası olursa kendi yazdığı, değişmemiş hedefleri geri almaya çalışır; geri alma da hata verirse `RECOVERY_REQUIRED` ile durur.
- Sembolik bağlantıları, hardlink’leri ve yol kaçışlarını reddeder. Klasörler 0700, dosyalar 0600 izinleriyle oluşturulur.

**Sınır:** Bu deneysel özel klasör API’sindeki normal plan/makbuz nesneleri aynı süreç içinde kullanılır; tüm çalışma klasörünü yeniden açıp yeni işlemlere devam etme henüz yoktur. Ayrı süreç sonrası kurtarma API’si aşağıda belirtilmiştir. Gerçek OpenCode proje ayarı için yukarıdaki ayrı proje komutları kullanılır. Çok dosyalı işlem bütünüyle atomik değildir. Güç kesintisi dayanıklılığı veya kötü niyetli aynı kullanıcıya karşı eşzamanlı dizin değiştirme koruması iddia edilmez. Yedekler hassas içerik taşıyabilir ve Git’e eklenmemelidir.

İlk güvenlik çekirdeği 85, inceleme komutu eklendikten sonraki kesit 110 testle doğrulandı. Bunlar global kurulum desteği anlamına gelmez. Tasarım: [yönetilen çalışma klasörü](docs/superpowers/specs/2026-11-08-managed-workspace-design.md).

### Süreç sonrası kurtarma API’si (deneysel)

`src/core/recovery.mjs`, kalıcı `pending.json` günlüğünden `prepareRecovery(root)` ile salt okunur önizleme oluşturur. `recoverWorkspace(plan, { approvedPlanId: plan.id })` ayrı onayla yalnızca o işlemdeki dosyaları işlem öncesine döndürür. Bu fonksiyonları `recover` komutu kullanır; onaysız otomatik geri alma yapılmaz.

- Günlük, yedek ve mevcut hedefler doğrulanmadan yazma yapılmaz.
- Kullanıcı düzenlemesi, canlı yazıcı süreç, bozuk yedek veya eski plan kurtarmayı engeller.
- Yedekler ve ilgisiz dosyalar korunur. İşlemin kendi oluşturduğu dosya geri alınırken kaldırılabilir.
- Kurtarma kilidi mevcutsa otomatik kırılmaz; çökmüş kurtarma sürecinin bıraktığı kilit elle incelenmelidir.
- Yeni planlar en çok 100 dosya, hedef başına 1 MiB ve toplam yeni/eski içerik ayrı ayrı 8 MiB ile sınırlıdır. Kalıcı yedek üst sınırı 16 MiB’dir.

Kurtarma testleri kullanıcı onayıyla çalıştırıldı ve tam takım geçti. Bu, CLI üzerinden gerçek ajan kurulumu veya güç kesintisi garantisi değildir. [Kurtarma tasarımı](docs/superpowers/specs/2026-11-08-process-recovery-design.md).

## Katkı

Proje tasarım aşamasındadır. Uygulama sınırları, güvenli ayar birleştirme ve geri alınabilir kurulum önerileri memnuniyetle karşılanır. Issue ve örneklerde gerçek şifre, token veya özel sohbet verisi paylaşmayın.

## Lisans

Henüz lisans dosyası eklenmedi. Lisans seçilmeden yeniden dağıtım hakkı verilmiş sayılmaz.
