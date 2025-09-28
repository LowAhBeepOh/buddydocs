import { getSetting, setSetting, tx, deleteDocument, saveDocument, STORES } from './idb.js';
import { applyDynamicTheme, applyClassicTheme } from './theme.js';
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7/+esm';

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
  const enc = new TextEncoder();
  const data = enc.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
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
    aiApiKeyInput.placeholder = "••••••••••••••••••••";
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

  // No need to apply theme here, initTheme in theme.js handles it.
}

async function verifyCurrentPassword(secret) {
  const storedHash = await getSetting('secretHash');
  if (!storedHash) return true; // No password set yet
  
  const inputHash = await hashSecret(secret);
  return inputHash === storedHash;
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
  ];

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


// Initialize the app
loadSettings().then(() => {
  handleTabSwitching();
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

  // Handle tab switching
  handleTabSwitching();
  const aiProviderSelect = document.getElementById('aiProvider');
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', toggleAiProviderSettings);
  }
});

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
