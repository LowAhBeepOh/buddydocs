import { getSetting, setSetting } from './idb.js';

const root = document.documentElement;

function applyTheme(theme) {
  let t = theme;
  if (t === 'system') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', t);
}

export async function initTheme() {
  const theme = await getSetting('theme', 'light');
  applyTheme(theme);

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
