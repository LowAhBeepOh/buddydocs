import { getSetting, setSetting, tx, deleteDocument, saveDocument, STORES } from './idb.js';

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
  const theme = await getSetting('theme', 'light');
  const fontSize = await getSetting('fontSize', 16);
  const highContrast = await getSetting('highContrast', false);
  const reduceMotion = await getSetting('reduceMotion', false);
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
  const smartComposeTrainFromDocs = await getSetting('smartComposeTrainFromDocs', false);
  const scConf = await getSetting('smartComposeConfThresh', 0.88);
  const scMinCtx = await getSetting('smartComposeMinContext', 2);
  const scMaxCont = await getSetting('smartComposeMaxCont', 2);
  const scRequireNames = await getSetting('smartComposeRequireSeenNames', true);
  
  // AI Welcome Message Settings
  const aiWelcomeEnabled = await getSetting('aiWelcomeEnabled', false);
  const aiWelcomeTone = await getSetting('aiWelcomeTone', 'casual');
  const aiWelcomeCustomTone = await getSetting('aiWelcomeCustomTone', '');

  document.getElementById('themeSelect').value = theme;
  document.getElementById('fontSize').value = fontSize;
  const fsOut = document.getElementById('fontSizeValue');
  if (fsOut) fsOut.textContent = `${fontSize}px`;
  document.getElementById('highContrast').checked = !!highContrast;
  document.getElementById('reduceMotion').checked = !!reduceMotion;
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

  // Apply current theme instantly on settings page
  root.setAttribute('data-theme', theme);
  updateMetaThemeColor();
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
  const theme = document.getElementById('themeSelect').value;
  const fontSize = Number(document.getElementById('fontSize').value);
  const highContrast = document.getElementById('highContrast').checked;
  const reduceMotion = document.getElementById('reduceMotion').checked;
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
  const aiModel = document.getElementById('aiModel').value.trim();
  const aiBaseUrl = document.getElementById('aiBaseUrl').value.trim() || 'http://localhost:11434';
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
    setSetting('aiWelcomeEnabled', aiWelcomeEnabled),
    setSetting('aiWelcomeTone', aiWelcomeTone),
    setSetting('aiWelcomeCustomTone', aiWelcomeCustomTone),
    setSetting('usePin', usePin),
  ]);

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

// Initialize the app
loadSettings().then(() => {
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
});

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

// Security label toggle
document.getElementById('usePin')?.addEventListener('change', (e)=>{
  const isPin = !!e.target.checked;
  const labelEl = document.getElementById('secretLabel');
  if (labelEl) labelEl.textContent = isPin ? 'PIN' : 'Password';
  const input = document.getElementById('secretInput');
  if (input) input.placeholder = isPin ? 'Set 4-8 digit PIN' : 'Set password';
});
