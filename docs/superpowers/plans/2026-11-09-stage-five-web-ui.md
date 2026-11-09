# SeroAI yerel web arayüzü — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `seroai ui` ile mevcut Node çekirdeğini tarayıcıda kullandıran, onay/yedek/geri alma sözleşmesini değiştirmeyen yerel bir panel eklemek.

**Architecture:** Node.js `node:http` ile 127.0.0.1'e bağlanan, oturum belirteçli bir sunucu; statik dosyalar `src/ui/public/` altında derlemesiz servis edilir; API uçları mevcut plan/apply/rollback fonksiyonlarını çağırır ve her yazma önizleme kimliğini yeniden doğrular.

**Tech Stack:** Node.js 22+ ESM, `node:http`, `node:crypto`, saf HTML/CSS/ES modülleri, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-09-local-web-ui-design.md`

## Global Constraints

- Sessiz yazma yok: her mutasyon `planId` ister ve uç noktada plan yeniden hesaplanır; eşleşmezse `STALE_PLAN`.
- Varsayılan bağlantı `127.0.0.1`; oturum başına 64 hex belirteç; `GET` dışı isteklerde belirteç + `Origin` + `Sec-Fetch-Site` uyumu.
- Gövde sınırı 256 KiB; `Content-Type: application/json` zorunlu; bilinmeyen alan reddi.
- Dış ağ, telemetri, üçüncü taraf betik, ağ fontu ve ham config/token gösterimi yok.
- Türkçe arayüz; kod, dosya ve komut adları İngilizce.
- Yeni çalışma zamanı bağımlılığı yok; `npm ci --ignore-scripts` değişmez.
- Testler yalnızca geçici klasörlerde çalışır; gerçek kullanıcı ayarına yazım yok.
- Tarayıcı/etkileşim kontrolü ayrı onay ister.
- Commit/push yalnızca kullanıcının açık onayıyla.

## Review Focus

1. Önizlemeden sonra dosya değişirse eski `planId` ile yazma → `STALE_PLAN`, hedefe sıfır yazım.
2. Belirteçsiz veya farklı `Origin`'li yazma isteği → çekirdek çağrılmadan 401/403.
3. Bozuk/aşırı büyük gövde → 400/413, yarım uygulama yok.
4. `workspace`/`project` sorgusunda symlink veya `..` → güvenli hata, kök dışı okuma yok.
5. Yazma sırasında süreç kesilirse → sonraki `planUpdateRollback`/`planOpenCodeRollback` pending durumu görür; arayüz `RECOVERY_REQUIRED`/`WORKSPACE_BUSY` durumunu açıklar, yutkunmaz.

---

### Task 1: HTTP çekirdeği ve güvenlik

**Files:**
- Create: `src/ui/server.mjs`, `src/ui/static.mjs`, `tests/ui-server.test.mjs`
- Modify: `src/cli/messages.mjs` (yalnızca `UI_*` hata kodları)

**Interfaces:**
- Consumes: `src/core/safe-files.mjs` (`failure`), `src/cli/messages.mjs` (`messages.tr`).
- Produces:
  - `createUiServer({ root, port = 0, host = '127.0.0.1', publicDirectory }) -> Promise<{ url, port, token, close }>`
  - `staticEntry(pathname) -> { file, type } | null` (yalnızca izinli adlar).

- [x] **Step 1: Write the failing test**

`tests/ui-server.test.mjs`: sunucuyu `port: 0` ile başlat; `url`'e `fetch` ile:
  - `GET /` 200, `content-type: text/html`, gövdede `SeroAI` ve satır içi `<script>` yok.
  - `GET /../package.json`, `/public/app.js`, `/%2e%2e/` → 404.
  - Belirteçsiz `POST /api/echo` → 401; doğru belirteç + yanlış `Origin` → 403; `content-type: text/plain` → 415; 300 KiB gövde → 413.
  - `GET /api/missing` → 404 JSON `{ error: { code: 'UI_NOT_FOUND' } }`.
  - Yanıt başlıklarında `content-security-policy` ve `x-content-type-options: nosniff` var.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-server.test.mjs`
Expected: FAIL — `src/ui/server.mjs` yok.

- [x] **Step 3: Implement `src/ui/server.mjs` and `src/ui/static.mjs`**

