import { getSetting, setSetting } from './idb.js';

async function loadSettings(){
  const theme = await getSetting('theme', 'light');
  const fontSize = await getSetting('fontSize', 16);
  const highContrast = await getSetting('highContrast', false);
  const reduceMotion = await getSetting('reduceMotion', false);
  const displayName = await getSetting('displayName', 'Buddy');
  const initials = await getSetting('initials', 'BD');
  const profilePicture = await getSetting('profilePicture', null);

  document.getElementById('themeSelect').value = theme;
  document.getElementById('fontSize').value = fontSize;
  document.getElementById('highContrast').checked = !!highContrast;
  document.getElementById('reduceMotion').checked = !!reduceMotion;
  document.getElementById('displayName').value = displayName;
  document.getElementById('initials').value = initials;
  
  const preview = document.getElementById('profilePreview');
  if (profilePicture) {
    preview.style.backgroundImage = `url(${profilePicture})`;
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = '';
    preview.textContent = initials;
  }
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

  await Promise.all([
    setSetting('theme', theme),
    setSetting('fontSize', fontSize),
    setSetting('highContrast', highContrast),
    setSetting('reduceMotion', reduceMotion),
    setSetting('displayName', displayName),
    setSetting('initials', initials),
    setSetting('profilePicture', profilePicDataUrl),
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
