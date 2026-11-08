# SeroAI salt okunur temel uygulama planı

> **Ajanlar için:** Bu planı görev görev uygulamak için `executing-plans` becerisini kullanın. Ayrıca izin verilmedikçe alt ajan görevlendirmeyin. İlerleme onay kutularıyla izlenir.

**Amaç:** Seçilen kaynakları listeleyen ve uygulama ayarlarını değiştirmeden önerilen kurulumu gösteren, bağımlılıksız ve sınırlarını açıkça belirten bir CLI sunmak.

**Mimari:** Bildirimsel kaynak/uygulama katalogları saf bir planlayıcıyı besler. İnce bir ESM CLI çıktıyı Türkçe veya İngilizce biçimlendirir. Sahiplik, yedekleme, onay ve geri alma aşaması uygulanana kadar kurulum ve tüm global değişiklikler kullanılamaz.

**Teknoloji:** Node.js >=22, yerel ESM, yerleşik `node:test` ve `assert`; çalışma zamanı bağımlılığı yok.

**Tasarım belgesi:** `docs/design.md`.

## Adımlar

- [x] Herkese açık kaynak/uygulama kataloglarını ve tek sürüm kaynağını ekle.
- [x] Saf, salt okunur kurulum planlayıcısını uygula ve test et.
- [x] CLI giriş noktalarını ve gerçeği yansıtan Türkçe/İngilizce çıktıyı ekle.
- [ ] Doğrulama onayı al, kararlaştırılan kontrolleri çalıştır ve yayın onayı iste.

## Genel kısıtlar

- Yedi temel kaynağı koru: Superpowers, Graphify, yalnızca Caveman becerileri, Ponytail, Karpathy Skills, Impeccable, GitHub MCP.
- AgentMemory deneysel ve isteğe bağlı kalır; Claude-Mem ve ECC kapsam dışıdır.
- MCP taşıma biçimi veya klasör varlığından destek sonucu çıkarma.
- Bu aşamada ev dizinine yazma, kimlik bilgisi okuma, ağ çağrısı, paket indirme, dış kaynak kodu çalıştırma veya otomatik CI yok.
- Kök `version.json`, `surum`, `tarih` ve `not` alanlarını içerir; tüm CLI sürüm çıktısı bu dosyadan okunur.
- Test/build/lint/tarayıcı/canlı doğrulama öncesinde izin iste; çalıştırılmayan testlerin geçtiğini iddia etme.
- Kullanıcının açık izni olmadan commit/push yapma. Üst dizindeki kişisel dosyaları ekleme.

## İnceleme odağı

- Bilinmeyen paket/uygulama kimlikleri sessiz bir varsayılan yerine hata vermeli.
- Yinelenen seçimler yinelenen plan kayıtları üretmemeli.
- Doğrulanmamış yerel hook’lar ve masaüstü/CLI farkları çıktıda görünür kalmalı.
- Ev dizininde sembolik bağlantılar veya hassas dosyalar bulunsa da önizleme salt okunur kalmalı.
- Uygulanmayan değiştirici komutlar yanıltıcı başarı yerine sıfırdan farklı çıkış kodu vermeli.

## Dosya haritası

```text
package.json                     Yerel script/bin bilgileri; henüz yayın yok
version.json                     Çalışma zamanı sürüm kaynağı
catalog/packages.json            İstenen kaynaklar; incelenmemiş sürümler açıkça belirtilir
catalog/clients.json             Ayrı masaüstü/CLI hedefleri ve yetenek durumu
src/core/catalog.mjs             Katalog yükleme/doğrulama
src/core/plan.mjs                Saf önizleme üretimi
src/cli/main.mjs                 Argüman ayrıştırma ve çıktı
src/cli/messages.mjs             Türkçe/İngilizce metinler
tests/catalog.test.mjs           Katalog sözleşmeleri
tests/plan.test.mjs              Saf planlama davranışı
tests/cli.test.mjs               Geçici dizinlerde CLI sözleşmeleri
```

## Görev 1: Kataloglar ve sürüm

**Dosyalar:** `package.json`, `version.json`, `catalog/packages.json`, `catalog/clients.json`, `src/core/catalog.mjs`, `tests/catalog.test.mjs`.

**Arayüzler:** `loadCatalog(root: string): Promise<{ packages: Package[], clients: Client[], version: Version }>`; Package, `id`, `repository`, `role`, `status`, `reviewedRef` (incelenene kadar null) içerir. Client, `id`, `label`, `capabilityStatus` (başlangıçta `unverified`) içerir. Version, belirtilen üç Türkçe anahtarı kullanır. Depo URL’leri kimlik bilgisi/sorgu içermeyen HTTPS GitHub adresleridir.

- [x] Tam yedi benzersiz temel kimliği ve HTTPS kaynağını sınayan; yinelenen kimlikleri, geçersiz URL şemalarını, eksik sürüm alanlarını ve uydurma incelenmiş sürümü reddeden testleri yaz.
- [ ] Hedefli test komutu için izin iste; izin yoksa çalıştırma.
- [x] `JSON.parse` ve açık şema kontrolleriyle yükleme/doğrulamayı uygula; ham ayar içeriğini göstermeden açıklayıcı hata döndür.
- [x] İlk geliştirme sürümünü `0.1.0-dev.1`, tarihi `2026-11-08` yap; paket bilgisi ikinci bir CLI sürüm kaynağı olmasın. npm yayın akışı ekleme veya paket adının boşta olduğunu iddia etme.
- [ ] Onaylandığında `node --test tests/catalog.test.mjs` çalıştır; beklenen sıfır hata. Devir notuna beklentiyi değil gerçek sonucu kaydet.

