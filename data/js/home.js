import { getSetting, setSetting, listDocuments, saveDocument, deleteDocument } from './idb.js';

// ------- .bdox Import functionality -------
async function importBdoxFile(file) {
  try {
    const text = await file.text();
    // Decode base64
    const decoded = decodeURIComponent(escape(atob(text)));
    const data = JSON.parse(decoded);
    
    if (data.meta?.app !== 'BuddyDocs' || !data.document) {
      throw new Error('Invalid .bdox file format');
    }
    
    // Import the document (generate new ID to avoid conflicts)
    const doc = { ...data.document, id: null };
    const saved = await saveDocument(doc);
    return { success: true, title: doc.title || 'Untitled' };
  } catch (error) {
    console.error('Import failed:', error);
    return { success: false, error: error.message };
  }
}

async function handleBdoxDrop(files) {
  const bdoxFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.bdox'));
  if (bdoxFiles.length === 0) {
    alert('No .bdox files found. Please drop Buddy Docs files.');
    return;
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of bdoxFiles) {
    const result = await importBdoxFile(file);
    if (result.success) {
      successCount++;
    } else {
      errorCount++;
      console.error(`Failed to import ${file.name}:`, result.error);
    }
  }
  
  // Show results
  if (successCount > 0) {
    alert(`Successfully imported ${successCount} document${successCount > 1 ? 's' : ''}.`);
    await renderDocs(); // Refresh the document list
  }
  if (errorCount > 0) {
    alert(`Failed to import ${errorCount} file${errorCount > 1 ? 's' : ''}. Check console for details.`);
  }
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('dropZone');
  let dragCounter = 0;
  
  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
  });
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  // Show drop zone on drag enter
  document.body.addEventListener('dragenter', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter++;
      dropZone.classList.add('active');
    }
  });
  
  // Hide drop zone on drag leave
  document.body.addEventListener('dragleave', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter--;
      if (dragCounter === 0) {
        dropZone.classList.remove('active');
      }
    }
  });
  
  // Handle drop
  document.body.addEventListener('drop', (e) => {
    dragCounter = 0;
    dropZone.classList.remove('active');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleBdoxDrop(files);
    }
  });
}

function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }

