import { saveDocument, getDocument, deleteDocument } from './idb.js';

// State management
let presentation = {
  id: null,
  title: 'Untitled Presentation',
  type: 'presentation',
  slides: [],
  currentSlideIndex: 0,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

let selectedElement = null;
let isDragging = false;
let isResizing = false;
let dragStartX = 0;
let dragStartY = 0;
let elementStartX = 0;
let elementStartY = 0;
let currentTool = 'select';

// DOM elements
const slidesList = document.getElementById('slidesList');
const slideCanvas = document.getElementById('slideCanvas');
const presentationTitle = document.getElementById('presentationTitle');
const addSlideBtn = document.getElementById('addSlideBtn');
const deleteElementBtn = document.getElementById('deleteElementBtn');
const slideCounter = document.getElementById('slideCounter');
const syncIcon = document.getElementById('syncIcon');

// Tool buttons
const toolBtns = document.querySelectorAll('.tool-btn');
const formatBtns = document.querySelectorAll('.format-btn');
const fontSizeSelect = document.getElementById('fontSizeSelect');
const textColorPicker = document.getElementById('textColorPicker');
const bgColorPicker = document.getElementById('bgColorPicker');
const imageInput = document.getElementById('imageInput');

// Presentation mode
const presentBtn = document.getElementById('presentBtn');
const presentationMode = document.getElementById('presentationMode');
const presentCanvas = document.getElementById('presentCanvas');
const exitPresentBtn = document.getElementById('exitPresentBtn');
const prevSlideBtn = document.getElementById('prevSlideBtn');
const nextSlideBtn = document.getElementById('nextSlideBtn');
const presentSlideCounter = document.getElementById('presentSlideCounter');

// File menu
const fileMenuBtn = document.getElementById('fileMenuBtn');
const fileDropdown = document.getElementById('fileDropdown');
const archiveBtn = document.getElementById('archiveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportBdoxBtn = document.getElementById('exportBdoxBtn');

// Shape modal
const shapeModal = document.getElementById('shapeModal');
const closeShapeModal = document.getElementById('closeShapeModal');
const shapeOptions = document.querySelectorAll('.shape-option');

// Layout modal
const layoutModal = document.getElementById('layoutModal');
const layoutBtn = document.getElementById('layoutBtn');
const closeLayoutModal = document.getElementById('closeLayoutModal');
const layoutOptions = document.querySelectorAll('.layout-option');

// New buttons
const duplicateSlideBtn = document.getElementById('duplicateSlideBtn');
const bringForwardBtn = document.getElementById('bringForwardBtn');
const sendBackwardBtn = document.getElementById('sendBackwardBtn');
const alignBtns = document.querySelectorAll('[data-align]');

// Initialize
async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  
  if (id) {
    await loadPresentation(id);
  } else {
    createSlide();
    await savePresentation();
    // Update URL with new ID
    window.history.replaceState({}, '', `slides.html?id=${presentation.id}`);
  }
  
  renderSlidesList();
  renderCurrentSlide();
  setupEventListeners();
}

// Create a new slide
function createSlide() {
  const slide = {
    id: crypto.randomUUID(),
    elements: [],
    background: '#FFFFFF'
  };
  presentation.slides.push(slide);
  return slide;
}

// Add slide button
addSlideBtn?.addEventListener('click', () => {
  createSlide();
  presentation.currentSlideIndex = presentation.slides.length - 1;
  renderSlidesList();
  renderCurrentSlide();
  savePresentation();
});

// Tool selection
toolBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    
    if (tool === 'image') {
      imageInput.click();
      return; // Don't change tool, will auto-switch back after adding image
    } else if (tool === 'shape') {
      shapeModal.hidden = false;
      return; // Don't change tool, will auto-switch back after adding shape
    }
    
    toolBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = tool;
  });
});

// Image upload
imageInput?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    addImageElement(event.target.result);
    imageInput.value = '';
  };
  reader.readAsDataURL(file);
});

// Shape selection
shapeOptions.forEach(option => {
  option.addEventListener('click', () => {
    const shape = option.dataset.shape;
    addShapeElement(shape);
    shapeModal.hidden = true;
  });
});

closeShapeModal?.addEventListener('click', () => {
  shapeModal.hidden = true;
});

// Layout selection
layoutBtn?.addEventListener('click', () => {
  layoutModal.hidden = false;
});

layoutOptions.forEach(option => {
  option.addEventListener('click', () => {
    const layout = option.dataset.layout;
    applyLayout(layout);
    layoutModal.hidden = true;
  });
});

