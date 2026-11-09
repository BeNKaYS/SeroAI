# Çalışma klasörü incelemesi uygulama planı

**Amaç:** Kullanıcının seçtiği yönetilen klasörü yeni bir süreçte, yazma veya geri alma yapmadan incelemek.

**Mimari ve kapsam kararı:** Node.js >=22, ESM, bağımlılık yok. `inspectManagedWorkspace(root)` diskteki sahiplik kaydını okur; sadece kayıttaki güvenli göreli adları kontrol eder. CLI’ye `inspect --workspace <mutlak-yol> [--json] [--lang tr|en]` eklenir. Genel `status`, kurulum ve kurtarma komutları hâlâ kapalıdır. Kullanıcı mevcut testleri bitirip sonraki adıma geçilmesini istedi; bu, güvenlik çekirdeğinin salt okunur devamıdır.

## Adımlar

- [x] İnceleme ve CLI testlerini yaz.
- [x] Kayıt doğrulama ve salt okunur inceleme fonksiyonunu ekle.
- [x] Türkçe/İngilizce CLI çıktısını ve belgeleri güncelle.
- [x] Yeni testler için onay al, çalıştır ve gerçek sonucu kaydet.

## Sözleşme

- `src/core/inspection.mjs`: `inspectManagedWorkspace(root)` → `{ mode: 'inspection', changesApplied: false, revision: number|null, recordStatus: 'present'|'missing', files: [{ path, status: 'unchanged'|'modified'|'missing'|'unsafe' }], warnings: string[] }`.
- Mutlak yol zorunlu; root ve `.seroai` gerçek, özel dizinler olmalı. Üst dizinlerde symlink reddedilir.
- Kayıt yapısı `{ revision, files }`; revision negatif olmayan güvenli tamsayı, files yalnızca izinli adlar ve SHA-256 değerleri içerir. Bozuk kayıt içeriği hata mesajına sızmaz. Sahiplik kaydı yoksa `recordStatus: missing`, revision null; boş/temiz diye raporlanmaz.
- Yalnızca kayda ait `.md`, `.txt`, `.json` dosyaları okunur. Sahipsiz dosyalar taranmaz. Symlink, hardlink, dizin ve aşırı büyük dosya `unsafe` olarak gösterilir; hedefleri okunmaz. Dosya içerikleri çıktıda yer almaz.
- İnceleme yalnızca mevcut sahiplik kaydıyla karşılaştırır. Tamamlanmamış işlemler ve yedeklerin tutarlılığı değerlendirilmez; “kurulum sağlıklı” veya “kurtarma tamam” denmez. Bu sınır her sonuçta uyarıdır.
- CLI varsayılan Türkçe, JSON alanları/durumları dilden bağımsızdır. Hatalar sıfırdan farklı çıkış kodu verir. Yeni test ve yayın onayları ayrı tutulur.

## Testler ve dosyalar

- `tests/inspection.test.mjs`: yeni süreçten/sahiplik dosyasından okuma; değişmeyen, değişmiş, silinmiş, symlink/hardlink/dizin hedefler; sahipsiz dosyayı takip etmeme; bozuk kayıt, sahte path/hash/revision ve eksik kayıt; öncesi/sonrası dosya adları ve içerikleri aynı.
- `tests/cli.test.mjs`: `inspect --workspace` argümanları, Türkçe/İngilizce ve JSON, geçersiz yol hatası. Önceki komut testleri korunur.
- `src/core/safe-files.mjs`: tek ortak güvenli dosya adı kontrolü; `workspace.mjs` bu kontrolü tekrar kullanır.
- `src/cli/main.mjs`, `src/cli/messages.mjs`: yalnızca inceleme komutu eklenir.
- `README.md`, `docs/progress.md`: kapsam ve gerçek test sonucu.

Doğrulama komutu: kullanıcı onayından sonra `node --test`. Beklenen sıfır hata; sonuç alınmadan yeni adıma tamamlandı denmez. Commit/push ayrıca izin gerektirir.
