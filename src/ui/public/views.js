const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const short = hash => (typeof hash === 'string' && hash ? hash.slice(0, 12) : '—');
const lines = value => String(value ?? '').split('\n').map(line => line.trim()).filter(Boolean);
const badge = (text, tone = '') => `<span class="badge"${tone ? ` data-tone="${tone}"` : ''}>${esc(text)}</span>`;

function planRows(plan) {
  if (Array.isArray(plan.files)) {
    return plan.files.map(file => ({
      op: file.action,
      path: file.path,
      detail: file.beforeHash ? `${short(file.beforeHash)} → ${short(file.afterHash)}` : `yeni → ${short(file.afterHash)}`,
    }));
  }
  if (Array.isArray(plan.changes) && plan.changes.length) {
    return plan.changes.map(change => ({
      op: change.action,
      path: change.path,
      detail: change.count ? `${change.count} kayıt` : 'yapılandırma',
    }));
  }
  if (plan.action && plan.action !== 'none') {
    return [{
      op: plan.action,
      path: plan.target ?? 'yapılandırma',
      detail: plan.action === 'delete' ? 'oluşturulan dosya kaldırılacak' : 'önceki içerik geri gelecek',
    }];
  }
  return [];
}

export function ledger(plan, { summary = '', approveLabel = 'Uygula', approveAction = '', danger = true } = {}) {
  const rows = planRows(plan);
  return `
    <section class="ledger" aria-label="Değişiklik defteri">
      <h2>Değişiklik defteri</h2>
      <p class="ledger-summary">${esc(summary)}</p>
      ${rows.length ? `<ol>${rows.map((row, index) => `
        <li data-op="${esc(row.op)}" style="animation-delay:${Math.min(index, 8) * 25}ms">
          <span class="op">${esc(row.op)}</span>
          <span class="path">${esc(row.path)}</span>
          <span class="hash">${esc(row.detail)}</span>
        </li>`).join('')}</ol>` : '<p class="empty">Değişiklik yok.</p>'}
      <div class="actions">
        <button class="primary" type="button" data-action="${esc(approveAction)}">${esc(approveLabel)}</button>
        <span class="field-hint">Onay kimliği: <code class="mono">${esc(short(plan.id))}</code> · yedek ve geri alma kaydı oluşturulur.</span>
      </div>
    </section>`;
}

