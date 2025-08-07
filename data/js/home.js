import { getSetting, listDocuments, saveDocument, deleteDocument } from './idb.js';

function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }

function timeGreeting(date = new Date()){
  const h = date.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function dueBadge(d){
  if (!d.dueDate) return '';
  const today = startOfDay(new Date());
  const dd = startOfDay(new Date(d.dueDate));
  const diffDays = Math.round((dd - today) / (1000*60*60*24));
  let cls = 'blue', label = '';
  if (diffDays < 0){ cls = 'gray'; label = `${Math.abs(diffDays)}d ago`; }
  else if (diffDays === 0){ cls = 'red'; label = 'Today'; }
  else if (diffDays === 1){ cls = 'orange'; label = 'Tomorrow'; }
  else if (diffDays <= 3){ cls = 'yellow'; label = `${diffDays}d`; }
  else if (diffDays <= 7){ cls = 'green'; label = `${diffDays}d`; }
  else if (diffDays <= 14){ cls = 'blue'; label = `${diffDays}d`; }
  else { cls = 'blue'; label = `${diffDays}d`; }
  return `<span class="badge ${cls}">Due ${label}</span>`;
}

async function renderGreeting(){
  const displayName = await getSetting('displayName', 'Buddy');
  document.getElementById('greetingText').textContent = `${timeGreeting()}, ${displayName}`;
  const initials = await getSetting('initials', 'U');
  const avatar = document.getElementById('profileBtn');
  if (avatar) avatar.textContent = (initials || 'U').slice(0,2).toUpperCase();
}

function positionMenuNearButton(menuEl, buttonEl){
  // Get button rect relative to viewport
  const r = buttonEl.getBoundingClientRect();
  const menuRect = menuEl.getBoundingClientRect();
  const margin = 8;
  let top = r.bottom + margin;
  let left = r.right - menuRect.width; // align right edges

  // Lazy measure if hidden
  if (menuEl.hidden){
    menuEl.style.visibility = 'hidden';
    menuEl.hidden = false;
    const m2 = menuEl.getBoundingClientRect();
    menuEl.hidden = true;
    menuEl.style.visibility = '';
    // Use measured width/height
    left = r.right - m2.width;
  }

  // Clamp within viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Recompute height if needed
  const menuW = menuEl.offsetWidth || 180;
  const menuH = menuEl.offsetHeight || 160;

  if (left + menuW > vw - margin) left = vw - margin - menuW;
  if (left < margin) left = margin;
  if (top + menuH > vh - margin){
    // place above button if bottom overflows
    top = r.top - margin - menuH;
  }
  if (top < margin) top = margin;

  menuEl.style.left = `${Math.round(left)}px`;
  menuEl.style.top = `${Math.round(top)}px`;
}

function closeAllMenus(except) {
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    if (menu !== except) {
      menu.hidden = true;
    }
  });
}

async function handleDocAction(doc, action) {
  switch(action) {
    case 'archive':
      doc.archived = true;
      await saveDocument(doc);
      break;
    case 'complete':
      doc.dueDate = null;
      doc.completed = true;
      await saveDocument(doc);
      break;
    case 'delete':
      if (confirm('Are you sure you want to delete this document?')) {
        await deleteDocument(doc.id);
      }
      break;
  }
  await renderDocs();
  await renderDeadlines();
}

function createDocCard(doc){
  const tmpl = document.getElementById('docCardTmpl');
  const node = tmpl.content.firstElementChild.cloneNode(true);
  const link = node.querySelector('.doc-link');
  link.href = `editor.html?id=${encodeURIComponent(doc.id)}`;
  node.querySelector('.title').textContent = doc.title || 'Untitled';
  node.querySelector('.type').textContent = (doc.type||'document').replace(/^./, c=>c.toUpperCase());
  node.querySelector('.due').innerHTML = dueBadge(doc);
  
  // Show document preview in thumb
  const thumb = node.querySelector('.thumb');
  if (doc.type === 'gallery' && Array.isArray(doc.content) && doc.content.length > 0) {
    // For galleries, show a random image from the gallery
    const randomImage = doc.content[Math.floor(Math.random() * doc.content.length)];
    thumb.innerHTML = `<img src="${randomImage}" alt="Gallery preview" style="width: 100%; height: 100%; object-fit: cover;">`;
    thumb.style.padding = '0';
  } else if (doc.content) {
    thumb.innerHTML = doc.content.slice(0, 200) + (doc.content.length > 200 ? '...' : '');
  }

  // Handle dropdown menu
  const moreBtn = node.querySelector('.more');
  const menu = node.querySelector('.dropdown-menu');

  function open(){
    closeAllMenus(menu);
    menu.hidden = false;
    positionMenuNearButton(menu, moreBtn);
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
  }
  function close(){
    menu.hidden = true;
    window.removeEventListener('resize', onWindowChange);
    window.removeEventListener('scroll', onWindowChange, true);
  }
  function onWindowChange(){
    if (!menu.hidden) positionMenuNearButton(menu, moreBtn);
  }

  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open(); else close();
  });

  menu.addEventListener('click', async (e) => {
    e.stopPropagation();
    const menuItem = e.target.closest('.menu-item');
    if (!menuItem) return;
    const action = menuItem.dataset.action;
    await handleDocAction(doc, action);
    close();
  });

  document.addEventListener('click', (e) => {
    if (!menu.hidden) close();
  });

  return node;
}

async function renderDocs(){
  const grid = document.getElementById('docGrid');
  const term = document.getElementById('search').value;
  const docs = await listDocuments({ search: term });
  grid.innerHTML = '';
  for(const d of docs){
    grid.appendChild(createDocCard(d));
  }
}

async function renderDeadlines(){
  const docs = await listDocuments();
  const today = startOfDay(new Date());
  const items = docs.filter(d=>d.dueDate).map(d=>({ d, diff: Math.round((startOfDay(new Date(d.dueDate))-today)/(1000*60*60*24)) }))
    .filter(x => x.diff <= 14) // more than 14 days not shown here
    .sort((a,b)=>a.diff - b.diff)
    .slice(0,8);
  const ul = document.getElementById('deadlineList');
  ul.innerHTML = '';
  for(const {d} of items){
    const li = document.createElement('li');
    li.innerHTML = `<div><strong>${d.title||'Untitled'}</strong><div class="muted">${new Date(d.dueDate).toDateString()}</div></div>${dueBadge(d)}`;
    ul.appendChild(li);
  }
}

function bindSearch(){
  const s = document.getElementById('search');
  s.addEventListener('input', () => renderDocs());
}

renderGreeting();
renderDocs();
renderDeadlines();
bindSearch();
