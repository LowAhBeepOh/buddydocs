import { getSetting, setSetting } from './idb.js';

const root = document.documentElement;

function updateMetaThemeColor(){
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const computed = getComputedStyle(root);
  const bg = computed.getPropertyValue('--bg').trim() || '#000000';
  meta.setAttribute('content', bg);
}

export function applyClassicTheme(theme) {
  let t = theme;
  if (t === 'system') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', t);
  root.style = ''; // Clear dynamic styles
  updateMetaThemeColor();
}

export function generateDynamicTheme(hue, mode, scheme) {
  const isLight = mode === 'light';
  const baseSat = 75;
  const baseLight = isLight ? 97 : 8;

  const theme = {
    '--bg': `hsl(${hue}, 20%, ${baseLight}%)`,
    '--surface': `hsl(${hue}, 15%, ${isLight ? 94 : 14}%)`,
    '--primary': `hsl(${hue}, ${baseSat}%, ${isLight ? 50 : 65}%)`,
    '--text': `hsl(${hue}, 10%, ${isLight ? 10 : 90}%)`,
    '--muted': `hsl(${hue}, 8%, ${isLight ? 45 : 65}%)`,
    '--border': `hsl(${hue}, 10%, ${isLight ? 85 : 20}%)`,
  };

  let accentHue2 = hue;
  switch (scheme) {
    case 'vivid':
      accentHue2 = (hue + 60) % 360;
      break;
    case 'expressive':
      accentHue2 = (hue + 20) % 360; // Warmer color
      break;
    case 'normal':
    default:
      accentHue2 = (hue + 30) % 360;
      break;
  }

  if (scheme === 'expressive') {
    // Only primary and a warm accent
    theme['--secondary'] = `hsl(${accentHue2}, ${baseSat - 10}%, ${isLight ? 60 : 55}%)`;
  } else if (scheme !== 'normal') {
    theme['--secondary'] = `hsl(${accentHue2}, ${baseSat - 15}%, ${isLight ? 60 : 55}%)`;
  }

  return theme;
}

export function applyDynamicTheme(hue, mode, scheme) {
  const theme = generateDynamicTheme(hue, mode, scheme);
  root.removeAttribute('data-theme'); // Remove classic theme attribute
  for (const [prop, value] of Object.entries(theme)) {
    root.style.setProperty(prop, value);
  }
  updateMetaThemeColor();
}

export async function initTheme() {
  const useDynamicTheme = await getSetting('useDynamicTheme', false);

  if (useDynamicTheme) {
    const hue = await getSetting('dynamicThemeHue', 220);
    const mode = await getSetting('dynamicThemeMode', 'light');
    const scheme = await getSetting('dynamicThemeScheme', 'normal');
    applyDynamicTheme(hue, mode, scheme);
  } else {
    const theme = await getSetting('theme', 'light');
    applyClassicTheme(theme);
  }

  // React to system changes when "system" is selected for classic theme
  const mql = matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener?.('change', async () => {
    const useDynamic = await getSetting('useDynamicTheme', false);
    if (useDynamic) return;
    const saved = await getSetting('theme', 'light');
    if (saved === 'system') applyClassicTheme('system');
  });

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', async () => {
      const cur = root.getAttribute('data-theme') || 'light';
      const next = cur === 'light' ? 'dark' : 'light';
      applyClassicTheme(next);
      await setSetting('theme', next);
      await setSetting('useDynamicTheme', false); // Switch off dynamic theme
    });
  }
}

initTheme();

// Font size + accessibility from settings page
export async function applyEditorPrefs() {
  const fontSize = await getSetting('fontSize', 16);
  root.style.setProperty('--editor-font-size', `${fontSize}px`);
  const highContrast = await getSetting('highContrast', false);
  // This needs to be smarter when using dynamic themes
  if (!await getSetting('useDynamicTheme', false)) {
    root.style.setProperty('--border', highContrast ? '#8f8d9f' : getComputedStyle(root).getPropertyValue('--border'));
  }
}
