# Salt okunur temel — uygulama kaydı

Plan: `docs/superpowers/plans/2026-11-08-read-only-foundation.md`.

## Durum

- Görev 1: katalog, sürüm ve doğrulayıcı yazıldı; ilgili testler tam takım içinde geçti.
- Görev 2: saf planlayıcı ve test dosyası yazıldı; ilgili testler tam takım içinde geçti.
- Görev 3: CLI, Türkçe/İngilizce mesajlar, README örnekleri ve CLI testleri yazıldı; ilgili testler tam takım içinde geçti.
- Görev 4: testler geçti; kullanıcı, listelenen 16 dosyanın `main` dalında commit edilip public repoya gönderilmesini açıkça onayladı. Yayın işleminin sonucu Git geçmişinden izlenir.

## Gerçek doğrulama sonucu

Kullanıcının açık onayından sonra depo kökünde `node --test` çalıştırıldı. Çıkış kodu **0**; **59 test geçti, 0 başarısız, 0 atlanan**, süre yaklaşık **3,1 saniye**. Katalog, planlayıcı ve CLI testlerinin tamamı bu çalıştırmaya dahildir; dosya bazlı komutlar ayrıca çalıştırılmadı. Gerçek HOME üzerinde duman testi, canlı entegrasyon, build, lint veya tarayıcı kontrolü yapılmadı.

## Arayüz uyumu

- Görev 1 → 2: `packages` ve `clients` dizilerindeki `id` alanları seçim doğrulamasını besler.
- Görev 1 → 3: CLI, proje kökünü kendi dosya konumundan bulur; geçerli çalışma dizinine veya kullanıcı HOME dizinine dayanmaz.
- Görev 2 → 3: `mode: preview`, `changesApplied: false`, `review-required` alanları JSON’da korunur; uyarılar çıktı diline çevrilir.

## Kararlar ve sınırlar

- Kullanıcı mevcut klasörde devam edilmesini onayladı; mevcut doküman değişiklikleri korundu, başka çalışma ağacına taşınmadı. İlk aşama daha sonra ayrıca onaylanarak yayımlandı.
- Başlangıçta kullanıcının onay kuralı nedeniyle otomatik test ve commit adımları uygulanmadı. Önce testler yazıldı, ancak başarısız/başarılı test döngüsü çalıştırılmadı. Daha sonra onayla tam takım çalıştırıldı ve yukarıdaki sonuç alındı; bu, geriye dönük bir başarısız/başarılı test döngüsü kanıtı değildir.
- Uygulama sürümlerini karıştırmamak için katalogda 12 hedef var; OpenChamber, OpenCode üzerinden ortak kayıtta. Claude, Codex ve Gemini masaüstü/CLI hedefleri ayrı. Önceki durum raporundaki “9 istemci” sayısı bağlayıcı bir kapsam değildi.
- Her hedefte beceri, MCP, hook ve kural yükleme yetenekleri ayrı ayrı `unverified`. Kaynak sürümleri ve lisanslar `null`; uydurma inceleme/sabitleme kabul edilmez.
- Güncelleme zorunluluğu tasarımda korunuyor; bu ilk salt okunur aşamada güvenli yedekleme/geri alma altyapısı olmadığı için güncelleme uygulanmıyor ve komut hata veriyor.
- `.trail/` kurulmadı; kullanıcı ayarları, özel raporlar ve mevcut hafıza sistemleri değiştirilmedi.

## Sıradaki adım

İlk aşamanın onaylanan 16 dosyası GitHub MCP ile `8082ef2` commit’inde yayımlandı. Yerel commit `bd4cd3f`; iki geçmiş izinsiz reset/merge ile eşitlenmedi. Trail kurulumu olmadığı kullanıcıya bildirildi; sessiz kurulum yapılmadığı için `trail check` çalıştırılmadı. npm paketi, release, global kurulum veya uygulama ayarı değişikliği ayrıca onay gerektirir.

## İkinci aşama: yönetilen çalışma klasörü

Kullanıcının uygulamaya devam talebiyle güvenlik çekirdeğinin ilk kesiti yazıldı. Tasarım ve plan:

- `docs/superpowers/specs/2026-11-08-managed-workspace-design.md`
- `docs/superpowers/plans/2026-11-08-managed-workspace.md`

Yeni dosyalar: `src/core/safe-files.mjs`, `src/core/workspace.mjs`, `tests/workspace.test.mjs`. Belgeler güncellendi; CLI ve version.json değiştirilmedi.

