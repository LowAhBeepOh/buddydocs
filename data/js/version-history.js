// Version History System for Buddy Docs
import { getDocument, saveDocument } from './idb.js';

const MAX_VERSIONS = 50; // Keep last 50 versions

// Save a version snapshot
export async function saveVersion(docId, content, title) {
  const doc = await getDocument(docId);
  if (!doc) return;

  if (!doc.versions) {
    doc.versions = [];
  }

  const version = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    content: content,
    title: title || doc.title,
    wordCount: countWords(content)
  };

  doc.versions.unshift(version);

  // Keep only the last MAX_VERSIONS
  if (doc.versions.length > MAX_VERSIONS) {
    doc.versions = doc.versions.slice(0, MAX_VERSIONS);
  }

  await saveDocument(doc);
}

// Get all versions for a document
export async function getVersions(docId) {
  const doc = await getDocument(docId);
  return doc?.versions || [];
}

// Restore a specific version
export async function restoreVersion(docId, versionId) {
  const doc = await getDocument(docId);
  if (!doc || !doc.versions) return null;

  const version = doc.versions.find(v => v.id === versionId);
  if (!version) return null;

  // Save current state as a version before restoring
  await saveVersion(docId, doc.content, doc.title);

  // Restore the version
  doc.content = version.content;
  doc.title = version.title;
  doc.updatedAt = Date.now();

  await saveDocument(doc);
  return doc;
}

// Delete a specific version
export async function deleteVersion(docId, versionId) {
  const doc = await getDocument(docId);
  if (!doc || !doc.versions) return;

  doc.versions = doc.versions.filter(v => v.id !== versionId);
  await saveDocument(doc);
}

// Helper function to count words
function countWords(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const text = temp.textContent || temp.innerText || '';
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Format timestamp for display
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  // Format as date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

// Show version history modal
export function showVersionHistoryModal(docId, onRestore) {
  const modal = document.createElement('div');
  modal.className = 'version-history-modal';
  modal.innerHTML = `
    <div class="version-history-card">
      <div class="version-history-header">
        <h3>
          <span class="material-symbols-outlined">history</span>
          Version History
        </h3>
        <button class="icon-btn close-version-history">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="version-history-body">
        <div class="version-list" id="versionList">
          <div style="text-align: center; padding: 40px; color: var(--muted);">
            Loading versions...
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close button
  modal.querySelector('.close-version-history').addEventListener('click', () => {
    modal.remove();
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Load and display versions
  loadVersions(docId, modal, onRestore);
}

async function loadVersions(docId, modal, onRestore) {
  const versions = await getVersions(docId);
  const versionList = modal.querySelector('#versionList');

  if (versions.length === 0) {
    versionList.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--muted);">
        <span class="material-symbols-outlined" style="font-size: 48px; display: block; margin-bottom: 12px;">history</span>
        <div>No version history yet</div>
        <div style="font-size: 12px; margin-top: 8px;">Versions are automatically saved as you edit</div>
      </div>
    `;
    return;
  }

  versionList.innerHTML = '';

  versions.forEach((version, index) => {
    const item = document.createElement('div');
    item.className = 'version-item';
    item.innerHTML = `
      <span class="material-symbols-outlined version-item-icon">schedule</span>
      <div class="version-item-info">
        <div class="version-item-time">${formatTimestamp(version.timestamp)}</div>
        <div class="version-item-details">${version.wordCount} words • ${version.title}</div>
      </div>
      <div class="version-item-actions">
        <button class="version-btn view-version" data-version-id="${version.id}">View</button>
        <button class="version-btn primary restore-version" data-version-id="${version.id}">Restore</button>
      </div>
    `;

    // View version
    item.querySelector('.view-version').addEventListener('click', () => {
      showVersionPreview(version);
    });

    // Restore version
    item.querySelector('.restore-version').addEventListener('click', async () => {
      if (confirm('Are you sure you want to restore this version? Your current content will be saved as a version.')) {
        const restored = await restoreVersion(docId, version.id);
        if (restored && onRestore) {
          onRestore(restored);
        }
        modal.remove();
      }
    });

    versionList.appendChild(item);
  });
}

function showVersionPreview(version) {
  const preview = document.createElement('div');
  preview.className = 'version-history-modal';
  preview.innerHTML = `
    <div class="version-history-card">
      <div class="version-history-header">
        <h3>
          <span class="material-symbols-outlined">visibility</span>
          Version Preview
        </h3>
        <button class="icon-btn close-preview">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="version-history-body">
        <div style="margin-bottom: 16px; padding: 12px; background: color-mix(in hsl, var(--primary) 6%, var(--surface)); border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-weight: 600; margin-bottom: 4px;">${version.title}</div>
          <div style="font-size: 12px; color: var(--muted);">${formatTimestamp(version.timestamp)} • ${version.wordCount} words</div>
        </div>
        <div style="padding: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; max-height: 400px; overflow-y: auto; line-height: 1.6;">
          ${version.content}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(preview);

  preview.querySelector('.close-preview').addEventListener('click', () => {
    preview.remove();
  });

  preview.addEventListener('click', (e) => {
    if (e.target === preview) {
      preview.remove();
    }
  });
}
