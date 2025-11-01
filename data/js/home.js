import { getSetting, setSetting, listDocuments, saveDocument, deleteDocument, listFolders, saveFolder, deleteFolder, getFolder } from './idb.js';
import { initAiCommandBar } from './ai-command.js';
import { TEMPLATES } from './templates.js';
import { generateWelcomeMessage } from './ai-utils.js';

// Current folder navigation
let currentFolderId = null;

// Export render functions for other modules to trigger UI refresh
export { renderDocs, renderDeadlines, renderGreeting };
async function requireAuth(){
  const secretSet = await getSetting('secretSet', false);
  if (!secretSet) return true;
  const usePin = await getSetting('usePin', false);
  const input = prompt(usePin ? 'Enter PIN' : 'Enter password');
  if (input == null) return false;
  try {
    // Prefer scrypt if salt is available; fallback to SHA-256 for legacy hashes
    const saltStr = await getSetting('secretSalt', '');
    let hashHex = '';
    if (saltStr && saltStr.length > 0) {
      const { scrypt } = await import('https://cdn.jsdelivr.net/npm/scrypt-js@3.0.1/+esm');
      const enc = new TextEncoder();
      const passwordBytes = enc.encode(input);
      const saltBytes = Uint8Array.from(atob(saltStr), c => c.charCodeAt(0));
      const N = 16384, r = 8, p = 1, dkLen = 32;
      const result = await scrypt(passwordBytes, saltBytes, N, r, p, dkLen);
      hashHex = Array.from(result).map(b=>b.toString(16).padStart(2,'0')).join('');
    } else {
      const enc = new TextEncoder();
      const data = enc.encode(input);
      const digest = await crypto.subtle.digest('SHA-256', data);
      const bytes = Array.from(new Uint8Array(digest));
      hashHex = bytes.map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    const stored = await getSetting('secretHash', '');
    return stored && hashHex === stored;
  } catch {
    return false;
  }
}


function showNewDocumentDialog() {
    // This function needs to be implemented to show the new document dialog
    console.log('Showing new document dialog...');
}

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
  
  // Random chance for a fun emoji (1/300 chance)
  if (Math.random() < 0.0033) {
    const funEmojis = ['📚', '✏️', '📝', '📖', '🔍', '📋', '📓'];
    const randomEmoji = funEmojis[Math.floor(Math.random() * funEmojis.length)];
    return { greeting: randomEmoji, sub: 'Keep your study materials organized' };
  }
  
  // Late night/early morning messages (1 AM to 5 AM)
  if (h >= 1 && h < 5) {
    const sleepMessages = [
      { greeting: `Late night study session, ${displayName}?`, sub: 'Remember to get enough rest for tomorrow.' },
      { greeting: `Early morning review`, sub: 'Good time to review notes before class.' },
      { greeting: `Late night thoughts?`, sub: 'Jot them down for tomorrow.' },
      { greeting: `Early bird`, sub: 'Perfect time for focused study before the day begins.' },
      { greeting: `Study break`, sub: 'Consider taking a short break to stay fresh.' }
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
    const hoursLeft = Math.ceil((new Date(urgentDeadlines[0].dueDate) - now) / (1000 * 60 * 60));
    const minutesLeft = Math.ceil(((new Date(urgentDeadlines[0].dueDate) - now) % (1000 * 60 * 60)) / (1000 * 60));
    
    let timeLeft = '';
    if (hoursLeft > 1) {
      timeLeft = `${hoursLeft} hours`;
    } else if (hoursLeft === 1) {
      timeLeft = `1 hour and ${minutesLeft} minutes`;
    } else {
      timeLeft = `${minutesLeft} minutes`;
    }
    
    const urgentMessages = [
      { greeting: `⏰ Deadline approaching`, sub: `${urgentDeadlines.length} item${urgentDeadlines.length > 1 ? 's' : ''} due in ${timeLeft}` },
      { greeting: `Time to focus, ${displayName}`, sub: `${urgentDeadlines.length} deadline${urgentDeadlines.length > 1 ? 's' : ''} coming up in ${timeLeft}` },
      { greeting: `Heads up!`, sub: `${urgentDeadlines.length} item${urgentDeadlines.length > 1 ? 's' : ''} due in ${timeLeft}` },
      { greeting: `Quick check-in`, sub: `You have ${urgentDeadlines.length} deadline${urgentDeadlines.length > 1 ? 's' : ''} in ${timeLeft}` },
      { greeting: `Action needed`, sub: `${urgentDeadlines.length} item${urgentDeadlines.length > 1 ? 's' : ''} due in ${timeLeft}` }
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
    const daysOverdue = Math.ceil((now - new Date(oldestOverdue.dueDate)) / (1000 * 60 * 60 * 24));
    
    // More descriptive time phrases
    let timePhrase = '';
    if (daysOverdue === 1) timePhrase = 'yesterday';
    else if (daysOverdue < 7) timePhrase = `${daysOverdue} days ago`;
    else if (daysOverdue < 30) timePhrase = `${Math.floor(daysOverdue/7)} week${Math.floor(daysOverdue/7) > 1 ? 's' : ''} ago`;
    else timePhrase = `${Math.floor(daysOverdue/30)} month${Math.floor(daysOverdue/30) > 1 ? 's' : ''} ago`;
    
    const overdueMessages = [
      { greeting: `📅 ${overdueDeadlines.length} item${overdueDeadlines.length > 1 ? 's' : ''} need attention`, sub: `Oldest is from ${timePhrase}` },
      { greeting: `Let's catch up, ${displayName}`, sub: `You have ${overdueDeadlines.length} overdue item${overdueDeadlines.length > 1 ? 's' : ''}` },
      { greeting: `Time to check in`, sub: `${overdueDeadlines.length} item${overdueDeadlines.length > 1 ? 's' : ''} waiting for your attention` },
      { greeting: `Overdue items found`, sub: `You have ${overdueDeadlines.length} task${overdueDeadlines.length > 1 ? 's' : ''} to review` },
      { greeting: `📌 Quick update needed`, sub: `${overdueDeadlines.length} item${overdueDeadlines.length > 1 ? 's' : ''} from ${timePhrase}` }
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
      { 
        greeting: dayOfWeek === 6 ? `Happy Saturday, ${displayName}` : `Peaceful Sunday, ${displayName}`, 
        sub: dayOfWeek === 6 ? 'A great day for creative work' : 'Perfect time to plan the week ahead'
      },
      { 
        greeting: 'Weekend productivity', 
        sub: 'When great ideas have space to breathe'
      },
      { 
        greeting: 'Weekend mode', 
        sub: 'Perfect for those side projects and personal growth'
      },
      { 
        greeting: `Hello ${displayName}`, 
        sub: dayOfWeek === 6 ? 'Saturday is made for catching up' : 'Sunday is for planning and reflection'
      },
      { 
        greeting: 'Weekend thoughts', 
        sub: 'Jot them down before they float away'
      },
      { 
        greeting: dayOfWeek === 6 ? 'Saturday session' : 'Sunday planning', 
        sub: dayOfWeek === 6 ? 'Time to make progress' : 'Set yourself up for success'
      },
      { 
        greeting: 'Weekend warrior', 
        sub: 'Making the most of your free time'
      }
    ];
    return weekendGreetings[Math.floor(Math.random() * weekendGreetings.length)];
  }
  
  // Early morning messages (before 8 AM)
  if (h < 8) {
    const earlyGreetings = [
      { 
        greeting: `Early start, ${displayName}`, 
        sub: 'The world is quiet - perfect for focused work' 
      },
      { 
        greeting: `Good morning, early bird`, 
        sub: 'The early hours are yours to conquer' 
      },
      { 
        greeting: `Rise and shine`, 
        sub: 'A fresh day awaits your brilliance' 
      },
      { 
        greeting: `First light productivity`, 
        sub: 'Set the tone for a successful day' 
      },
      { 
        greeting: `Morning, ${displayName}`, 
        sub: 'Early hours, endless possibilities' 
      },
      { 
        greeting: `Before the world wakes`, 
        sub: 'Perfect time for strategic thinking' 
      },
      { 
        greeting: `Dawn of a new day`, 
        sub: 'Make it count' 
      }
    ];
    return earlyGreetings[Math.floor(Math.random() * earlyGreetings.length)];
  }
  
  // Late evening messages (after 10 PM)
  if (h >= 22) {
    const lateGreetings = [
      { 
        greeting: `Night owl hours, ${displayName}`, 
        sub: 'When creativity flows freely' 
      },
      { 
        greeting: `Late night thoughts`, 
        sub: 'Capture them before they slip away' 
      },
      { 
        greeting: `Evening deep work`, 
        sub: 'The world is quiet, your mind is sharp' 
      },
      { 
        greeting: `Still creating?`, 
        sub: 'Some of the best work happens after hours' 
      },
      { 
        greeting: `Midnight oil`, 
        sub: 'Burning bright with ideas' 
      },
      { 
        greeting: `Night shift`, 
        sub: 'Making progress while others sleep' 
      },
      { 
        greeting: `Late night clarity`, 
        sub: 'When the best ideas often come' 
      }
    ];
    return lateGreetings[Math.floor(Math.random() * lateGreetings.length)];
  }
  
  // Monday motivation messages
  if (dayOfWeek === 1) {
    const mondayGreetings = [
      { 
        greeting: `New week, new opportunities`, 
        sub: 'Make it count, ' + displayName 
      },
      { 
        greeting: `It's Monday`, 
        sub: 'Set the tone for a good week' 
      },
      { 
        greeting: `Fresh start`, 
        sub: 'A whole week of potential ahead' 
      },
      { 
        greeting: `Good Morning, ${displayName}`, 
        sub: 'Back to school' 
      }
    ];
    return mondayGreetings[Math.floor(Math.random() * mondayGreetings.length)];
  }
  
  // Friday celebration messages
  if (dayOfWeek === 5) {
    const fridayGreetings = [
      { 
        greeting: `Friday feeling, ${displayName}`, 
        sub: 'Time to wrap up and celebrate your wins' 
      },
      { 
        greeting: `Weekend countdown`, 
        sub: 'Finish strong and start your weekend right' 
      },
      { 
        greeting: `TGIF`, 
        sub: 'Time to complete what you started this week' 
      },
      { 
        greeting: `Final stretch`, 
        sub: 'Make today count before the weekend begins' 
      },
      { 
        greeting: `Friday energy`, 
        sub: 'One more productive day before you recharge' 
      },
      { 
        greeting: `Weekend is calling`, 
        sub: 'But first, let\'s finish strong' 
      },
      { 
        greeting: `Friday focus`, 
        sub: 'Set yourself up for a relaxing weekend' 
      }
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
  
  // Empty state messages (no documents)
  if (deadlines.length === 0) {
    const emptyGreetings = [
      { 
        greeting: `Welcome to your workspace, ${displayName}`, 
        sub: 'Ready to create something amazing?' 
      },
      { 
        greeting: `Fresh canvas`, 
        sub: 'Every great project starts with a single document' 
      },
      { 
        greeting: `Let's begin`, 
        sub: 'Create your first note, list, or document' 
      },
      { 
        greeting: `Your digital notebook`, 
        sub: 'Organized, accessible, and ready for your ideas' 
      },
      { 
        greeting: `Hello, ${displayName}`, 
        sub: 'Start capturing your thoughts and ideas' 
      },
      { 
        greeting: `Blank page`, 
        sub: 'Infinite possibilities await your first words' 
      },
      { 
        greeting: `Getting started`, 
        sub: 'Create, organize, and find your perfect workflow' 
      }
    ];
    return emptyGreetings[Math.floor(Math.random() * emptyGreetings.length)];
  }
  
  // Time-based greetings with variations
  const greetings = {
    morning: [
      { 
        greeting: 'Good morning, ' + displayName, 
        sub: 'Check today\'s schedule and assignments' 
      },
      { 
        greeting: 'Morning study session', 
        sub: 'Great time to review notes before class' 
      },
      { 
        greeting: 'Ready for the day?', 
        sub: 'Review your to-do list and priorities' 
      },
      { 
        greeting: 'Early start', 
        sub: 'Perfect time for focused studying' 
      },
      { 
        greeting: 'Morning prep', 
        sub: 'Gather materials for today\'s classes' 
      },
      { 
        greeting: 'Breakfast and books', 
        sub: 'Start your day with some light review' 
      },
      { 
        greeting: 'Day planner', 
        sub: 'Organize your study schedule' 
      }
    ],
    afternoon: [
      { 
        greeting: 'Good afternoon', 
        sub: 'How are your classes going today?' 
      },
      { 
        greeting: 'Afternoon study break', 
        sub: 'Time to review your notes' 
      },
      { 
        greeting: 'Lunch break', 
        sub: 'Great time to organize your notes' 
      },
      { 
        greeting: 'Midday check-in', 
        sub: 'Update your assignment tracker' 
      },
      { 
        greeting: 'Afternoon session', 
        sub: 'Work on homework and projects' 
      },
      { 
        greeting: 'Study time', 
        sub: 'Focus on one subject at a time' 
      },
      { 
        greeting: 'Class notes', 
        sub: 'Review and organize today\'s materials' 
      }
    ],
    evening: [
      { 
        greeting: 'Good evening, ' + displayName, 
        sub: 'Time to review today\'s lessons' 
      },
      { 
        greeting: 'Evening study', 
        sub: 'Work on assignments and projects' 
      },
      { 
        greeting: 'Homework time', 
        sub: 'Focus on completing your tasks' 
      },
      { 
        greeting: 'Nightly review', 
        sub: 'Go over what you learned today' 
      },
      { 
        greeting: 'Study session', 
        sub: 'Find a quiet place to concentrate' 
      },
      { 
        greeting: 'Evening prep', 
        sub: 'Get ready for tomorrow\'s classes' 
      },
      { 
        greeting: 'End of day', 
        sub: 'Update your planner for tomorrow' 
      }
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

function createWelcomeScreen() {
    const existing = document.querySelector('.documents .welcome-container');
    if (existing) existing.remove();

    const welcomeContainer = document.createElement('div');
    welcomeContainer.className = 'welcome-container';

    const welcomeContent = document.createElement('div');
    welcomeContent.className = 'welcome-content';

    const leftSide = document.createElement('div');
    leftSide.className = 'welcome-left';

    const welcomeText = document.createElement('div');
    welcomeText.className = 'welcome-text';
    welcomeText.innerHTML = `
        <h1>Welcome to Buddy Docs!</h1>
        <p>Let's get started</p>
        <ul class="features">
            <li>Create different types of docs</li>
            <li>Summarize documents (somewhat here)</li>
            <li>Less lag on old laptops</li>
            <li>Personalized to you</li>
            <li>Many customization options (still working on)</li>
            <li>No tracking, and no login needed</li>
            <li>Put deadlines on documents</li>
            <li>Easily export to Google Docs</li>
            <li>Integrated with apps from us (when they work)</li>
            <li>Get a calendar for deadlines</li>
        </ul>
    `;

    const rightSide = document.createElement('div');
    rightSide.className = 'welcome-right';

    const welcomeImage = document.createElement('img');
    welcomeImage.src = 'data/assets/welcomeCanvasImage.png';
    welcomeImage.alt = 'Welcome to Buddy Docs';
    welcomeImage.className = 'welcome-image';

    welcomeImage.addEventListener('error', () => {
        const placeholder = document.createElement('div');
        placeholder.className = 'welcome-image-placeholder';
        placeholder.textContent = '📚';
        rightSide.replaceChild(placeholder, welcomeImage);
    });

    rightSide.appendChild(welcomeImage);

    leftSide.appendChild(welcomeText);
    welcomeContent.appendChild(leftSide);
    welcomeContent.appendChild(rightSide);
    welcomeContainer.appendChild(welcomeContent);

    // Instead of appending to grid, append to the documents section
    const documentsSection = document.querySelector('.documents');
    documentsSection.appendChild(welcomeContainer);
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
  const aiEnabled = await getSetting('aiEnabled', false);
  const aiWelcomeEnabled = await getSetting('aiWelcomeEnabled', false);
  const docs = await listDocuments();
  
  let greetingData;
  
  if (aiEnabled && aiWelcomeEnabled) {
    // Get user context for AI welcome message
    const displayName = await getSetting('displayName', 'Buddy');
    const now = new Date();
    
    // Get recent documents (last 5 modified)
    const recentDocs = [...docs]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 5)
      .map(doc => doc.title || 'Untitled');
    
    // Get upcoming deadlines (next 7 days)
    const upcomingDeadlines = docs
      .filter(doc => doc.dueDate && new Date(doc.dueDate) > now)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 5);
    
    // Get passed deadlines (overdue)
    const passedDeadlines = docs
      .filter(doc => doc.dueDate && new Date(doc.dueDate) < now && !doc.completed)
      .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate))
      .slice(0, 5);
    
    // Get AI welcome message tone
    const aiWelcomeTone = await getSetting('aiWelcomeTone', 'casual');
    const aiWelcomeCustomTone = await getSetting('aiWelcomeCustomTone', '');
    
    let aiWelcomeFailed = false;
    
    // Verify AI provider is properly configured
    const aiProvider = await getSetting('aiProvider', 'ollama');
    const aiModel = await getSetting('aiModel', 'llama3');
    const aiBaseUrl = await getSetting('aiBaseUrl', 'http://localhost:11434');
    
    // Only proceed if we have a valid provider and model
    if (aiProvider && aiModel) {
      try {
        // Generate AI welcome message with a more reasonable timeout
        const aiWelcomePromise = generateWelcomeMessage({
          name: displayName,
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          recentDocuments: recentDocs,
          upcomingDeadlines: upcomingDeadlines,
          passedDeadlines: passedDeadlines,
          tone: aiWelcomeCustomTone || aiWelcomeTone
        });
        
        // Set a 10-second timeout for the AI welcome message
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI welcome message timeout')), 10000)
        );
        
        // Race between the AI welcome message and the timeout
        greetingData = await Promise.race([aiWelcomePromise, timeoutPromise]);
      } catch (error) {
        console.warn('AI welcome message generation failed:', error);
        aiWelcomeFailed = true;
      }
    } else {
      console.warn('AI provider not properly configured');
      aiWelcomeFailed = true;
    }
    
    // If AI welcome failed or timed out, use the default greeting
    if (aiWelcomeFailed) {
      greetingData = await getDynamicGreeting(new Date(), docs);
    }
  } else {
    // Use default greeting
    greetingData = await getDynamicGreeting(new Date(), docs);
  }
  
  // Handle both string and object formats for backward compatibility
  const greetingText = typeof greetingData === 'string' ? greetingData : greetingData.greeting;
  const subText = typeof greetingData === 'string' ? 'Keep your docs organized and on track.' : greetingData.sub;
  
  // Update the DOM
  const greetingElement = document.getElementById('greetingText');
  if (greetingElement) {
    greetingElement.textContent = greetingText;
  }
  
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
    case 'move-to-folder':
      await showMoveToFolderModal(doc);
      break;
    case 'toggle-lock': {
      const secretSet = await getSetting('secretSet', false);
      if (!secretSet){
        alert('Set a password or PIN in Settings first.');
        break;
      }
      if (!doc.locked){
        doc.locked = true;
        await saveDocument(doc);
      } else {
        const ok = await requireAuth();
        if (ok){
          doc.locked = false;
          await saveDocument(doc);
        }
      }
      break;
    }
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
  const thumb = node.querySelector('.thumb');
  
  // Route handler with lock protection
  let targetHref;
  if (doc.type === 'gallery') {
    targetHref = `gallery.html?id=${encodeURIComponent(doc.id)}`;
  } else if (doc.type === 'presentation') {
    targetHref = `slides.html?id=${encodeURIComponent(doc.id)}`;
  } else if (doc.type === 'board') {
    targetHref = `board.html?id=${encodeURIComponent(doc.id)}`;
  } else {
    targetHref = `editor.html?id=${encodeURIComponent(doc.id)}`;
  }
  link.href = '#';
  link.addEventListener('click', async (e)=>{
    e.preventDefault();
    if (doc.locked){
      const ok = await requireAuth();
      if (!ok) return;
    }
    location.href = targetHref;
  });
  
  node.querySelector('.title').textContent = doc.title || 'Untitled';
  node.querySelector('.type').textContent = (doc.type||'document').replace(/^./, c=>c.toUpperCase());
  node.querySelector('.due').innerHTML = dueBadge(doc);
  
  // Defer preview population until visible
  if (doc.type === 'gallery' && doc.thumbnailSrc) {
    // Use the pinned image as thumbnail for gallery
    thumb.innerHTML = '';
    const img = document.createElement('img');
    img.src = doc.thumbnailSrc;
    img.alt = doc.title || 'Gallery';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = '<span class="material-symbols-outlined">description</span>';
  }
  node._doc = doc;

  ensureDocCardObserver();
  docCardObserver.observe(node);

  // Lock UI overlay
  if (doc.locked){
    thumb.classList.add('locked');
    const overlay = document.createElement('div');
    overlay.className = 'lock-overlay';
    overlay.innerHTML = '<span class="material-symbols-outlined">lock</span>';
    thumb.appendChild(overlay);
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

// Folder colors
const FOLDER_COLORS = {
  blue: '#0550FF',
  purple: '#8B5CF6',
  pink: '#EC4899',
  red: '#EF4444',
  orange: '#F97316',
  yellow: '#EAB308',
  green: '#10B981',
  teal: '#14B8A6',
  gray: '#6B7280'
};

function createFolderCard(folder) {
  const card = document.createElement('div');
  card.className = 'doc-card folder-card';
  card.style.setProperty('--folder-color', FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue);
  
  const link = document.createElement('a');
  link.className = 'doc-link';
  link.href = '#';
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    currentFolderId = folder.id;
    await renderDocs();
  });
  
  const thumb = document.createElement('div');
  thumb.className = 'thumb folder-thumb';
  
  // Display either image or emoji based on folder settings
  if (folder.thumbnailType === 'image' && folder.thumbnailImage) {
    thumb.innerHTML = `<div class="folder-thumbnail"><img src="${folder.thumbnailImage}" alt="${folder.name}"></div>`;
  } else {
    thumb.innerHTML = `<span class="folder-emoji">${folder.emoji || '📁'}</span>`;
  }
  
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `
    <strong class="title">${folder.name || 'Untitled Folder'}</strong>
    <span class="type">Folder</span>
  `;
  
  link.appendChild(thumb);
  link.appendChild(meta);
  card.appendChild(link);
  
  // Menu container
  const menuContainer = document.createElement('div');
  menuContainer.className = 'menu-container';
  
  const moreBtn = document.createElement('button');
  moreBtn.className = 'more icon-btn';
  moreBtn.title = 'More';
  moreBtn.innerHTML = '<span class="material-symbols-outlined">more_horiz</span>';
  
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.hidden = true;
  menu.innerHTML = `
    <button class="menu-item" data-action="edit-folder">
      <span class="material-symbols-outlined">edit</span>
      Edit Folder
    </button>
    <button class="menu-item delete" data-action="delete-folder">
      <span class="material-symbols-outlined">delete</span>
      Delete Folder
    </button>
  `;
  
  menuContainer.appendChild(moreBtn);
  menuContainer.appendChild(menu);
  card.appendChild(menuContainer);
  
  // Menu handlers
  function open() {
    closeAllMenus(menu);
    menu.hidden = false;
    positionMenuNearButton(menu, moreBtn);
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
  }
  function close() {
    menu.hidden = true;
    window.removeEventListener('resize', onWindowChange);
    window.removeEventListener('scroll', onWindowChange, true);
  }
  function onWindowChange() {
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
    
    if (action === 'edit-folder') {
      showEditFolderModal(folder);
    } else if (action === 'delete-folder') {
      if (confirm(`Delete "${folder.name}" and all its contents?`)) {
        await deleteFolder(folder.id);
        await renderDocs();
      }
    }
    close();
  });
  
  document.addEventListener('click', () => {
    if (!menu.hidden) close();
  });
  
  return card;
}

// Lazy preview hydration for document cards
let docCardObserver = null;
function hydrateDocCardPreview(card){
  try {
    const doc = card._doc;
    const thumb = card.querySelector('.thumb');
    if (!doc || !thumb) return;
    // Do not render heavy previews for locked docs; keep placeholder + overlay
    if (doc.locked) return;

    if (doc.type === 'gallery' && Array.isArray(doc.content) && doc.content.length > 0) {
      const entries = doc.content
        .map(entry => typeof entry === 'string' ? { src: entry, spoiler:false, locked:false } : entry);
      let chosen = null;
      if (doc.thumbnailSrc) {
        chosen = doc.thumbnailSrc;
      }
      if (!chosen) {
        const candidates = entries.filter(e => !e.spoiler && !e.locked);
        chosen = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].src : null;
      }
      if (chosen){
        thumb.innerHTML = `<img src="${chosen}" alt="Gallery preview" style="width: 100%; height: 100%; object-fit: cover;">`;
        thumb.style.padding = '0';
      }
    } else if (doc.type === 'presentation' && Array.isArray(doc.slides) && doc.slides.length > 0) {
      const firstSlide = doc.slides[0];
      thumb.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; background: ${firstSlide.background || '#fff'}; font-size: 11px; color: var(--muted);">
        <span class="material-symbols-outlined" style="font-size: 48px;">slideshow</span>
      </div>`;
      thumb.style.padding = '0';
    } else if (doc.type === 'board') {
      const hasItems = Array.isArray(doc.content) && doc.content.length > 0;
      const bgUrl = 'data/assets/textures/corkboard1.png';
      thumb.style.padding = '0';
      thumb.innerHTML = `
        <div style="position:absolute; inset:0; background:${hasItems?`url('${bgUrl}') center / cover`:'var(--surface)'};"></div>
        <div style="position:absolute; inset:0; padding:8px;">
          ${hasItems ? doc.content
            .filter(it => it.type === 'note' || it.type === 'link' || it.type === 'shape')
            .slice(0,3)
            .map((it, i) => {
              const bg = it.bg || (it.type==='shape' ? '#FFD78A' : '#FFF3A4');
              const rot = it.rotation || (i === 0 ? -4 : i === 1 ? 3 : 1);
              const text = (it.text || it.href || '');
              return `<div style="position:absolute; left:${8 + i*58}px; top:${10 + i*8}px; width:80px; height:56px; background:${bg}; color:#333; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,.2); transform:rotate(${rot}deg); display:flex; align-items:center; justify-content:center; font-size:10px; overflow:hidden;">${text ? text.slice(0,22) : ''}</div>`;
            }).join('')
            : `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--muted);">
                 <span class="material-symbols-outlined" style="font-size:40px;">dashboard</span>
               </div>`}
        </div>
      `;
    } else {
      const content = doc.content || (doc.pages && doc.pages.length > 0 ? doc.pages[0].content : null);
      if (content) {
        thumb.innerHTML = content.slice(0, 200) + (content.length > 200 ? '...' : '');
      }
    }
  } catch (err) {
    // Fail gracefully
    console.warn('Preview hydrate error', err);
  }
}

function ensureDocCardObserver(){
  if (docCardObserver) return;
  docCardObserver = new IntersectionObserver((entries)=>{
    for (const e of entries){
      if (e.isIntersecting){
        hydrateDocCardPreview(e.target);
        docCardObserver.unobserve(e.target);
      }
    }
  }, { root: null, rootMargin: '200px 0px', threshold: 0.01 });
}

// Append large lists in chunks to avoid main-thread jank
function appendInChunks(container, list, createFn){
  const CHUNK = 40;
  let i = 0;
  function step(){
    const frag = document.createDocumentFragment();
    for (let c = 0; c < CHUNK && i < list.length; c++, i++){
      frag.appendChild(createFn(list[i]));
    }
    container.appendChild(frag);
    if (i < list.length){
      if ('requestIdleCallback' in window){
        requestIdleCallback(step, { timeout: 200 });
      } else {
        setTimeout(step, 16);
      }
    }
  }
  step();
}

async function renderDocs(){
  const grid = document.getElementById('docGrid');
  const term = document.getElementById('search').value;
  
  // Get folders and documents
  const folders = await listFolders({ parentId: currentFolderId });
  const allDocs = await listDocuments({ search: term });
  const docs = allDocs.filter(d => (d.folderId || null) === currentFolderId);
  
  grid.innerHTML = '';

  const sectionHead = document.querySelector('.documents .section-head');
  const documentsSection = document.querySelector('.documents');
  const existingWelcome = documentsSection.querySelector('.welcome-container');
  
  // Update section title based on current folder
  const sectionTitle = sectionHead?.querySelector('h3');
  if (sectionTitle) {
    if (currentFolderId) {
      const currentFolder = await getFolder(currentFolderId);
      sectionTitle.textContent = currentFolder ? currentFolder.name : 'Your Documents';
      
      // Add back button
      let backBtn = sectionHead.querySelector('.back-btn');
      if (!backBtn) {
        backBtn = document.createElement('button');
        backBtn.className = 'icon-btn back-btn';
        backBtn.title = 'Back';
        backBtn.innerHTML = '<span class="material-symbols-outlined">arrow_back</span>';
        backBtn.addEventListener('click', async () => {
          const folder = await getFolder(currentFolderId);
          currentFolderId = folder?.parentId || null;
          await renderDocs();
        });
        sectionTitle.parentElement.insertBefore(backBtn, sectionTitle);
      }
    } else {
      sectionTitle.textContent = 'Your Documents';
      const backBtn = sectionHead.querySelector('.back-btn');
      if (backBtn) backBtn.remove();
    }
  }

  if (folders.length === 0 && docs.length === 0 && !term && !currentFolderId) {
      if (sectionHead) sectionHead.style.display = 'none';
      grid.hidden = true;
      if (!existingWelcome) createWelcomeScreen(grid);
  } else {
      if (sectionHead) sectionHead.style.display = 'flex';
      grid.hidden = false;
      if (existingWelcome) existingWelcome.remove();
      
      // Render folders first
      appendInChunks(grid, folders, createFolderCard);
      
      // Then render documents
      appendInChunks(grid, docs, createDocCard);
  }
}

async function setupDeadlinesToggle() {
  const section = document.querySelector('.deadlines');
  const toggleBtn = document.querySelector('.deadlines .toggle-btn');
  
  if (!section || !toggleBtn) return;
  
  const icon = toggleBtn.querySelector('.material-symbols-outlined');
  
  // Load saved state
  const isCollapsed = await getSetting('deadlinesCollapsed', false);
  
  if (isCollapsed) {
    section.classList.add('collapsed');
    icon.textContent = 'expand_content';
  } else {
    icon.textContent = 'collapse_content';
  }
  
  // Handle toggle
  toggleBtn.addEventListener('click', async () => {
    const isCurrentlyCollapsed = section.classList.contains('collapsed');
    const newState = !isCurrentlyCollapsed;
    
    if (newState) {
      section.classList.add('collapsed');
      icon.textContent = 'expand_content';
    } else {
      section.classList.remove('collapsed');
      icon.textContent = 'collapse_content';
    }
    
    // Save state to local storage
    await setSetting('deadlinesCollapsed', newState);
  });
}

async function renderDeadlines() {
  const section = document.querySelector('.deadlines');
  if (!section) return;
  
  const docs = await listDocuments();
  const today = startOfDay(new Date());
  const items = docs.filter(d => d.dueDate)
    .map(d => ({ 
      d, 
      diff: Math.round((startOfDay(new Date(d.dueDate)) - today) / (1000 * 60 * 60 * 24)) 
    }))
    .filter(x => x.diff <= 14) // more than 14 days not shown here
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 8);
  
  const ul = document.getElementById('deadlineList');
  if (!ul) return;
  
  if (items.length === 0) {
    section.style.display = 'none'; // Hide the entire section if no deadlines
    return;
  }
  
  // Show the section and populate the list
  section.style.display = '';
  ul.innerHTML = '';
  
  for (const { d } of items) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <strong>${d.title || 'Untitled'}</strong>
        <div class="muted">${new Date(d.dueDate).toDateString()}</div>
      </div>
      ${dueBadge(d)}
    `;
    ul.appendChild(li);
  }
  
  // Update greeting when deadlines change
  await renderGreeting();
}

function renderTemplates(category = 'All') {
  const grid = document.getElementById('templatesGrid');
  if (!grid) {
    console.error('Templates grid not found in the modal.');
    return;
  }
  grid.innerHTML = ''; // Clear existing templates

  const filteredTemplates = Object.values(TEMPLATES).filter(template => 
    category === 'All' || template.category === category
  );

  if (filteredTemplates.length === 0) {
    grid.innerHTML = '<p class="empty-state">No templates found in this category.</p>';
    return;
  }

  for (const template of filteredTemplates) {
    const card = document.createElement('a');
    card.className = 'card template-card';
    card.href = `editor.html?template=${encodeURIComponent(template.key)}`;

    card.innerHTML = `
      <strong>${template.title}</strong>
      <div class="preview">${template.content.substring(0, 150)}...</div>
      <div class="info">
        <p>${template.description}</p>
      </div>
    `;
    grid.appendChild(card);
  }
}

function setupTemplatesModal() {
  const openBtn = document.getElementById('openTemplatesModal');
  const modal = document.getElementById('templatesModal');
  const closeBtn = document.getElementById('closeTemplatesModal');
  const sidebar = document.querySelector('.template-sidebar');

  if (!modal || !openBtn || !closeBtn || !sidebar) {
    return;
  }

  function open() {
    modal?.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    renderTemplates('All');
    // Ensure the 'All' button is active by default
    sidebar.querySelector('button[data-category="All"]').classList.add('active');
  }

  function close() {
    modal?.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    open();
  });

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  window.addEventListener('keydown', (e) => {
    if (!modal?.hasAttribute('hidden') && e.key === 'Escape') close();
  });

  sidebar.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const category = e.target.dataset.category;
      sidebar.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      renderTemplates(category);
    }
  });
}