closeLayoutModal?.addEventListener('click', () => {
  layoutModal.hidden = true;
});

// Duplicate slide
duplicateSlideBtn?.addEventListener('click', () => {
  duplicateCurrentSlide();
});

// Z-index controls
bringForwardBtn?.addEventListener('click', () => {
  if (!selectedElement) return;
  const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
  if (element) {
    element.zIndex = (element.zIndex || 0) + 1;
    renderCurrentSlide();
    savePresentation();
  }
});

sendBackwardBtn?.addEventListener('click', () => {
  if (!selectedElement) return;
  const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
  if (element) {
    element.zIndex = Math.max(0, (element.zIndex || 0) - 1);
    renderCurrentSlide();
    savePresentation();
  }
});

// Alignment buttons
alignBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedElement) return;
    const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
    if (!element || element.type !== 'text') return;
    
    const align = btn.dataset.align;
    element.textAlign = align;
    renderCurrentSlide();
    savePresentation();
  });
});

// Canvas click - add text element
slideCanvas?.addEventListener('click', (e) => {
  if (e.target === slideCanvas && currentTool === 'text') {
    const rect = slideCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    addTextElement(x, y);
  }
});

// Add text element
function addTextElement(x, y) {
  const element = {
    id: crypto.randomUUID(),
    type: 'text',
    x: x,
    y: y,
    width: 200,
    height: 50,
    content: 'Click to edit',
    fontSize: 24,
    color: '#110F17',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none'
  };
  
  getCurrentSlide().elements.push(element);
  renderCurrentSlide();
  savePresentation();
}

// Add image element
function addImageElement(src) {
  const element = {
    id: crypto.randomUUID(),
    type: 'image',
    x: 100,
    y: 100,
    width: 300,
    height: 200,
    src: src
  };
  
  getCurrentSlide().elements.push(element);
  renderCurrentSlide();
  savePresentation();
  
  // Switch back to select tool
  currentTool = 'select';
  toolBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tool="select"]')?.classList.add('active');
}

// Add shape element
function addShapeElement(shape) {
  const element = {
    id: crypto.randomUUID(),
    type: 'shape',
    shape: shape,
    x: 200,
    y: 150,
    width: 100,
    height: 100,
    color: '#0550FF'
  };
  
  getCurrentSlide().elements.push(element);
  renderCurrentSlide();
  savePresentation();
  
  // Switch back to select tool
  currentTool = 'select';
  toolBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tool="select"]')?.classList.add('active');
}

// Duplicate current slide
function duplicateCurrentSlide() {
  const currentSlide = getCurrentSlide();
  const duplicateSlide = {
    id: crypto.randomUUID(),
    elements: currentSlide.elements.map(el => ({
      ...el,
      id: crypto.randomUUID()
    })),
    background: currentSlide.background
  };
  
  presentation.slides.splice(presentation.currentSlideIndex + 1, 0, duplicateSlide);
  presentation.currentSlideIndex++;
  renderSlidesList();
  renderCurrentSlide();
  savePresentation();
}

// Apply layout template
function applyLayout(layout) {
  const slide = getCurrentSlide();
  slide.elements = [];
  
  switch(layout) {
    case 'blank':
      // Just clear everything
      break;
    case 'title':
      slide.elements.push({
        id: crypto.randomUUID(),
        type: 'text',
        x: 180,
        y: 180,
        width: 600,
        height: 80,
        content: 'Title',
        fontSize: 64,
        color: '#110F17',
        fontWeight: 'bold',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center'
      });
      slide.elements.push({
        id: crypto.randomUUID(),
        type: 'text',
        x: 280,
        y: 300,
        width: 400,
        height: 50,
        content: 'Subtitle',
        fontSize: 32,
        color: '#6b667a',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center'
      });
      break;
    case 'title-content':
      slide.elements.push({
        id: crypto.randomUUID(),
        type: 'text',
        x: 60,
        y: 40,
        width: 840,
        height: 60,
        content: 'Title',
        fontSize: 48,
        color: '#110F17',
        fontWeight: 'bold',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left'
      });
      slide.elements.push({
        id: crypto.randomUUID(),
        type: 'text',
        x: 60,
        y: 140,
        width: 840,
        height: 340,
        content: 'Content goes here',
        fontSize: 24,
        color: '#110F17',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left'
      });
      break;
    case 'two-column':
      slide.elements.push({
        id: crypto.randomUUID(),
        type: 'text',
        x: 60,
        y: 40,
        width: 840,
        height: 60,
        content: 'Title',
        fontSize: 48,
        color: '#110F17',
        fontWeight: 'bold',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left'
      });
      slide.elements.push({
        id: crypto.randomUUID(),
        type: 'text',
        x: 60,
        y: 140,
        width: 390,
        height: 340,
        content: 'Left column',
        fontSize: 24,
        color: '#110F17',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left'
      });
      slide.elements.push({
        id: crypto.randomUUID(),
        type: 'text',
        x: 510,
        y: 140,
        width: 390,
        height: 340,
        content: 'Right column',
        fontSize: 24,
        color: '#110F17',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left'
      });
      break;
  }
  
  renderCurrentSlide();
  savePresentation();
}

