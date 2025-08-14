import { getDocument, saveDocument, deleteDocument, setSetting, getSetting } from './idb.js';
import { applyEditorPrefs } from './theme.js';

const editor = document.getElementById('editor');
const titleEl = document.getElementById('docTitle');
const typeEl = document.getElementById('docType');
const dueEl = document.getElementById('dueDate');
const tagsEl = document.getElementById('tags');

let currentDoc = { id:null, title:'Untitled', type:'document', content:'', dueDate:null, tags:[], createdAt: Date.now(), updatedAt: Date.now() };

function getParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function applyBlock(tag){
  if (tag === 'p') document.execCommand('formatBlock', false, 'p');
  else if (tag === 'blockquote') document.execCommand('formatBlock', false, 'blockquote');
  else if (tag === 'pre') document.execCommand('formatBlock', false, 'pre');
  else document.execCommand('formatBlock', false, tag);
}

function updateToolbarForType(type) {
  // Get all toolbar items that should be hidden for certain types
  const imageBtn = document.getElementById('insertImage');
  const linkBtn = document.getElementById('insertLink');
  const blockFormatSelect = document.getElementById('blockFormat');
  const imageInput = document.getElementById('imageInput');
  
  if (type === 'list') {
    // For list type, hide everything except basic formatting and list buttons
    imageBtn.style.display = 'none';
    linkBtn.style.display = 'none';
    imageInput.style.display = 'none';
    
    // Show only paragraph and list options in block format
    Array.from(blockFormatSelect.options).forEach(option => {
      const value = option.value;
      if (!['p', 'h2', 'h3'].includes(value)) {
        option.style.display = 'none';
      }
    });

  } else if (type === 'document') {
    // For document type, show everything
    imageBtn.style.display = '';
    linkBtn.style.display = '';
    imageInput.style.display = '';
    
    Array.from(blockFormatSelect.options).forEach(option => {
      option.style.display = '';
    });
  }

  // If it's gallery type, redirect to gallery.html
  if (type === 'gallery') {
    const id = getParam('id');
    location.href = `gallery.html${id ? '?id=' + id : ''}`;
    return;
  }
}

function bindToolbar(){
  document.querySelectorAll('.formatbar [data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      document.execCommand(cmd, false);
      editor.focus();
    });
  });
  // top menu actions (File/Edit/View/Insert/Format/Tools/Help)
  // Menus are lightweight; many items map to existing actions/shortcuts
  const menuContainer = document.querySelector('.menu-row');
  if (menuContainer){
    menuContainer.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.menu-btn');
      if (!btn) return;
      const name = btn.dataset.menu;
      switch(name){
        case 'file':
          toggleFileMenu();
          break;
        case 'edit':
          document.execCommand('selectAll');
          break;
        case 'view':
          // toggle compact formatbar
          document.querySelector('.formatbar')?.classList.toggle('compact');
          break;
        case 'insert':
          document.getElementById('insertImage')?.click();
          break;
        case 'format':
          document.getElementById('blockFormat')?.focus();
          break;
        case 'tools':
          toggleToolsMenu();
          break;
        case 'help':
          alert('Buddy Docs — Editor Help coming soon.');
          break;
      }
    });
  }
  // block format select
  const blockSel = document.getElementById('blockFormat');
  if (blockSel){
    blockSel.addEventListener('change', () => {
      applyBlock(blockSel.value);
      editor.focus();
    });
  }
  // image
  const imgBtn = document.getElementById('insertImage');
  const imgInput = document.getElementById('imageInput');
  imgBtn.addEventListener('click', ()=> imgInput.click());
  imgInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => document.execCommand('insertImage', false, reader.result);
    reader.readAsDataURL(file);
  });
  // link
  const linkBtn = document.getElementById('insertLink');
  linkBtn.addEventListener('click', () => {
    const url = prompt('Enter URL');
    if (!url) return;
    document.execCommand('createLink', false, url);
    editor.focus();
  });
  // clear formatting
  const clr = document.getElementById('clearFormat');
  clr.addEventListener('click', () => {
    document.execCommand('removeFormat');
    // unwrap links
    document.execCommand('unlink');
    editor.focus();
  });
}

