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

- Kullanıcı mevcut klasörde devam edilmesini onayladı; mevcut doküman değişiklikleri korundu, başka çalışma ağacına taşınmadı. Commit/push yapılmadı.
- Başlangıçta kullanıcının onay kuralı nedeniyle otomatik test ve commit adımları uygulanmadı. Önce testler yazıldı, ancak başarısız/başarılı test döngüsü çalıştırılmadı. Daha sonra onayla tam takım çalıştırıldı ve yukarıdaki sonuç alındı; bu, geriye dönük bir başarısız/başarılı test döngüsü kanıtı değildir.
- Uygulama sürümlerini karıştırmamak için katalogda 12 hedef var; OpenChamber, OpenCode üzerinden ortak kayıtta. Claude, Codex ve Gemini masaüstü/CLI hedefleri ayrı. Önceki durum raporundaki “9 istemci” sayısı bağlayıcı bir kapsam değildi.
- Her hedefte beceri, MCP, hook ve kural yükleme yetenekleri ayrı ayrı `unverified`. Kaynak sürümleri ve lisanslar `null`; uydurma inceleme/sabitleme kabul edilmez.
- Güncelleme zorunluluğu tasarımda korunuyor; bu ilk salt okunur aşamada güvenli yedekleme/geri alma altyapısı olmadığı için güncelleme uygulanmıyor ve komut hata veriyor.
- `.trail/` kurulmadı; kullanıcı ayarları, özel raporlar ve mevcut hafıza sistemleri değiştirilmedi.

## Sıradaki adım

Onaylanan 16 dosyayı commit edip gönder. Trail kurulumu olmadığı kullanıcıya bildirildi; sessiz kurulum yapılmadığı için `trail check` çalıştırılmadı. npm paketi, release, global kurulum veya uygulama ayarı değişikliği ayrıca onay gerektirir.
