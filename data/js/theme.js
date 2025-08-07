import { getSetting, setSetting } from './idb.js';

const root = document.documentElement;

function updateMetaThemeColor(){
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const computed = getComputedStyle(root);
  const bg = computed.getPropertyValue('--bg').trim() || '#000000';
  meta.setAttribute('content', bg);
}

function applyTheme(theme) {
  let t = theme;
  if (t === 'system') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', t);
  updateMetaThemeColor();
}

export async function initTheme() {
  const theme = await getSetting('theme', 'light');
  applyTheme(theme);

  // React to system changes when "system" is selected
  const mql = matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener?.('change', async () => {
    const saved = await getSetting('theme', 'light');
    if (saved === 'system') applyTheme('system');
  });

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', async () => {
      const cur = root.getAttribute('data-theme') || 'light';
      const next = cur === 'light' ? 'dark' : 'light';
      applyTheme(next);
      await setSetting('theme', next);
    });
  }
}

initTheme();

// Font size + accessibility from settings page
export async function applyEditorPrefs() {
  const fontSize = await getSetting('fontSize', 16);
  root.style.setProperty('--editor-font-size', `${fontSize}px`);
  const highContrast = await getSetting('highContrast', false);
  root.style.setProperty('--border', highContrast ? '#8f8d9f' : getComputedStyle(root).getPropertyValue('--border'));
}
