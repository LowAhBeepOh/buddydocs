import { getDocument, saveDocument, deleteDocument, setSetting } from './idb.js';
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
    menuContainer.addEventListener('click', (e)=>{
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
          // placeholder tool: word count
          alert(`Word count: ${editor.innerText.trim().split(/\s+/).filter(Boolean).length}`);
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
    meta: { version: 1, app: 'BuddyDocs' },
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
      <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #333; border-bottom: 2px solid #0550FF; padding-bottom: 10px; margin-bottom: 30px;">
          ${currentDoc.title || 'Untitled Document'}
        </h1>
        <div style="line-height: 1.6; color: #333;">
          ${currentDoc.content || ''}
        </div>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
          Generated by Buddy Docs
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
  });
}

bindToolbar();
bindMeta();
autosave();
keyboardShortcuts();
loadOrCreate();
applyEditorPrefs();

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