function timeGreeting(date = new Date()){
  const h = date.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

async function getDynamicGreeting(date = new Date(), deadlines = []) {
  const h = date.getHours();
  const displayName = await getSetting('displayName', 'Buddy');
  
  // Random chance for >_< (1/300 chance)
  if (Math.random() < 0.0033) {
    return { greeting: '>_<', sub: 'Keep your docs organized and on track.' };
  }
  
  // Go to sleep message (1 AM to 5 AM)
  if (h >= 1 && h < 5) {
    const sleepMessages = [
      { greeting: `Time for bed, ${displayName}`, sub: 'Your docs will be here tomorrow.' },
      { greeting: `Maybe some sleep?`, sub: 'Your documents can wait until morning.' },
      { greeting: `Late night session?`, sub: 'Don\'t forget to rest.' },
      { greeting: `Still working, ${displayName}?`, sub: 'Consider getting some sleep.' }
    ];
    return sleepMessages[Math.floor(Math.random() * sleepMessages.length)];
  }
  
  // Check for urgent deadlines (due in less than 6 hours)
  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const urgentDeadlines = deadlines.filter(d => {
    if (!d.dueDate) return false;
    const dueDate = new Date(d.dueDate);
    return dueDate <= sixHoursFromNow && dueDate > now;
  });
  
  if (urgentDeadlines.length > 0) {
    const hoursLeft = Math.floor((new Date(urgentDeadlines[0].dueDate) - now) / (1000 * 60 * 60));
    const urgentMessages = [
      { greeting: `Deadline approaching, ${displayName}`, sub: `${urgentDeadlines.length} item${urgentDeadlines.length > 1 ? 's' : ''} due in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} or less` },
      { greeting: `Time's ticking`, sub: `${urgentDeadlines.length} deadline${urgentDeadlines.length > 1 ? 's' : ''} coming up soon` },
      { greeting: `Almost deadline time`, sub: `${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} left on ${urgentDeadlines.length} item${urgentDeadlines.length > 1 ? 's' : ''}` }
    ];
    return urgentMessages[Math.floor(Math.random() * urgentMessages.length)];
  }
  
  // Check for many deadlines (10+ in next 3 days)
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = deadlines.filter(d => {
    if (!d.dueDate) return false;
    const dueDate = new Date(d.dueDate);
    return dueDate <= threeDaysFromNow && dueDate >= now;
  });
  
  // Check for overdue deadlines
  const overdueDeadlines = deadlines.filter(d => {
    if (!d.dueDate) return false;
    const dueDate = new Date(d.dueDate);
    return dueDate < now;
  });
  
  if (overdueDeadlines.length > 0) {
    const oldestOverdue = overdueDeadlines.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    const daysOverdue = Math.floor((now - new Date(oldestOverdue.dueDate)) / (1000 * 60 * 60 * 24));
    const overdueMessages = [
      { greeting: `${overdueDeadlines.length} overdue item${overdueDeadlines.length > 1 ? 's' : ''}`, sub: `Oldest is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} behind` },
      { greeting: `Catch up time, ${displayName}`, sub: `${overdueDeadlines.length} item${overdueDeadlines.length > 1 ? 's' : ''} overdue` },
      { greeting: `Some items are overdue`, sub: `Time to tackle those ${overdueDeadlines.length} task${overdueDeadlines.length > 1 ? 's' : ''}` }
    ];
    return overdueMessages[Math.floor(Math.random() * overdueMessages.length)];
  }
  
  if (upcomingDeadlines.length >= 10) {
    const busyMessages = [
      { greeting: `Busy few days ahead`, sub: `${upcomingDeadlines.length} items due soon` },
      { greeting: `Quite the schedule`, sub: `${upcomingDeadlines.length} deadlines in the next 3 days` },
      { greeting: `Packed calendar`, sub: `${upcomingDeadlines.length} things to wrap up` }
    ];
    return busyMessages[Math.floor(Math.random() * busyMessages.length)];
  }
  
  // Check for weekend
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const weekendGreetings = [
      { greeting: `Weekend time, ${displayName}`, sub: 'Good time to catch up on things.' },
      { greeting: `Happy weekend`, sub: 'Maybe organize some docs?' },
      { greeting: `Weekend vibes`, sub: 'Relax, but stay productive.' },
      { greeting: `It's the weekend`, sub: 'Perfect for some quiet work.' },
      { greeting: `Weekend mode`, sub: 'Time to tackle that backlog.' },
      { greeting: `Enjoy your weekend, ${displayName}`, sub: 'Don\'t forget about your docs though.' }
    ];
    return weekendGreetings[Math.floor(Math.random() * weekendGreetings.length)];
  }
  
  // Check for early morning (before 8 AM)
  if (h < 8) {
    const earlyGreetings = [
      { greeting: `Early start, ${displayName}`, sub: 'Good time to plan ahead.' },
      { greeting: `Morning person`, sub: 'Getting things done before others wake up.' },
      { greeting: `Up early today`, sub: 'Perfect time for focused work.' },
      { greeting: `Early bird`, sub: 'Making the most of the quiet hours.' },
      { greeting: `Bright and early`, sub: 'Ready to tackle the day.' },
      { greeting: `Morning, ${displayName}`, sub: 'Starting strong today.' },
      { greeting: `Early riser`, sub: 'Time to get organized.' }
    ];
    return earlyGreetings[Math.floor(Math.random() * earlyGreetings.length)];
  }
  
  // Check for late night (after 10 PM)
  if (h >= 22) {
    const lateGreetings = [
      { greeting: `Working late, ${displayName}`, sub: 'Night time productivity.' },
      { greeting: `Evening session`, sub: 'Quiet hours for deep work.' },
      { greeting: `Night owl`, sub: 'Making progress in the calm hours.' },
      { greeting: `Late night work`, sub: 'Sometimes the best ideas come at night.' },
      { greeting: `Still at it?`, sub: 'Night time can be surprisingly productive.' },
      { greeting: `Evening, ${displayName}`, sub: 'Perfect time for some focused writing.' },
      { greeting: `Burning the midnight oil`, sub: 'Getting things done after hours.' }
    ];
    return lateGreetings[Math.floor(Math.random() * lateGreetings.length)];
  }
  
  // Check for Monday blues
  if (dayOfWeek === 1) {
    const mondayGreetings = [
      { greeting: `Monday, ${displayName}`, sub: 'New week, fresh start.' },
      { greeting: `Here we go again`, sub: 'Another week begins.' },
      { greeting: `Monday mood`, sub: 'Time to get back into it.' },
      { greeting: `Week one, day one`, sub: 'Let\'s see what this week brings.' },
      { greeting: `Monday morning`, sub: 'Coffee and documents await.' },
      { greeting: `Starting the week`, sub: 'Ready or not, here we go.' },
      { greeting: `Mondays...`, sub: 'At least your docs are organized.' }
    ];
    return mondayGreetings[Math.floor(Math.random() * mondayGreetings.length)];
  }
  
  // Check for Friday excitement
  if (dayOfWeek === 5) {
    const fridayGreetings = [
      { greeting: `Friday, ${displayName}`, sub: 'Almost there - wrap things up.' },
      { greeting: `End of the week`, sub: 'Time to finish strong.' },
      { greeting: `Friday feeling`, sub: 'One more push before the weekend.' },
      { greeting: `TGIF`, sub: 'Finish up and enjoy your weekend.' },
      { greeting: `Final stretch`, sub: 'Close out the week properly.' },
      { greeting: `Friday vibes`, sub: 'Weekend is just around the corner.' },
      { greeting: `Last day`, sub: 'Make it count, then relax.' }
    ];
    return fridayGreetings[Math.floor(Math.random() * fridayGreetings.length)];
  }
  
  // Check for productivity streaks (if we had this data)
  const todayDocs = deadlines.filter(d => {
    if (!d.createdAt) return false;
    const createdDate = new Date(d.createdAt);
    return startOfDay(createdDate).getTime() === startOfDay(now).getTime();
  });
  
  if (todayDocs.length >= 3) {
    const productiveMessages = [
      { greeting: `Productive day, ${displayName}`, sub: `${todayDocs.length} documents created today.` },
      { greeting: `On a roll today`, sub: `${todayDocs.length} new docs already.` },
      { greeting: `Getting stuff done`, sub: `${todayDocs.length} documents and counting.` }
    ];
    return productiveMessages[Math.floor(Math.random() * productiveMessages.length)];
  }
  
  // Check for empty state (no documents)
  if (deadlines.length === 0) {
    const emptyGreetings = [
      { greeting: `Welcome, ${displayName}`, sub: 'Ready to create your first document?' },
      { greeting: `Clean slate`, sub: 'Time to start building your collection.' },
      { greeting: `Fresh start`, sub: 'Your first document awaits.' },
      { greeting: `New workspace`, sub: 'Let\'s get you organized.' },
      { greeting: `Getting started`, sub: 'Create something worth documenting.' },
      { greeting: `Hello, ${displayName}`, sub: 'Your organized workspace awaits.' }
    ];
    return emptyGreetings[Math.floor(Math.random() * emptyGreetings.length)];
  }
  
  // Time-based greetings with variations
  const greetings = {
    morning: [
      { greeting: 'Good morning', sub: 'Time to check your documents.' },
      { greeting: 'Morning', sub: 'Ready for another productive day?' },
      { greeting: 'New day', sub: 'What will you accomplish today?' },
      { greeting: 'Good morning', sub: 'Your docs are waiting.' },
      { greeting: 'Rise and shine', sub: 'Time to organize your thoughts.' },
      { greeting: 'Morning time', sub: 'Perfect for some planning.' },
      { greeting: 'Another day', sub: 'Let\'s make it count.' },
      { greeting: 'Fresh start', sub: 'Ready to tackle your tasks?' },
      { greeting: 'Hello there', sub: 'Morning productivity awaits.' },
      { greeting: 'Day begins', sub: 'Time to get organized.' }
    ],
    afternoon: [
      { greeting: 'Good afternoon', sub: 'How are your docs coming along?' },
      { greeting: 'Midday check-in', sub: 'Making progress on your work?' },
      { greeting: 'Afternoon', sub: 'Time for a productivity boost.' },
      { greeting: 'Half way through', sub: 'Keep the momentum going.' },
      { greeting: 'Lunch break over?', sub: 'Back to your documents.' },
      { greeting: 'Afternoon session', sub: 'What needs your attention?' },
      { greeting: 'Middle of the day', sub: 'Perfect time to organize.' },
      { greeting: 'Post-lunch time', sub: 'Ready to dive back in?' },
      { greeting: 'Good day so far?', sub: 'Let\'s keep it productive.' },
      { greeting: 'Afternoon productivity', sub: 'Time to make progress.' }
    ],
    evening: [
      { greeting: 'Good evening', sub: 'Winding down with some docs?' },
      { greeting: 'Evening', sub: 'Perfect time to reflect and organize.' },
      { greeting: 'End of day', sub: 'Time to wrap things up.' },
      { greeting: 'Evening session', sub: 'Quiet time for focused work.' },
      { greeting: 'Day\'s end', sub: 'Review and organize your thoughts.' },
      { greeting: 'Evening work', sub: 'Sometimes the best time to focus.' },
      { greeting: 'Closing time', sub: 'Finish strong before you rest.' },
      { greeting: 'Evening hours', sub: 'Perfect for some deep work.' },
      { greeting: 'Day wrapping up', sub: 'Time to get organized.' },
      { greeting: 'Evening productivity', sub: 'Making the most of your time.' }
    ]
  };
  
  let timeCategory;
  if (h < 12) timeCategory = 'morning';
  else if (h < 17) timeCategory = 'afternoon';
  else timeCategory = 'evening';
  
  const timeGreetings = greetings[timeCategory];
  const randomGreeting = timeGreetings[Math.floor(Math.random() * timeGreetings.length)];
  
  return { greeting: `${randomGreeting.greeting}, ${displayName}`, sub: randomGreeting.sub };
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
  const docs = await listDocuments();
  const greetingData = await getDynamicGreeting(new Date(), docs);
  
  // Handle both string and object formats for backward compatibility
  const greetingText = typeof greetingData === 'string' ? greetingData : greetingData.greeting;
  const subText = typeof greetingData === 'string' ? 'Keep your docs organized and on track.' : greetingData.sub;
  
  document.getElementById('greetingText').textContent = greetingText;
  
  // Update sub-greeting if it exists
  const subElement = document.querySelector('.greeting .sub');
  if (subElement) {
    subElement.textContent = subText;
  }
  
  // Handle avatar display
  const avatar = document.getElementById('profileBtn');
  if (avatar) {
    const profilePicture = await getSetting('profilePicture', null);
    const initials = await getSetting('initials', 'BD');
    
    if (profilePicture) {
      avatar.style.backgroundImage = `url(${profilePicture})`;
      avatar.textContent = '';
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = (initials || 'BD').slice(0,2).toUpperCase();
    }
  }
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
  
  // Update greeting when deadlines change
  await renderGreeting();
}

