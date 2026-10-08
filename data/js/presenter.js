import { getDocument } from './idb.js';
import { renderSlideInto } from './slide-render.js';

// Presenter window: shows the current slide, the next one, and the speaker notes.
// It stays in sync with the presentation editor over the same BroadcastChannel the editor uses.
const params = new URLSearchParams(location.search);
const docId = params.get('id');

const titleEl = document.getElementById('presenterTitle');
const counterEl = document.getElementById('presenterCounter');
const timerEl = document.getElementById('timer');
const resetTimerBtn = document.getElementById('resetTimer');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const currentEl = document.getElementById('currentSlide');
const nextEl = document.getElementById('nextSlide');
const endMsg = document.getElementById('endMsg');
const notesEl = document.getElementById('notes');
const errorEl = document.getElementById('presenterError');
const mainEl = document.getElementById('presenterMain');

let presentation = null;
let index = Math.max(0, parseInt(params.get('slide') || '0', 10) || 0);
let startedAt = Date.now();

const channel = docId && 'BroadcastChannel' in window
  ? new BroadcastChannel(`buddydocs-present-${docId}`)
  : null;

function slides() {
  return presentation?.slides || [];
}

function clampIndex(i) {
  return Math.min(Math.max(i, 0), Math.max(slides().length - 1, 0));
}

function render() {
  if (!presentation) return;
  const list = slides();
  index = clampIndex(index);

  renderSlideInto(currentEl, list[index]);
  if (index + 1 < list.length) {
    renderSlideInto(nextEl, list[index + 1]);
    nextEl.hidden = false;
    endMsg.hidden = true;
  } else {
    nextEl.innerHTML = '';
    nextEl.hidden = true;
    endMsg.hidden = false;
  }

  notesEl.textContent = list[index]?.notes || 'No notes for this slide.';
  counterEl.textContent = list.length ? `${index + 1} / ${list.length}` : '0 / 0';
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index >= list.length - 1;
}

function go(i, { broadcast = true } = {}) {
  if (!presentation) return;
  index = clampIndex(i);
  render();
  if (broadcast) channel?.postMessage({ type: 'goto', index });
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  mainEl.hidden = true;
}

async function loadPresentation() {
  const doc = await getDocument(docId);
  if (!doc || doc.type !== 'presentation') return false;
  presentation = doc;
  titleEl.textContent = doc.title || 'Untitled Presentation';
  document.title = `Presenter • ${titleEl.textContent}`;
  return true;
}

async function reloadPresentation() {
  if (await loadPresentation()) render();
}

function tick() {
  const total = Math.floor((Date.now() - startedAt) / 1000);
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  timerEl.textContent = `${mins}:${secs}`;
}

prevBtn.addEventListener('click', () => go(index - 1));
nextBtn.addEventListener('click', () => go(index + 1));
resetTimerBtn.addEventListener('click', () => {
  startedAt = Date.now();
  tick();
});

document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  // Space on a focused button should activate that button, not advance the slide
  if (e.key === ' ' && e.target.closest?.('button')) return;

  switch (e.key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      e.preventDefault();
      go(index + 1);
      break;
    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      go(index - 1);
      break;
    case 'Home':
      e.preventDefault();
      go(0);
      break;
    case 'End':
      e.preventDefault();
      go(slides().length - 1);
      break;
  }
});

channel?.addEventListener('message', (e) => {
  if (e.data?.type === 'goto' && Number.isInteger(e.data.index)) {
    go(e.data.index, { broadcast: false });
  } else if (e.data?.type === 'doc') {
    reloadPresentation();
  }
});

window.addEventListener('resize', () => {
  if (presentation) render();
});

async function init() {
  if (!docId) {
    showError('No presentation specified. Open presenter view from the presentation editor.');
    return;
  }
  const ok = await loadPresentation();
  if (!ok) {
    showError('Presentation not found. Save it in the editor first, then try again.');
    return;
  }
  setInterval(tick, 1000);
  tick();
  render();
}

init();