function bindMeta(){
  titleEl.addEventListener('input', () => currentDoc.title = titleEl.textContent.trim() || 'Untitled');
  typeEl.addEventListener('change', (e) => {
    // Prevent changing to gallery type if document already exists
    if (e.target.value === 'gallery' && currentDoc.id) {
      e.preventDefault();
      typeEl.value = currentDoc.type; // Revert selection
      alert('Cannot convert existing documents to galleries. Please create a new gallery instead.');
      return;
    }
    currentDoc.type = typeEl.value;
    updateToolbarForType(typeEl.value);
  });
  dueEl.addEventListener('change', () => currentDoc.dueDate = dueEl.value || null);
  tagsEl.addEventListener('change', () => currentDoc.tags = tagsEl.value.split(',').map(s=>s.trim()).filter(Boolean));
}

function autosave(){
  let t;
  function queue(){
    clearTimeout(t);
    // immediately show unsaved state
    const iconPending = document.getElementById('syncIcon');
    if (iconPending){ iconPending.textContent = 'sync'; iconPending.classList.remove('spin'); }
    t = setTimeout(async () => {
      currentDoc.content = editor.innerHTML;
      const icon = document.getElementById('syncIcon');
      if (icon){ icon.textContent = 'sync'; icon.classList.add('spin'); }
      await saveDocument(currentDoc);
      if (icon){ icon.textContent = 'check'; icon.classList.remove('spin'); }
    }, 600);
  }
  editor.addEventListener('input', queue);
  titleEl.addEventListener('input', queue);
  typeEl.addEventListener('change', queue);
  dueEl.addEventListener('change', queue);
  tagsEl.addEventListener('change', queue);
}

async function loadOrCreate(){
  const id = getParam('id');
  const type = getParam('type');
  if (id){
    const d = await getDocument(id);
    if (d){
      currentDoc = d;
    }
  } else if (type){
    currentDoc.type = type;
  }
  titleEl.textContent = currentDoc.title || 'Untitled';
  typeEl.value = currentDoc.type || 'document';
  if (currentDoc.dueDate) dueEl.value = currentDoc.dueDate;
  if (currentDoc.tags?.length) tagsEl.value = currentDoc.tags.join(', ');
  editor.innerHTML = currentDoc.content || placeholderForType(currentDoc.type);
  
  // Update toolbar for current document type
  updateToolbarForType(currentDoc.type);
  
  // Update status bar and outline after loading content
  setTimeout(() => {
    updateStatusCounts();
    buildOutline();
  }, 0);
}

function placeholderForType(type){
  switch(type){
    case 'essay': return `<h1>Essay title</h1><h3>Subtitle</h3><p>Start with an introduction...</p>`;
    case 'list': return `<h2>List</h2><ul><li>First item</li><li>Second item</li></ul>`;
    case 'gallery': return `<h2>Gallery</h2><p>Insert images with the image button.</p>`;
    default: return `<h1>Untitled Document</h1><p>Start typing...</p>`;
  }
}

async function saveNow(){
  currentDoc.content = editor.innerHTML;
  const icon = document.getElementById('syncIcon');
  if (icon){ icon.textContent = 'sync'; icon.classList.add('spin'); }
  const saved = await saveDocument(currentDoc);
  if (!getParam('id')){
    history.replaceState({}, '', `editor.html?id=${encodeURIComponent(saved.id)}`);
  }
  if (icon){ icon.textContent = 'check'; icon.classList.remove('spin'); }
}

async function deleteNow(){
  if (!currentDoc.id) return;
  const ok = confirm('Delete this document?');
  if (!ok) return;
  await deleteDocument(currentDoc.id);
  location.href = './';
}

function toggleFileMenu(){
  const btn = document.getElementById('fileMenuBtn');
  const menu = document.getElementById('fileDropdown');
  if (!btn || !menu) return;
  const open = menu.hasAttribute('hidden') ? false : true;
  if (open){
    menu.setAttribute('hidden','');
    btn.setAttribute('aria-expanded','false');
    document.removeEventListener('click', onDocClick);
    return;
  }
  // position the menu below the File button
  const r = btn.getBoundingClientRect();
  menu.style.left = `${r.left}px`;
  menu.style.top = `${r.bottom + 6 + window.scrollY}px`;
  menu.removeAttribute('hidden');
  btn.setAttribute('aria-expanded','true');
  setTimeout(()=> document.addEventListener('click', onDocClick));
  function onDocClick(ev){
    if (!menu.contains(ev.target) && ev.target !== btn){
      menu.setAttribute('hidden','');
      btn.setAttribute('aria-expanded','false');
      document.removeEventListener('click', onDocClick);
    }
  }
}