// Get current slide
function getCurrentSlide() {
  return presentation.slides[presentation.currentSlideIndex];
}

// Render current slide
function renderCurrentSlide() {
  const slide = getCurrentSlide();
  if (!slide) return;
  
  slideCanvas.innerHTML = '';
  slideCanvas.style.background = slide.background;
  
  slide.elements.forEach(element => {
    const el = createElementDOM(element);
    slideCanvas.appendChild(el);
  });
  
  updateSlideCounter();
}

// Create element DOM
function createElementDOM(element) {
  const div = document.createElement('div');
  div.className = 'slide-element';
  div.dataset.id = element.id;
  div.style.left = element.x + 'px';
  div.style.top = element.y + 'px';
  div.style.width = element.width + 'px';
  div.style.height = element.height + 'px';
  div.style.zIndex = element.zIndex || 0;
  
  if (element.type === 'text') {
    div.classList.add('text-box');
    div.innerHTML = element.content;
    div.style.fontSize = element.fontSize + 'px';
    div.style.color = element.color;
    div.style.fontWeight = element.fontWeight;
    div.style.fontStyle = element.fontStyle;
    div.style.textDecoration = element.textDecoration;
    div.style.textAlign = element.textAlign || 'left';
    
    div.addEventListener('dblclick', () => {
      div.contentEditable = true;
      div.focus();
      selectElement(div);
    });
    
    div.addEventListener('blur', () => {
      div.contentEditable = false;
      element.content = div.innerHTML;
      savePresentation();
    });
  } else if (element.type === 'image') {
    div.classList.add('image-box');
    const img = document.createElement('img');
    img.src = element.src;
    div.appendChild(img);
  } else if (element.type === 'shape') {
    div.classList.add('shape-box');
    const shape = document.createElement('div');
    shape.className = 'shape ' + element.shape;
    if (element.shape === 'rectangle' || element.shape === 'circle' || element.shape === 'line') {
      shape.style.background = element.color;
    }
    div.appendChild(shape);
  }
  
  // Make element draggable and selectable
  div.addEventListener('mousedown', (e) => {
    if (e.target.contentEditable === 'true') return;
    e.stopPropagation();
    selectElement(div);
    startDrag(e, element);
  });
  
  return div;
}

// Select element
function selectElement(el) {
  document.querySelectorAll('.slide-element').forEach(e => {
    e.classList.remove('selected');
    e.querySelectorAll('.resize-handle').forEach(h => h.remove());
  });
  
  el.classList.add('selected');
  selectedElement = el;
  
  // Add resize handles
  const handles = ['nw', 'ne', 'sw', 'se'];
  handles.forEach(pos => {
    const handle = document.createElement('div');
    handle.className = 'resize-handle ' + pos;
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      startResize(e, pos);
    });
    el.appendChild(handle);
  });
}

// Start dragging
function startDrag(e, element) {
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  elementStartX = element.x;
  elementStartY = element.y;
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}

function onDrag(e) {
  if (!isDragging || !selectedElement) return;
  
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  
  const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
  if (element) {
    element.x = elementStartX + dx;
    element.y = elementStartY + dy;
    selectedElement.style.left = element.x + 'px';
    selectedElement.style.top = element.y + 'px';
  }
}

function stopDrag() {
  if (isDragging) {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    savePresentation();
  }
}