`staticEntry`: yalnızca `index.html`, `app.css`, `app.js`, `views.js` adlarını kabul eder; başka her yol `null`. `createUiServer` rastgele 64 hex belirteç üretir, `node:http` sunucusunu dinlemeye alır, her istekte yolu sorgudan ayırır, 256 KiB gövde sınırı uygular, güvenlik başlıklarını yazar ve `close()` ile kapatır. API yönlendirmesi bu görevde yoktur; bilinmeyen `/api/*` `UI_NOT_FOUND` döndürür.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui-server.test.mjs`
Expected: PASS.

### Task 2: Okuma API'si

**Files:**
- Create: `src/ui/routes.mjs`, `tests/ui-api-read.test.mjs`
- Modify: `src/ui/server.mjs` (yönlendirmeyi `routes.mjs`'e bağla)

**Interfaces:**
- Consumes: `loadCatalog`, `inspectManagedWorkspace`, `planOpenCodeProject`, `planOpenCodeRollback`, `planUpdate`, `validateProfile`, `profileSources`.
- Produces: `handleApi({ request, url, root, messages }) -> Promise<{ status, body }>`; uçlar:
  - `GET /api/status` → `{ version, counts: { packages, clients }, root }`
  - `GET /api/catalog` → `{ packages, clients }`
  - `GET /api/inspect?workspace=` → inspection
  - `GET /api/project/preview?project=&skill-dir=&instruction=&github=1` → proje planı
  - `GET /api/project/rollback-preview?project=` → rollback planı veya `null`
  - `GET /api/update/preview?root=&local=` veya `&repo=&ref=` → güncelleme planı
  - `POST /api/profile/preview` `{ profile, mappings }` → proje planı + `deferredClients`

- [x] **Step 1: Write the failing test**

`tests/ui-api-read.test.mjs`: geçici kökte `version.json`, `catalog/*`, gerçek `.git` dizinli proje ve beceri klasörü oluştur. Sunucuya belirteçle istek at:
  - `/api/status` sürümü ve sayıları döndürür; `.env` veya token içermez.
  - `/api/catalog` 7 paket/12 istemci döndürür.
  - `/api/project/preview` `changesApplied: false` ve 64 hex `id` döndürür; proje config'i yazılmaz.
  - `project=relative` → 400 `INVALID_PROJECT`; `skill-dir` symlink → `UNSAFE_PATH`/`UNSAFE_FILE`.
  - `/api/update/preview` yerel kaynakla `available: true` döndürür; içerik okunmaz (fixture'da payload dosyası sonradan bozulsa bile yanıt aynı kalır).

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-api-read.test.mjs`
Expected: FAIL — uçlar yok.

- [x] **Step 3: Implement read routes in `src/ui/routes.mjs`**

Sorgu parametrelerini `URLSearchParams` ile oku; mutlak yol doğrulamasını çekirdeğe bırak; her hata `{ code, message }` biçiminde döner. `deferredClients` için `profileSources` kullan.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui-api-read.test.mjs`
Expected: PASS.

### Task 3: Yazma API'si

**Files:**
- Create: `tests/ui-api-write.test.mjs`
- Modify: `src/ui/routes.mjs`

**Interfaces:**
- Produces:
  - `POST /api/project/apply` `{ project, skillDirectories, instructionFiles, includeGitHub, planId }`
  - `POST /api/project/rollback` `{ project, planId }`
  - `POST /api/update/apply` `{ root, source, planId }`
  - `POST /api/update/rollback` `{ root, planId }`
  - `POST /api/recover/apply` `{ workspace, planId }`
  - `POST /api/profile/restore` `{ profile, mappings, project, planId }`

- [x] **Step 1: Write the failing test**

`tests/ui-api-write.test.mjs`: her uç için önce önizleme al, sonra:
  - `planId` yok/yanlış → 400 `APPROVAL_REQUIRED`/`STALE_PLAN`; hedef dosya değişmez; `.git/seroai` oluşmaz.
  - Doğru `planId` → `changesApplied: true`; yedek oluşur.
  - Önizlemeden sonra hedefi elle değiştir → `STALE_PLAN` veya `CONFLICT`, kullanıcı düzeni korunur.
  - Gövdede bilinmeyen alan (`token`) → 400 `INVALID_ARGUMENTS`.
  - Profil geri yükleme: `deferredClients` döner ve OpenCode dışı istemci yazılmaz.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-api-write.test.mjs`
Expected: FAIL — yazma uçları yok.

- [x] **Step 3: Implement write routes**

Her uç önce aynı girdilerle planı yeniden üretir, `plan.id !== planId` ise `STALE_PLAN` atar, sonra mevcut apply/rollback fonksiyonunu çağırır. Ek yazma yolu açılmaz.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui-api-write.test.mjs`
Expected: PASS.

### Task 4: Arayüz kabuğu ve ekranlar

**Files:**
- Create: `src/ui/public/index.html`, `src/ui/public/app.css`, `src/ui/public/app.js`, `src/ui/public/views.js`, `tests/ui-static.test.mjs`
- Modify: `src/ui/static.mjs` (dosya listesi)

**Interfaces:**
- Consumes: Task 1–3 uçları; belirteci `location.search`'ten okur, her istekte `X-SeroAI-Token` gönderir.
- Produces: altı görünüm — Genel bakış, Kaynaklar, Proje, Güncelleme, Profil, Hakkında.

- [x] **Step 1: Write the failing test**

`tests/ui-static.test.mjs`:
  - `GET /` yalnızca beyaz listedeki dosyaları ister; gövdede `http://`/`https://` dış URL, satır içi `<script>`, `<style>` yok.
  - `app.js` yalnızca aynı kökene istek atar; `fetch(` çağrıları `./api` veya `/api` ile başlar.
  - `app.css` `--accent`, `--ground`, `--surface` değişkenlerini ve `prefers-color-scheme` ile `prefers-reduced-motion` bloklarını içerir.
  - Düğmelerde `aria-*`, onay defterinde `role="status"`/`aria-live` var.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-static.test.mjs`
Expected: FAIL — dosyalar yok.

- [x] **Step 3: Implement shell and screens**

Sol 232 px ray, üstte kök/sürüm, ana içerik. Değişiklik defteri: dosya, eylem, hash kısaltması, yedek satırı; tek birincil "Uygula" düğmesi plan kimliğiyle. Koyu/açık mod, görünür odak, `aria-live` hata alanı. Grafik süsleme ve dış varlık yok.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui-static.test.mjs`
Expected: PASS.

### Task 5: CLI `ui` komutu

**Files:**
- Create: `src/cli/ui.mjs`, `tests/ui-cli.test.mjs`
- Modify: `src/cli/main.mjs`, `src/cli/messages.mjs`

**Interfaces:**
- Produces: `runUi(options, messages) -> Promise<string>`; `--root <mutlak>`, `--port <0-65535>`, `--no-open`, `--json`.

- [x] **Step 1: Write the failing test**

`tests/ui-cli.test.mjs`:
  - `ui --json --no-open --port 0` ilk satırda `{ url, port }` yazar; `port` 1–65535, `url` `http://127.0.0.1:` ile başlar; süreç kapatılır.
  - `ui --port 70000`, `ui --root relative`, `ui --no-open --no-open` → `INVALID_ARGUMENTS`.
  - `help` çıktısı `ui` satırını içerir; `--lang en` İngilizce karşılığını verir.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-cli.test.mjs`
Expected: FAIL — komut yok.

- [x] **Step 3: Implement command**

`createUiServer`'ı başlat, adresi yaz, `--no-open` yoksa platforma göre tarayıcı aç (`open`/`xdg-open`/`start`), `SIGINT`/`SIGTERM` ile temiz kapan. `--json` modunda tek satır JSON.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui-cli.test.mjs`
Expected: PASS.

### Task 6: Belgeler, sürüm ve tam doğrulama

**Files:**
- Modify: `README.md`, `docs/progress.md`, `docs/support-matrix.md`, `version.json`
- Create: `docs/reports/stage-five.md`

- [x] **Step 1: Update docs and version**

Sürüm `0.1.0-dev.4`; README'ye `ui` kullanımı, güvenlik sınırı ve onay akışı; support-matrix'e panelin yalnızca mevcut OpenCode uyarlamasını kullandığı; `docs/reports/stage-five.md`'ye test kanıtı ve sınırlar.

- [x] **Step 2: Run the full suite**

Run: `node --test`
Expected: tüm testler geçer; sayı rapora gerçek çıktıdan yazılır.

- [ ] **Step 3: Review and commit (onay sonrası)**

Kod incelemesi ve kullanıcı onayı olmadan commit/push yapılmaz.
