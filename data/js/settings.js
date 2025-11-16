import { getSetting, setSetting, tx, deleteDocument, saveDocument, STORES, listDocuments, getDocument } from './idb.js';
import { applyDynamicTheme, applyClassicTheme, initAppFont, ensureWebFontLoaded } from './theme.js';
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7/+esm';
import { scrypt } from 'https://cdn.jsdelivr.net/npm/scrypt-js@3.0.1/+esm';
import { getVersions } from './version-history.js';

const root = document.documentElement;
function updateMetaThemeColor(){
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const computed = getComputedStyle(root);
  const bg = computed.getPropertyValue('--bg').trim() || '#000000';
  meta.setAttribute('content', bg);
}

// Store the original secret for hint purposes
let originalSecret = '';

async function hashSecret(secret) {
  // Use scrypt for password hashing suitable for storage (memory-hard)
  // Keep salt stable across devices via synced settings
  let saltBase64 = await getSetting('secretSalt', null);
  if (!saltBase64) {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    saltBase64 = btoa(String.fromCharCode(...saltBytes));
    await setSetting('secretSalt', saltBase64);
  }
  const saltBytes = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));

  const N = 2048, r = 8, p = 1, dkLen = 32; // Optimized for even faster verification
  const pwBytes = new TextEncoder().encode(secret);
  const out = await scrypt(pwBytes, saltBytes, N, r, p, dkLen);
  // Convert to hex string
  return Array.from(out).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadSettings() {
  const useDynamicTheme = await getSetting('useDynamicTheme', false);
  const classicThemeSection = document.getElementById('classic-theme-section');
  const dynamicThemeSection = document.getElementById('dynamic-theme-section');

  if (useDynamicTheme) {
    classicThemeSection.style.display = 'none';
    dynamicThemeSection.style.display = 'block';

    const hue = await getSetting('dynamicThemeHue', 220);
    const mode = await getSetting('dynamicThemeMode', 'light');
    const scheme = await getSetting('dynamicThemeScheme', 'normal');

    const hueSlider = document.getElementById('hueSlider');
    const themeModeActiveBtn = document.querySelector(`#themeMode button[data-value="${mode}"]`);
    const themeModeInactiveBtn = document.querySelector(`#themeMode button:not([data-value="${mode}"])`);
    const colorSchemeSelect = document.getElementById('colorScheme');
    
    if (hueSlider) hueSlider.value = hue;
    if (themeModeActiveBtn) themeModeActiveBtn.classList.add('active');
    if (themeModeInactiveBtn) themeModeInactiveBtn.classList.remove('active');
    if (colorSchemeSelect) colorSchemeSelect.value = scheme;

  } else {
    classicThemeSection.style.display = 'block';
    dynamicThemeSection.style.display = 'none';
    const theme = await getSetting('theme', 'light');
    document.getElementById('themeSelect').value = theme;
  }

  const appFontFamily = await getSetting('appFontFamily', 'Inter Tight');
  const defaultFontSelect = document.getElementById('defaultFontSelect');
  const customFontRow = document.getElementById('customFontRow');
  const customFontNameInput = document.getElementById('customFontName');
  if (defaultFontSelect) defaultFontSelect.value = appFontFamily;
  if (customFontRow) customFontRow.style.display = appFontFamily === 'Custom' ? 'grid' : 'none';
  if (customFontNameInput && appFontFamily === 'Custom') {
    customFontNameInput.value = await getSetting('customFontName', '');
  }

  const displayName = await getSetting('displayName', 'Buddy');
  const initials = await getSetting('initials', 'BD');
  const profilePicture = await getSetting('profilePicture', null);
  const usePin = await getSetting('usePin', false);
  const secretSet = await getSetting('secretSet', false);
  
  // Store the original secret for hint
  originalSecret = await getSetting('originalSecret', '');
  
  // AI settings
  // AI Settings
  const aiEnabled = await getSetting('aiEnabled', false);
  const aiProvider = await getSetting('aiProvider', 'ollama');
  const aiModel = await getSetting('aiModel', '');
  const aiBaseUrl = await getSetting('aiBaseUrl', 'http://localhost:11434');
  const aiApiKey = await getSetting('aiApiKey', '');
  const smartComposeTrainFromDocs = await getSetting('smartComposeTrainFromDocs', false);
  const scConf = await getSetting('smartComposeConfThresh', 0.88);
  const scMinCtx = await getSetting('smartComposeMinContext', 2);
  const scMaxCont = await getSetting('smartComposeMaxCont', 2);
  const scRequireNames = await getSetting('smartComposeRequireSeenNames', true);
  
  // Integrations
  const musicPlayerEnabled = await getSetting('musicPlayerEnabled', false);
  const musicFilterType = await getSetting('musicFilterType', 'all');
  const musicFilterValue = await getSetting('musicFilterValue', '');

  // AI Welcome Message Settings
  const aiWelcomeEnabled = await getSetting('aiWelcomeEnabled', false);
  const aiWelcomeTone = await getSetting('aiWelcomeTone', 'casual');
  const aiWelcomeCustomTone = await getSetting('aiWelcomeCustomTone', '');

  document.getElementById('displayName').value = displayName;
  document.getElementById('initials').value = initials;
  // Security
  const usePinEl = document.getElementById('usePin');
  if (usePinEl) usePinEl.checked = !!usePin;
  const labelEl = document.getElementById('secretLabel');
  if (labelEl) labelEl.textContent = usePin ? 'New PIN' : 'New Password';
  const secretInput = document.getElementById('secretInput');
  const secretConfirm = document.getElementById('secretConfirm');
  const currentSecretInput = document.getElementById('currentSecret');
  
  if (secretInput) secretInput.value = '';
  if (secretConfirm) secretConfirm.value = '';
  if (currentSecretInput) currentSecretInput.value = '';
  
  // Handle password section visibility
  const changePasswordSection = document.getElementById('changePasswordSection');
  const forgotPasswordLink = document.getElementById('forgotPassword');
  const passwordHint = document.getElementById('passwordHint');
  const passwordHintText = document.getElementById('passwordHintText');
  const currentPasswordField = document.getElementById('currentSecret');
  
  // Always show the password section
  if (changePasswordSection) changePasswordSection.style.display = 'block';
  
  if (secretSet) {
    // If password is set, show forgot password link and require current password
    if (forgotPasswordLink) forgotPasswordLink.style.display = 'block';
    if (currentPasswordField) {
      currentPasswordField.required = true;
      currentPasswordField.closest('.form-row').style.display = 'block';
    }
    
    // Show first 2 characters of the original secret as a hint
    if (originalSecret && originalSecret.length > 2 && passwordHintText) {
      const hint = originalSecret.substring(0, 2) + '*'.repeat(originalSecret.length - 2);
      passwordHintText.textContent = hint;
    }
  } else {
    // If no password is set yet, hide the current password field and forgot password link
    if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
    if (passwordHint) passwordHint.classList.add('hidden');
    if (currentPasswordField) {
      currentPasswordField.required = false;
      currentPasswordField.closest('.form-row').style.display = 'none';
    }
  }
  
  // Set AI settings
  const aiEnabledEl = document.getElementById('aiEnabled');
  aiEnabledEl.checked = !!aiEnabled;
  document.getElementById('aiProvider').value = aiProvider;
  document.getElementById('aiModel').value = aiModel;
  document.getElementById('aiBaseUrl').value = aiBaseUrl;

  const aiApiKeyInput = document.getElementById('aiApiKey');
  if (aiApiKey) {
    aiApiKeyInput.placeholder = "••••••••••••••••••••••••";
  } else {
    aiApiKeyInput.placeholder = "sk-...";
  }
  aiApiKeyInput.value = '';

  toggleAiProviderSettings();

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
  
  // Set AI Welcome Message settings
  const aiWelcomeSettings = document.getElementById('aiWelcomeSettings');
  const aiWelcomeEnabledEl = document.getElementById('aiWelcomeEnabled');
  const aiWelcomeToneEl = document.getElementById('aiWelcomeTone');
  const customToneContainer = document.getElementById('customToneContainer');
  
  if (aiWelcomeSettings && aiWelcomeEnabledEl && aiWelcomeToneEl) {
    aiWelcomeSettings.style.display = aiEnabled ? 'block' : 'none';
    aiWelcomeEnabledEl.checked = !!aiWelcomeEnabled;
    aiWelcomeToneEl.value = aiWelcomeTone;
    
    // Show/hide custom tone input based on selection
    if (aiWelcomeTone === 'custom') {
      customToneContainer.style.display = 'block';
      document.getElementById('aiWelcomeCustomTone').value = aiWelcomeCustomTone || '';
    } else {
      customToneContainer.style.display = 'none';
    }
  }
  
  const preview = document.getElementById('profilePreview');
  if (profilePicture) {
    preview.style.backgroundImage = `url(${profilePicture})`;
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = '';
    preview.textContent = initials;
  }

  // Load notification settings
  const notificationsEnabled = await getSetting('notificationsEnabled', false);
  const useSmartReminders = await getSetting('useSmartReminders', true);
  const reminderTime = await getSetting('reminderTime', 15);
  
  const notificationsEnabledEl = document.getElementById('notificationsEnabled');
  const notificationSettingsDiv = document.getElementById('notificationSettings');
  const useSmartRemindersEl = document.getElementById('useSmartReminders');
  const customReminderSectionEl = document.getElementById('customReminderSection');
  const reminderTimeEl = document.getElementById('reminderTime');
  
  if (notificationsEnabledEl) {
    notificationsEnabledEl.checked = !!notificationsEnabled;
  }
  if (useSmartRemindersEl) {
    useSmartRemindersEl.checked = !!useSmartReminders;
  }
  if (reminderTimeEl) {
    reminderTimeEl.value = reminderTime;
  }
  if (notificationSettingsDiv) {
    notificationSettingsDiv.style.display = notificationsEnabled ? 'block' : 'none';
  }
  if (customReminderSectionEl) {
    customReminderSectionEl.style.display = useSmartReminders ? 'none' : 'block';
  }

  // No need to apply theme here, initTheme in theme.js handles it.
}