Kapsam kararı: önce sadece yeni oluşturulan özel bir klasörde, kendi sahip olduğu tek seviyeli metin dosyaları. Gerçek ajan ayarları, paket indirme, otomatik güncelleme, yeniden başlatma sonrası kurtarma ve istemci uyarlamaları henüz açılmıyor. Böylece temel onay/yedek/geri alma kodu global kuruluma yetki vermeden ele alınabiliyor.

Testler önce yazıldı; ilk yazımda çalıştırma onayı olmadığı için başarısız/başarılı test döngüsü yapılmadı. Kullanıcının “testleri bitir yeni adıma geç” onayıyla `node --test` çalıştırıldı: **85 test geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık 3,1 saniye. Bu sonuç 59 önceki test ile 26 çalışma klasörü testini kapsar; gerçek ajan entegrasyonu veya süreç çökmesi kurtarma kanıtı değildir.

Yeni değişiklikler için commit/push onayı alınmadı. Sıradaki geliştirme: kalıcı sahiplik kaydından salt okunur çalışma klasörü incelemesi. Otomatik kurtarma ve gerçek uygulama uyarlamaları hâlâ kapsam dışı.

## Üçüncü kesit: kalıcı kayıttan salt okunur inceleme

`docs/superpowers/plans/2026-11-08-workspace-inspection.md` uygulandı. `inspectManagedWorkspace(root)` ve `inspect --workspace <mutlak-yol>` eklendi. CLI, çekirdeğin yazdığı sahiplik kaydını ayrı bir süreçten okuyabiliyor; değişmemiş/değiştirilmiş/eksik/güvensiz dosyaları içeriklerini göstermeden raporluyor. Sahipsiz dosyalar taranmıyor. Mutasyon komutları hâlâ kapalı; süreç sonrası otomatik kurtarma eklenmedi.

Kullanıcının testleri bitirme ve sonraki adıma geçme talebi kapsamında tam takım çalıştırıldı. İlk sonuç 109 geçti / 1 başarısızdı: CLI testi `/kurtarma/` ararken doğru çıktı `Kurtarma yapılmaz.` içeriyordu. Ürün davranışını değiştirmeden test beklentisi `/Kurtarma yapılmaz\./` olarak düzeltildi. Tekrar `node --test`: **110 geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık **4,0 saniye**.

Bu sonuç mevcut güvenlik çekirdeği ve yeni inceleme özelliğini kapsar; gerçek ajan ayarlarıyla canlı test yapılmadı. Yeni kod yereldedir; ikinci ve üçüncü kesit için commit/push yapılmadı. Bir sonraki güvenlik işi, yarıda kalan işlemlerin kalıcı günlükten tanınması ve ayrı onayla süreç sonrası kurtarmadır; bunlar tamamlanmadan gerçek ajan kurulumuna geçilmez.

## Dördüncü kesit: süreç sonrası kurtarma (testler geçti)

Kullanıcının sonraki adıma devam talebiyle, mevcut özel klasör sınırında kalıcı pending günlüğü ve ayrı kurtarma API’si yazıldı. Tasarım ve plan:

- `docs/superpowers/specs/2026-11-08-process-recovery-design.md`
- `docs/superpowers/plans/2026-11-08-process-recovery.md`

Yeni çekirdek modülleri: `workspace-state.mjs`, `journal.mjs`, `recovery.mjs`. Önceki `workspace.mjs` artık hedef yazmadan önce pending günlüğü oluşturur; `inspection.mjs` ortak sahiplik okuyucusunu kullanır. CLI mutasyonları açılmadı ve gerçek ajan ayarları değiştirilmedi.

`tests/recovery.test.mjs` önce yazıldı. Kullanıcı soru aracında test çalıştırmayı açıkça onayladı. `node --test` sonucu: **131 geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık 4,2 saniye. İlk hedef yazılmadan önce günlük/yedek ilişkisinin hazır olduğunu denetleyen ek testten sonra tam takım `node --test --test-reporter=dot` ile yeniden çalıştırıldı: **132 testin tamamı geçti**, çıkış kodu 0.

Yeni testlerde kontrollü alt süreç çıkışıyla ikinci hedef, sahiplik yazımının öncesi/sonrası ve rollback kesintileri oluşturuldu. Ayrı onay, güncel plan, kullanıcı düzenlemeleri, bozuk kayıtlar, symlink ve kilit durumları sınandı. Kurtarma sırasında yazma hatasından sonra yeni önizlemeyle devam edilmesi ve ilgisiz kullanıcı dosyalarının korunması da geçti. Bu test çalışmaları gerçek ajan ayarlarına dokunmadı.

