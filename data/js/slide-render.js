import { sanitizeHtml } from './sanitize.js';

// Slides are stored in a fixed 960x540 coordinate space and scaled to fit wherever they're shown.
export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;

// The host needs a laid-out size (or an explicit scale) so the stage can be sized to fit it.
export function renderSlideInto(host, slide, scale = host.clientWidth / SLIDE_WIDTH) {
  host.innerHTML = '';
  host.classList.add('slide-host');
  if (!slide) return;

  const stage = document.createElement('div');
  stage.className = 'slide-stage';
  stage.style.background = slide.background;
  stage.style.transform = `scale(${scale})`;

  slide.elements.forEach(element => stage.appendChild(buildElementNode(element)));
  host.appendChild(stage);
}

function buildElementNode(element) {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.left = element.x + 'px';
  el.style.top = element.y + 'px';
  el.style.width = element.width + 'px';
  el.style.height = element.height + 'px';
  el.style.zIndex = element.zIndex || 0;

  if (element.type === 'text') {
    el.innerHTML = sanitizeHtml(element.content);
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
    if (element.shape === 'rectangle' || element.shape === 'circle' || element.shape === 'line') {
      shape.style.background = element.color;
    }
    el.appendChild(shape);
  }

  return el;
}