async function verifyCurrentPassword(secret) {
  const storedHash = await getSetting('secretHash');
  if (!storedHash) return true; // No password set yet
  
  const saltBase64 = await getSetting('secretSalt', null);
  if (!saltBase64) return false; // No salt, can't verify
  
  const saltBytes = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const pwBytes = new TextEncoder().encode(secret);
  
  // Try both N=2048 (new), N=4096, and N=16384 (old) for backward compatibility
  for (const N of [2048, 4096, 16384]) {
    const r = 8, p = 1, dkLen = 32;
    const out = await scrypt(pwBytes, saltBytes, N, r, p, dkLen);
    const inputHash = Array.from(out).map(b => b.toString(16).padStart(2, '0')).join('');
    if (inputHash === storedHash) {
      return true;
    }
  }
  return false;
}

async function resetPassword() {
  if (!confirm('WARNING: This will delete all locked documents, galleries, and images. Are you sure you want to continue?')) {
    return false;
  }
  
  try {
    const store = await tx(STORES.documents, 'readwrite');
    const req = store.getAll();
    
    return new Promise((resolve, reject) => {
      req.onsuccess = async () => {
        const documents = req.result || [];
        const lockedDocs = [];
        const galleriesToUpdate = [];
        
        // First pass: find locked documents and process galleries
        for (const doc of documents) {
          if (doc.locked) {
            lockedDocs.push(doc);
          } else if (doc.type === 'gallery' && Array.isArray(doc.content)) {
            // Check for locked images in gallery content
            const hasLockedImages = doc.content.some(entry => {
              // Handle both string entries and object entries with locked property
              const isLocked = typeof entry === 'object' && entry !== null && entry.locked === true;
              return isLocked;
            });
            
            if (hasLockedImages) {
              // Create a copy of the gallery with locked images removed
              const updatedGallery = {
                ...doc,
                content: doc.content.filter(entry => {
                  // Keep entries that are not objects, or don't have locked: true
                  return typeof entry !== 'object' || !entry || entry.locked !== true;
                }),
                updatedAt: Date.now()
              };
              galleriesToUpdate.push(updatedGallery);
            }
          }
        }
        
        // Delete locked documents
        for (const doc of lockedDocs) {
          await deleteDocument(doc.id);
        }
        
        // Update galleries to remove locked images
        for (const gallery of galleriesToUpdate) {
          await saveDocument(gallery);
        }
        
        // Clear the password
        await setSetting('secretHash', '');
        await setSetting('secretSet', false);
        await setSetting('originalSecret', '');
        
        // Reload settings
        await loadSettings();
        
        const deletedCount = lockedDocs.length + galleriesToUpdate.length;
        alert(`Password has been reset. Deleted ${lockedDocs.length} locked documents and removed locked images from ${galleriesToUpdate.length} galleries.`);
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    alert('Error resetting password. Please try again.');
    return false;
  }
}

async function saveSettings() {
  const useDynamicTheme = document.getElementById('dynamic-theme-section').style.display === 'block';

  await setSetting('useDynamicTheme', useDynamicTheme);

  if (useDynamicTheme) {
    const hue = document.getElementById('hueSlider').value;
    const mode = document.querySelector('#themeMode button.active').dataset.value;
    const scheme = document.getElementById('colorScheme').value;
    await setSetting('dynamicThemeHue', Number(hue));
    await setSetting('dynamicThemeMode', mode);
    await setSetting('dynamicThemeScheme', scheme);
    applyDynamicTheme(Number(hue), mode, scheme);
  } else {
    const theme = document.getElementById('themeSelect').value;
    await setSetting('theme', theme);
    applyClassicTheme(theme);
  }

  const appFontFamily = document.getElementById('defaultFontSelect')?.value || 'Inter Tight';
  const customFontName = document.getElementById('customFontName')?.value.trim() || '';

  const displayName = document.getElementById('displayName').value.trim() || 'Buddy';
  const initials = document.getElementById('initials').value.trim().slice(0,3).toUpperCase() || 'BD';
  const profilePicture = document.getElementById('profilePreview').style.backgroundImage;
  const profilePicDataUrl = profilePicture ? profilePicture.slice(5, -2) : null;
  const usePin = document.getElementById('usePin')?.checked || false;
  const currentSecret = document.getElementById('currentSecret')?.value || '';
  const newSecret = document.getElementById('secretInput')?.value || '';
  const secretConfirm = document.getElementById('secretConfirm')?.value || '';
  
  // Get AI settings
  const aiEnabled = document.getElementById('aiEnabled').checked;
  const aiProvider = document.getElementById('aiProvider').value;
  let aiModel = document.getElementById('aiModel').value.trim();
  const aiBaseUrl = document.getElementById('aiBaseUrl').value.trim();
  const newAiApiKey = document.getElementById('aiApiKey').value.trim();
  const smartComposeTrainFromDocs = document.getElementById('smartComposeTrainDocs')?.checked || false;
  const scConf = Number(document.getElementById('smartComposeConfThresh')?.value || 0.88);
  const scMinCtx = Number(document.getElementById('smartComposeMinContext')?.value || 2);
  const scMaxCont = Number(document.getElementById('smartComposeMaxCont')?.value || 2);
  const scRequireNames = !!document.getElementById('smartComposeRequireSeenNames')?.checked;
  
  // Get AI Welcome Message settings
  const aiWelcomeEnabled = document.getElementById('aiWelcomeEnabled')?.checked || false;
  const aiWelcomeTone = document.getElementById('aiWelcomeTone')?.value || 'casual';
  const aiWelcomeCustomTone = aiWelcomeTone === 'custom' 
    ? (document.getElementById('aiWelcomeCustomTone')?.value || '').trim() 
    : '';

  const musicPlayerEnabled = document.getElementById('musicPlayerEnabled').checked;
  const musicFilterType = document.getElementById('musicFilterType').value;
  const musicFilterValue = document.getElementById('musicFilterValue').value;
  const activityEnabled = document.getElementById('activityEnabled')?.checked || false;

  // Get notification settings
  const notificationsEnabled = document.getElementById('notificationsEnabled')?.checked || false;
  const useSmartReminders = document.getElementById('useSmartReminders')?.checked || true;
  const reminderTime = Number(document.getElementById('reminderTime')?.value || 15);

  const settingsToSave = [
    setSetting('displayName', displayName),
    setSetting('initials', initials),
    setSetting('profilePicture', profilePicDataUrl),
    setSetting('aiEnabled', aiEnabled),
    setSetting('aiProvider', aiProvider),
    setSetting('smartComposeTrainFromDocs', smartComposeTrainFromDocs),
    setSetting('smartComposeConfThresh', scConf),
    setSetting('smartComposeMinContext', scMinCtx),
    setSetting('smartComposeMaxCont', scMaxCont),
    setSetting('smartComposeRequireSeenNames', scRequireNames),
    setSetting('aiWelcomeEnabled', aiWelcomeEnabled),
    setSetting('aiWelcomeTone', aiWelcomeTone),
    setSetting('aiWelcomeCustomTone', aiWelcomeCustomTone),
    setSetting('usePin', usePin),
    setSetting('musicPlayerEnabled', musicPlayerEnabled),
    setSetting('musicFilterType', musicFilterType),
    setSetting('musicFilterValue', musicFilterValue),
    setSetting('activityEnabled', activityEnabled),
    setSetting('notificationsEnabled', notificationsEnabled),
    setSetting('useSmartReminders', useSmartReminders),
    setSetting('reminderTime', reminderTime),
    setSetting('appFontFamily', appFontFamily),
  ];

  if (appFontFamily === 'Custom') {
    settingsToSave.push(setSetting('customFontName', customFontName));
    if (pendingCustomFontData) {
      settingsToSave.push(setSetting('customFontData', pendingCustomFontData));
      settingsToSave.push(setSetting('customFontFormat', pendingCustomFontFormat || 'ttf'));
    }
  }

  if (aiProvider === 'openai') {
    if (!aiModel) {
      aiModel = 'GPT 5 Nano';
    }
    settingsToSave.push(setSetting('aiModel', aiModel));
    if (newAiApiKey) {
      settingsToSave.push(setSetting('aiApiKey', newAiApiKey));
    }
    // Do not save base URL for OpenAI
    settingsToSave.push(setSetting('aiBaseUrl', ''));
  } else { // ollama or lmstudio
    settingsToSave.push(setSetting('aiModel', aiModel));
    settingsToSave.push(setSetting('aiBaseUrl', aiBaseUrl || 'http://localhost:11434'));
    // Do not save API key for other providers
    settingsToSave.push(setSetting('aiApiKey', ''));
  }

  await Promise.all(settingsToSave);

  // Record settings lastUpdated for conflict resolution during cloud sync
  const nowIso = new Date().toISOString();
  await setSetting('settingsLastUpdated', nowIso);

  // Save secret if provided and matches
  if (newSecret || secretConfirm) {
    // Check if this is a password change (not initial set)
    const isPasswordChange = await getSetting('secretSet');
    
    if (isPasswordChange) {
      // Verify current password
      const isCurrentValid = await verifyCurrentPassword(currentSecret);
      if (!isCurrentValid) {
        alert('Current password is incorrect.');
        return;
      }
    }
    
    if (newSecret !== secretConfirm) {
      alert('New password confirmation does not match.');
      return;
    }
    
    if (usePin && !/^\d{4,8}$/.test(newSecret)) {
      alert('PIN must be 4-8 digits.');
      return;
    }
    
    if (!usePin && newSecret.length < 4) {
      alert('Password must be at least 4 characters.');
      return;
    }
    
    // Hash and save the new password
    const hash = await hashSecret(newSecret);
    await setSetting('secretHash', hash);
    await setSetting('secretSet', true);
    await setSetting('originalSecret', newSecret);
    
    // Clear the password fields
    document.getElementById('currentSecret').value = '';
    document.getElementById('secretInput').value = '';
    document.getElementById('secretConfirm').value = '';
  }

  alert('Settings saved');
  loadSettings();
  await initAppFont();
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

// Toggle AI Welcome Message settings based on AI enabled state
function toggleAiWelcomeSettings() {
  const aiEnabled = document.getElementById('aiEnabled').checked;
  const aiWelcomeSettings = document.getElementById('aiWelcomeSettings');
  if (aiWelcomeSettings) {
    aiWelcomeSettings.style.display = aiEnabled ? 'block' : 'none';
    
    // If AI is disabled, uncheck the welcome message toggle
    if (!aiEnabled) {
      const welcomeToggle = document.getElementById('aiWelcomeEnabled');
      if (welcomeToggle) welcomeToggle.checked = false;
    }
  }
}

// Toggle custom tone input based on tone selection
function toggleCustomToneInput() {
  const toneSelect = document.getElementById('aiWelcomeTone');
  const customToneContainer = document.getElementById('customToneContainer');
  
  if (toneSelect && customToneContainer) {
    if (toneSelect.value === 'custom') {
      customToneContainer.style.display = 'block';
    } else {
      customToneContainer.style.display = 'none';
    }
  }
}

// Toggle AI provider specific settings
function toggleAiProviderSettings() {
  const provider = document.getElementById('aiProvider').value;
  const modelLabel = document.getElementById('aiModelLabel');
  const baseUrlLabel = document.getElementById('aiBaseUrlLabel');
  const apiKeyLabel = document.getElementById('aiApiKeyLabel');

  if (provider === 'openai') {
    modelLabel.style.display = 'block';
    baseUrlLabel.style.display = 'none';
    apiKeyLabel.style.display = 'block';
  } else { // ollama, lmstudio
    modelLabel.style.display = 'block';
    baseUrlLabel.style.display = 'block';
    apiKeyLabel.style.display = 'none';
  }
}

// Handle tab switching in the new settings page layout
function handleTabSwitching() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.settings-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetPaneId = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      panes.forEach(pane => {
        if (pane.id === targetPaneId) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });

      // Lazy init Activity tab on demand
      if (targetPaneId === 'activity') {
        lazyInitActivityTab();
      }
      if (targetPaneId === 'cloud') {
        lazyInitCloudTab();
      }
    });
  });
}