function bindSearch() {
  const searchInput = document.getElementById('search');
  if (!searchInput) return;

  // Debounce search to avoid too many re-renders
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderDocs();
    }, 300);
  });

  // Also search on Enter key
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      renderDocs();
    }
  });
}

// Move to folder modal functions
async function showMoveToFolderModal(doc) {
  const modal = document.getElementById('moveToFolderModal');
  const folderSelect = document.getElementById('folderSelect');
  const moveBtn = document.getElementById('moveToFolderBtn');
  
  if (!modal) return;
  
  // Populate folder select with all folders
  const allFolders = await getAllFoldersFlat();
  folderSelect.innerHTML = '<option value="">Root (No Folder)</option>';
  
  for (const folder of allFolders) {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = folder.name;
    if (doc.folderId === folder.id) {
      option.selected = true;
    }
    folderSelect.appendChild(option);
  }
  
  modal.removeAttribute('hidden');
  
  // Handle move
  const handleMove = async () => {
    const selectedFolderId = folderSelect.value || null;
    doc.folderId = selectedFolderId;
    await saveDocument(doc);
    closeMoveToFolderModal();
    await renderDocs();
  };
  
  moveBtn.onclick = handleMove;
}

function closeMoveToFolderModal() {
  const modal = document.getElementById('moveToFolderModal');
  if (modal) modal.setAttribute('hidden', '');
}

