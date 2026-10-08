// Formatbar items the user can hide. `selector` is matched inside the editor's .formatbar.
export const TOOLBAR_ITEMS = [
  { key: 'undo', label: 'Undo', selector: '[data-cmd="undo"]' },
  { key: 'redo', label: 'Redo', selector: '[data-cmd="redo"]' },
  { key: 'blockFormat', label: 'Block style', selector: '#blockFormat' },
  { key: 'fontName', label: 'Font family', selector: '.font-controls' },
  { key: 'bold', label: 'Bold', selector: '[data-cmd="bold"]' },
  { key: 'italic', label: 'Italic', selector: '[data-cmd="italic"]' },
  { key: 'underline', label: 'Underline', selector: '[data-cmd="underline"]' },
  { key: 'strikeThrough', label: 'Strikethrough', selector: '[data-cmd="strikeThrough"]' },
  { key: 'subscript', label: 'Subscript', selector: '#subBtn' },
  { key: 'superscript', label: 'Superscript', selector: '#supBtn' },
  { key: 'highlight', label: 'Text highlight', selector: '.highlight-dropdown-container' },
  { key: 'insertTable', label: 'Insert table', selector: '#insertTableBtn' },
  { key: 'alignLeft', label: 'Align left', selector: '[data-cmd="justifyLeft"]' },
  { key: 'alignCenter', label: 'Align center', selector: '[data-cmd="justifyCenter"]' },
  { key: 'alignRight', label: 'Align right', selector: '[data-cmd="justifyRight"]' },
  { key: 'bulletList', label: 'Bulleted list', selector: '[data-cmd="insertUnorderedList"]' },
  { key: 'numberedList', label: 'Numbered list', selector: '[data-cmd="insertOrderedList"]' },
  { key: 'insertLink', label: 'Insert link', selector: '#insertLink' },
  { key: 'insertImage', label: 'Insert image', selector: '#insertImage' },
  { key: 'clearFormat', label: 'Clear formatting', selector: '#clearFormat' },
];

// Hides the chosen items, then hides any separator that would sit next to nothing.
export function applyToolbarVisibility(bar, hiddenKeys) {
  const hidden = new Set(hiddenKeys);
  for (const item of TOOLBAR_ITEMS) {
    const el = bar.querySelector(item.selector);
    if (el) el.style.display = hidden.has(item.key) ? 'none' : '';
  }

  // A separator is shown only if visible content exists on both of its sides.
  let pendingSep = null;
  let seenContent = false;
  for (const child of [...bar.children]) {
    if (child.classList.contains('sep')) {
      child.style.display = 'none';
      pendingSep = child;
    } else if (!child.hidden && child.style.display !== 'none') {
      if (pendingSep && seenContent) pendingSep.style.display = '';
      pendingSep = null;
      seenContent = true;
    }
  }
}