// Music player settings
async function getAllSongs() {
    const songs = [];
    try {
        const musicDB = await openDB('BuddyMusicDB', 1);
        const favs = await musicDB.getAll('favorites');
        songs.push(...favs);
    } catch (e) {
        console.warn("Could not open BuddyMusicDB. Favorites will not be available.");
    }

    try {
        const songsDB = await openDB('BuddyMusicSongsDB', 1);
        const allSongs = await songsDB.getAll('songs');
        songs.push(...allSongs);
    } catch (e) {
        console.warn("Could not open BuddyMusicSongsDB. Songs will not be available.");
    }
    
    // Remove duplicates
    const uniqueSongs = [];
    const seenIds = new Set();
    for (const song of songs) {
        if (!seenIds.has(song.id)) {
            uniqueSongs.push(song);
            seenIds.add(song.id);
        }
    }

    return uniqueSongs;
}

async function populateMusicFilterValues() {
    const filterType = document.getElementById('musicFilterType').value;
    const filterValueContainer = document.getElementById('musicFilterValueContainer');
    const filterValueSelect = document.getElementById('musicFilterValue');
    const filterValueLabel = document.getElementById('musicFilterValueLabel');

    if (filterType === 'all') {
        filterValueContainer.style.display = 'none';
        return;
    }

    filterValueContainer.style.display = 'block';
    filterValueSelect.innerHTML = '';
    filterValueLabel.textContent = `Select ${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`;

    const songs = await getAllSongs();
    let options = new Set();

    switch (filterType) {
        case 'genre':
            songs.forEach(song => song.metadata.genre && options.add(song.metadata.genre));
            break;
        case 'artist':
            songs.forEach(song => song.metadata.artist && options.add(song.metadata.artist));
            break;
        case 'album':
            songs.forEach(song => song.metadata.album && options.add(song.metadata.album));
            break;
        case 'song':
            songs.forEach(song => options.add(JSON.stringify({id: song.id, title: song.metadata.title || 'Unknown Title'})));
            break;
    }

    options.forEach(option => {
        const el = document.createElement('option');
        if (filterType === 'song') {
            const songData = JSON.parse(option);
            el.value = songData.id;
            el.textContent = songData.title;
        } else {
            el.value = option;
            el.textContent = option;
        }
        filterValueSelect.appendChild(el);
    });

    const savedValue = await getSetting('musicFilterValue', '');
    filterValueSelect.value = savedValue;
}