async function getAllFoldersFlat() {
  // Get all folders recursively
  const result = [];
  
  async function collectFolders(parentId = null, prefix = '') {
    const folders = await listFolders({ parentId });
    for (const folder of folders) {
      result.push({ ...folder, name: prefix + folder.name });
      await collectFolders(folder.id, prefix + '  ');
    }
  }
  
  await collectFolders();
  return result;
}

function setupMoveToFolderModal() {
  const modal = document.getElementById('moveToFolderModal');
  const closeBtn = document.getElementById('closeMoveToFolderModal');
  
  if (!modal) return;
  
  closeBtn?.addEventListener('click', closeMoveToFolderModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMoveToFolderModal();
  });
  window.addEventListener('keydown', (e) => {
    if (!modal?.hasAttribute('hidden') && e.key === 'Escape') closeMoveToFolderModal();
  });
}

// Folder modal functions
function showEditFolderModal(folder = null) {
  const isNew = !folder;
  const modal = document.getElementById('folderModal');
  const modalTitle = document.getElementById('folderModalTitle');
  const nameInput = document.getElementById('folderNameInput');
  const emojiInput = document.getElementById('folderEmojiInput');
  const colorPicker = document.getElementById('folderColorPicker');
  const saveBtn = document.getElementById('saveFolderBtn');
  const useEmojiRadio = document.getElementById('useEmoji');
  const useImageRadio = document.getElementById('useImage');
  const emojiSection = document.getElementById('emojiSection');
  const imageSection = document.getElementById('imageSection');
  const imageInput = document.getElementById('folderImageInput');
  const imagePreview = document.getElementById('imagePreview');
  
  if (!modal) return;
  
  modalTitle.textContent = isNew ? 'New Folder' : 'Edit Folder';
  nameInput.value = folder?.name || '';
  emojiInput.value = folder?.emoji || '📁';
  
  // Set active color
  const colorButtons = colorPicker.querySelectorAll('.color-option');
  colorButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === (folder?.color || 'blue'));
  });
  
  // Set thumbnail type
  if (folder?.thumbnailType === 'image' && folder?.thumbnailImage) {
    useImageRadio.checked = true;
    emojiSection.style.display = 'none';
    imageSection.style.display = 'block';
    
    // Show existing image
    imagePreview.innerHTML = '';
    const img = document.createElement('img');
    img.src = folder.thumbnailImage;
    imagePreview.appendChild(img);
  } else {
    useEmojiRadio.checked = true;
    emojiSection.style.display = 'block';
    imageSection.style.display = 'none';
    imagePreview.innerHTML = '';
  }
  
  // Handle thumbnail type toggle
  useEmojiRadio.onchange = () => {
    emojiSection.style.display = 'block';
    imageSection.style.display = 'none';
  };
  
  useImageRadio.onchange = () => {
    emojiSection.style.display = 'none';
    imageSection.style.display = 'block';
  };
  
  // Handle image upload preview
  imageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.innerHTML = '';
      const img = document.createElement('img');
      img.src = e.target.result;
      imagePreview.appendChild(img);
    };
    reader.readAsDataURL(file);
  };
  
  modal.removeAttribute('hidden');
  nameInput.focus();
  
  // Handle save
  const handleSave = async () => {
    const name = nameInput.value.trim() || 'Untitled Folder';
    const activeColor = colorPicker.querySelector('.color-option.active');
    const color = activeColor?.dataset.color || 'blue';
    
    // Get thumbnail data
    const thumbnailType = useEmojiRadio.checked ? 'emoji' : 'image';
    let thumbnailImage = null;
    let emoji = '📁';
    
    if (thumbnailType === 'emoji') {
      emoji = emojiInput.value.trim() || '📁';
    } else if (imageInput.files[0]) {
      // Convert image to base64
      const file = imageInput.files[0];
      const reader = new FileReader();
      thumbnailImage = await new Promise((resolve) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    } else if (folder?.thumbnailImage) {
      // Keep existing image if no new one was uploaded
      thumbnailImage = folder.thumbnailImage;
    }
    
    const folderData = {
      ...(folder || {}),
      name,
      emoji,
      color,
      thumbnailType,
      thumbnailImage,
      parentId: currentFolderId
    };
    
    await saveFolder(folderData);
    closeFolderModal();
    await renderDocs();
  };
  
  saveBtn.onclick = handleSave;
  nameInput.onkeydown = (e) => {
    if (e.key === 'Enter') handleSave();
  };
}

