# SeroAI — ürün bağlamı

Durum: kullanıcının açık brief'inden türetildi. Varsayımlar aşağıda ayrıca işaretlidir; doğrulanmadan ürün gerçeği sayılmaz.

## Ürün

SeroAI, bir geliştiricinin seçtiği ajan becerilerini, kurallarını ve MCP bağlantılarını tek yerden görmesini, değişiklikleri önce incelemesini, onaylamasını, yedekle uygulamasını ve geri almasını sağlayan yerel öncelikli bir yöneticidir. Evrensel bir MCP sunucusu veya her şeyi içeren bir çatı değildir.

## Kullanıcı ve sahne

Teknik bir geliştirici, kendi macOS makinesinde, birden çok istemcinin (OpenCode/OpenChamber, Cursor, Antigravity, Claude, Codex, Gemini, DeepSeek Harness, Jan) ayarlarını dağınık tutmamak için kullanır. Sahne: bir proje klasörü açık, terminalde çalışan bir CLI ve yanında tarayıcıda yerel bir panel. İş genellikle kısa ve seyrektir: yeni bir projeye seçim uygulamak, bir güncellemeyi kontrol etmek, yanlış giden bir ayarı geri almak.

## İş

- Neyin seçili, neyin uygulanmış ve neyin doğrulanmamış olduğunu tek bakışta görmek.
- Bir değişikliği önizlemek; hangi dosyanın, hangi kaynağın, hangi hash'in etkileneceğini okumak.
- Aynı önizleme kimliğiyle onaylayıp uygulamak; önce yedeğin alındığını bilmek.
- Son işlemi veya yarım kalmış yazımı geri almak; kullanıcı düzenlemesinin ezilmediğini görmek.
- Sürüm profilini sır içermeden dışa aktarıp yeni bir makinede eşlemelerle geri yüklemek.

## Kanıt ve kısıtlar

- Her mutasyon önizleme → açık onay → yedek → yazım → geri alma sırasını izler. `--yes` yoktur; arayüz de onay kimliği olmadan yazmaz.
- Kullanıcı ayarları, token'lar, sohbetler, hafıza, veritabanları ve yerel modeller arayüzün kapsamı dışındadır; ham config içeriği gösterilmez.
- Kaynak kataloğu, sürüm ve lisans incelemesi "doğrulanmadı" olarak dürüstçe gösterilir; arayüz desteklenmeyen bir istemciyi uygulanmış gibi göstermez.
- Arayüz dış ağa istek atmaz; GitHub güncelleme kontrolü yalnızca kullanıcı açıkça tetiklerse ve mevcut çekirdek üzerinden yapılır.
- Türkçe arayüz, İngilizce kod ve komut. Geliştirici bilgisi sade bir "Hakkında" satırıdır.

## Mod

Operate. Ziyaretçi işini bitirmeye gelir; dünya yalnızca tipografi, palet, yoğunluk ve tek bir imza hareketiyle katılır. Navigasyon ve kontroller tanıdık web bileşenleridir.

## Değişmezler

1. Sessiz yazma yok; onay kimliği olmadan hiçbir hedef değişmez.
2. Yedek ve işlem kaydı kullanıcıya görünür; gizlenmez.
3. Sır, token, sohbet ve ham ayar içeriği panelde gösterilmez veya günlüğe yazılmaz.
4. Varsayılan olarak yalnızca `127.0.0.1`; dış arayüz, telemetri ve üçüncü taraf betik yok.
5. Doğrulanmamış yetenek "doğrulanmadı" olarak kalır.

## Varsayımlar (doğrulanmadı)

- Tek kullanıcı, tek makine, aynı anda tek panel oturumu.
- Güncel bir Safari veya Chrome kullanılır; JavaScript açıktır.
- Masaüstü pencere hissi bu sürümde gerekli değil; tarayıcı sekmesi kabul edilebilir. Paketleme ve imzalama sonraki aşamadır.
- Kullanıcı terminalden `seroai ui` komutunu çalıştırmayı kabul eder; otomatik başlatma veya sistem tepsisinde kalma yoktur.