// Start resizing
function startResize(e, corner) {
  isResizing = true;
  const startX = e.clientX;
  const startY = e.clientY;
  const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
  const startWidth = element.width;
  const startHeight = element.height;
  const startPosX = element.x;
  const startPosY = element.y;
  
  function onResize(e) {
    if (!isResizing) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    if (corner.includes('e')) {
      element.width = Math.max(50, startWidth + dx);
    }
    if (corner.includes('w')) {
      element.width = Math.max(50, startWidth - dx);
      element.x = startPosX + dx;
    }
    if (corner.includes('s')) {
      element.height = Math.max(50, startHeight + dy);
    }
    if (corner.includes('n')) {
      element.height = Math.max(50, startHeight - dy);
      element.y = startPosY + dy;
    }
    
    selectedElement.style.width = element.width + 'px';
    selectedElement.style.height = element.height + 'px';
    selectedElement.style.left = element.x + 'px';
    selectedElement.style.top = element.y + 'px';
  }
  
  function stopResize() {
    isResizing = false;
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    savePresentation();
  }
  
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
}

// Delete element
deleteElementBtn?.addEventListener('click', () => {
  if (!selectedElement) return;
  
  const slide = getCurrentSlide();
  const index = slide.elements.findIndex(el => el.id === selectedElement.dataset.id);
  if (index !== -1) {
    slide.elements.splice(index, 1);
    renderCurrentSlide();
    selectedElement = null;
    savePresentation();
  }
});

// Format buttons
formatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedElement) return;
    const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
    if (!element || element.type !== 'text') return;
    
    const cmd = btn.dataset.cmd;
    if (cmd === 'bold') {
      element.fontWeight = element.fontWeight === 'bold' ? 'normal' : 'bold';
    } else if (cmd === 'italic') {
      element.fontStyle = element.fontStyle === 'italic' ? 'normal' : 'italic';
    } else if (cmd === 'underline') {
      element.textDecoration = element.textDecoration === 'underline' ? 'none' : 'underline';
    }
    
    renderCurrentSlide();
    savePresentation();
  });
});

// Font size
fontSizeSelect?.addEventListener('change', () => {
  if (!selectedElement) return;
  const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
  if (!element || element.type !== 'text') return;
  
  element.fontSize = parseInt(fontSizeSelect.value);
  renderCurrentSlide();
  savePresentation();
});

// Text color
textColorPicker?.addEventListener('change', () => {
  if (!selectedElement) return;
  const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
  if (!element || element.type !== 'text') return;
  
  element.color = textColorPicker.value;
  renderCurrentSlide();
  savePresentation();
});

// Background color
bgColorPicker?.addEventListener('change', () => {
  const slide = getCurrentSlide();
  slide.background = bgColorPicker.value;
  slideCanvas.style.background = slide.background;
  renderSlidesList();
  savePresentation();
});

// Render slides list (thumbnails)
function renderSlidesList() {
  slidesList.innerHTML = '';
  
  presentation.slides.forEach((slide, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'slide-thumbnail';
    if (index === presentation.currentSlideIndex) {
      thumb.classList.add('active');
    }
    
    const content = document.createElement('div');
    content.className = 'slide-thumbnail-content';
    content.style.transform = 'scale(0.23)';
    content.style.width = '960px';
    content.style.height = '540px';
    content.style.background = slide.background;
    
    slide.elements.forEach(element => {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = element.x + 'px';
      el.style.top = element.y + 'px';
      el.style.width = element.width + 'px';
      el.style.height = element.height + 'px';
      
      if (element.type === 'text') {
        el.innerHTML = element.content;
        el.style.fontSize = element.fontSize + 'px';
        el.style.color = element.color;
        el.style.fontWeight = element.fontWeight;
        el.style.fontStyle = element.fontStyle;
      } else if (element.type === 'image') {
        const img = document.createElement('img');
        img.src = element.src;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        el.appendChild(img);
      } else if (element.type === 'shape') {
        const shape = document.createElement('div');
        shape.className = 'shape ' + element.shape;
        shape.style.width = '100%';
        shape.style.height = '100%';
        if (element.shape === 'rectangle' || element.shape === 'circle' || element.shape === 'line') {
          shape.style.background = element.color;
        }
        el.appendChild(shape);
      }
      
      content.appendChild(el);
    });
    
    const number = document.createElement('div');
    number.className = 'slide-number';
    number.textContent = index + 1;
    
    thumb.appendChild(content);
    thumb.appendChild(number);
    
    thumb.addEventListener('click', () => {
      presentation.currentSlideIndex = index;
      renderSlidesList();
      renderCurrentSlide();
    });
    
    // Add context menu for delete
    thumb.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (presentation.slides.length > 1) {
        if (confirm('Delete this slide?')) {
          presentation.slides.splice(index, 1);
          if (presentation.currentSlideIndex >= presentation.slides.length) {
            presentation.currentSlideIndex = presentation.slides.length - 1;
          }
          renderSlidesList();
          renderCurrentSlide();
          savePresentation();
        }
      }
    });
    
    slidesList.appendChild(thumb);
  });
}

