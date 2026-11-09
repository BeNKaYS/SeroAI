# Yönetilen çalışma klasörü: onay, yedek ve geri alma

## Amaç ve kapsam

Bir sonraki kurulum aşamasının güvenlik çekirdeğini kurmak. Kullanıcı uygulamaya devam edilmesini istedi; bu dar kapsam mevcut tasarımın devamıdır. Gerçek ajan ayarları, ev dizinindeki kurulumlar ve istemci uyarlamaları bu aşamada değiştirilmez.

## Yaklaşım

Doğrudan uygulama ayarlarını değiştirmek, henüz incelenmemiş uyarlamalara güvenmeyi gerektirir. Genel amaçlı bir dosya taşıma sistemi ise sahiplik ve kurtarma kapsamını gereksiz büyütür. Uygulama tercihi: önce **yeni ve özel bir SeroAI çalışma klasörü** içinde, kendi oluşturduğu düz metin dosyaları için işlemler. Bu tercih geliştiricinin kapsam kararıdır; tüm istemcilerin desteklendiği anlamına gelmez.

Node.js >=22, yerel ESM, çalışma zamanı bağımlılığı yok. Var olan `setup` önizlemesi ve CLI komutları değişmez.

## Sözleşme

- `createManagedWorkspace(parent, { approved: true })`: açıkça seçilmiş, var olan parent altında yeni rastgele `seroai-*` klasörü oluşturur. Onay olmadan hiçbir dizin yazılmaz. Klasör ve iç yedek alanı 0700, yazılan dosyalar 0600 olur.
- Dönen nesnede `root`, `prepare(changes)`, `apply(plan, { approvedPlanId })`, `rollback(receipt, { approvedPlanId })` bulunur. Yeni klasör yaratma onayı, dosya yazma veya geri alma onayı değildir.
- `prepare` salt okunurdur. `{ path, content }` kayıtlarından değişmez bir önizleme üretir: işlem kimliği, göreli dosya adları, önceki/sonraki SHA-256, bayt sayısı. İçerik önizlemede gösterilmez. Gerçek içerik yalnızca bellekte saklanır.
- İlk kesitte yalnızca tek seviyeli `.md`, `.txt`, `.json` dosyaları kabul edilir. Gizli adlar, yol ayırıcıları, `..`, yinelenen adlar, boş listeler ve 1 MiB üstü içerikler reddedilir. Çok seviyeli paket ağaçları sonraki iştir.
- Sahiplik yalnızca bu nesnenin başarıyla yazdığı dosyalardan gelir. Var olan sahipsiz dosya çakışması reddedilir; içeriği okunmaz. Yönetilen dosya sonradan değişirse yazma ve geri alma reddedilir.
- Önizleme kimliğiyle eşleşen açık onay ve aynı nesnenin ürettiği plan olmadan `apply` hiçbir şey yazmaz. Her işlem tek kullanımlıktır. Eski önizleme, yeni sahiplik sürümünden sonra reddedilir.
- Her hedef yeniden kontrol edilir; sembolik bağlantı, hardlink, dizin ve dosya tipi değişimi reddedilir. Parent ve root üst dizinlerinde sembolik bağlantı kabul edilmez.
- Tüm önceki içerikler ve sahiplik bilgisi özel `.seroai/backups/<id>.json` dosyasına, hedefler değiştirilmeden önce yazılıp diske aktarılır. Yedek alınamazsa hedeflere dokunulmaz.
- Hedef güncellemeleri aynı dizindeki özel geçici dosyadan rename ile yapılır. İşlem sırasında hata olursa yalnızca bu işlemin yazdığı ve hâlâ aynı içeriği taşıyan hedefler geri alınır. Çakışmalı geri alma hatası ayrıca raporlanır; yedek korunur.
- Manuel rollback aynı süreçteki makbuz, eşleşen onay, güncel sahiplik sürümü ve değişmemiş hedefler gerektirir. Bir hedef çakışıyorsa diğerlerine başlamadan reddedilir.

## Sınırlar ve güvenlik modeli

Bu süreç içi bir çekirdektir; CLI’ye bağlı değildir. Sahiplik ve yedek kaydı yazılır, fakat süreç yeniden başlatılınca çalışma klasörü açma/kurtarma henüz yoktur. Çok dosyalı işlem güç kesintisine karşı atomik değildir. Süreç çökmesi, kötü niyetli aynı kullanıcı tarafından eşzamanlı dizin değiştirme ve yedek kurcalama karşısında tam kurtarma iddia edilmez. Aynı nesnede eşzamanlı işlemler reddedilir. Bu sınırlamalar giderilmeden gerçek kurulum açılmaz.

Hiçbir kaynak indirilmez, script çalıştırılmaz, kimlik bilgisi veya mevcut uygulama ayarı okunmaz. Kullanıcı verisi veya mevcut hafıza deposu güncelleme hedefine alınmaz. Çalışma klasörü hassas yedek içerebilir; `.seroai/` Git dışında tutulur.

## Kabul

Geçici dizin testleri: onaysız sıfır yazma; onaylı yeni dosya; sahip olunan dosya güncelleme ve geri alma; sahipsiz dosya çakışması; eski/değiştirilmiş plan; sonradan düzenlenmiş hedef; symlink/hardlink; yol kaçışı; özel izinler; yedek oluşturma hatasında hedefleri koruma; ikinci dosya yazımındaki hatada ilkini geri alma. Testler yalnızca kullanıcı onayıyla çalıştırılır. Commit/push ayrıca onay gerektirir.