Kapsam sınırı: süreç sonrası geri alma, bütün çalışma klasörünü tekrar açıp yeni kurulumlara devam etme değildir. Güç kesintisi dayanıklılığı, kötü niyetli aynı kullanıcıya karşı dosya sistemi yarışı ve çöken kurtarma sürecinin kilidini otomatik kırma iddia edilmez. Pending kaydı olmayan eski yedekler otomatik geri alınmaz. Yeni commit/push için onay alınmadı; ikinci, üçüncü ve dördüncü kesitler henüz yalnızca yereldedir.

## Beşinci kesit: açık onaylı kurtarma CLI’si

`docs/superpowers/plans/2026-11-08-recovery-cli.md` uygulandı. `recover --workspace <mutlak-yol>` varsayılan olarak salt okunur önizleme gösterir; yalnızca aynı önizlemenin güncel kimliğiyle `--approve <id>` verilirse mevcut kurtarma motorunu çalıştırır. Genel `--yes` yoktur. CLI’nin bütünüyle salt okunur olduğu yönündeki önceki ifade yardımda ve README’de düzeltildi; setup/inspect hâlâ salt okunurdur.

Yeni testler önce yazıldı. Kullanıcı soru aracında hedefli test ve tam takım çalıştırmayı açıkça onayladı. İlk `node --test tests/recovery-cli.test.mjs`: 6 başarısız, 7 geçti; altı davranış testi `recover` komutu henüz bulunmadığı için başarısız oldu. CLI bağlandıktan sonra aynı komut: **13 geçti, 0 başarısız**. Geçersiz bayrak testleri, geçerli kökle ve `INVALID_ARGUMENTS` kodunu denetleyerek güçlendirildi. Son `node --test`: **145 geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık **4,2 saniye**.

Doğrulanan davranışlar: önizlemede sıfır yazım; ayrı CLI süreçlerinde kimliğe bağlı kurtarma; yanlış veya tekrar kullanılan onayı reddetme; kullanıcı düzenlemesini koruma; işlem yokluğunu dürüstçe bildirme; Türkçe/İngilizce ve JSON çıktı; dosya silme etkisini önizlemede açıklama; `--approve` bayrağını yalnızca recover’da kabul etme. Testler sadece oluşturulan geçici klasörlerde çalıştı.

Yeni commit/push yapılmadı; gerçek ajan ayarları değiştirilmedi. Gerçek kurulum ve güncelleme hâlâ kapalıdır. Sonraki kapsam, ilk istemci uyarlaması için belgelenmiş yetenek ve kaynak sürümü incelemesidir; gerçek ayar yazımı ayrıca plan ve onay gerektirir.

## Altıncı kesit: ilk OpenCode V2 uyarlama önizlemesi

Kullanıcı, her adım sonunda ilgili otomatik testler ve tam takım için sürekli çalıştırma onayı verdi. Bu tercih kaydedildi; gerçek ayarlar, canlı servis, build/lint ve yayın için genel yetki sayılmadı.

Resmî V2 config/skills/instructions/MCP belgeleri ve GitHub uzak sunucu belgesi okundu; bulgular `docs/adapters/opencode-v2.md` içinde kaynaklarıyla kaydedildi. Uygulama planı: `docs/superpowers/plans/2026-11-08-opencode-preview.md`.

`src/adapters/opencode.mjs`, yalnızca seçilen yerel mutlak beceri klasörleri, `.md` kural dosyaları ve isteğe bağlı kapalı GitHub MCP için saf ayar parçası üretir. CLI `opencode-preview` komutu eklendi. V2 için `skills`/`instructions` dizileri, `mcp.servers` ve `disabled: true` kullanılır. Ayar dosyaları ve kimlik bilgileri okunmaz; ağ bağlantısı başlatılmaz. Genel katalogdaki tüm istemciler `unverified` kalır; dış kaynak sürümleri ve lisanslar bu adımda incelenmiş sayılmaz.

Testler önce yazıldı. `node --test --test-name-pattern="OpenCode JSON" tests/opencode-cli.test.mjs`, komut henüz bulunmadığı için beklenen biçimde başarısız oldu. Uygulama sonrası `node --test tests/opencode.test.mjs tests/opencode-cli.test.mjs`: **36 geçti, 0 başarısız**. Son `node --test`: **181 geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık **4,3 saniye**. Testler gerçek kullanıcı ayarlarında çalıştırılmadı.