function toggleToolsMenu(){
  const btn = document.getElementById('toolsMenuBtn');
  const menu = document.getElementById('toolsDropdown');
  if (!btn || !menu) return;
  const open = menu.hasAttribute('hidden') ? false : true;
  if (open){
    menu.setAttribute('hidden','');
    btn.setAttribute('aria-expanded','false');
    document.removeEventListener('click', onDocClick);
    return;
  }
  // position the menu below the Tools button
  const r = btn.getBoundingClientRect();
  menu.style.left = `${r.left}px`;
  menu.style.top = `${r.bottom + 6 + window.scrollY}px`;
  menu.removeAttribute('hidden');
  btn.setAttribute('aria-expanded','true');
  setTimeout(()=> document.addEventListener('click', onDocClick));
  function onDocClick(ev){
    if (!menu.contains(ev.target) && ev.target !== btn){
      menu.setAttribute('hidden','');
      btn.setAttribute('aria-expanded','false');
      document.removeEventListener('click', onDocClick);
    }
  }
}

// Document Settings modal controls
function openDocSettings(){
  const modal = document.getElementById('docSettingsModal');
  const fileDrop = document.getElementById('fileDropdown');
  if (fileDrop && !fileDrop.hasAttribute('hidden')) fileDrop.setAttribute('hidden','');
  if (modal){
    modal.removeAttribute('hidden');
    // Close when clicking backdrop (outside card)
    modal.addEventListener('click', onBackdrop);
  }
}
function closeDocSettings(){
  const modal = document.getElementById('docSettingsModal');
  if (modal){
    modal.setAttribute('hidden','');
    modal.removeEventListener('click', onBackdrop);
  }
}
function onBackdrop(e){
  const card = document.querySelector('#docSettingsModal .modal-card');
  if (card && !card.contains(e.target)) closeDocSettings();
}

// ------- Export helpers -------
function downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function exportBdox(){
  const data = {
    meta: { version: 5, app: 'BuddyDocs' },
    document: currentDoc
  };
  const jsonData = JSON.stringify(data, null, 2);
  const encoded = btoa(unescape(encodeURIComponent(jsonData))); // base64 encode
  const blob = new Blob([encoded], { type: 'application/octet-stream' });
  const name = `${(currentDoc.title||'document').replace(/[^\w\-]+/g,'_')}.bdox`;
  downloadBlob(blob, name);
}

function htmlToPlainText(html){
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim();
}

