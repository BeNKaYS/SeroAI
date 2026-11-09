# Otomatik kurulum — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pinlenmiş GitHub commit'lerinden seçilen becerileri OpenCode keşif klasörüne onay/yedek/sahiplik kaydıyla kuran, doctor/rollback/uninstall sunan kurulum motoru.

**Architecture:** `catalog/sources.json` pinleri tutar; GitHub ağaç metadatası önizleme için, tarball uygulama için kullanılır. Kendi katı tar okuyucumuz ve mevcut güvenli dosya yardımcılarıyla proje (`.opencode/skills`) veya global (`~/.config/opencode/skills`) hedefe yazılır; durum `.git/seroai/install/` veya `~/.seroai/install/` altındadır.

**Tech Stack:** Node.js 22+ ESM, `node:zlib`, `node:crypto`, `node:http` yok (fetch), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-09-auto-install-design.md`

## Global Constraints

- Onaysız yazma yok: her mutasyon `planId` ister; `--yes` yoktur.
- Upstream kod/`install.sh`/npm script çalıştırılmaz; yalnızca dosya kopyalanır.
- Yalnızca HTTPS, `codeload.github.com` ve `api.github.com`; yönlendirmeler denetlenir.
- Sıkıştırılmış 24 MiB, açılmış 64 MiB, 5000 girdi, dosya başına 2 MiB.
- Symlink/hardlink/aygıt, mutlak yol, `..`, ters bölü reddedilir.
- Lisanssız paket (karpathy-skills) otomatik kurulmaz; graphify (araç) ve github-mcp (ayar) dosya olarak kurulmaz.
- Hedefte SeroAI'ya ait olmayan veya kullanıcı tarafından değiştirilmiş dosya ezilmez.
- Testler yalnızca geçici klasörlerde; canlı GitHub çağrısı yapmaz (sahte taşıyıcı).
- Commit/push ayrı onay ister.

## Review Focus

1. Tarball içinde `../` veya mutlak yol → hiçbir dosya yazılmadan ret.
2. Symlink/hardlink/PAX hilesi → ret; hedef dışına yazım yok.
3. Aynı beceri adı iki pakette → plan reddi, kısmi yazım yok.
4. Sahiplik kaydındaki dosya kullanıcı tarafından değiştirilmiş → güncelleme/rollback/uninstall durur.
5. Onaydan sonra commit pini veya hedef durumu değişmiş → `STALE_PLAN`, sıfır yazım.

---

### Task 1: Kaynak kataloğu ve ağaç metadatası

**Files:**
- Create: `catalog/sources.json`, `src/install/sources.mjs`, `tests/install-sources.test.mjs`

**Interfaces:**
- Produces:
  - `loadSources(root) -> { schema, sources }`; her kaynak `{ id, repository, ref, license, kind, skillsRoot, installable, reason? }`.
  - `sourceTree(source, { fetchImpl }) -> Map<path, { sha, size }>` (yalnızca blob'lar).

- [x] **Step 1: Write the failing test**

`tests/install-sources.test.mjs`: gerçek katalog 7 kaynak döndürür; commit'ler 40 hex; `installable: false` olanların gerekçesi vardır; karpathy lisanssızdır. Sahte `fetchImpl` ile ağaç eşlemesi doğru kurulur; 404 → `UPDATE_SOURCE_UNAVAILABLE`; 40 hex olmayan ref → `INVALID_INSTALL_SOURCE`; yanıt 5 MB'ı aşarsa ret.

- [x] **Step 2: Run test to verify it fails** — `node --test tests/install-sources.test.mjs`

- [x] **Step 3: Implement `catalog/sources.json` and `src/install/sources.mjs`**

Pinler tasarımdaki tablodan. `sourceTree` tek çağrıda `https://api.github.com/repos/<repo>/git/trees/<sha>?recursive=1` okur; yanıt `truncated: true` ise reddeder.

- [x] **Step 4: Run test to verify it passes**

### Task 2: Katı tar okuyucu

**Files:**
- Create: `src/install/tar.mjs`, `tests/install-tar.test.mjs`, `tests/helpers/tar-fixture.mjs`

**Interfaces:**
- Produces: `extractTarGz(buffer, { maxBytes = 64 MiB, maxFiles = 5000, fileLimit = 2 MiB }) -> Map<path, Buffer>`.

- [x] **Step 1: Write the failing test**

Fixture yazıcısı normal dosya, dizin, uzun ad (GNU `L`), PAX başlığı (`x`), symlink, hardlink ve `../` yolu üretebilsin. Testler: normal içerik çıkar; symlink/hardlink/aygıt, `..`, mutlak yol, ters bölü, 2 MiB dosya, 5001 girdi ve bozuk başlık reddedilir; çıktı girdi sırasından bağımsızdır.

- [x] **Step 2: Run test to verify it fails**

- [x] **Step 3: Implement `src/install/tar.mjs`**