Yol varlığı/symlink kontrolü, mevcut JSONC ile çakışmasız birleştirme, kaynak sürümü/lisans kilitleri ve gerçek bağlantı doğrulaması hâlâ eksiktir. Çıktı `readyToApply: false`, `runtimeStatus: unverified`; tam ayar dosyası yerine kullanılmaz. Yeni kod yereldedir; bu kesitler için commit/push onayı alınmadı.

## Aşama 3 kapanışı: ilk incelenmiş proje uyarlaması

Kullanıcı 3. aşamanın sonuna kadar ara devam onayı istenmeden ilerlenmesini, sonunda test ve rapor verilmesini istedi. `docs/superpowers/plans/2026-11-08-stage-three.md` uygulandı. Bu kapanış kademeli ilk OpenCode V2 uyarlamasıdır; tüm istemcilerin otomatik kurulduğu anlamına gelmez. Diğer istemciler `docs/support-matrix.md` içinde manuel/inceleme gerekli olarak açıkça gösterildi.

Yeni işler: JSONC korumalı ekleme; yerel kaynak dosyalarının bütünlük kontrolü; gerçek `.git` dizinli proje için onaylı ayar uygulama; özel yedek ve son işlem kaydı; normal ve kesilmiş işlem için ayrı onaylı rollback; Türkçe/İngilizce CLI. Proje yedekleri çalışma ağacında değil `.git/seroai/opencode/` içinde tutulur. `.git` dosyalı worktree ve Git dışı projeler fail-closed biçimde manuel kalır. `jsonc-parser@3.3.1` MIT bağımlılığı sabit sürüm/bütünlükle, `--ignore-scripts --no-audit --no-fund` kullanılarak eklendi. Sürüm tek kaynaktan `0.1.0-dev.2` oldu.

Ara testler: JSONC birleştirme 10/10, ardından tam takım 191/191; proje çekirdeği 16/16, ardından 207/207; CLI döngüsü 10/10, ardından 217/217. İnceleme sırasında, son işlem işaretçisi yokken yedek dizini kontrolünün atlanabildiği görüldü. Yeni test önce başarısız oldu; dizin kontrolü işaretçiden bağımsız yapıldıktan sonra geçti. Böylece son takıma bir güvenlik regresyon testi daha eklendi.

Son doğrulama: `node --test` → **218 geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık **4,5 saniye**. Gerçek kullanıcı projesinde veya ajan ayarlarında kurulum yapılmadı; canlı servis/kimlik doğrulama, lint/build/tarayıcı kontrolü yapılmadı. Commit/push yapılmadı. Kabul ve sınırlar: `docs/reports/stage-three.md`.

Sonraki ana aşama 4’tür: yerel/GitHub güncelleme kaynakları ve profil geri yükleme. Yeni istemci uyarlamaları, global ayar yazımı ve upstream paket kurucuları ayrıca incelenmeden açılmaz.

## Aşama 4: güncelleme kaynakları ve taşınabilir profil

`docs/superpowers/plans/2026-11-08-stage-four.md` uygulandı. Sürüm `0.1.0-dev.3` oldu. İki sözleşme eklendi:

- **Program güncellemesi:** yerel klasör, GitHub release ve `--ref` ile commit’e sabitlenen dal. Önizleme yalnızca sürüm/manifest metadatasını ve mevcut hedefleri okur; payload onaydan ve yedekten sonra alınır. Yedekler `.git/seroai/updates/` içinde 0600; işaretçi `pending` olmadan hedef yazılmaz; `version.json` en son yazılır. Ayrı `update-rollback` kullanıcı düzenlemesinde durur. İndirilen kod/npm script’i çalıştırılmaz, bağımlılık kurulmaz, kilitler otomatik kırılmaz.
- **Profil:** yalnızca mantıksal istemci/paket seçimi ve kaynak anahtarları (`skill`/`instruction`) taşır; yol, token, ham config ve bilinmeyen alan reddedilir. Dışa aktarma stdout’a JSON yazar. Geri yükleme açık `anahtar=/mutlak/yol` eşlemeleri ve mevcut OpenCode proje akışı üzerinden ayrı onay ister; diğer istemciler ertelenmiş sayılır.

