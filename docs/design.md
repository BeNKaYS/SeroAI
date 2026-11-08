# SeroAI tasarımı

Durum: önerilen uygulama planı. Bu aşamada hiçbir uygulama ayarı değiştirilmedi.

## Amaç

Kullanıcının seçtiği ajan becerilerinin, kuralların ve MCP entegrasyonlarının yeni bir bilgisayarda yeniden kurulabilmesini sağlamak. Ayarları tek yerden anlaşılır tutarken her uygulamaya kendi desteklediği yüzeyler üzerinden bağlanmak.

## Mimari

Küçük bir Node.js CLI ve ortak bir kütüphane kullanılır. Dış kaynak kataloğu ve uygulama yetenek tanımları bildirimsel dosyalar olarak tutulur. Sağlayıcı kimlik bilgileri ve kişisel çalışma verileri kaynak deposunun dışında kalır. Gelecekteki masaüstü arayüzü ikinci bir kurulum aracı yazmak yerine aynı çekirdeği kullanır.

Mimari tercih bir **yöneticidir**, evrensel bir MCP sunucusu değildir. MCP; yerel hook’ları tek başına kuramaz, uygulama eklentilerini etkinleştiremez veya desteklenmeyen uygulamalara beceri keşfi kazandıramaz.

## Değerlendirilen yaklaşımlar

- Büyük ve her şeyi içeren bir çatıyı çatallamak, bakım yükü ve istenmeyen bir katalog getirir. ECC kapsam dışıdır.
- Aynı dosyaları tüm uygulamalara kopyalamak, farklı yerel yetenekleri yok sayar.
- **Seçilen yön:** seçilmiş dış paketler, sabitlenmiş sürümler ve ince uygulama uyarlamaları için bağımsız bir yönetici. Uydurma uyumluluk yerine kaynağın desteklediği kurulum yolları tercih edilir.

## Temel ve sahiplik

Superpowers, Graphify, yalnızca Caveman becerileri, Ponytail, Karpathy Skills, Impeccable ve GitHub MCP hedeflenen temeli oluşturur. AgentMemory ayrıca kapısı açılacak deneysel bir adaydır. Claude-Mem yeni temelden çıkarılmıştır; ancak bu, mevcut hafıza verilerinin silinebileceği anlamına gelmez.

Dış kaynak kodunun tamamı varsayılan olarak depoya gömülmez. Depo kaynağı ve lisans bilgisi kaydedilir; incelenmiş ve sürümü sabitlenmiş çıktılar veya yerel kurulum yolları kullanılır. Tek başına bir kaynak bağlantısı, sabitlenmiş ve doğrulanmış sürüm sayılmaz. GitHub kimlik bilgileri uygulamanın kendi deposunda veya uygun yerel gizli alanda tutulur.

## İlk kilometre taşı: salt okunur temel

Paket listeleme, açık uygulama seçimi ve yapılandırılmış kurulum önizlemesi uygulanır. Bu aşama kullanıcı ev dizininde klasör oluşturmamalı, paket indirmemeli, kurulum aracı çalıştırmamalı, tarayıcı açmamalı, kimlik bilgisi istememeli veya hiçbir uygulama ayarını değiştirmemelidir. Bilinmeyen yetenek, destekleniyor değil **bilinmiyor** olarak gösterilir.

`setup`, `status`, `update`, `backup`, `restore` ve `uninstall` gibi komut fikirleri davranışları uygulanana kadar ayrılmıştır. İlk aşamada `setup` açıkça **önizleme** olarak etiketlenir, kurulum değildir. Uygulanmayan değiştirici komutlar sessizce başarılı görünmek yerine hata vermelidir.

Teknik karar: Node.js 22 veya üstü, yerel ESM, yerleşik test çalıştırıcısı ve bu aşamada çalışma zamanı bağımlılığı yok. Global geliştirme bağımlılığı gerekmez.

## Sonraki değişiklik yaşam döngüsü

Plan → açık onay → yedek → çıktıyı alma → doğrulama → hazırlık alanı → yazma → onayla yenileme → rapor; hata durumunda yalnızca bu işlemin yedeklerini geri yükleme. Güncellemeler için yerel klasör ve HTTPS GitHub kaynakları desteklenir. Sürüm, kök `version.json` dosyasındaki `surum`, `tarih` ve `not` alanlarından okunur. İkinci bir bağımsız sürüm sabiti oluşturulmaz.