// Import Cloud tab initialization
import { initCloudTab } from './cloud.js';
let cloudTabInitialized = false;
function lazyInitCloudTab(){
  if (cloudTabInitialized) return;
  const cloudPane = document.getElementById('cloud');
  if (!cloudPane) return;
  cloudTabInitialized = true;
  Promise.resolve().then(()=>initCloudTab()).catch((e)=>{
    console.warn('Cloud tab init failed:', e);
    cloudTabInitialized = false;
  });
}

// Activity tab
let activityTabInitialized = false;
function lazyInitActivityTab(){
  if (activityTabInitialized) return;
  const pane = document.getElementById('activity');
  if (!pane) return;
  activityTabInitialized = true;
  Promise.resolve().then(()=>initActivityTab()).catch((e)=>{
    console.warn('Activity tab init failed:', e);
    activityTabInitialized = false;
  });
}

function countWordsFromHtml(html){
  if (typeof html !== 'string' || !html) return 0;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const text = temp.textContent || temp.innerText || '';
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function wordsAddedForDocInRange(doc, startMs, endMs){
  try{
    const versions = await getVersions(doc.id);
    if (Array.isArray(versions) && versions.length > 0){
      // versions are newest-first; make ascending by timestamp
      const asc = [...versions].sort((a,b)=>a.timestamp - b.timestamp);
      let prevWC = 0;
      // seed prevWC as last version before start
      for (let i=0;i<asc.length;i++){
        const v = asc[i];
        if (v.timestamp < startMs){
          prevWC = v.wordCount || 0;
        } else {
          break;
        }
      }
      let sum = 0;
      for (const v of asc){
        if (v.timestamp >= startMs && v.timestamp <= endMs){
          const delta = (v.wordCount||0) - prevWC;
          if (delta > 0) sum += delta;
          prevWC = v.wordCount||0;
        }
        if (v.timestamp > endMs){
          break;
        }
      }
      return sum;
    }
  } catch(e){
    // ignore
  }
  // Fallback: if doc updated in range, approximate using current word count
  if (doc.updatedAt >= startMs && doc.updatedAt <= endMs){
    return countWordsFromHtml(doc.content || '');
  }
  return 0;
}

function formatCompare(curr, prev){
  if (!prev && !curr) return 'No change';
  if (!prev && curr>0) return 'up 100%';
  if (prev===curr) return 'No change';
  const diff = curr - prev;
  const pct = Math.round(Math.abs(diff) / (prev || 1) * 100);
  return diff >= 0 ? `up ${pct}%` : `down ${pct}%`;
}

async function computeActivityStats(){
  const docs = await listDocuments({ includeArchived: true });
  const now = Date.now();
  const day = 24*60*60*1000;
  const ranges = {
    week: { start: now - 7*day, end: now, prevStart: now - 14*day, prevEnd: now - 7*day },
    month:{ start: now - 30*day, end: now, prevStart: now - 60*day, prevEnd: now - 30*day },
    year: { start: now - 365*day, end: now, prevStart: now - 730*day, prevEnd: now - 365*day }
  };

  // Total word count across all documents
  let totalWords = 0;
  for (const d of docs){
    if (typeof d.content === 'string'){
      totalWords += countWordsFromHtml(d.content);
    } else if (Array.isArray(d.pages) && d.pages.length){
      // Some docs keep content in pages
      totalWords += countWordsFromHtml(d.pages[0]?.content || '');
    }
  }

  async function calcFor(range){
    let words = 0, prevWords = 0, done = 0, prevDone = 0;
    for (const d of docs){
      words += await wordsAddedForDocInRange(d, range.start, range.end);
      prevWords += await wordsAddedForDocInRange(d, range.prevStart, range.prevEnd);
      // Completed docs counted by updatedAt when completion saved
      if (d.completed && d.updatedAt >= range.start && d.updatedAt <= range.end){
        done += 1;
      }
      if (d.completed && d.updatedAt >= range.prevStart && d.updatedAt <= range.prevEnd){
        prevDone += 1;
      }
    }
    return { words, prevWords, done, prevDone };
  }

  const weekly = await calcFor(ranges.week);
  const monthly = await calcFor(ranges.month);
  const yearly = await calcFor(ranges.year);

  return {
    totalWords,
    weekly,
    monthly,
    yearly
  };
}

async function initActivityTab(){
  const enabled = await getSetting('activityEnabled', false);
  const toggle = document.getElementById('activityEnabled');
  const note = document.getElementById('activityDisabledNote');
  const content = document.getElementById('activityContent');
  if (toggle){
    toggle.checked = !!enabled;
    toggle.addEventListener('change', async (e)=>{
      await setSetting('activityEnabled', !!e.target.checked);
      renderActivity();
    });
  }
  // Initial render
  renderActivity();

  async function renderActivity(){
    const isOn = await getSetting('activityEnabled', false);
    if (!isOn){
      note.style.display = 'block';
      content.style.display = 'none';
      return;
    }
    note.style.display = 'none';
    content.style.display = 'block';

    const stats = await computeActivityStats();
    // Total words
    const totalEl = document.getElementById('totalWordCount');
    totalEl.textContent = String(stats.totalWords);

    // Weekly
    document.getElementById('weeklyWords').textContent = String(stats.weekly.words);
    document.getElementById('weeklyCompare').textContent = formatCompare(stats.weekly.words, stats.weekly.prevWords);
    document.getElementById('weeklyDone').textContent = String(stats.weekly.done);
    document.getElementById('weeklyDoneCompare').textContent = formatCompare(stats.weekly.done, stats.weekly.prevDone);

    // Monthly
    document.getElementById('monthlyWords').textContent = String(stats.monthly.words);
    document.getElementById('monthlyCompare').textContent = formatCompare(stats.monthly.words, stats.monthly.prevWords);
    document.getElementById('monthlyDone').textContent = String(stats.monthly.done);
    document.getElementById('monthlyDoneCompare').textContent = formatCompare(stats.monthly.done, stats.monthly.prevDone);

    // Yearly
    document.getElementById('yearlyWords').textContent = String(stats.yearly.words);
    document.getElementById('yearlyCompare').textContent = formatCompare(stats.yearly.words, stats.yearly.prevWords);
    document.getElementById('yearlyDone').textContent = String(stats.yearly.done);
    document.getElementById('yearlyDoneCompare').textContent = formatCompare(stats.yearly.done, stats.yearly.prevDone);
  }
}

// Initialize the app
loadSettings().then(async () => {
  handleTabSwitching();
  
  // Lazy initialize Cloud tab only when opened
  const cloudPane = document.getElementById('cloud');
  if (cloudPane && cloudPane.classList.contains('active')) {
    lazyInitCloudTab();
  }
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'cloud') lazyInitCloudTab();
      if (tab.dataset.tab === 'activity') lazyInitActivityTab();
    });
  });
  // Add event listeners
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  // Toggle AI Welcome Message settings when AI Enabled changes
  const aiEnabledEl = document.getElementById('aiEnabled');
  if (aiEnabledEl) {
    aiEnabledEl.addEventListener('change', toggleAiWelcomeSettings);
  }
  
  // Toggle custom tone input when tone selection changes
  const aiWelcomeToneEl = document.getElementById('aiWelcomeTone');
  if (aiWelcomeToneEl) {
    aiWelcomeToneEl.addEventListener('change', toggleCustomToneInput);
  }
  document.getElementById('profilePicture').addEventListener('change', handleProfilePicture);
  document.getElementById('removeProfilePic').addEventListener('click', removeProfilePicture);

  const defaultFontSelect = document.getElementById('defaultFontSelect');
  const customFontRow = document.getElementById('customFontRow');
  if (defaultFontSelect) {
    defaultFontSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (customFontRow) customFontRow.style.display = val === 'Custom' ? 'grid' : 'none';
      let stack = '';
      if (val === 'System UI') {
        stack = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Noto Color Emoji'";
      } else if (val === 'Custom') {
        const savedName = await getSetting('customFontName', 'Custom Font');
        const savedFmt = await getSetting('customFontFormat', 'ttf');
        const savedData = await getSetting('customFontData', '');
        if (savedData) {
          const bytes = Uint8Array.from(atob(savedData), c => c.charCodeAt(0));
          const mime = savedFmt === 'woff2' ? 'font/woff2' : savedFmt === 'woff' ? 'font/woff' : savedFmt === 'otf' ? 'font/otf' : 'font/ttf';
          const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
          let style = document.getElementById('bd-custom-font-preview');
          if (!style) {
            style = document.createElement('style');
            style.id = 'bd-custom-font-preview';
            document.head.appendChild(style);
          }
          const cssFmt = savedFmt === 'ttf' ? 'truetype' : savedFmt === 'otf' ? 'opentype' : savedFmt;
          style.textContent = `@font-face{font-family:'${savedName}';src:url('${url}') format('${cssFmt}');font-weight:400;font-style:normal;font-display:swap}`;
          root.style.setProperty('--bd-font-family', `'${savedName}', system-ui, Inter, Roboto, -apple-system, Helvetica, Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`);
          return;
        }
        const name = document.getElementById('customFontName')?.value.trim() || savedName || 'Custom Font';
        root.style.setProperty('--bd-font-family', `'${name}', system-ui, Inter, Roboto, -apple-system, Helvetica, Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`);
        return;
      } else {
        ensureWebFontLoaded(val);
        stack = `'${val}', system-ui, Inter, Roboto, -apple-system, Helvetica, Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
      }
      root.style.setProperty('--bd-font-family', stack);
    });
  }

  const fontFileInput = document.getElementById('fontFileInput');
  const customFontNameInput = document.getElementById('customFontName');
  if (customFontNameInput) {
    customFontNameInput.addEventListener('input', (e) => {
      const name = e.target.value.trim();
      if (name) {
        root.style.setProperty('--bd-font-family', `'${name}', system-ui, Inter, Roboto, -apple-system, Helvetica, Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`);
      }
    });
  }
  if (fontFileInput) {
    fontFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      pendingCustomFontFormat = ext;
      const reader = new FileReader();
      reader.onload = () => {
        const buf = reader.result;
        const arr = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
        pendingCustomFontData = btoa(bin);
        const name = document.getElementById('customFontName')?.value.trim() || 'Custom Font';
        pendingCustomFontName = name;
        const mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : ext === 'otf' ? 'font/otf' : 'font/ttf';
        const url = URL.createObjectURL(new Blob([arr], { type: mime }));
        let style = document.getElementById('bd-custom-font-preview');
        if (!style) {
          style = document.createElement('style');
          style.id = 'bd-custom-font-preview';
          document.head.appendChild(style);
        }
        const cssFmt = ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext;
        style.textContent = `@font-face{font-family:'${name}';src:url('${url}') format('${cssFmt}');font-weight:400;font-style:normal;font-display:swap}`;
        root.style.setProperty('--bd-font-family', `'${name}', system-ui, Inter, Roboto, -apple-system, Helvetica, Arial, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Toggle notification settings visibility and request permission
  const notificationsEnabledToggle = document.getElementById('notificationsEnabled');
  if (notificationsEnabledToggle) {
    notificationsEnabledToggle.addEventListener('change', async (e) => {
      const notificationSettings = document.getElementById('notificationSettings');
      if (notificationSettings) {
        notificationSettings.style.display = e.target.checked ? 'block' : 'none';
      }
      
      // Import notification manager and handle enable/disable
      if (e.target.checked) {
        try {
          const { notificationManager } = await import('./notifications.js');
          const success = await notificationManager.enableNotifications();
          if (!success) {
            e.target.checked = false;
            notificationSettings.style.display = 'none';
            alert('Notification permission was denied. Please enable notifications in your browser settings.');
          }
        } catch (error) {
          console.error('Error enabling notifications:', error);
          e.target.checked = false;
          notificationSettings.style.display = 'none';
        }
      } else {
        try {
          const { notificationManager } = await import('./notifications.js');
          await notificationManager.disableNotifications();
        } catch (error) {
          console.error('Error disabling notifications:', error);
        }
      }
    });
  }

  // Toggle between smart and custom reminder times
  const useSmartRemindersToggle = document.getElementById('useSmartReminders');
  if (useSmartRemindersToggle) {
    useSmartRemindersToggle.addEventListener('change', async (e) => {
      const customReminderSection = document.getElementById('customReminderSection');
      if (customReminderSection) {
        customReminderSection.style.display = e.target.checked ? 'none' : 'block';
      }
      
      try {
        const { notificationManager } = await import('./notifications.js');
        if (e.target.checked) {
          await notificationManager.useSmartReminderTimes();
        } else {
          const reminderTime = Number(document.getElementById('reminderTime')?.value || 15);
          await notificationManager.setCustomReminderTime(reminderTime);
        }
      } catch (error) {
        console.error('Error updating reminder times:', error);
      }
    });
  }

  document.getElementById('musicPlayerEnabled').checked = musicPlayerEnabled;
  document.getElementById('musicFilterType').value = musicFilterType;

  if (musicPlayerEnabled) {
    document.getElementById('musicFilters').style.display = 'block';
    populateMusicFilterValues();
  }

  document.getElementById('musicPlayerEnabled').addEventListener('change', (e) => {
      document.getElementById('musicFilters').style.display = e.target.checked ? 'block' : 'none';
      if(e.target.checked) {
          populateMusicFilterValues();
      }
  });

  document.getElementById('musicFilterType').addEventListener('change', populateMusicFilterValues);
  
  // Theme switching buttons
  document.getElementById('switchToDynamic').addEventListener('click', () => {
    document.getElementById('classic-theme-section').style.display = 'none';
    document.getElementById('dynamic-theme-section').style.display = 'block';
  });

  document.getElementById('switchToClassic').addEventListener('click', () => {
    document.getElementById('classic-theme-section').style.display = 'block';
    document.getElementById('dynamic-theme-section').style.display = 'none';
    // Apply classic theme preview on switch back
    const theme = document.getElementById('themeSelect').value;
    applyClassicTheme(theme);
  });

  // Dynamic theme live preview
  const hueSlider = document.getElementById('hueSlider');
  const colorScheme = document.getElementById('colorScheme');
  const themeModeButtons = document.querySelectorAll('#themeMode button');
  
  if (hueSlider) {
    hueSlider.addEventListener('input', livePreviewDynamicTheme);
  }
  
  if (colorScheme) {
    colorScheme.addEventListener('change', livePreviewDynamicTheme);
  }
  
  if (themeModeButtons.length > 0) {
    themeModeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const activeButton = document.querySelector('#themeMode button.active');
        if (activeButton) {
          activeButton.classList.remove('active');
        }
        btn.classList.add('active');
        livePreviewDynamicTheme();
      });
    });
  }

  // Forgot password functionality
  const forgotPasswordLink = document.getElementById('forgotPassword');
  const passwordHint = document.getElementById('passwordHint');
  const resetPasswordBtn = document.getElementById('resetPassword');
  
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      passwordHint.classList.toggle('hidden');
    });
  }
  
  if (resetPasswordBtn) {
    resetPasswordBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const success = await resetPassword();
      if (success) {
        passwordHint.classList.add('hidden');
      }
    });
  }
  
  // Toggle between PIN and password
  const usePinToggle = document.getElementById('usePin');
  if (usePinToggle) {
    usePinToggle.addEventListener('change', () => {
      const labelEl = document.getElementById('secretLabel');
      if (labelEl) {
        labelEl.textContent = usePinToggle.checked ? 'New PIN' : 'New Password';
      }
      const secretInput = document.getElementById('secretInput');
      const secretConfirm = document.getElementById('secretConfirm');
      if (secretInput) secretInput.value = '';
      if (secretConfirm) secretConfirm.value = '';
    });
  }

  // Handle delete data checkboxes
  const deleteSettingsCheckbox = document.getElementById('deleteSettings');
  const deleteDocumentsCheckbox = document.getElementById('deleteDocuments');
  const deleteDataBtn = document.getElementById('deleteDataBtn');
  
  if (deleteSettingsCheckbox && deleteDocumentsCheckbox && deleteDataBtn) {
    // Enable/disable delete button based on checkbox selection
    function updateDeleteButtonState() {
      const deleteFolders = document.getElementById('deleteFolders').checked;
      const deleteLockedData = document.getElementById('deleteLockedData').checked;
      
      deleteDataBtn.disabled = !(deleteSettingsCheckbox.checked || 
                               deleteDocumentsCheckbox.checked || 
                               deleteFolders || 
                               deleteLockedData);
    }
    
    // Add event listeners to all checkboxes
    deleteSettingsCheckbox.addEventListener('change', updateDeleteButtonState);
    deleteDocumentsCheckbox.addEventListener('change', updateDeleteButtonState);
    document.getElementById('deleteFolders').addEventListener('change', updateDeleteButtonState);
    document.getElementById('deleteLockedData').addEventListener('change', updateDeleteButtonState);
    
    // Handle delete button click
    deleteDataBtn.addEventListener('click', async () => {
      const deleteSettings = deleteSettingsCheckbox.checked;
      const deleteDocuments = deleteDocumentsCheckbox.checked;
      const deleteFolders = document.getElementById('deleteFolders').checked;
      const deleteLockedData = document.getElementById('deleteLockedData').checked;
      
      if (!deleteSettings && !deleteDocuments && !deleteFolders && !deleteLockedData) return;
      
      // Build confirmation message
      let message = 'Are you sure you want to delete ';
      const itemsToDelete = [];
      
      if (deleteSettings) itemsToDelete.push('settings');
      if (deleteDocuments) itemsToDelete.push('documents');
      if (deleteFolders) itemsToDelete.push('folders');
      if (deleteLockedData) itemsToDelete.push('locked data and password');
      
      message += itemsToDelete.join(' and ') + '?';
      message += '\n\nThis action cannot be undone.';
      
      if (confirm(message)) {
        try {
          // Import required functions from idb.js
          const { tx, STORES, getSetting, setSetting } = await import('./idb.js');
          
          if (deleteSettings || deleteLockedData) {
            try {
              // Get all settings using the proper API
              const store = await tx(STORES.settings, 'readonly');
              const allSettings = await new Promise((resolve) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (e) => {
                  console.error('Error getting settings:', e);
                  resolve([]);
                };
              });
              
              // Delete non-essential settings
              let settingsToKeep = [];
              
              if (deleteLockedData) {
                // If deleting locked data, only keep non-security settings
                settingsToKeep = ['theme', 'fontSize', 'autoSave', 'spellCheck'];
              } else {
                // If just deleting regular settings, keep security settings
                settingsToKeep = ['secretHash', 'usePin', 'originalSecret', 'secretSet'];
              }
              
              for (const setting of allSettings) {
                if (setting && setting.key) {
                  // If we're deleting locked data and this is a security setting, delete it
                  // Or if we're deleting settings and this is not a security setting, delete it
                  const shouldDelete = (deleteLockedData && ['secretHash', 'usePin', 'originalSecret', 'secretSet'].includes(setting.key)) ||
                                    (deleteSettings && !settingsToKeep.includes(setting.key));
                  
                  if (shouldDelete) {
                    try {
                      const writeStore = await tx(STORES.settings, 'readwrite');
                      await new Promise((resolve, reject) => {
                        const request = writeStore.delete(setting.key);
                        request.onsuccess = resolve;
                        request.onerror = (e) => {
                          console.error(`Error deleting setting ${setting.key}:`, e);
                          resolve(); // Continue with other deletions
                        };
                      });
                    } catch (e) {
                      console.error(`Error in transaction for ${setting.key}:`, e);
                    }
                  }
                }
              }
              
              // Reset theme to default if deleting settings
              if (deleteSettings) {
                document.documentElement.setAttribute('data-theme', 'light');
              }
            } catch (error) {
              console.error('Error in settings deletion:', error);
              throw new Error('Failed to delete settings');
            }
          }
          
          if (deleteDocuments || deleteLockedData) {
            try {
              const store = await tx(STORES.documents, 'readwrite');

              if (deleteDocuments) {
                // Clear all documents across all types (documents, lists, essays, galleries, boards, presentations)
                await new Promise((resolve, reject) => {
                  const request = store.clear();
                  request.onsuccess = resolve;
                  request.onerror = (e) => {
                    console.error('Error clearing documents:', e);
                    reject(e);
                  };
                });
              } else if (deleteLockedData) {
                // Delete only locked documents and strip locked entries from galleries
                const allDocs = await new Promise((resolve) => {
                  const request = store.getAll();
                  request.onsuccess = () => resolve(request.result || []);
                  request.onerror = () => resolve([]);
                });

                const deletePromises = [];

                for (const doc of allDocs) {
                  // Delete locked docs
                  if (doc.locked || doc.isEncrypted) {
                    deletePromises.push(new Promise((resolve) => {
                      const request = store.delete(doc.id);
                      request.onsuccess = resolve;
                      request.onerror = (e) => {
                        console.error(`Error deleting document ${doc.id}:`, e);
                        resolve();
                      };
                    }));
                    continue;
                  }

                  // For unlocked gallery docs, remove any locked entries within content
                  if (doc.type === 'gallery' && Array.isArray(doc.content)) {
                    const hasLockedEntries = doc.content.some(entry => typeof entry === 'object' && entry?.locked === true);
                    if (hasLockedEntries) {
                      const updatedGallery = {
                        ...doc,
                        content: doc.content.filter(entry => !(typeof entry === 'object' && entry?.locked === true)),
                        updatedAt: Date.now()
                      };
                      deletePromises.push(new Promise((resolve) => {
                        const request = store.put(updatedGallery);
                        request.onsuccess = resolve;
                        request.onerror = (e) => {
                          console.error(`Error updating gallery ${doc.id}:`, e);
                          resolve();
                        };
                      }));
                    }
                  }
                }

                await Promise.all(deletePromises);
              }
            } catch (e) {
              console.error('Error in documents deletion:', e);
              throw new Error('Failed to delete documents');
            }
          }
          
          if (deleteFolders) {
            try {
              // First, get all documents that are in any folder
              const allDocs = await new Promise(async (resolve) => {
                const docStore = await tx(STORES.documents, 'readonly');
                const request = docStore.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => resolve([]);
              });
              
              // Move all documents to root (set folderId to null)
              const docsToUpdate = allDocs.filter(doc => doc.folderId)
                .map(doc => ({ ...doc, folderId: null }));
              
              if (docsToUpdate.length > 0) {
                const docStore = await tx(STORES.documents, 'readwrite');
                await new Promise((resolve, reject) => {
                  const updatePromises = [];
                  
                  for (const doc of docsToUpdate) {
                    updatePromises.push(
                      new Promise((resolveUpdate) => {
                        const request = docStore.put(doc);
                        request.onsuccess = resolveUpdate;
                        request.onerror = (e) => {
                          console.error(`Error moving document ${doc.id} to root:`, e);
                          resolveUpdate();
                        };
                      })
                    );
                  }
                  
                  // Wait for all updates to complete
                  Promise.all(updatePromises).then(resolve).catch(reject);
                });
              }
              
              // Clear folders in a separate transaction
              const folderStore = await tx(STORES.folders, 'readwrite');
              await new Promise((resolve, reject) => {
                const request = folderStore.clear();
                request.onsuccess = resolve;
                request.onerror = (e) => {
                  console.error('Error clearing folders:', e);
                  reject(e);
                };
              });
            } catch (e) {
              console.error('Error in folders deletion:', e);
              throw new Error('Failed to delete folders');
            }
          }
          
          // Show success message
          alert('Selected data has been deleted successfully.');
          
          // Refresh the page to reflect changes
          if (deleteSettings || deleteLockedData || deleteFolders || deleteDocuments) {
            window.location.reload();
          } else {
            // If only documents were deleted, just uncheck the boxes and disable the button
            deleteSettingsCheckbox.checked = false;
            deleteDocumentsCheckbox.checked = false;
            document.getElementById('deleteFolders').checked = false;
            document.getElementById('deleteLockedData').checked = false;
            deleteDataBtn.disabled = true;
            
            // Refresh the UI if on a page that shows documents
            if (window.location.pathname.endsWith('home.html') && window.refreshDocumentList) {
              window.refreshDocumentList();
            }
          }
          
        } catch (error) {
          console.error('Error deleting data:', error);
          alert('An error occurred while deleting data: ' + (error.message || 'Unknown error'));
        }
      }
    });
  }
  
  // Handle tab switching
  handleTabSwitching();
  const aiProviderSelect = document.getElementById('aiProvider');
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', toggleAiProviderSettings);
  }

  // Data Management
  const exportZipButton = document.getElementById('exportZip');
  exportZipButton.addEventListener('click', exportDataAsZip);