async function exportAs(type){
  const titleSafe = (currentDoc.title||'document').replace(/[^\w\-]+/g,'_');
  if (type === 'txt'){
    const blob = new Blob([htmlToPlainText(currentDoc.content||'')], { type: 'text/plain;charset=utf-8' });
    return downloadBlob(blob, `${titleSafe}.txt`);
  }
  if (type === 'md'){
    // naive markdown: strip tags and keep headings/list markers where possible
    let html = currentDoc.content || '';
    html = html.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
    html = html.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
    html = html.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
    html = html.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
    html = html.replace(/<br\s*\/?>(\n)?/gi, '\n');
    const text = htmlToPlainText(html);
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    return downloadBlob(blob, `${titleSafe}.md`);
  }
  if (type === 'bdox') return exportBdox();

  if (type === 'pdf'){
    // Generate real PDF using html2pdf.js
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: 'Inter Tight', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #333; border-bottom: 2px solid #0550FF; padding-bottom: 10px; margin-bottom: 30px;">
          ${currentDoc.title || 'Untitled Document'}
        </h1>
        <div style="line-height: 1.6; color: #000;">
          ${currentDoc.content || ''}
        </div>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; font-size: 14px; color: #666; text-align: center;">
          Written in <a style="color: #0550FF; text-decoration: none;" href="https://lowahbeepoh.github.io/buddydocs" target="_blank">Buddy Docs</a>
        </div>
      </div>
    `;
    
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${titleSafe}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    try {
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('PDF generation failed. Please try again.');
    }
    return;
  }
  
  if (type === 'docx'){
    // Lightweight client-only fallback: generate HTML file and hint extension
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${currentDoc.title||'Document'}</title></head><body>${currentDoc.content||''}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const suggested = `${titleSafe}.${type}.html`;
    return downloadBlob(blob, suggested);
  }
  
  if (type === 'gdocs'){
    // Copy to clipboard in Google Docs compatible format
    try {
      // First try the modern clipboard API
      if (navigator.clipboard && window.ClipboardItem) {
        // Create a temporary element in the document
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        
        // Clean the content to remove background/highlighting styles
        let cleanContent = currentDoc.content || '';
        // Remove background-color and background styles from all elements
        cleanContent = cleanContent.replace(/background-color:\s*[^;]+;?/gi, '');
        cleanContent = cleanContent.replace(/background:\s*[^;]+;?/gi, '');
        // Remove style attributes that only contain background properties
        cleanContent = cleanContent.replace(/style="[^"]*background[^"]*"/gi, '');
        // Remove empty style attributes
        cleanContent = cleanContent.replace(/style="\s*"/gi, '');
        // Remove empty style attributes with only whitespace
        cleanContent = cleanContent.replace(/style="\s*"/gi, '');
        
        tempDiv.innerHTML = cleanContent;
        document.body.appendChild(tempDiv);
        
        // Select the content
        const range = document.createRange();
        range.selectNodeContents(tempDiv);
        
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Try to copy with formatting
        const success = document.execCommand('copy');
        selection.removeAllRanges();
        
        // Clean up
        document.body.removeChild(tempDiv);
        
        if (success) {
          alert('Document copied to clipboard! You can now paste it into Google Docs.');
          return;
        }
      }
      
      // Fallback: copy as plain text with basic formatting
      const plainText = htmlToPlainText(currentDoc.content || '');
      await navigator.clipboard.writeText(plainText);
      alert('Document copied to clipboard as plain text!');
      
    } catch (error) {
      console.error('Copy failed:', error);
      // Final fallback: copy as plain text
      try {
        const plainText = htmlToPlainText(currentDoc.content || '');
        await navigator.clipboard.writeText(plainText);
        alert('Document copied to clipboard as plain text!');
      } catch (finalError) {
        console.error('Final copy attempt failed:', finalError);
        alert('Copy failed. Please try selecting and copying the content manually.');
      }
    }
    return;
  }
}

function setupAutoFormat(){
  editor.addEventListener('input', (e) => {
    // Only handle text input events
    if (e.inputType !== 'insertText' && e.inputType !== 'insertCompositionText') return;
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const currentNode = range.startContainer;
    
    // Make sure we're in a text node
    if (currentNode.nodeType !== Node.TEXT_NODE) return;
    
    const textContent = currentNode.textContent;
    const cursorPos = range.startOffset;
    
    // Check if we just typed a space after a markdown pattern
    if (e.data === ' ') {
      const textBeforeCursor = textContent.substring(0, cursorPos);
      const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
      const lineText = textBeforeCursor.substring(lineStart);
      
      // Handle unordered lists (- )
      if (lineText === '- ') {
        e.preventDefault();
        transformToList('ul', currentNode, lineStart, cursorPos);
        return;
      }
      
      // Handle ordered lists (1. , 2. , etc.)
      const numberMatch = lineText.match(/^(\d+)\. $/);
      if (numberMatch) {
        e.preventDefault();
        transformToList('ol', currentNode, lineStart, cursorPos, parseInt(numberMatch[1]));
        return;
      }
      
      // Handle headings (# , ## , ### )
      const headingMatch = lineText.match(/^(#{1,6}) $/);
      if (headingMatch) {
        e.preventDefault();
        const level = headingMatch[1].length;
        transformToHeading(level, currentNode, lineStart, cursorPos);
        return;
      }
    }
  });
  
  // Handle backspace to revert formatting
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      const currentElement = range.startContainer.nodeType === Node.TEXT_NODE 
        ? range.startContainer.parentElement 
        : range.startContainer;
      
      // Check if we're at the beginning of a list item or heading
      if (range.startOffset === 0 && range.collapsed) {
        if (currentElement.tagName === 'LI') {
          e.preventDefault();
          revertListItem(currentElement);
          return;
        }
        
        if (/^H[1-6]$/.test(currentElement.tagName)) {
          e.preventDefault();
          revertHeading(currentElement);
          return;
        }
      }
    }
  });
}

function transformToList(type, textNode, lineStart, cursorPos) {
  const parent = textNode.parentElement;
  const textContent = textNode.textContent;
  
  // Split the text content
  const beforeLine = textContent.substring(0, lineStart);
  const afterCursor = textContent.substring(cursorPos);
  
  // Create new elements
  const listElement = document.createElement(type);
  const listItem = document.createElement('li');
  
  // Set the starting number for ordered lists
  if (type === 'ol') {
    const numberMatch = textContent.substring(lineStart, cursorPos).match(/^(\d+)\./);
    if (numberMatch) {
      listElement.start = parseInt(numberMatch[1]);
    }
  }
  
  listItem.textContent = '';
  listElement.appendChild(listItem);
  
  // Replace the content
  if (beforeLine) {
    textNode.textContent = beforeLine;
    parent.insertBefore(listElement, textNode.nextSibling);
  } else {
    parent.replaceChild(listElement, textNode);
  }
  
  if (afterCursor) {
    const afterTextNode = document.createTextNode(afterCursor);
    listElement.parentNode.insertBefore(afterTextNode, listElement.nextSibling);
  }
  
  // Set cursor in the list item
  const range = document.createRange();
  range.setStart(listItem, 0);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function transformToHeading(level, textNode, lineStart, cursorPos) {
  const parent = textNode.parentElement;
  const textContent = textNode.textContent;
  
  // Split the text content
  const beforeLine = textContent.substring(0, lineStart);
  const afterCursor = textContent.substring(cursorPos);
  
  // Create heading element
  const heading = document.createElement(`h${level}`);
  heading.textContent = '';
  
  // Replace the content
  if (beforeLine) {
    textNode.textContent = beforeLine;
    parent.insertBefore(heading, textNode.nextSibling);
  } else {
    parent.replaceChild(heading, textNode);
  }
  
  if (afterCursor) {
    const afterTextNode = document.createTextNode(afterCursor);
    heading.parentNode.insertBefore(afterTextNode, heading.nextSibling);
  }
  
  // Set cursor in the heading
  const range = document.createRange();
  range.setStart(heading, 0);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function revertListItem(listItem) {
  const list = listItem.parentElement;
  const isOrdered = list.tagName === 'OL';
  const startNum = isOrdered ? (list.start || 1) : null;
  
  // Create the markdown text
  const markdownPrefix = isOrdered ? `${startNum}. ` : '- ';
  const content = listItem.textContent;
  
  // Create new paragraph with the markdown text
  const paragraph = document.createElement('p');
  paragraph.textContent = markdownPrefix + content;
  
  // Replace the list with the paragraph
  list.parentNode.replaceChild(paragraph, list);
  
  // Set cursor after the markdown prefix
  const range = document.createRange();
  const textNode = paragraph.firstChild;
  range.setStart(textNode, markdownPrefix.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function revertHeading(heading) {
  const level = parseInt(heading.tagName.substring(1));
  const markdownPrefix = '#'.repeat(level) + ' ';
  const content = heading.textContent;
  
  // Create new paragraph with the markdown text
  const paragraph = document.createElement('p');
  paragraph.textContent = markdownPrefix + content;
  
  // Replace the heading with the paragraph
  heading.parentNode.replaceChild(paragraph, heading);
  
  // Set cursor after the markdown prefix
  const range = document.createRange();
  const textNode = paragraph.firstChild;
  range.setStart(textNode, markdownPrefix.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function keyboardShortcuts(){
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
      e.preventDefault();
      saveNow();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
      e.preventDefault();
      const url = prompt('Enter URL');
      if (url) document.execCommand('createLink', false, url);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '/'){
      e.preventDefault();
      document.getElementById('blockFormat').focus();
    }
    // Word count popup (Ctrl+Shift+C)
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c'){
      e.preventDefault();
      showWordCountPopup();
    }
    // Bold (Ctrl+B)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b'){
      e.preventDefault();
      document.execCommand('bold', false);
    }
    // Italic (Ctrl+I)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i'){
      e.preventDefault();
      document.execCommand('italic', false);
    }
    // Underline (Ctrl+U)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u'){
      e.preventDefault();
      document.execCommand('underline', false);
    }
    // Select All (Ctrl+A)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a'){
      e.preventDefault();
      document.execCommand('selectAll', false);
    }
    // Undo (Ctrl+Z)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey){
      e.preventDefault();
      document.execCommand('undo', false);
    }
    // Redo (Ctrl+Y or Ctrl+Shift+Z)
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))){
      e.preventDefault();
      document.execCommand('redo', false);
    }
  });
}

// Word count popup functionality
function showWordCountPopup() {
  const content = editor.innerText || '';
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const characters = content.length;
  const charactersNoSpaces = content.replace(/\s/g, '').length;
  const pages = Math.ceil(characters / 1800); // Rough estimate: ~1800 characters per page
  
  // Remove existing popup if any
  const existingPopup = document.getElementById('wordCountPopup');
  if (existingPopup) {
    existingPopup.remove();
  }
  
  // Create popup
  const popup = document.createElement('div');
  popup.id = 'wordCountPopup';
  popup.className = 'word-count-popup';
  popup.innerHTML = `
    <div class="word-count-header">
      <span class="material-symbols-outlined">analytics</span>
      <span>Document Statistics</span>
      <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="word-count-content">
      <div class="stat-item">
        <span class="stat-label">Words</span>
        <span class="stat-value">${words.toLocaleString()}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Characters</span>
        <span class="stat-value">${characters.toLocaleString()}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Characters (no spaces)</span>
        <span class="stat-value">${charactersNoSpaces.toLocaleString()}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Pages (estimated)</span>
        <span class="stat-value">${pages}</span>
      </div>
    </div>
  `;
  
  // Position popup near the editor
  document.body.appendChild(popup);
  
  // Position the popup in the center of the viewport
  const rect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  popup.style.left = `${(viewportWidth - rect.width) / 2}px`;
  popup.style.top = `${(viewportHeight - rect.height) / 2}px`;
  
  // Auto-close after 5 seconds
  setTimeout(() => {
    if (popup.parentElement) {
      popup.remove();
    }
  }, 5000);
  
  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      popup.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  // Close on click outside
  const handleClickOutside = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
}

// Keyboard shortcuts help popup
function showKeyboardShortcutsHelp() {
  // Remove existing popup if any
  const existingPopup = document.getElementById('shortcutsHelpPopup');
  if (existingPopup) {
    existingPopup.remove();
  }
  
  // Create popup
  const popup = document.createElement('div');
  popup.id = 'shortcutsHelpPopup';
  popup.className = 'shortcuts-help-popup';
  popup.innerHTML = `
    <div class="shortcuts-help-header">
      <span class="material-symbols-outlined">keyboard</span>
      <span>Keyboard Shortcuts</span>
      <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="shortcuts-help-content">
      <div class="shortcut-group">
        <h4>Document</h4>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+S</span>
          <span class="shortcut-desc">Save document</span>
        </div>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+Shift+C</span>
          <span class="shortcut-desc">Word count & statistics</span>
        </div>
      </div>
      <div class="shortcut-group">
        <h4>Editing</h4>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+Z</span>
          <span class="shortcut-desc">Undo</span>
        </div>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+Y</span>
          <span class="shortcut-desc">Redo</span>
        </div>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+A</span>
          <span class="shortcut-desc">Select all</span>
        </div>
      </div>
      <div class="shortcut-group">
        <h4>Formatting</h4>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+B</span>
          <span class="shortcut-desc">Bold</span>
        </div>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+I</span>
          <span class="shortcut-desc">Italic</span>
        </div>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+U</span>
          <span class="shortcut-desc">Underline</span>
        </div>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+K</span>
          <span class="shortcut-desc">Insert link</span>
        </div>
        <div class="shortcut-item">
          <span class="shortcut-key">Ctrl+/</span>
          <span class="shortcut-desc">Block format</span>
        </div>
      </div>
      <div class="shortcut-group">
        <h4>Navigation</h4>
        <div class="shortcut-item">
          <span class="shortcut-key">Alt+F</span>
          <span class="shortcut-desc">File menu</span>
        </div>
      </div>
    </div>
  `;
  
  // Position popup
  document.body.appendChild(popup);
  
  // Position the popup in the center of the viewport
  const rect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  popup.style.left = `${(viewportWidth - rect.width) / 2}px`;
  popup.style.top = `${(viewportHeight - rect.height) / 2}px`;
  
  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      popup.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  // Close on click outside
  const handleClickOutside = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
}

bindToolbar();
bindMeta();
autosave();
setupAutoFormat();
keyboardShortcuts();
loadOrCreate();
applyEditorPrefs();
setupToolsMenu();

// Del button (Save button removed; saving is automatic and via Ctrl/Cmd+S)
document.getElementById('deleteBtn')?.addEventListener('click', deleteNow);

// Archive toggle via File menu
document.getElementById('archiveBtn')?.addEventListener('click', async ()=>{
  currentDoc.archived = !currentDoc.archived;
  await saveNow();
  alert(currentDoc.archived ? 'Archived' : 'Unarchived');
});

// Document settings modal bindings
document.getElementById('openDocSettings')?.addEventListener('click', (e)=>{ e.preventDefault(); openDocSettings(); });
document.getElementById('closeDocSettings')?.addEventListener('click', closeDocSettings);

// Export buttons
document.getElementById('exportBdoxBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); exportBdox(); });
document.getElementById('exportAsBtn')?.addEventListener('click', (e)=>{
  e.preventDefault();
  const trigger = e.currentTarget;
  const menu = document.getElementById('exportAsMenu');
  const dropdown = document.getElementById('fileDropdown');
  if (!menu || !trigger) return;
  const r = trigger.getBoundingClientRect();
  menu.style.left = `${r.right + 8}px`;
  menu.style.top = `${r.top + window.scrollY}px`;
  menu.toggleAttribute('hidden');
  // Close when clicking elsewhere
  function onDoc(ev){
    if (!menu.contains(ev.target) && ev.target !== trigger){
      menu.setAttribute('hidden','');
      document.removeEventListener('click', onDoc);
    }
  }
  setTimeout(()=> document.addEventListener('click', onDoc));
});
document.getElementById('exportAsMenu')?.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-export]');
  if (!btn) return;
  const type = btn.getAttribute('data-export');
  exportAs(type);
  document.getElementById('exportAsMenu')?.setAttribute('hidden','');
});

// Open File menu with Alt+F
document.addEventListener('keydown', (e)=>{
  if (e.altKey && (e.key.toLowerCase() === 'f')){
    e.preventDefault();
    toggleFileMenu();
  }
});

// Setup Tools menu items
async function setupToolsMenu(){
  const { getSetting } = await import('./idb.js');
  const aiEnabled = await getSetting('aiEnabled', false);
  const openAiBtn = document.getElementById('openAiBtn');
  if (openAiBtn){
    openAiBtn.style.display = aiEnabled ? '' : 'none';
    openAiBtn.addEventListener('click', async ()=>{
      toggleToolsMenu();
      const { isAiEnabled } = await import('./ai.js');
      const enabled = await isAiEnabled();
      if (!enabled){
        alert('AI is disabled. Enable it in Settings.');
        return;
      }
      // Show chatbot UI and adjust layout
      window.showChatbot?.();
      const wrap = document.querySelector('.editor-wrap');
      if (wrap){ wrap.classList.add('with-ai'); }
    });
  }
  const openShortcuts = document.getElementById('openShortcuts');
  if (openShortcuts){
    openShortcuts.addEventListener('click', ()=>{
      toggleToolsMenu();
      showKeyboardShortcutsHelp();
    });
  }
  const openWordCount = document.getElementById('openWordCount');
  if (openWordCount){
    openWordCount.addEventListener('click', ()=>{
      toggleToolsMenu();
      showWordCountPopup();
    });
  }
}

// When closing chatbot, remove with-ai class
window.hideChatbot = (function(orig){
  return function(){
    if (typeof orig === 'function') orig();
    const wrap = document.querySelector('.editor-wrap');
    if (wrap){ wrap.classList.remove('with-ai'); }
  };
})(window.hideChatbot);

// Enhance autosave: also update status bar and outline on input
function updateStatusCounts() {
  const text = (editor?.innerText || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const display = document.getElementById('wordCountDisplay');
  if (display) display.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  
  // Update progress bar
  const progressBar = document.getElementById('wordProgressBar');
  const goalInput = document.getElementById('wordGoalInput');
  if (progressBar && goalInput) {
    const goal = parseInt(goalInput.value) || 0;
    const progress = goal > 0 ? Math.min((words / goal) * 100, 100) : 0;
    progressBar.style.width = `${progress}%`;
  }
}

function buildOutline() {
  const outlineList = document.getElementById('outlineList');
  if (!outlineList) return;
  const headings = Array.from(editor.querySelectorAll('h1, h2, h3'));
  outlineList.innerHTML = '';
  if (headings.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'outline-empty';
    empty.textContent = 'Headings you add to the document will appear here.';
    outlineList.appendChild(empty);
    return;
  }
  let h1Index = 0, h2Index = 0, h3Index = 0;
  headings.forEach(h => {
    const level = Number(h.tagName.slice(1));
    if (level === 1) { h1Index++; h2Index = 0; h3Index = 0; }
    if (level === 2) { h2Index++; h3Index = 0; }
    if (level === 3) { h3Index++; }
    const item = document.createElement('a');
    item.href = '#';
    item.className = `outline-item level-${level}`;
    const num = document.createElement('span');
    num.className = 'outline-number';
    const text = document.createElement('span');
    text.className = 'outline-text';
    const title = h.textContent.trim() || `Heading ${h1Index}.${h2Index || ''}${h3Index || ''}`;
    // numbering similar to Google Docs 1, 1.1, 1.1.1
    let n = '';
    if (level === 1) n = `${h1Index}`;
    if (level === 2) n = `${h1Index}.${h2Index}`;
    if (level === 3) n = `${h1Index}.${h2Index}.${h3Index}`;
    num.textContent = n;
    text.textContent = title;
    item.appendChild(num);
    item.appendChild(text);
    // Scroll to heading on click
    item.addEventListener('click', (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // briefly highlight
      h.style.outline = `2px solid var(--primary)`;
      setTimeout(() => (h.style.outline = ''), 800);
    });
    outlineList.appendChild(item);
  });
}

// Wire outline toggle and word count widget
(function initEditorExtras(){
  // clicking the word-count widget opens the detailed popup
  document.getElementById('wordCountWidget')?.addEventListener('click', (e)=>{
    e.preventDefault();
    showWordCountPopup();
  });
  // Initialize and persist word goal input
  (async ()=>{
    const goalInput = document.getElementById('wordGoalInput');
    if (!goalInput) return;
    try {
      const saved = await getSetting('wordGoal', 0);
      if (saved != null) goalInput.value = Number(saved) || 0;
    } catch {}
    // Update on change and input, persist
    const onGoalChange = async ()=>{
      await setSetting('wordGoal', parseInt(goalInput.value||'0')||0);
      updateStatusCounts();
    };
    goalInput.addEventListener('change', onGoalChange);
    goalInput.addEventListener('input', onGoalChange);
  })();
  // toggle outline sidebar
  document.getElementById('toggleOutline')?.addEventListener('click', ()=>{
    const wrap = document.querySelector('.editor-wrap');
    wrap?.classList.toggle('with-outline');
  });
  // hide menus button + shortcut Ctrl+Shift+F
  document.getElementById('hideMenusBtn')?.addEventListener('click', ()=>{
    const wrap = document.querySelector('.editor-wrap');
    wrap?.classList.toggle('hide-menus');
  });
  document.addEventListener('keydown', (e)=>{
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f'){
      e.preventDefault();
      const wrap = document.querySelector('.editor-wrap');
      wrap?.classList.toggle('hide-menus');
    }
  });
  // mode switcher
  const editBtn = document.getElementById('editModeBtn');
  const viewBtn = document.getElementById('viewModeBtn');
  const setMode = (mode)=>{
    if (mode === 'view'){
      editor.setAttribute('contenteditable','false');
      viewBtn?.classList.add('active');
      editBtn?.classList.remove('active');
    } else {
      editor.setAttribute('contenteditable','true');
      editBtn?.classList.add('active');
      viewBtn?.classList.remove('active');
      editor.focus();
    }
  };
  editBtn?.addEventListener('click', ()=> setMode('edit'));
  viewBtn?.addEventListener('click', ()=> setMode('view'));
})();

// Hook into existing flows to update counts and outline
(function attachLiveUpdates(){
  const update = ()=>{ updateStatusCounts(); buildOutline(); };
  // initial
  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(update, 0);
  } else {
    window.addEventListener('DOMContentLoaded', update, { once:true });
  }
  editor.addEventListener('input', update);
})();