## Görev 2: Saf kurulum önizlemesi

**Dosyalar:** `src/core/plan.mjs`, `tests/plan.test.mjs`.

**Girdi:** Görev 1’deki katalog.

**Çıktı:** `createPlan(catalog, { packageIds, clientIds }): { mode: 'preview', changesApplied: false, items: Array<{ packageId, clientId, status: 'review-required' }>, warnings: string[] }`.

- [x] Bilinmeyen kimliklerin ve boş uygulama seçiminin hata verdiğini, yinelenen kimliklerin tekilleştiğini, her kaydın inceleme gerektirdiğini ve `changesApplied` değerinin false olduğunu sınayan testleri yaz.
- [x] İzole geçici HOME içinde işaret dosyası ve sembolik bağlantı kullanan, planlayıcıyı çağıran ve ikisinin de değişmediğini sınayan yan etki testi yaz; planlayıcı dosya/ağ/process modülü içe aktarmasın.
- [ ] `node --test tests/plan.test.mjs` öncesinde izin iste.
- [x] Saf planlayıcıyı uygula. MCP’nin otomatik kayıt veya yerel hook anlamına gelmediği uyarısını ekle. Bu fonksiyonda shell komutu veya kurulum işlemi olmasın.
- [ ] Onaylandığında hedefli testleri çalıştır ve sonuçları kaydet.

## Görev 3: CLI ve kullanıcıya sunulan sözleşme

**Dosyalar:** `src/cli/main.mjs`, `src/cli/messages.mjs`, `tests/cli.test.mjs`, `README.md`.

**Girdi:** `loadCatalog` ve `createPlan`.

**Çıktı:** `help`, `version`, `catalog` ve yalnızca önizleme yapan `setup --client <id> --package <id> [--json] [--lang tr|en]` komutlarını içeren `seroai` bin kaydı. Yinelenen bayraklar birden fazla kimlik seçer. Varsayılan dil Türkçedir. Yardım geliştirme aşamasını ve salt okunur davranışı açıkça belirtir.

- [x] Türkçe varsayılan/İngilizce seçimi, geçerli JSON önizlemesi, version.json ile sürüm eşleşmesi, bilinmeyen bayrak/kimlik hataları ve `update`, `backup`, `restore`, `uninstall` için uygulanmadı mesajıyla sıfırdan farklı çıkış kodu testlerini yaz.
- [x] Geçici HOME ve çalışma dizininde önizlemenin ayar/durum dosyası oluşturmadığını sınayan alt süreç testi yaz. Gerçek kullanıcı HOME dizininde duman testi çalıştırma.
- [ ] CLI testleri öncesinde onay iste; Node yerleşik araçlarıyla argüman ayrıştırıcısını uygula ve tüm geçersiz girdilerde sıfırdan farklı çıkış kodu döndür.
- [x] `setup` kurulummuş gibi anlaşılmasın: metin ve JSON, önizleme modunu ve değişiklik uygulanmadığını açıkça belirtsin. Sahte başarılı status komutu uygulama.
- [x] Kaynak kopyadan kullanımı yalnızca çalıştırılacak dosyalar oluşturulduktan sonra belgele. Sahip olunmayan/yayımlanmamış npm adı için `npx` talimatı yayımlama.
- [ ] Onaylandığında `node --test tests/cli.test.mjs` çalıştır ve sonuçları kaydet.

## Görev 4: Doğrulama ve yayın kapısı

- [x] Tüm test takımı için `node --test` çalıştırma iznini açıkça al. Bu aşama için sağlık/sağlayıcı/tarayıcı kontrolü gerekmez.
- [x] Onaylanırsa gerçek sayıları ve hataları raporla; yalnızca bu aşamayla ilgili kusurları düzelt. Onay verilmezse aşamayı doğrulanmamış olarak işaretle.
- [ ] Trail kurulup kurulmayacağını sor; yeni depoda `.trail/` yok. Sessizce kurma veya başlatma. Commit istendiğinde ilgili Trail politikasını uygula ya da eksik kurulumu bildir.
- [x] Commit istemeden önce herkese açık kesin dosya listesini sun; kişisel raporlar depo dışında kalsın. Doğrulama onayı olmadan gizli bilgi tarayıcısı çalıştırma.
- [x] Açık commit/push onayı al. İncelenen dosyaları yalnızca bundan sonra yayımla; ayrıca hazırlık ve yayın yetkisi olmadan release veya npm paketi oluşturma.

## Sonraki aşamaların işleri (bu planla uygulanmaz)

Onay ve çakışma kararları; yalnızca sahibine açık yedekler; atomik sahiplik/durum yazımı; yarıda kalan işlemi geri alma; incelenmiş dış kaynak sürümleri ve lisanslar; güvenli yerel/HTTPS GitHub güncelleme kaynakları; seçmeli uyarlamalar; kullanıcı profili dışa/içe aktarma; kapsamlı değil sahiplik sınırında kaldırma; ayrı AgentMemory pilotu; isteğe bağlı GUI/MCP katmanı. Global kurulum sunulmadan önce bunların kendi uygulama planı ve testleri gerekir.