function bindSearch(){
  const s = document.getElementById('search');
  s.addEventListener('input', () => renderDocs());
}

// Deadlines toggle functionality
async function setupDeadlinesToggle() {
  const toggleBtn = document.getElementById('deadlinesToggle');
  const deadlinesSection = document.querySelector('.deadlines');
  
  if (!toggleBtn || !deadlinesSection) {
    console.error('Deadlines toggle elements not found');
    return;
  }
  
  const icon = toggleBtn.querySelector('.material-symbols-outlined');
  
  // Load saved state
  const isCollapsed = await getSetting('deadlinesCollapsed', false);
  console.log('Loading deadlines collapsed state:', isCollapsed);
  
  if (isCollapsed) {
    deadlinesSection.classList.add('collapsed');
    icon.textContent = 'expand_content';
  } else {
    icon.textContent = 'collapse_content';
  }
  
  // Handle toggle
  toggleBtn.addEventListener('click', async () => {
    const isCurrentlyCollapsed = deadlinesSection.classList.contains('collapsed');
    const newState = !isCurrentlyCollapsed;
    
    console.log('Toggling deadlines collapsed state to:', newState);
    
    if (newState) {
      deadlinesSection.classList.add('collapsed');
      icon.textContent = 'expand_content';
    } else {
      deadlinesSection.classList.remove('collapsed');
      icon.textContent = 'collapse_content';
    }
    
    // Save state to local storage
    await setSetting('deadlinesCollapsed', newState);
    console.log('Saved deadlines collapsed state:', newState);
  });
}

// Initialize everything when DOM is ready
async function initialize() {
  await renderGreeting();
  await renderDocs();
  await renderDeadlines();
  bindSearch();
  setupDragAndDrop();
  await setupDeadlinesToggle();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
