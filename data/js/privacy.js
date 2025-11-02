const LATEST_POLICY_VERSION = '2025-11-02';
const SEEN_POLICY_VERSION_KEY = 'seenPrivacyPolicyVersion';
const UPDATE_BANNER_DISMISSED_KEY = 'privacyUpdateBannerDismissed';

function getSeenPolicyVersion() {
  return localStorage.getItem(SEEN_POLICY_VERSION_KEY);
}

function setSeenPolicyVersion(version) {
  localStorage.setItem(SEEN_POLICY_VERSION_KEY, version);
}

function isUpdateBannerDismissed() {
  return localStorage.getItem(UPDATE_BANNER_DISMISSED_KEY) === 'true';
}

function setUpdateBannerDismissed() {
  localStorage.setItem(UPDATE_BANNER_DISMISSED_KEY, 'true');
}

function clearUpdateBannerDismissed() {
  localStorage.removeItem(UPDATE_BANNER_DISMISSED_KEY);
}

function formatPolicyDate(isoDate) {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate + 'T00:00:00');
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return isoDate;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const privacyBanner = document.getElementById('privacy-banner');
  if (!privacyBanner) return;

  const readPrivacyBtn = document.getElementById('read-privacy');
  const dismissPrivacyBtn = document.getElementById('dismiss-privacy');
  const privacyDateEl = document.getElementById('privacy-date');
  const consentBannerPending = localStorage.getItem('privacyBannerDismissed') !== 'true';

  const latestVersion = LATEST_POLICY_VERSION;
  let seenVersion = getSeenPolicyVersion();

  // Always set the date for debugging.
  if (privacyDateEl) {
    privacyDateEl.textContent = formatPolicyDate(latestVersion);
  }

  // Attach listeners unconditionally to ensure clicks are captured
  if (readPrivacyBtn) {
    readPrivacyBtn.addEventListener('click', () => {
      console.debug('[privacy] Read Change clicked');
      setSeenPolicyVersion(latestVersion);
      setUpdateBannerDismissed();
    });
  }

  if (dismissPrivacyBtn) {
    dismissPrivacyBtn.addEventListener('click', (e) => {
      console.debug('[privacy] Dismiss clicked');
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}
      setSeenPolicyVersion(latestVersion);
      setUpdateBannerDismissed();
      // Hide the banner robustly: both via attribute and removing from DOM
      privacyBanner.hidden = true;
      privacyBanner.classList.add('hidden');
      console.debug('[privacy] Banner hidden flag set');
      // If attribute/class-based hiding fails due to CSS, remove the element
      setTimeout(() => {
        if (privacyBanner && !privacyBanner.hasAttribute('hidden')) {
          privacyBanner.setAttribute('hidden', '');
        }
        // As a final fallback, remove from DOM
        if (privacyBanner && document.body.contains(privacyBanner)) {
          privacyBanner.remove();
        }
        console.debug('[privacy] Banner removed from DOM');
      }, 0);
    });
  }

  // If user previously dismissed but for some reason the seen version wasn't recorded,
  // record it now to keep the banner hidden for this version.
  if (isUpdateBannerDismissed() && latestVersion && !seenVersion) {
    setSeenPolicyVersion(latestVersion);
    seenVersion = latestVersion;
  }

  // If a new version is available, clear previous dismissal so the banner can show
  if (latestVersion && latestVersion !== seenVersion) {
    clearUpdateBannerDismissed();
  }

  const shouldShowUpdateBanner = (
    latestVersion && latestVersion !== seenVersion && !consentBannerPending && !isUpdateBannerDismissed()
  );

  if (shouldShowUpdateBanner) {
    privacyBanner.hidden = false;
  } else if (!seenVersion && latestVersion) {
    setSeenPolicyVersion(latestVersion);
  }
  // If user has dismissed the update banner for the current version, ensure it's hidden immediately
  if (isUpdateBannerDismissed() && latestVersion === seenVersion) {
    privacyBanner.hidden = true;
    privacyBanner.classList.add('hidden');
    // Remove to guarantee it doesn't flash due to CSS/JS timing
    setTimeout(() => {
      if (privacyBanner && document.body.contains(privacyBanner)) {
        privacyBanner.remove();
      }
    }, 0);
  }
});