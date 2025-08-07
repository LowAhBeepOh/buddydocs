import { getDocument, saveDocument, deleteDocument } from './idb.js';
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
  document.querySelectorAll('.toolbar [data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      document.execCommand(cmd, false);
      editor.focus();
    });
  });
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
    t = setTimeout(async () => {
      currentDoc.content = editor.innerHTML;
      await saveDocument(currentDoc);
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
  const saved = await saveDocument(currentDoc);
  if (!getParam('id')){
    history.replaceState({}, '', `editor.html?id=${encodeURIComponent(saved.id)}`);
  }
}

async function deleteNow(){
  if (!currentDoc.id) return;
  const ok = confirm('Delete this document?');
  if (!ok) return;
  await deleteDocument(currentDoc.id);
  location.href = './';
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

// Save/Del buttons
document.getElementById('saveBtn').addEventListener('click', saveNow);
document.getElementById('deleteBtn').addEventListener('click', deleteNow);