// Update slide counter
function updateSlideCounter() {
  if (slideCounter) {
    slideCounter.textContent = `Slide ${presentation.currentSlideIndex + 1} of ${presentation.slides.length}`;
  }
}

// Presentation mode
presentBtn?.addEventListener('click', () => {
  enterPresentationMode();
});

function enterPresentationMode() {
  presentationMode.hidden = false;
  presentation.presentSlideIndex = 0;
  renderPresentationSlide();
  
  // Fullscreen API
  if (presentationMode.requestFullscreen) {
    presentationMode.requestFullscreen();
  }
}

exitPresentBtn?.addEventListener('click', exitPresentationMode);

function exitPresentationMode() {
  presentationMode.hidden = true;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
}

prevSlideBtn?.addEventListener('click', () => {
  if (presentation.presentSlideIndex > 0) {
    presentation.presentSlideIndex--;
    renderPresentationSlide();
  }
});

nextSlideBtn?.addEventListener('click', () => {
  if (presentation.presentSlideIndex < presentation.slides.length - 1) {
    presentation.presentSlideIndex++;
    renderPresentationSlide();
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Presentation mode shortcuts
  if (!presentationMode.hidden) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      if (presentation.presentSlideIndex < presentation.slides.length - 1) {
        presentation.presentSlideIndex++;
        renderPresentationSlide();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (presentation.presentSlideIndex > 0) {
        presentation.presentSlideIndex--;
        renderPresentationSlide();
      }
    } else if (e.key === 'Escape') {
      exitPresentationMode();
    }
    return;
  }
  
  // Edit mode shortcuts
  // Don't trigger shortcuts when typing in contenteditable elements
  if (document.activeElement.contentEditable === 'true' || document.activeElement.tagName === 'INPUT') {
    return;
  }
  
  // F5 - Start presentation
  if (e.key === 'F5') {
    e.preventDefault();
    enterPresentationMode();
    return;
  }
  
  // Ctrl+D - Duplicate slide
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    duplicateCurrentSlide();
  }
  // Ctrl+M - New slide
  else if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
    e.preventDefault();
    createSlide();
    presentation.currentSlideIndex = presentation.slides.length - 1;
    renderSlidesList();
    renderCurrentSlide();
    savePresentation();
  }
  // Ctrl+B - Bold
  else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    if (!selectedElement) return;
    const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
    if (element && element.type === 'text') {
      element.fontWeight = element.fontWeight === 'bold' ? 'normal' : 'bold';
      renderCurrentSlide();
      savePresentation();
    }
  }
  // Ctrl+I - Italic
  else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault();
    if (!selectedElement) return;
    const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
    if (element && element.type === 'text') {
      element.fontStyle = element.fontStyle === 'italic' ? 'normal' : 'italic';
      renderCurrentSlide();
      savePresentation();
    }
  }
  // Ctrl+U - Underline
  else if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault();
    if (!selectedElement) return;
    const element = getCurrentSlide().elements.find(el => el.id === selectedElement.dataset.id);
    if (element && element.type === 'text') {
      element.textDecoration = element.textDecoration === 'underline' ? 'none' : 'underline';
      renderCurrentSlide();
      savePresentation();
    }
  }
  // Delete - Delete selected element
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedElement) {
      e.preventDefault();
      const slide = getCurrentSlide();
      const index = slide.elements.findIndex(el => el.id === selectedElement.dataset.id);
      if (index !== -1) {
        slide.elements.splice(index, 1);
        renderCurrentSlide();
        selectedElement = null;
        savePresentation();
      }
    }
  }
  // V - Select tool
  else if (e.key === 'v' || e.key === 'V') {
    currentTool = 'select';
    toolBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="select"]')?.classList.add('active');
  }
  // T - Text tool
  else if (e.key === 't' || e.key === 'T') {
    currentTool = 'text';
    toolBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="text"]')?.classList.add('active');
  }
  // I - Image tool
  else if (e.key === 'i' && !e.ctrlKey && !e.metaKey) {
    currentTool = 'image';
    toolBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="image"]')?.classList.add('active');
    imageInput.click();
  }
  // S - Shape tool
  else if (e.key === 's' || e.key === 'S') {
    currentTool = 'shape';
    toolBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="shape"]')?.classList.add('active');
    shapeModal.hidden = false;
  }
});