`gunzipSync` ile aç; 512 baytlık başlıkları ayrıştır; `typeflag` 0/5 kabul, `x/g/L/K` atla (uzun adı `L` içeriğinden al), diğerleri ret. Ad + prefix birleştir; `\0` kırp; checksum doğrula; boyut sınırlarını uygula.

- [x] **Step 4: Run test to verify it passes**

### Task 3: Kurulum planı ve çakışmalar

**Files:**
- Create: `src/install/state.mjs`, `src/install/plan.mjs`, `tests/install-plan.test.mjs`

**Interfaces:**
- Produces:
  - `installStatePath(root, { global })`
  - `loadInstallState(root, { global }) -> { fingerprint, packages, skills }`
  - `planInstall(options, { fetchImpl }) -> plan`; `options: { project?, globalDirectory?, packageIds?, profile? }`
  - Plan: `{ id, mode, changesApplied: false, target, packages, skills, actions, exclusions, warnings }`.

- [x] **Step 1: Write the failing test**

Geçici projede: boş hedef → `create`; aynı ad iki pakette → `DUPLICATE_SKILL`; sahipli değişmemiş hedef → `replace`; sahipsiz hedef → `CONFLICT`; sahipli değişmiş dosya → `CONFLICT`; lisanssız/araç/ayar paketi `exclusions` içinde; `--global` ve `--project` birlikte → `INVALID_ARGUMENTS`; plan kimliği 64 hex ve girdi değişince farklı.

- [x] **Step 2: Run test to verify it fails**

- [x] **Step 3: Implement state and planner**

State dosyası yoksa boş kabul et; varsa şema, hedef ve dosya hash'lerini doğrula. Plan yalnızca metadatayı okur; dosya içeriği indirmez. Hedef adı `basename`; `/`, `..`, gizli adlar reddedilir.

- [x] **Step 4: Run test to verify it passes**

### Task 4: Uygulama, geri alma, doctor, uninstall

**Files:**
- Create: `src/install/apply.mjs`, `tests/install-apply.test.mjs`

**Interfaces:**
- Produces:
  - `applyInstall(plan, { approvedPlanId }) -> { installed, transactionId, skills }`
  - `planInstallRollback(root, { global })`, `rollbackInstall(plan, { approvedPlanId })`
  - `doctorInstall(root, { global }) -> { status, skills }`
  - `planUninstall(root, options)`, `uninstallSkills(plan, { approvedPlanId })`

- [x] **Step 1: Write the failing test**

Sahte taşıyıcı, planlanan commit için fixture tarball döndürsün. Testler: onaysız → sıfır yazım; doğru onay → dosyalar hedefte ve state'te; içerik hash'i yanlış → sıfır yazım; ikinci kurulum idempotent; kullanıcı dosyayı değiştirince doctor `modified`, güncelleme `CONFLICT`; rollback dosyaları kaldırır; uninstall yalnızca sahipli dosyaları siler; hedef dışına yazım yok.

- [x] **Step 2: Run test to verify it fails**

- [x] **Step 3: Implement apply/state**

Tüm paketleri önce geçici alana indir/doğrula; hedefleri yedekle (`.git/seroai/install/backups/<id>/` / `~/.seroai/install/backups/`); yazımı geçici dizin + rename ile yap; state'i en son atomik yaz. Kilit dosyası ile eşzamanlı yazımı engelle.

- [x] **Step 4: Run test to verify it passes**

### Task 5: CLI

**Files:**
- Create: `src/cli/install.mjs`, `tests/install-cli.test.mjs`
- Modify: `src/cli/main.mjs`, `src/cli/messages.mjs`

**Interfaces:**
- Produces: `install`, `install-doctor`, `install-rollback`, `uninstall` komutları; `--project`, `--global`, `--profile`, `--package`, `--approve`, `--json`.

- [x] **Step 1: Write the failing test**

`install --project <tmp> --profile core --json` önizleme verir, yazmaz; `--approve` ile yazar; `--global` ve `--project` birlikte → `INVALID_ARGUMENTS`; `--yes` → `INVALID_ARGUMENTS`; doctor JSON'u; uninstall önizlemesi; yardım satırları TR/EN.

- [x] **Step 2: Run test to verify it fails**

- [x] **Step 3: Implement CLI and messages**

Türkçe/İngilizce özet ve hata metinleri; `--json` alanları dilden bağımsız.

- [x] **Step 4: Run test to verify it passes**

### Task 6: Belgeler, sürüm ve tam doğrulama

**Files:**
- Modify: `README.md`, `docs/progress.md`, `docs/support-matrix.md`, `version.json`
- Create: `docs/reports/stage-six.md`

- [x] **Step 1:** Sürüm `0.1.0-dev.5`; README'ye kurulum komutları, kapsam dışı paketler ve güvenlik sınırı; rapora gerçek test çıktısı.
- [x] **Step 2:** `node --test` → tüm testler geçer; sayı çıktıdan yazılır.
- [ ] **Step 3:** İnceleme ve commit (ayrı onay).
