import { getSetting, setSetting } from './idb.js';

const root = document.documentElement;
function updateMetaThemeColor(){
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const computed = getComputedStyle(root);
  const bg = computed.getPropertyValue('--bg').trim() || '#000000';
  meta.setAttribute('content', bg);
}

async function loadSettings(){
  const theme = await getSetting('theme', 'light');
  const fontSize = await getSetting('fontSize', 16);
  const highContrast = await getSetting('highContrast', false);
  const reduceMotion = await getSetting('reduceMotion', false);
  const displayName = await getSetting('displayName', 'Buddy');
  const initials = await getSetting('initials', 'BD');
  const profilePicture = await getSetting('profilePicture', null);
  
  // AI settings
  const aiEnabled = await getSetting('aiEnabled', false);
  const aiProvider = await getSetting('aiProvider', 'ollama');
  const aiModel = await getSetting('aiModel', '');
  const aiBaseUrl = await getSetting('aiBaseUrl', 'http://localhost:11434');
  const smartComposeTrainFromDocs = await getSetting('smartComposeTrainFromDocs', false);
  const scConf = await getSetting('smartComposeConfThresh', 0.88);
  const scMinCtx = await getSetting('smartComposeMinContext', 2);
  const scMaxCont = await getSetting('smartComposeMaxCont', 2);
  const scRequireNames = await getSetting('smartComposeRequireSeenNames', true);

  document.getElementById('themeSelect').value = theme;
  document.getElementById('fontSize').value = fontSize;
  const fsOut = document.getElementById('fontSizeValue');
  if (fsOut) fsOut.textContent = `${fontSize}px`;
  document.getElementById('highContrast').checked = !!highContrast;
  document.getElementById('reduceMotion').checked = !!reduceMotion;
  document.getElementById('displayName').value = displayName;
  document.getElementById('initials').value = initials;
  
  // Set AI settings
  document.getElementById('aiEnabled').checked = !!aiEnabled;
  document.getElementById('aiProvider').value = aiProvider;
  document.getElementById('aiModel').value = aiModel;
  document.getElementById('aiBaseUrl').value = aiBaseUrl;
  const scTrain = document.getElementById('smartComposeTrainDocs');
  if (scTrain) scTrain.checked = !!smartComposeTrainFromDocs;
  const confEl = document.getElementById('smartComposeConfThresh');
  if (confEl) confEl.value = scConf;
  const minCtxEl = document.getElementById('smartComposeMinContext');
  if (minCtxEl) minCtxEl.value = scMinCtx;
  const maxContEl = document.getElementById('smartComposeMaxCont');
  if (maxContEl) maxContEl.value = scMaxCont;
  const reqNamesEl = document.getElementById('smartComposeRequireSeenNames');
  if (reqNamesEl) reqNamesEl.checked = !!scRequireNames;
  
  const preview = document.getElementById('profilePreview');
  if (profilePicture) {
    preview.style.backgroundImage = `url(${profilePicture})`;
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = '';
    preview.textContent = initials;
  }

  // Apply current theme instantly on settings page
  root.setAttribute('data-theme', theme);
  updateMetaThemeColor();
}

async function saveSettings(){
  const theme = document.getElementById('themeSelect').value;
  const fontSize = Number(document.getElementById('fontSize').value);
  const highContrast = document.getElementById('highContrast').checked;
  const reduceMotion = document.getElementById('reduceMotion').checked;
  const displayName = document.getElementById('displayName').value.trim() || 'Buddy';
  const initials = document.getElementById('initials').value.trim().slice(0,3).toUpperCase() || 'BD';
  const profilePicture = document.getElementById('profilePreview').style.backgroundImage;
  const profilePicDataUrl = profilePicture ? profilePicture.slice(5, -2) : null;
  
  // Get AI settings
  const aiEnabled = document.getElementById('aiEnabled').checked;
  const aiProvider = document.getElementById('aiProvider').value;
  const aiModel = document.getElementById('aiModel').value.trim();
  const aiBaseUrl = document.getElementById('aiBaseUrl').value.trim() || 'http://localhost:11434';
  const smartComposeTrainFromDocs = document.getElementById('smartComposeTrainDocs')?.checked || false;
  const scConf = Number(document.getElementById('smartComposeConfThresh')?.value || 0.88);
  const scMinCtx = Number(document.getElementById('smartComposeMinContext')?.value || 2);
  const scMaxCont = Number(document.getElementById('smartComposeMaxCont')?.value || 2);
  const scRequireNames = !!document.getElementById('smartComposeRequireSeenNames')?.checked;

  await Promise.all([
    setSetting('theme', theme),
    setSetting('fontSize', fontSize),
    setSetting('highContrast', highContrast),
    setSetting('reduceMotion', reduceMotion),
    setSetting('displayName', displayName),
    setSetting('initials', initials),
    setSetting('profilePicture', profilePicDataUrl),
    setSetting('aiEnabled', aiEnabled),
    setSetting('aiProvider', aiProvider),
    setSetting('aiModel', aiModel),
    setSetting('aiBaseUrl', aiBaseUrl),
    setSetting('smartComposeTrainFromDocs', smartComposeTrainFromDocs),
    setSetting('smartComposeConfThresh', scConf),
    setSetting('smartComposeMinContext', scMinCtx),
    setSetting('smartComposeMaxCont', scMaxCont),
    setSetting('smartComposeRequireSeenNames', scRequireNames),
  ]);

  alert('Settings saved');
}

function handleProfilePicture(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = document.getElementById('profilePreview');
    preview.style.backgroundImage = `url(${e.target.result})`;
    preview.textContent = '';
  };
  reader.readAsDataURL(file);
}

function removeProfilePicture() {
  const preview = document.getElementById('profilePreview');
  preview.style.backgroundImage = '';
  const initials = document.getElementById('initials').value.trim().slice(0,3).toUpperCase() || 'BD';
  preview.textContent = initials;
  document.getElementById('profilePicture').value = '';
}

loadSettings();
document.getElementById('saveSettings').addEventListener('click', saveSettings);
document.getElementById('profilePicture').addEventListener('change', handleProfilePicture);
document.getElementById('removeProfilePic').addEventListener('click', removeProfilePicture);

// Live previews
document.getElementById('fontSize')?.addEventListener('input', (e)=>{
  const v = Number(e.target.value);
  const out = document.getElementById('fontSizeValue');
  if (out) out.textContent = `${v}px`;
});
document.getElementById('initials')?.addEventListener('input', (e)=>{
  const preview = document.getElementById('profilePreview');
  if (preview && !preview.style.backgroundImage){
    preview.textContent = (e.target.value||'BD').trim().slice(0,3).toUpperCase();
  }
});

// Live theme/app prefs
document.getElementById('themeSelect')?.addEventListener('change', (e)=>{
  const val = e.target.value;
  root.setAttribute('data-theme', val);
  updateMetaThemeColor();
});
document.getElementById('highContrast')?.addEventListener('change', (e)=>{
  const isOn = !!e.target.checked;
  const currentBorder = getComputedStyle(root).getPropertyValue('--border') || '#E6E4F4';
  root.style.setProperty('--border', isOn ? '#8f8d9f' : currentBorder);
});