function renderPresentationSlide() {
  const slide = presentation.slides[presentation.presentSlideIndex];
  if (!slide) return;
  
  presentCanvas.innerHTML = '';
  presentCanvas.style.background = slide.background;
  
  slide.elements.forEach(element => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = element.x + 'px';
    el.style.top = element.y + 'px';
    el.style.width = element.width + 'px';
    el.style.height = element.height + 'px';
    
    if (element.type === 'text') {
      el.innerHTML = element.content;
      el.style.fontSize = element.fontSize + 'px';
      el.style.color = element.color;
      el.style.fontWeight = element.fontWeight;
      el.style.fontStyle = element.fontStyle;
      el.style.textDecoration = element.textDecoration;
      el.style.textAlign = element.textAlign || 'left';
      el.style.padding = '12px';
    } else if (element.type === 'image') {
      const img = document.createElement('img');
      img.src = element.src;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      el.appendChild(img);
    } else if (element.type === 'shape') {
      const shape = document.createElement('div');
      shape.className = 'shape ' + element.shape;
      shape.style.width = '100%';
      shape.style.height = '100%';
      if (element.shape === 'rectangle' || element.shape === 'circle' || element.shape === 'line') {
        shape.style.background = element.color;
      }
      el.appendChild(shape);
    }
    
    presentCanvas.appendChild(el);
  });
  
  presentSlideCounter.textContent = `${presentation.presentSlideIndex + 1} / ${presentation.slides.length}`;
}

// Save presentation
async function savePresentation() {
  presentation.title = presentationTitle.textContent.trim() || 'Untitled Presentation';
  presentation.updatedAt = Date.now();
  
  syncIcon.classList.remove('material-symbols-outlined');
  syncIcon.textContent = '...';
  
  await saveDocument(presentation);
  
  setTimeout(() => {
    syncIcon.classList.add('material-symbols-outlined');
    syncIcon.textContent = 'check';
  }, 500);
}

// Load presentation
async function loadPresentation(id) {
  const doc = await getDocument(id);
  if (doc && doc.type === 'presentation') {
    presentation = doc;
    presentationTitle.textContent = presentation.title;
    if (!presentation.slides || presentation.slides.length === 0) {
      createSlide();
    }
    presentation.currentSlideIndex = presentation.currentSlideIndex || 0;
  }
}

// Auto-save on title change
presentationTitle?.addEventListener('blur', savePresentation);
presentationTitle?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    presentationTitle.blur();
  }
});

// File menu
fileMenuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  fileDropdown.hidden = !fileDropdown.hidden;
  
  if (!fileDropdown.hidden) {
    const rect = fileMenuBtn.getBoundingClientRect();
    fileDropdown.style.left = rect.left + 'px';
    fileDropdown.style.top = rect.bottom + 'px';
    
    const closeDropdown = (e) => {
      if (!fileDropdown.contains(e.target) && e.target !== fileMenuBtn) {
        fileDropdown.hidden = true;
        document.removeEventListener('click', closeDropdown);
      }
    };
    setTimeout(() => document.addEventListener('click', closeDropdown), 0);
  }
});

// Archive
archiveBtn?.addEventListener('click', async () => {
  presentation.archived = !presentation.archived;
  await savePresentation();
  alert(presentation.archived ? 'Presentation archived' : 'Presentation unarchived');
  window.location.href = './';
});

// Delete
deleteBtn?.addEventListener('click', async () => {
  if (confirm('Delete this presentation permanently?')) {
    await deleteDocument(presentation.id);
    window.location.href = './';
  }
});

// Export as PDF (placeholder)
exportPdfBtn?.addEventListener('click', () => {
  alert('PDF export coming soon!');
});

// Export as .bdox
exportBdoxBtn?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(presentation, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${presentation.title}.bdox`;
  a.click();
  URL.revokeObjectURL(url);
});

// Setup event listeners
function setupEventListeners() {
  // Click outside to deselect
  document.addEventListener('click', (e) => {
    if (e.target === slideCanvas) {
      document.querySelectorAll('.slide-element').forEach(el => {
        el.classList.remove('selected');
        el.querySelectorAll('.resize-handle').forEach(h => h.remove());
      });
      selectedElement = null;
    }
  });
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
