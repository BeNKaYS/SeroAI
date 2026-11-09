# Süreç sonrası kurtarma

## Amaç ve yaklaşım

Yönetilen özel klasördeki apply/rollback işlemi süreç kapanmasıyla yarıda kalırsa, yeni süreçte kalıcı kayıttan bir geri alma önizlemesi üretmek ve yalnızca bu önizlemeye bağlı ayrı onayla işlem öncesi dosyalara dönmek.

Önceki salt okunur inceleme yalnızca sahiplik kaydını karşılaştırır. Doğrudan bunu “kurtarma” saymak eksik veya kısmen yazılmış dosyaları kaçırır. Seçilen dar yaklaşım: mevcut özel yedeğin yanında, hedefler yazılmadan önce oluşturulan tek bir `pending.json` günlüğü. Genel veritabanı veya istemci kurulum sistemi eklenmez. CLI yazma komutları kapalı kalır; kurtarma API’si deneysel kütüphanedir.

## Kayıt ve durum geçişi

- Apply: doğrula → özel yedek yaz/sync → `pending.json` özel ve exclusive oluştur/sync → hedefleri yaz → sahipliği yaz → pending kaydını kaldır → makbuz döndür.
- Rollback: doğrula → mevcut yedeğin hash’ini doğrula → rollback pending kaydı oluştur → eski hedefleri geri getir → sahipliği yaz → pending kaydını kaldır.
- Pending; şema sürümü 1, işlem kimliği, mutlak root, işlem türü, yazıcı PID, yedek SHA-256 ve başlangıç sahiplik kaydı içerir. Root değişirse veya kayıt/yedek ilişkisi bozuksa kurtarma reddedilir.
- Başarısız apply’nin süreç içi geri alması başarılı olursa sahiplik başlangıca döner ve pending kaldırılır. Geri alma tamamlanamazsa pending ve yedek korunur.

## Kurtarma sözleşmesi

- `prepareRecovery(root)` salt okunur; pending yoksa null döner. Varsa günlük ve özel yedeği doğrular, dosyaları sınıflandırır ve içerik göstermeyen donmuş bir önizleme döndürür. Çıktı kimliği; günlük, yedek, sahiplik ve güncel dosya hash’lerine bağlıdır.
- Snapshot dosya adları UUID’den türetilir; göreli hedefler yalnızca mevcut tek seviyeli metin dosyası kuralına uyar. Base64 içerik katı doğrulanır ve önceki SHA-256 ile eşleşmelidir. Snapshot üst sınırı 16 MiB; hedef başına sınır 1 MiB, planda en çok 100 dosya ve toplam yeni/eski içerik ayrı ayrı en çok 8 MiB.
- Güncel hedefler önceki veya sonraki hash’le eşleşmeli. Herhangi bir üçüncü içerik, eksik yönetilen güncelleme, symlink, hardlink veya dizin tüm kurtarmayı başlamadan engeller. Önceki ve sonraki hash aynıysa hedef zaten geri dönmüş sayılır.
- Yazıcı PID hâlâ yaşıyorsa veya canlılığı güvenle belirlenemiyorsa işlem durur. PID yeniden kullanılmışsa yanlışlıkla yazmak yerine gereksiz reddetme tercih edilir.
- `recoverWorkspace(plan, { approvedPlanId })` sadece aynı süreçte üretilmiş gerçek planı ve eşleşen onayı kabul eder; eski planı uygulamadan önce yeniden doğrular. Başka kurtarma işlemi özel `recovery.lock` ile engellenir.
- Bütün hedefler önceden kontrol edilir. Yalnızca sonraki hash’te duran hedefler eski içeriğe döner; zaten eski durumda olanlar bırakılır. İlgisiz dosyalar ve yedekler kaldırılmaz. Sahiplik, önceki dosya listesiyle ve başlangıçtan iki büyük revizyonla yazılır; pending en son kaldırılır.
- Kurtarma tekrar kesilirse pending korunur. Dosyaların eski/sonraki karışımı ve kurtarma sonrası sahiplik sürümü tanınır. Ancak çöken kurtarma sürecinden kalan `recovery.lock` otomatik silinmez; elle inceleme gerekir. Hata durumunda otomatik kilit kırılmaz.

## Sınırlar

Node.js >=22, ESM, harici bağımlılık yok. Gerçek ajan ayarları, global kurulum, paket indirme, açık güncelleme komutları ve otomatik servis yenileme kapsam dışıdır. Bu aşama süreç çıkışı/çökmesi içindir; güç kesintisinde dizin fsync dayanıklılığı veya kötü niyetli aynı kullanıcıya karşı dosya sistemi yarışı garantisi verilmez. Eski yedekler pending kaydı yoksa kendiliğinden geri alınmaz.

Test ve yayın için ayrı kullanıcı onayı gerekir. Önceki 110 test sonucu yeni kodu doğrulamaz; bu kesitin gerçek doğrulama sonucu `docs/progress.md` içinde kaydedilir.