Ara testler: kaynak katmanı 17/17, ardından tam takım 235/235; güncelleme çekirdeği 12/12; profil + CLI 14/14. Son doğrulama: `node --test` → **261 geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık **4,8 saniye**. Canlı GitHub API/release çağrısı, gerçek indirme, gerçek kullanıcı ayarına yazım, npm yayını ve commit/push yapılmadı. Release akışı yalnızca sahte taşıyıcıyla sınandı; public release henüz yok. Ayrıntılar ve sınırlar: `docs/reports/stage-four.md`.

## Aşama 5: yerel web paneli

`docs/superpowers/specs/2026-11-09-local-web-ui-design.md` ve `docs/superpowers/plans/2026-11-09-stage-five-web-ui.md` uygulandı. Sürüm `0.1.0-dev.4`. Kullanıcı platform olarak yerel web panelini (`seroai ui`), sakin/MacPaw çizgisini ve onaylı tam akışı seçti.

Yeni işler: `node:http` tabanlı, 127.0.0.1'e bağlanan ve oturum belirteci üreten sunucu; belirteç/köken/tür/256 KiB gövde denetimi; altı ekranlı derlemesiz arayüz (Genel bakış, Kaynaklar, Proje, Güncelleme, Profil, Hakkında); değişiklik defteri ve tek birincil onay düğmesi; koyu/açık mod, görünür odak ve `aria-live` bildirim. Yazma uçları mevcut plan/apply/rollback fonksiyonlarını çağırır, plan kimliğini yeniden hesaplar; yeni yazma yolu yoktur.

Testler: sunucu/güvenlik 5/5; okuma API'si 6/6; yazma API'si 6/6; statik/a11y 5/5; CLI + canlı sunucu 3/3. Son `node --test`: **286 geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık **5,4 saniye**. Kullanıcı onayıyla panel geçici bir projede tarayıcıda açıldı; masaüstü/mobil, açık/koyu mod, önizleme→uygula→geri alma akışı çalıştı. Kontrolde üç kusur düzeltildi: uygulama sonrası bildirimin silinmesi, geri alma defterinin boş görünmesi, profil listesinin tek sütunda aşırı uzaması. Gerçek kullanıcı ayarına yazım yapılmadı; commit/push yapılmadı. Ayrıntılar: `docs/reports/stage-five.md`.

## Aşama 6: otomatik beceri kurulumu

Kullanıcı, ECC benzeri otomatik kurulumun yeterli olduğunu belirtti; platform olarak yerel web paneli ve ardından kurulum motoru seçildi. Tasarım ve plan:

- `docs/superpowers/specs/2026-11-09-auto-install-design.md`
- `docs/superpowers/plans/2026-11-09-stage-six-auto-install.md`

`catalog/sources.json` yedi paketi tam commit SHA'sına ve lisansına pinler. `src/install/` altında kaynak/ağaç doğrulama, bağımlılıksız katı tar okuyucu, plan/çakışma, sahiplik durumu, uygulama, rollback, doctor ve uninstall eklendi. CLI: `install`, `install-doctor`, `install-rollback`, `uninstall`. Proje hedefi `.opencode/skills/`, global hedef `~/.config/opencode/skills/`; durum `.git/seroai/install/` veya `~/.seroai/install/`.

Kapsam gerçeği: `karpathy-skills` lisans belirtmediği için, `graphify` upstream CLI olduğu için, `github-mcp` ayar kaydı olduğu için otomatik kurulmaz. Core profili `superpowers`, `caveman`, `ponytail`, `impeccable` paketlerini kurar; diğerlerini gerekçesiyle listeler. Upstream `install.sh`/`npx` çalıştırılmaz.

Testler: kaynak 4/4, tar 6/6, plan 7/7, uygulama 7/7, CLI 4/4. Son `node --test`: **313 geçti, 0 başarısız, 0 atlanan**, çıkış kodu 0, süre yaklaşık **5,4 saniye**. Kullanıcı onayıyla gerçek GitHub arşivleriyle geçici bir projede 44 beceri kuruldu; doctor tümünü `unchanged` gördü ve geri alma tamamlandı. Bu sırada büyük arşiv sınırı, CRLF dönüşümü, indirme zaman aşımı, çalıştırma izni ve 1 MB okuma sınırı düzeltildi. Global kurulum ve gerçek kullanıcı projesi denenmedi; commit/push ayrı onay ister. Ayrıntılar: `docs/reports/stage-six.md`.
