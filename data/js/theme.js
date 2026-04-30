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
    // Alias tokens used by components
    '--text-primary': `hsl(${hue}, 10%, ${isLight ? 10 : 90}%)`,
    '--text-secondary': `hsl(${hue}, 8%, ${isLight ? 45 : 65}%)`,
    '--bg-image': 'none',
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
    theme['--bg'] = `hsl(${hue}, ${isLight ? 30 : 24}%, ${baseLight}%)`;
    theme['--surface'] = `hsl(${hue}, ${isLight ? 20 : 16}%, ${isLight ? 94 : 14}%)`;
    theme['--primary'] = `hsl(${hue}, ${Math.min(baseSat + 15, 95)}%, ${isLight ? 52 : 66}%)`;
    theme['--secondary'] = `hsl(${accentHue2}, ${Math.min(baseSat + 5, 90)}%, ${isLight ? 58 : 58}%)`;
    theme['--bg-image'] = 'none';
  } else if (scheme === 'vivid') {
    theme['--primary'] = `hsl(${hue}, ${Math.min(baseSat + 10, 90)}%, ${isLight ? 50 : 65}%)`;
    theme['--secondary'] = `hsl(${accentHue2}, ${baseSat - 15}%, ${isLight ? 60 : 55}%)`;
    const g1 = `hsl(${hue}, 22%, ${isLight ? 98 : 12}%)`;
    const g2 = `hsl(${accentHue2}, 18%, ${isLight ? 94 : 14}%)`;
    theme['--bg-image'] = `linear-gradient(135deg, ${g1}, ${g2})`;
  } else {
    theme['--bg-image'] = 'none';
    theme['--secondary'] = `hsl(${accentHue2}, ${baseSat - 15}%, ${isLight ? 60 : 55}%)`;
  }

  // Ensure notes have proper contrast in dynamic themes
  if (isLight) {
    Object.assign(theme, {
      '--note-default-bg': '#E6E4F4',
      '--note-default-border': '#C9C5E0',
      '--note-red-bg': '#F4D8D8',
      '--note-red-border': '#E0B0B0',
      '--note-blue-bg': '#D8E4F4',
      '--note-blue-border': '#B0C0E0',
      '--note-green-bg': '#D8F4D8',
      '--note-green-border': '#B0E0B0',
      '--note-yellow-bg': '#F4F4D8',
      '--note-yellow-border': '#E0E0B0',
    });
  } else {
    Object.assign(theme, {
      '--note-default-bg': '#2a2735',
      '--note-default-border': '#4a455c',
      '--note-red-bg': '#4d2424',
      '--note-red-border': '#7a3a3a',
      '--note-blue-bg': '#1a2c4d',
      '--note-blue-border': '#2a4a7d',
      '--note-green-bg': '#1a4d2c',
      '--note-green-border': '#2a7d4a',
      '--note-yellow-bg': '#4d4d1a',
      '--note-yellow-border': '#7d7d2a',
    });
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

  await initAppFont();

  // Initialize squircle borders setting
  await initSquircleBorders();
}

// Initialize squircle borders from saved setting
async function initSquircleBorders() {
  const useSquircleBorders = await getSetting('useSquircleBorders', false);
  const root = document.documentElement;
  if (useSquircleBorders) {
    root.setAttribute('data-corner-shape', 'squircle');
  } else {
    root.removeAttribute('data-corner-shape');
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

let customFontStyleEl;
export async function initAppFont() {
  const family = await getSetting('appFontFamily', 'Inter Tight');
  if (family === 'Custom') {
    const name = await getSetting('customFontName', 'Custom Font');
    const fmt = await getSetting('customFontFormat', 'ttf');
    const data = await getSetting('customFontData', '');
    if (data) {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const mime = fmt === 'woff2' ? 'font/woff2' : fmt === 'woff' ? 'font/woff' : fmt === 'otf' ? 'font/otf' : 'font/ttf';
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      if (!customFontStyleEl) {
        customFontStyleEl = document.createElement('style');
        customFontStyleEl.id = 'bd-custom-font-style';
        document.head.appendChild(customFontStyleEl);
      }
      const cssFmt = fmt === 'ttf' ? 'truetype' : fmt === 'otf' ? 'opentype' : fmt;
      customFontStyleEl.textContent = `@font-face{font-family:'${name}';src:url('${url}') format('${cssFmt}');font-weight:400;font-style:normal;font-display:swap}`;
      root.style.setProperty('--bd-font-family', `'${name}', system-ui, Inter, Roboto, -apple-system, Helvetica, Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`);
      return;
    }
  }
  let stack = '';
  if (family === 'System UI') {
    stack = `system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Noto Color Emoji'`;
  } else if (family === 'OpenDyslexic') {
    await ensureWebFontLoaded('OpenDyslexic');
    stack = `'OpenDyslexic','OpenDyslexicRegular','OpenDyslexic3', system-ui, Inter, Roboto, -apple-system, Helvetica, Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
  } else {
    await ensureWebFontLoaded(family);
    stack = `'${family}', system-ui, Inter, Roboto, -apple-system, Helvetica, Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
  }
  root.style.setProperty('--bd-font-family', stack);
}

const ALLOWED_GOOGLE_FONTS = new Set([
  'Inter Tight',
  'Inter',
  'Roboto',
  'Poppins',
  'DM Sans',
  'Open Sans',
  'Nunito',
  'Lato',
  'Figtree',
  'Noto Sans',
  'IBM Plex Sans',
  'Cossette Titre',
]);

function gfFamilyParam(name){
  const map = {
    'Inter Tight': 'Inter+Tight',
    'Inter': 'Inter',
    'Roboto': 'Roboto',
    'Poppins': 'Poppins',
    'DM Sans': 'DM+Sans',
    'Open Sans': 'Open+Sans',
    'Nunito': 'Nunito',
    'Lato': 'Lato',
    'Figtree': 'Figtree',
    'Noto Sans': 'Noto+Sans',
    'IBM Plex Sans': 'IBM+Plex+Sans',
    'Cossette Titre': 'Cossette+Titre',
  };
  return map[name] || name.replace(/\s+/g, '+');
}

function gfLinkHref(name){
  const fam = gfFamilyParam(name);
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@400;500;700&display=swap`;
}

export async function ensureWebFontLoaded(name){
  if (!name || name === 'System UI' || name === 'Custom') return;
  const id = `bd-font-${gfFamilyParam(name).toLowerCase()}`;
  if (document.getElementById(id)) return;
  if (name === 'OpenDyslexic') {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @font-face{font-family:'OpenDyslexic';src:url('data/assets/fonts/OpenDyslexic-Regular.otf') format('opentype');font-weight:400;font-style:normal;font-display:swap}
      @font-face{font-family:'OpenDyslexic';src:url('data/assets/fonts/OpenDyslexic-Italic.otf') format('opentype');font-weight:400;font-style:italic;font-display:swap}
      @font-face{font-family:'OpenDyslexic';src:url('data/assets/fonts/OpenDyslexic-Bold.otf') format('opentype');font-weight:700;font-style:normal;font-display:swap}
      @font-face{font-family:'OpenDyslexic';src:url('data/assets/fonts/OpenDyslexic-Bold-Italic.otf') format('opentype');font-weight:700;font-style:italic;font-display:swap}
    `;
    document.head.appendChild(style);
    return;
  }
  if (!ALLOWED_GOOGLE_FONTS.has(name)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = gfLinkHref(name);
  document.head.appendChild(link);
}