function closeFolderModal() {
  const modal = document.getElementById('folderModal');
  if (modal) modal.setAttribute('hidden', '');
}

function setupFolderModal() {
  const modal = document.getElementById('folderModal');
  const closeBtn = document.getElementById('closeFolderModal');
  const colorPicker = document.getElementById('folderColorPicker');
  
  if (!modal) return;
  
  closeBtn?.addEventListener('click', closeFolderModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeFolderModal();
  });
  window.addEventListener('keydown', (e) => {
    if (!modal?.hasAttribute('hidden') && e.key === 'Escape') closeFolderModal();
  });
  
  // Color picker
  colorPicker?.addEventListener('click', (e) => {
    const colorBtn = e.target.closest('.color-option');
    if (colorBtn) {
      colorPicker.querySelectorAll('.color-option').forEach(btn => btn.classList.remove('active'));
      colorBtn.classList.add('active');
    }
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
  await initAiCommandBar();
  setupTemplatesModal();
  setupFolderModal();
  setupMoveToFolderModal();
  
  // Setup new folder button
  const newFolderBtn = document.getElementById('newFolderBtn');
  if (newFolderBtn) {
    newFolderBtn.addEventListener('click', () => showEditFolderModal());
  }
  
  // Setup quick action links to include folderId
  document.querySelectorAll('.quick-action-link').forEach(link => {
    link.addEventListener('click', (e) => {
      if (currentFolderId) {
        e.preventDefault();
        const baseHref = link.getAttribute('href');
        const separator = baseHref.includes('?') ? '&' : '?';
        window.location.href = `${baseHref}${separator}folderId=${encodeURIComponent(currentFolderId)}`;
      }
    });
  });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
