import { views } from './views.js';

const token = new URLSearchParams(location.search).get('token') ?? '';
const nav = document.getElementById('nav');
const view = document.getElementById('view');
const flash = document.getElementById('flash');
const rootLabel = document.getElementById('root');
const versionLabel = document.getElementById('version');
const themeButton = document.getElementById('theme');
const order = ['genel', 'kaynaklar', 'proje', 'guncelleme', 'profil', 'hakkinda'];
const labels = {
  genel: 'Genel bakış',
  kaynaklar: 'Kaynaklar',
  proje: 'Proje',
  guncelleme: 'Güncelleme',
  profil: 'Profil',
  hakkinda: 'Hakkında',
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function routeName() {
  const name = location.hash.replace(/^#/, '');
  return views[name] ? name : 'genel';
}

function setFlash(message, tone = 'info') {
  flash.textContent = message;
  flash.dataset.tone = tone;
  flash.hidden = !message;
}

function setVersion(value) {
  versionLabel.textContent = value ? `v${value}` : '—';
}

function setRoot(value) {
  rootLabel.textContent = value || '—';
  rootLabel.title = value || '';
}

async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: { 'x-seroai-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Panele ulaşılamadı. Sunucu hâlâ çalışıyor mu?');
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message ?? 'İşlem tamamlanamadı; hiçbir şey yazılmadı.';
    const error = new Error(message);
    error.code = payload?.error?.code ?? 'INTERNAL_ERROR';
    throw error;
  }
  return payload;
}

function setBusy(form, busy, label = '') {
  const buttons = form.querySelectorAll('button');
  buttons.forEach(button => {
    if (busy) {
      button.dataset.label = button.textContent;
      button.disabled = true;
      if (button.type === 'submit') button.textContent = label || 'Çalışıyor…';
    } else {
      button.disabled = false;
      if (button.dataset.label) button.textContent = button.dataset.label;
    }
  });
}

function go(route) {
  location.hash = `#${route}`;
}

const ctx = { api, go, setFlash, setBusy, setVersion, setRoot, refresh: () => render() };

function buildNav() {
  nav.innerHTML = order.map(name => `<button type="button" data-route="${name}">${esc(labels[name])}</button>`).join('');
  nav.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => go(button.dataset.route));
  });
}

function markNav(current) {
  nav.querySelectorAll('button').forEach(button => {
    if (button.dataset.route === current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeButton.textContent = dark ? 'Açık mod' : 'Koyu mod';
  themeButton.setAttribute('aria-pressed', String(dark));
}

async function render() {
  const name = routeName();
  const screen = views[name];
  setFlash('');
  if (!token) {
    view.innerHTML = `<div class="screen-head"><h1>Oturum belirteci yok</h1><p class="subtitle">Paneli terminalden <code class="mono">node src/cli/main.mjs ui</code> ile yeniden başlat ve yazdırılan adresi aç.</p></div>`;
    return;
  }
  view.innerHTML = `
    <div class="screen-head">
      <h1>${esc(screen.title)}</h1>
      <p class="subtitle">${esc(screen.subtitle)}</p>
    </div>
    ${screen.html(ctx)}`;
  markNav(name);
  view.focus({ preventScroll: true });
  try {
    await screen.mount?.(view, ctx);
  } catch (error) {
    setFlash(error.message, 'error');
  }
  view.classList.remove('view-enter');
  requestAnimationFrame(() => view.classList.add('view-enter'));
}

const storedTheme = localStorage.getItem('seroai-theme');
applyTheme(storedTheme ? storedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
themeButton.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  applyTheme(dark);
  localStorage.setItem('seroai-theme', dark ? 'dark' : 'light');
});

buildNav();
window.addEventListener('hashchange', render);
render();