SeroAI’ın sahip olduğu dosya ve kayıtlar tam olarak izlenir. İlgisiz kullanıcı kayıtları ve kullanıcı değişiklikleri korunur. Yol kaçışları, güvenli olmayan arşiv yolları, yazmayı başka yere yönlendiren son veya üst dizin sembolik bağlantıları ve sahibi belirsiz çakışmalar reddedilir. İndirilen arşivlerden gelişigüzel script çalıştırılmaz. İncelenmiş yerel bir kurulum aracı gerekiyorsa yetkisi açıklanır ve ayrıca onay istenir; SeroAI’ın izlenmeyen kurulum etkilerini tamamen geri alabileceği iddia edilmez.

Yedekler şifre içerebilir ve Git dışında, yalnızca sahibinin erişebildiği alanda tutulmalıdır. Canlı bir SQLite dosyasını kopyalamak tutarlı yedek sayılmaz. Geri yükleme/güncelleme listeleri sohbetleri, token’ları, işlemle ilgisiz ayarları, yerel modelleri ve hafıza veritabanlarını açıkça dışarıda bırakır.

Ücretli hizmetler, bulut senkronizasyonu, model proxy’leri ve telemetri sessizce açılmaz. Impeccable canlı modunun izinleri atlayan yedek yolu, canlı mod sunulmadan önce kapatılmalıdır. Çatı talimatları kullanıcının onay tercihlerini geçersiz kılmaz.

## Uygulama sınırları

OpenChamber, OpenCode entegrasyonu üzerinden değerlendirilir; Cursor, Antigravity sürümleri, Claude Desktop/Code, Codex masaüstü/CLI, Gemini masaüstü/CLI, DSH profilleri ve Jan ayrı ele alınır. Beceri keşfi, MCP taşıma biçimi, yaşam döngüsü hook’ları ve kural yükleme ayrı ayrı izlenir.

Başlangıç kataloğu istenen kaynakların envanteridir; kurulum uyumluluk matrisi değildir. Uygulama uyarlamasının yeteneği, kaynağın talimatları ve kurulu sürümler incelenene kadar doğrulanmamış kalır. “Ayar dosyası var” gözlemi, başarılı kimlik doğrulama veya çalışan entegrasyon olarak sunulamaz.

## Herkese açık / özel ayrımı

Herkese açık proje; uygulama kodu, genel şablonlar, kaynak bilgileri, geçici dizinlerle çalışan testler ve belgeler içerir. Kişisel envanter raporları ve makineye özel tasarım notları bu deponun dışında kalır. Gerçek ev dizini yolları, token’lar, cihaz eşleştirme kimlikleri, kimlik veritabanları ve sohbet dışa aktarımları yayımlanmaz.

Herkese açık kaynak deposu, kişisel tercihler için yedek hedefi değildir. Kullanıcı, kişisel profillerin ve korumalı yedeklerin nerede tutulacağını ayrıca seçer.

## Doğrulama politikası

Test, lint, build, duman testi, tarayıcı kontrolü veya canlı sağlayıcı çağrısından önce mevcut kullanıcıdan izin istenir. Test dosyası yazmak, onları çalıştırma yetkisi vermez. Bu ilk hazırlık sırasında otomatik CI akışı eklenmez. Yerel hazırlık dosyaları yayımlanmadan önce açık commit/push onayı istenir.

## İlk aşamanın kapsam dışıları

- Üretime hazır kurulum, yedekleme, geri yükleme veya güncelleme.
- Yerel arayüz, MCP yönetim uç noktası veya hesap hizmeti.
- Observer, hafıza veritabanı taşıma veya otomatik bilgi kaydı.
- Uygulamalar arasında tam özellik eşitliği veya evrensel global kural yüklemesi.
- Geliştirme sırasında kullanıcının mevcut ajan kurulumunu değiştirmek.

## Kabul ölçütleri

İlk aşama; dürüst belgeler, kaynağı açık ve uydurma sürüm sabitlemesi olmayan yedi kaynaklı bir katalog, desteği açıkça doğrulanmamış uygulama bilgileri, belirlenimci ve salt okunur bir kurulum önizlemesi ve hatalı girdi ile global yan etki olmadığını kanıtlayan testler içerir. Ayrıca onaylanmış doğrulama ve yayın tamamlanana kadar kurulabilir sürüm olarak tanıtılmaz.