function table(caption, head, rows) {
  return `<div class="table-wrap"><table><caption>${esc(caption)}</caption><thead><tr>${head.map(cell => `<th>${esc(cell)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

export const views = {
  genel: {
    title: 'Genel bakış',
    subtitle: 'Ne seçili, ne uygulanmış, ne bekliyor. Panel salt okunur başlar; her yazma kendi onay defteriyle yapılır.',
    html: () => `
      <section class="panel">
        <h2>Durum</h2>
        <p class="hint">Sürüm tek kaynaktan okunur. Kayıtlar yalnızca bu makinede, proje içinde tutulur.</p>
        <dl class="status-list" data-slot="status"><div class="empty">Yükleniyor…</div></dl>
      </section>
      <section class="panel">
        <h2>Başla</h2>
        <p class="hint">Bir Git projesi seç, incelediğin beceri ve kural kaynaklarını göster; değişiklik defterini görmeden hiçbir şey yazılmaz.</p>
        <div class="actions"><button class="primary" type="button" data-action="to-project">Proje ayarına git</button></div>
      </section>`,
    async mount(root, ctx) {
      const status = await ctx.api('/api/status');
      ctx.setVersion(status.version.surum);
      ctx.setRoot(status.root);
      const state = (label, value, tone = '') => `<div class="status-row"><dt>${esc(label)}</dt><dd>${tone ? badge(value, tone) : esc(value)}</dd></div>`;
      root.querySelector('[data-slot="status"]').innerHTML = [
        state('Sürüm', status.version.surum),
        state('Kurulum kökü', status.root),
        state('Kaynaklar', `${status.counts.packages} paket · ${status.counts.clients} istemci`),
        state('OpenCode proje kaydı', status.state.opencode ? 'var' : 'yok', status.state.opencode ? 'ok' : ''),
        state('Güncelleme kaydı', status.state.updates ? 'var' : 'yok', status.state.updates ? 'ok' : ''),
      ].join('');
      root.querySelector('[data-action="to-project"]').addEventListener('click', () => ctx.go('proje'));
    },
  },

  kaynaklar: {
    title: 'Kaynaklar',
    subtitle: 'Katalogdaki dış kaynaklar ve hedef istemciler. Durumlar doğrulanana kadar “doğrulanmadı” kalır; bu bir kurulum kanıtı değildir.',
    html: () => `
      <section class="panel">
        <h2>Paketler</h2>
        <p class="hint">Sürüm ve lisans incelemesi bekliyor. Bir kaynağın listede olması uyumluluk iddiası değildir.</p>
        <div data-slot="packages"><p class="empty">Yükleniyor…</p></div>
      </section>
      <section class="panel">
        <h2>İstemciler</h2>
        <p class="hint">Beceri, MCP, hook ve kural yetenekleri ayrı ayrı doğrulanmamıştır.</p>
        <div data-slot="clients"><p class="empty">Yükleniyor…</p></div>
      </section>`,
    async mount(root, ctx) {
      const catalog = await ctx.api('/api/catalog');
      root.querySelector('[data-slot="packages"]').innerHTML = table('Paketler', ['Paket', 'Depo', 'Durum'], catalog.packages.map(item => `
        <tr>
          <td><strong>${esc(item.id)}</strong><div class="field-hint">${esc(item.role)}</div></td>
          <td><a class="mono" href="${esc(item.repository)}" rel="noreferrer">${esc(item.repository.replace('https://github.com/', ''))}</a></td>
          <td>${badge(item.status === 'unreviewed' ? 'incelenmedi' : item.status, 'warn')}</td>
        </tr>`));
      root.querySelector('[data-slot="clients"]').innerHTML = table('İstemciler', ['İstemci', 'Yetenekler', 'Durum'], catalog.clients.map(client => `
        <tr>
          <td><strong>${esc(client.label)}</strong><div class="field-hint">${esc(client.id)}</div></td>
          <td class="mono">${esc(Object.values(client.capabilities).join(' · '))}</td>
          <td>${badge('doğrulanmadı', 'warn')}</td>
        </tr>`));
    },
  },

  proje: {
    title: 'Proje ayarı',
    subtitle: 'Yalnızca gerçek .git dizini olan proje. Önce defteri incele; “Uygula” aynı önizleme kimliğiyle çalışır.',
    html: () => `
      <section class="panel">
        <h2>Proje ve kaynaklar</h2>
        <p class="hint">Mutlak yollar kullan. Her satır bir beceri klasörü veya bir .md kural dosyasıdır; kaynaklar önizlemede okunur.</p>
        <form data-form="project">
          <div class="grid">
            <div class="full">
              <label for="project-path">Proje yolu</label>
              <input id="project-path" name="project" autocomplete="off" spellcheck="false" placeholder="/Users/…/proje">
            </div>
            <div>
              <label for="project-skills">Beceri klasörleri</label>
              <textarea id="project-skills" name="skills" spellcheck="false" placeholder="/Users/…/skills/superpowers"></textarea>
            </div>
            <div>
              <label for="project-instructions">Kural dosyaları</label>
              <textarea id="project-instructions" name="instructions" spellcheck="false" placeholder="/Users/…/rules/AGENTS.md"></textarea>
            </div>
            <div class="full">
              <label class="check"><input type="checkbox" id="project-github"> GitHub MCP kaydını kapalı olarak ekle</label>
            </div>
          </div>
          <div class="actions">
            <button class="primary" type="submit">Önizle</button>
            <button class="ghost" type="button" data-action="rollback-preview">Geri alma önizle</button>
          </div>
        </form>
      </section>
      <div data-slot="project-ledger"></div>`,
    async mount(root, ctx) {
      const form = root.querySelector('[data-form="project"]');
      const slot = root.querySelector('[data-slot="project-ledger"]');
      const values = () => ({
        project: form.elements.project.value.trim(),
        skillDirectories: lines(form.elements.skills.value),
        instructionFiles: lines(form.elements.instructions.value),
        includeGitHub: root.querySelector('#project-github').checked,
      });
      let plan = null;
      let rollbackPlan = null;
      const show = (html, bind) => {
        slot.innerHTML = html;
        bind?.(slot);
      };
      form.addEventListener('submit', async event => {
        event.preventDefault();
        ctx.setFlash('');
        const input = values();
        try {
          const query = new URLSearchParams({ project: input.project });
          input.skillDirectories.forEach(path => query.append('skill-dir', path));
          input.instructionFiles.forEach(path => query.append('instruction', path));
          if (input.includeGitHub) query.set('github', '1');
          ctx.setBusy(form, true, 'Önizleniyor…');
          plan = await ctx.api(`/api/project/preview?${query}`);
          show(ledger(plan, { summary: `${plan.target} · önizleme · hiçbir dosya yazılmadı.`, approveLabel: 'Uygula', approveAction: 'apply' }), node => {
            const applyButton = node.querySelector('[data-action="apply"]');
            applyButton.addEventListener('click', async () => {
              applyButton.disabled = true;
              try {
                const result = await ctx.api('/api/project/apply', { method: 'POST', body: { ...values(), planId: plan.id } });
                ctx.setFlash(result.applied ? 'Proje ayarı yedek alınarak uygulandı. GitHub MCP kapalı kalır.' : 'Seçilen kayıtlar zaten mevcut; config yeniden yazılmadı.', result.applied ? 'ok' : 'info');
                if (result.applied) applyButton.textContent = 'Uygulandı';
                else applyButton.disabled = false;
              } catch (error) {
                ctx.setFlash(error.message, 'error');
                applyButton.disabled = false;
              }
            });
          });
        } catch (error) {
          ctx.setFlash(error.message, 'error');
        } finally {
          ctx.setBusy(form, false);
        }
      });
      root.querySelector('[data-action="rollback-preview"]').addEventListener('click', async () => {
        ctx.setFlash('');
        const input = values();
        if (!input.project) return ctx.setFlash('Önce proje yolunu gir.', 'warn');
        try {
          const result = await ctx.api(`/api/project/rollback-preview?project=${encodeURIComponent(input.project)}`);
          rollbackPlan = result.plan;
          if (!rollbackPlan) return show('<section class="ledger"><h2>Geri alma</h2><p class="empty">Kayıtlı proje işlemi yok; yazılacak bir şey bulunmuyor.</p></section>');
          const html = ledger(rollbackPlan, { summary: 'Son proje işlemi işlem öncesine dönecek. Oluşturulan config silinebilir.', approveLabel: 'Geri al', approveAction: 'rollback' });
          show(html, node => {
            const rollbackButton = node.querySelector('[data-action="rollback"]');
            rollbackButton.addEventListener('click', async () => {
              rollbackButton.disabled = true;
              try {
                const result = await ctx.api('/api/project/rollback', { method: 'POST', body: { project: input.project, planId: rollbackPlan.id } });
                ctx.setFlash(result.rolledBack ? 'Proje ayarı işlem öncesine döndürüldü; yedek korundu.' : 'Geri alma tamamlandı.', 'ok');
                rollbackButton.textContent = 'Geri alındı';
              } catch (error) {
                ctx.setFlash(error.message, 'error');
                rollbackButton.disabled = false;
              }
            });
          });
        } catch (error) {
          ctx.setFlash(error.message, 'error');
        }
      });
    },
  },

  guncelleme: {
    title: 'Güncelleme',
    subtitle: 'Yalnızca SeroAI’ın kendi dosyaları. Üçüncü taraf beceri paketleri kurulmaz; içerik onaydan ve yedekten sonra alınır.',
    html: () => `
      <section class="panel">
        <h2>Kaynak</h2>
        <p class="hint">Yerel klasör veya GitHub sürümü. GitHub dalı önce commit SHA’sına sabitlenir; token okunmaz.</p>
        <form data-form="update">
          <div class="grid">
            <div class="full">
              <label class="check"><input type="radio" name="kind" value="local" checked> Yerel klasör</label>
              <label class="check"><input type="radio" name="kind" value="github"> GitHub sürümü</label>
            </div>
            <div class="full">
              <label for="update-root">Kurulum kökü (SeroAI deposu)</label>
              <input id="update-root" name="root" autocomplete="off" spellcheck="false" placeholder="/Users/…/SeroAI">
            </div>
            <div class="full" data-field="local">
              <label for="update-local">Yeni sürüm klasörü</label>
              <input id="update-local" name="local" autocomplete="off" spellcheck="false" placeholder="/Users/…/SeroAI-yeni">
            </div>
            <div data-field="github">
              <label for="update-repo">Depo (sahip/ad)</label>
              <input id="update-repo" name="repo" autocomplete="off" spellcheck="false" placeholder="BeNKaYS/SeroAI">
            </div>
            <div data-field="github">
              <label for="update-ref">Dal (isteğe bağlı)</label>
              <input id="update-ref" name="ref" autocomplete="off" spellcheck="false" placeholder="main">
            </div>
          </div>
          <div class="actions">
            <button class="primary" type="submit">Kontrol et</button>
            <button class="ghost" type="button" data-action="rollback-preview">Geri alma önizle</button>
          </div>
        </form>
      </section>
      <div data-slot="update-ledger"></div>`,
    async mount(root, ctx) {
      const form = root.querySelector('[data-form="update"]');
      const slot = root.querySelector('[data-slot="update-ledger"]');
      const inputs = () => {
        const kind = form.querySelector('input[name="kind"]:checked').value;
        return {
          kind,
          root: form.elements.root.value.trim(),
          local: form.elements.local.value.trim(),
          repo: form.elements.repo.value.trim(),
          ref: form.elements.ref.value.trim(),
        };
      };
      const toggle = () => {
        const kind = inputs().kind;
        root.querySelectorAll('[data-field]').forEach(field => { field.hidden = field.dataset.field !== kind; });
      };
      form.querySelectorAll('input[name="kind"]').forEach(radio => radio.addEventListener('change', toggle));
      toggle();
      let plan = null;
      const show = (html, bind) => { slot.innerHTML = html; bind?.(slot); };
      form.addEventListener('submit', async event => {
        event.preventDefault();
        ctx.setFlash('');
        const input = inputs();
        if (!input.root) return ctx.setFlash('Kurulum kökünü gir.', 'warn');
        try {
          const query = new URLSearchParams({ root: input.root });
          if (input.kind === 'local') query.set('local', input.local); else { query.set('repo', input.repo); if (input.ref) query.set('ref', input.ref); }
          ctx.setBusy(form, true, 'Kontrol ediliyor…');
          plan = await ctx.api(`/api/update/preview?${query}`);
          if (!plan.available) { show('<section class="ledger"><h2>Güncelleme</h2><p class="empty">Kaynak sürümü mevcut sürümden yeni değil; yazılacak bir şey yok.</p></section>'); return; }
          const summary = `${plan.current.surum} → ${plan.candidate.surum} · ${plan.candidate.tarih} · ${plan.candidate.not}`;
          show(ledger(plan, { summary, approveLabel: 'Uygula', approveAction: 'apply' }), node => {
            const applyButton = node.querySelector('[data-action="apply"]');
            applyButton.addEventListener('click', async () => {
              applyButton.disabled = true;
              try {
                const source = input.kind === 'local' ? { kind: 'local', directory: input.local } : { kind: 'github', repository: input.repo, ...(input.ref ? { ref: input.ref } : {}) };
                const result = await ctx.api('/api/update/apply', { method: 'POST', body: { root: input.root, source, planId: plan.id } });
                ctx.setFlash(result.updated ? `Güncelleme uygulandı: ${result.version}. CLI’yi elle yeniden başlat.` : 'Güncelleme yok.', result.updated ? 'ok' : 'info');
                if (result.updated) applyButton.textContent = 'Uygulandı';
                else applyButton.disabled = false;
              } catch (error) {
                ctx.setFlash(error.message, 'error');
                applyButton.disabled = false;
              }
            });
          });
        } catch (error) {
          ctx.setFlash(error.message, 'error');
        } finally {
          ctx.setBusy(form, false);
        }
      });
      root.querySelector('[data-action="rollback-preview"]').addEventListener('click', async () => {
        ctx.setFlash('');
        const rootPath = inputs().root;
        if (!rootPath) return ctx.setFlash('Kurulum kökünü gir.', 'warn');
        try {
          const result = await ctx.api(`/api/update/rollback-preview?root=${encodeURIComponent(rootPath)}`);
          const rollbackPlan = result.plan;
          if (!rollbackPlan) return show('<section class="ledger"><h2>Geri alma</h2><p class="empty">Kayıtlı güncelleme yok; geri alınacak bir şey bulunmuyor.</p></section>');
          show(ledger(rollbackPlan, { summary: rollbackPlan.interrupted ? 'Yarım kalmış yazım saptandı; geri alma bu işlemi tamamlar.' : 'Son güncelleme işlem öncesine dönecek.', approveLabel: 'Geri al', approveAction: 'rollback' }), node => {
            const rollbackButton = node.querySelector('[data-action="rollback"]');
            rollbackButton.addEventListener('click', async () => {
              rollbackButton.disabled = true;
              try {
                await ctx.api('/api/update/rollback', { method: 'POST', body: { root: rootPath, planId: rollbackPlan.id } });
                ctx.setFlash('Güncelleme işlem öncesine döndürüldü; yedek korundu. CLI’yi elle yeniden başlat.', 'ok');
                rollbackButton.textContent = 'Geri alındı';
              } catch (error) {
                ctx.setFlash(error.message, 'error');
                rollbackButton.disabled = false;
              }
            });
          });
        } catch (error) {
          ctx.setFlash(error.message, 'error');
        }
      });
    },
  },

  profil: {
    title: 'Profil',
    subtitle: 'Sır içermeyen taşınabilir seçim. Dosya yalnızca tarayıcıdan indirilir; sunucu profil yazmaz.',
    html: () => `
      <section class="panel">
        <h2>Dışa aktar</h2>
        <p class="hint">Yalnızca mantıksal seçimler ve kaynak anahtarları saklanır; mutlak yol, token veya ham ayar dosyaya girmez.</p>
        <form data-form="export">
          <div class="grid">
            <div class="full">
              <label for="export-name">Profil adı</label>
              <input id="export-name" name="name" value="SeroAI profili" maxlength="80">
            </div>
            <div class="full">
              <p class="group-title">İstemciler</p>
              <div class="checklist" data-slot="export-clients"><p class="empty">Yükleniyor…</p></div>
            </div>
            <div class="full">
              <p class="group-title">Paketler</p>
              <div class="checklist" data-slot="export-packages"><p class="empty">Yükleniyor…</p></div>
            </div>
            <div class="full">
              <label for="export-sources">Kaynak anahtarları (her satır: anahtar:skill veya anahtar:instruction)</label>
              <textarea id="export-sources" name="sources" spellcheck="false" placeholder="superpowers:skill&#10;team-rules:instruction"></textarea>
            </div>
            <div class="full">
              <label class="check"><input type="checkbox" id="export-github"> GitHub MCP’yi kapalı kayıt olarak ekle</label>
            </div>
          </div>
          <div class="actions"><button class="primary" type="submit">JSON indir</button></div>
        </form>
      </section>
      <section class="panel">
        <h2>Geri yükle</h2>
        <p class="hint">Profil dosyasını ve her kaynak anahtarı için yeni mutlak yolu ver. Uygulama mevcut OpenCode proje akışıdır.</p>
        <form data-form="restore">
          <div class="grid">
            <div class="full">
              <label for="restore-file">Profil dosyası</label>
              <input id="restore-file" name="file" type="file" accept="application/json,.json">
            </div>
            <div class="full">
              <label for="restore-project">Proje yolu</label>
              <input id="restore-project" name="project" autocomplete="off" spellcheck="false" placeholder="/Users/…/proje">
            </div>
            <div class="full">
              <label for="restore-mappings">Eşlemeler (her satır: anahtar=/mutlak/yol)</label>
              <textarea id="restore-mappings" name="mappings" spellcheck="false" placeholder="superpowers=/Users/…/skills&#10;team-rules=/Users/…/rules/AGENTS.md"></textarea>
            </div>
          </div>
          <div class="actions"><button class="primary" type="submit">Önizle</button></div>
        </form>
      </section>
      <div data-slot="profile-ledger"></div>`,
    async mount(root, ctx) {
      const catalog = await ctx.api('/api/catalog');
      const clientSlot = root.querySelector('[data-slot="export-clients"]');
      const packageSlot = root.querySelector('[data-slot="export-packages"]');
      clientSlot.innerHTML = catalog.clients.map(client => `<label class="check"><input type="checkbox" name="clients" value="${esc(client.id)}"> ${esc(client.label)}</label>`).join('');
      packageSlot.innerHTML = catalog.packages.map(item => `<label class="check"><input type="checkbox" name="packages" value="${esc(item.id)}"> ${esc(item.id)}</label>`).join('');
      const exportForm = root.querySelector('[data-form="export"]');
      const restoreForm = root.querySelector('[data-form="restore"]');
      const slot = root.querySelector('[data-slot="profile-ledger"]');
      exportForm.addEventListener('submit', async event => {
        event.preventDefault();
        ctx.setFlash('');
        try {
          const body = {
            name: exportForm.elements.name.value,
            clients: [...exportForm.querySelectorAll('input[name="clients"]:checked')].map(input => input.value),
            packages: [...exportForm.querySelectorAll('input[name="packages"]:checked')].map(input => input.value),
            sources: lines(exportForm.elements.sources.value),
            includeGitHub: root.querySelector('#export-github').checked,
          };
          ctx.setBusy(exportForm, true, 'Hazırlanıyor…');
          const profile = await ctx.api('/api/profile/export', { method: 'POST', body });
          const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'seroai-profile.json';
          link.click();
          URL.revokeObjectURL(link.href);
          ctx.setFlash('Profil JSON’u indirildi. Dosyayı yalnızca güvendiğin yerde sakla.', 'ok');
        } catch (error) {
          ctx.setFlash(error.message, 'error');
        } finally {
          ctx.setBusy(exportForm, false);
        }
      });
      let plan = null;
      restoreForm.addEventListener('submit', async event => {
        event.preventDefault();
        ctx.setFlash('');
        try {
          const file = restoreForm.elements.file.files[0];
          if (!file) return ctx.setFlash('Önce profil dosyasını seç.', 'warn');
          const profile = JSON.parse(await file.text());
          const body = {
            profile,
            project: restoreForm.elements.project.value.trim(),
            mappings: lines(restoreForm.elements.mappings.value),
          };
          ctx.setBusy(restoreForm, true, 'Önizleniyor…');
          plan = await ctx.api('/api/profile/preview', { method: 'POST', body });
          const deferred = plan.deferredClients.length ? ` · ertelenen: ${plan.deferredClients.join(', ')}` : '';
          slot.innerHTML = ledger(plan, { summary: `${plan.target}${deferred}`, approveLabel: 'Geri yükle', approveAction: 'apply' });
          slot.querySelector('[data-action="apply"]').addEventListener('click', async button => {
            button.disabled = true;
            try {
              const result = await ctx.api('/api/profile/restore', { method: 'POST', body: { ...body, planId: plan.id } });
              ctx.setFlash(result.applied ? 'Profil yedek alınarak uygulandı; diğer istemciler ertelendi.' : 'Seçilen kayıtlar zaten mevcut.', result.applied ? 'ok' : 'info');
            } catch (error) {
              ctx.setFlash(error.message, 'error');
              button.disabled = false;
            }
          });
        } catch (error) {
          ctx.setFlash(error.message || 'Profil dosyası okunamadı.', 'error');
        } finally {
          ctx.setBusy(restoreForm, false);
        }
      });
    },
  },

  hakkinda: {
    title: 'Hakkında',
    subtitle: 'Sürüm, sınırlar ve geliştirici bilgisi. Bu panel yerel çalışır; dış ağa istek atmaz.',
    html: () => `
      <section class="panel">
        <h2>SeroAI</h2>
        <div class="about-grid">
          <p class="hint">Ajan becerilerini, kurallarını ve MCP bağlantılarını tek yerden yöneten, onay ve yedek odaklı yerel araç. Lisans dosyası henüz eklenmedi; yeniden dağıtım hakkı verilmiş sayılmaz.</p>
          <dl class="status-list">
            <div class="status-row"><dt>Sürüm</dt><dd id="about-version">—</dd></div>
            <div class="status-row"><dt>Kapsam</dt><dd>OpenCode V2 proje ayarı; diğer istemciler manuel</dd></div>
            <div class="status-row"><dt>Veri</dt><dd>Token, sohbet, hafıza ve yerel model okunmaz</dd></div>
          </dl>
        </div>
      </section>
      <section class="panel">
        <h2>Geliştirici</h2>
        <div class="developer">
          <div>
            <p class="name">Sercan ÖZDEMİR (@BeNKaYS)</p>
            <p>Bilişim Teknolojileri Öğretmeni</p>
            <p class="hint">Eğitim ve yazılımı birleştiren, algoritmalar ve makine öğrenmesi üzerine projeler geliştiren bir yazılım öğretmeni.</p>
            <p><a href="mailto:sercanozdemir@yandex.com">sercanozdemir@yandex.com</a> · <a href="https://github.com/BeNKaYS" rel="noreferrer">github.com/BeNKaYS</a></p>
          </div>
        </div>
      </section>`,
    async mount(root, ctx) {
      const status = await ctx.api('/api/status');
      ctx.setVersion(status.version.surum);
      root.querySelector('#about-version').textContent = status.version.surum;
    },
  },
};
