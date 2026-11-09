# Yönetilen çalışma klasörü uygulama planı

> Bu oturumda uygulamayı ana ajan yürütür; alt ajan görevlendirilmez. Kullanıcı devam edilmesini istedi. Test ve yayın onayları bundan ayrı tutulur.

**Amaç:** Gerçek ajan ayarlarına bağlamadan, yeni bir yönetilen klasörde onay/yedek/geri alma çekirdeği eklemek.

**Mimari:** Güvenli dosya yardımcıları ve süreç içi sahiplik tutan çalışma klasörü. CLI yalnızca önizleme olarak kalır.

**Teknoloji:** Node.js >=22, ESM, yerleşik fs/crypto/test; harici bağımlılık yok.

**Tasarım:** `docs/superpowers/specs/2026-11-08-managed-workspace-design.md`.

## Adımlar

- [x] Onay, sahiplik ve geri alma sözleşmesinin testlerini yaz.
- [x] Güvenli dosya yardımcılarını ve yönetilen klasör çekirdeğini uygula.
- [x] Kapsamı ve sınırlamaları belgele; onayla testleri çalıştır ve sonucu kaydet.

## Genel kısıtlar

- Gerçek uygulama ayarlarına dokunma, mevcut HOME üzerinde deneme yapma.
- CLI davranışını değiştirme; kurulum/güncelleme/kaldırma açma.
- Yalnızca yeni oluşturulmuş özel klasör; düz `.md`, `.txt`, `.json` dosyaları; içerik üst sınırı 1 MiB.
- Önizleme kimliğine bağlı ayrı apply/rollback onayları; yedekten önce hedef yazma yok.
- Test/build/lint/doğrulama için önce izin iste. Commit/push izni önceki yayınla sınırlıydı; yeni değişiklikler için tekrar izin gerekir.

## İnceleme odağı

- Sahipsiz dosya veya kullanıcı düzenlemesi ezilmemeli.
- Plan taklidi, yeniden kullanım ve eski sürüm onayı reddedilmeli.
- Symlink/hardlink ve yol kaçışında dışarı yazılmamalı.
- Yedekleme hatası hedefleri değiştirmemeli.
- Kısmi yazma hatası, yalnızca işlem tarafından yazılmış ve değişmemiş hedefleri geri almalı.

## Görev 1: Regresyon sözleşmesi

**Dosya:** `tests/workspace.test.mjs`.

**Arayüz:** `createManagedWorkspace(parent, { approved })` → `{ root, prepare, apply, rollback }`. Plan ve makbuz nesneleri donuktur; `approvedPlanId` ilgili nesnenin `id` alanıyla eşleşir.

- [x] Geçici parent altında onay, yeni dosya, güncelleme, rollback, sahipsiz çakışma, kullanıcı düzenlemesi, plan taklidi/eskitme ve yol sınırı testlerini yaz.
- [x] İzinler, sembolik bağlantı/hardlink, engellenmiş yedek dizini ve kontrollü ikinci hedef hatası testlerini yaz.
- [x] Testleri çalıştırmadan önce kullanıcı izni al; reddedilirse yazılmış ama doğrulanmamış olarak bırak.

## Görev 2: Çekirdek

**Dosyalar:** `src/core/safe-files.mjs`, `src/core/workspace.mjs`.

**Arayüz:** `safe-files` özel atomik yazma ve gerçek dizin/normal dosya kontrollerini sağlar. `workspace` yalnızca kendi oluşturduğu root ve plan/makbuz nesneleriyle çalışır; sahiplik revizyonu, hash ve önceki içerikleri içeride tutar.

- [x] Dosya kontrolü, 0600 geçici yazma + sync + rename ve 0700 dizinleri uygula.
- [x] Salt okunur prepare, eşleşen onay, tek kullanımlı apply ve özel yedek yazımını uygula.
- [x] İşlem hatasında sınırlı geri alma ve ayrı onaylı manuel rollback uygula; hata durumunda yedeği koru.

## Görev 3: Doğrulama kapısı

**Dosyalar:** `README.md`, `docs/progress.md`.

- [x] Kütüphanenin CLI’ye bağlı olmadığını ve süreç çökmesi kurtarmasının eksik olduğunu belgele.
- [ ] Kullanıcı onayıyla `node --test tests/workspace.test.mjs` ve `node --test` çalıştır. Beklenen sıfır hata; gerçek çıktıyı kaydet.
- [ ] Sonuç ve yeni dosya listesini sun; onaysız commit/push yapma.
