import { listDeadlinesForMonth } from './idb.js';

const monthLabel = document.getElementById('monthLabel');
const grid = document.getElementById('calendarGrid');
const list = document.getElementById('calendarDeadlines');

let cur = new Date();

function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }

function renderMonthLabel(){
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  monthLabel.textContent = fmt.format(cur);
}

function buildGrid(){
  grid.innerHTML = '';
  const year = cur.getFullYear();
  const month = cur.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month+1, 0);
  const startDay = (first.getDay() + 6) % 7; // Monday=0
  const days = last.getDate();

  const wk = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  for(const h of wk){
    const el = document.createElement('div');
    el.className = 'day head';
    el.textContent = h;
    grid.appendChild(el);
  }

  for(let i=0;i<startDay;i++) grid.appendChild(Object.assign(document.createElement('div'),{className:'day'}));
  for(let d=1; d<=days; d++){
    const el = document.createElement('div');
    el.className = 'day';
    el.innerHTML = `<div class=\"date\">${d}</div><div class=\"items\"></div>`;
    el.dataset.date = new Date(year, month, d).toISOString().slice(0,10);
    
    // Check if this is today's date
    const today = new Date();
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    if (isToday) {
      el.classList.add('today');
    }
    
    grid.appendChild(el);
  }
}

function badgeClass(diff){
  if (diff < 0) return 'gray';
  if (diff === 0) return 'red';
  if (diff === 1) return 'orange';
  if (diff <= 3) return 'yellow';
  if (diff <= 7) return 'green';
  return 'blue';
}

async function renderDeadlines(){
  const items = await listDeadlinesForMonth(cur.getFullYear(), cur.getMonth());
  const today = startOfDay(new Date());
  list.innerHTML = '';
  const byDate = new Map();

  for (const it of items){
    const key = it.dueDate;
    const arr = byDate.get(key) || [];
    arr.push(it);
    byDate.set(key, arr);

    const diff = Math.round((startOfDay(new Date(it.dueDate)) - today)/(1000*60*60*24));
    const li = document.createElement('li');
    li.innerHTML = `<div><strong>${it.title||'Untitled'}</strong><div class=\"muted\">${new Date(it.dueDate).toDateString()}</div></div><span class=\"badge ${badgeClass(diff)}\">${diff<0? `${Math.abs(diff)}d ago`: diff===0? 'Today': diff===1? 'Tomorrow': `${diff}d`}</span>`;
    
    // Make the deadline item clickable
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => {
      window.open(`editor.html?id=${encodeURIComponent(it.id)}`, '_blank');
    });
    
    list.appendChild(li);
  }

  // annotate grid with titles instead of counts
  document.querySelectorAll('.calendar-grid .day').forEach(day => {
    const d = day.dataset.date;
    if (!d) return;
    const items = byDate.get(d);
    const itemsWrap = day.querySelector('.items');
    if (itemsWrap && items?.length){
      itemsWrap.innerHTML = '';
      for (const doc of items){
        const diff = Math.round((startOfDay(new Date(doc.dueDate)) - today)/(1000*60*60*24));
        const row = document.createElement('div');
        row.className = 'item';
        row.style.cursor = 'pointer';
        
        const dot = document.createElement('span');
        dot.className = 'dot';
        const colors = { gray:'#c9c7d7', red:'#F48585', orange:'#FFA559', yellow:'#FFE36E', green:'#85F485', blue:'#8FB6FF' };
        dot.style.background = colors[badgeClass(diff)];
        row.appendChild(dot);
        
        const title = document.createElement('span');
        title.textContent = doc.title || 'Untitled';
        row.appendChild(title);
        
        // Make the calendar item clickable
        row.addEventListener('click', () => {
          window.open(`editor.html?id=${encodeURIComponent(doc.id)}`, '_blank');
        });
        
        itemsWrap.appendChild(row);
      }
    }
  });
}

function nav(dir){
  cur = new Date(cur.getFullYear(), cur.getMonth()+dir, 1);
  render();
}

function bindNav(){
  document.getElementById('prevMonth').addEventListener('click', () => nav(-1));
  document.getElementById('nextMonth').addEventListener('click', () => nav(1));
}

function render(){
  renderMonthLabel();
  buildGrid();
  renderDeadlines();
}

bindNav();
render();
