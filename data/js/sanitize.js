import DOMPurify from './vendor/purify.es.mjs';

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ['style'],
  ADD_ATTR: ['target']
};

export function sanitizeHtml(html) {
  if (typeof html !== 'string' || html === '') return html ?? '';
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function htmlToPlainText(html) {
  const tmp = document.createElement('template');
  tmp.innerHTML = sanitizeHtml(html || '');
  return (tmp.content.textContent || '').replace(/\s+/g, ' ').trim();
}