const exportBluecoreButton = document.getElementById('exportBluecore');
exportBluecoreButton.addEventListener('click', exportDataAsBluecore);
  const importButton = document.getElementById('importButton');
  const importFile = document.getElementById('importFile');
importFile.addEventListener('change', handleFileImport);
  const tipBox = document.getElementById('tipBox');

  importButton.addEventListener('click', (e) => {
    isOverwriteImport = e.altKey;
    importFile.click();
  });

  window.addEventListener('keydown', (e) => {
    if (e.altKey) {
      importButton.textContent = 'Overwrite';
      tipBox.style.display = 'block';
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!e.altKey) {
      importButton.textContent = 'Add';
      tipBox.style.display = 'none';
    }
  });
});

async function exportDataAsZip() {
  const zip = new JSZip();

  for (const storeName of Object.values(STORES)) {
    const store = await tx(storeName, 'readonly');
    const allRecords = await new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    zip.file(`${storeName}.json`, JSON.stringify(allRecords, null, 2));
  }

  zip.generateAsync({ type: 'blob' }).then((content) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'buddydocs_export.zip';
    link.click();
  });
}

async function exportDataAsBluecore() {
  const password = prompt('Please enter a password to encrypt your data:');
  if (!password) {
    alert('Password is required for encryption.');
    return;
  }

  const data = {};
  for (const storeName of Object.values(STORES)) {
    const store = await tx(storeName, 'readonly');
    const allRecords = await new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    data[storeName] = allRecords;
  }

  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), password).toString();
  const blob = new Blob([encrypted], { type: 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'buddydocs_export.bluecore';
  link.click();
}

let isOverwriteImport = false;

let pendingCustomFontData = '';
let pendingCustomFontFormat = '';
let pendingCustomFontName = '';

async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const isOverwrite = isOverwriteImport;
  const reader = new FileReader();

  reader.onload = async (e) => {
    const content = e.target.result;
    if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(content);
      for (const filename in zip.files) {
        const storeName = filename.replace('.json', '');
        if (Object.values(STORES).includes(storeName)) {
          const fileData = await zip.files[filename].async('string');
          const data = JSON.parse(fileData);
          await importData(storeName, data, isOverwrite);
        }
      }
      alert('Data imported successfully!');
    } else if (file.name.endsWith('.bluecore')) {
      const password = prompt('Please enter the password to decrypt your data:');
      if (!password) {
        alert('Password is required for decryption.');
        return;
      }
      try {
        const bytes = CryptoJS.AES.decrypt(content, password);
        const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        for (const storeName in decryptedData) {
          if (Object.values(STORES).includes(storeName)) {
            await importData(storeName, decryptedData[storeName], isOverwrite);
          }
        }
        alert('Data imported successfully!');
      } catch (error) {
        alert('Decryption failed. Please check your password.');
      }
    } else {
      alert('Unsupported file type.');
    }
  };

  if (file.name.endsWith('.zip')) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

async function importData(storeName, data, isOverwrite) {
  const store = await tx(storeName, 'readwrite');
  if (isOverwrite) {
    await new Promise((resolve, reject) => {
      const r = store.clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }
  for (const record of data) {
    await new Promise((resolve, reject) => {
      const r = store.put(record);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }
}

// Dynamic theme live preview function
function livePreviewDynamicTheme() {
  const hue = document.getElementById('hueSlider').value;
  const mode = document.querySelector('#themeMode button.active').dataset.value;
  const scheme = document.getElementById('colorScheme').value;
  applyDynamicTheme(Number(hue), mode, scheme);
}

// Live previews
document.getElementById('initials')?.addEventListener('input', (e)=>{
  const preview = document.getElementById('profilePreview');
  if (preview && !preview.style.backgroundImage){
    preview.textContent = (e.target.value||'BD').trim().slice(0,3).toUpperCase();
  }
});

// Live theme/app prefs
document.getElementById('themeSelect')?.addEventListener('change', (e)=>{
  const val = e.target.value;
  applyClassicTheme(val);
});
