import { getSetting, setSetting } from './idb.js';

export async function isAiEnabled() {
  return await getSetting('aiEnabled', false);
}

export async function getAiConfig() {
  const provider = await getSetting('aiProvider', 'ollama');
  const model = await getSetting('aiModel', '');
  const baseUrl = await getSetting('aiBaseUrl', 'http://localhost:11434');
  const mode = await getSetting('aiMode', 'ask-without-context');
  
  return { provider, model, baseUrl, mode };
}

// Get document context based on mode
function getDocumentContext(mode) {
  const titleEl = document.getElementById('docTitle');
  const editorEl = document.getElementById('editor');
  
  if (!titleEl || !editorEl) return null;
  
  const title = titleEl.textContent || titleEl.innerText || 'Untitled';
  const content = editorEl.textContent || editorEl.innerText || '';
  
  if (mode === 'ask-without-context') {
    return null;
  } else if (mode === 'ask') {
    // Return visible content only
    return `Document Title: ${title}\n\nVisible Content:\n${content}`;
  } else if (mode === 'edit') {
    // Return full document for editing
    return {
      title,
      content,
      fullDocument: `Document Title: ${title}\n\nFull Document Content:\n${content}`
    };
  }
  
  return null;
}

// Apply document edits (for edit mode)
function applyDocumentEdit(editData) {
  const titleEl = document.getElementById('docTitle');
  const editorEl = document.getElementById('editor');
  
  if (!titleEl || !editorEl) return false;
  
  function dispatchChange(){
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Helpers for text-targeted operations
  function findTextNodeAndRange(root, target, { caseSensitive = false, occurrence = 'first' } = {}){
    if (!target) return null;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const normTarget = caseSensitive ? target : target.toLowerCase();
    let match = null;
    let last = null;
    while (tw.nextNode()){
      const node = tw.currentNode;
      const src = caseSensitive ? node.nodeValue : node.nodeValue.toLowerCase();
      const idx = src.indexOf(normTarget);
      if (idx !== -1){
        const res = { node, start: idx, end: idx + target.length };
        last = res;
        if (occurrence === 'first') { match = res; break; }
      }
    }
    return occurrence === 'last' ? (last || match) : match;
  }

  function splitTextNode(node, start, end){
    const before = node.splitText(start);
    const after = before.splitText(end - start);
    return { middle: before, after };
  }

  function wrapRangeWithTag(node, start, end, tagName){
    const { middle } = splitTextNode(node, start, end);
    const wrapper = document.createElement(tagName);
    middle.parentNode.replaceChild(wrapper, middle);
    wrapper.appendChild(middle);
    return wrapper;
  }

  function replaceRangeWithHtml(node, start, end, html){
    const { middle } = splitTextNode(node, start, end);
    const range = document.createRange();
    range.selectNode(middle);
    const frag = range.createContextualFragment(html);
    middle.parentNode.replaceChild(frag, middle);
  }

  function closestBlockElement(node){
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return el && el.closest('p,li,h1,h2,h3,h4,h5,blockquote,pre,div');
  }

  function replaceTagName(el, newTag){
    const ne = document.createElement(newTag);
    // preserve attributes
    for (const attr of Array.from(el.attributes)) ne.setAttribute(attr.name, attr.value);
    // move children
    while (el.firstChild) ne.appendChild(el.firstChild);
    el.parentNode.replaceChild(ne, el);
    return ne;
  }

  let changed = false;
  try {
    // Title change (simple)
    if (editData.newTitle && editData.newTitle !== titleEl.textContent) {
      titleEl.textContent = editData.newTitle;
      titleEl.dispatchEvent(new Event('input', { bubbles: true }));
      changed = true;
    }

    // Structured operations take precedence over raw newContent
    const ops = Array.isArray(editData.operations) ? editData.operations : (Array.isArray(editData.changes?.operations) ? editData.changes.operations : null);
    if (ops && ops.length){
      for (const op of ops){
        try {
          switch(op.type){
            case 'append': {
              if (op.html){ editorEl.insertAdjacentHTML('beforeend', op.html); changed = true; }
              break;
            }
            case 'prepend': {
              if (op.html){ editorEl.insertAdjacentHTML('afterbegin', op.html); changed = true; }
              break;
            }
            case 'insertAfter': {
              const res = findTextNodeAndRange(editorEl, op.target, { caseSensitive: !!op.caseSensitive, occurrence: op.occurrence || 'first' });
              if (res && op.html){
                const blk = closestBlockElement(res.node);
                if (blk){ blk.insertAdjacentHTML('afterend', op.html); changed = true; }
              }
              break;
            }
            case 'insertBefore': {
              const res = findTextNodeAndRange(editorEl, op.target, { caseSensitive: !!op.caseSensitive, occurrence: op.occurrence || 'first' });
              if (res && op.html){
                const blk = closestBlockElement(res.node);
                if (blk){ blk.insertAdjacentHTML('beforebegin', op.html); changed = true; }
              }
              break;
            }
            case 'replace': {
              const res = findTextNodeAndRange(editorEl, op.target, { caseSensitive: !!op.caseSensitive, occurrence: op.occurrence || 'first' });
              if (res && op.html){ replaceRangeWithHtml(res.node, res.start, res.end, op.html); changed = true; }
              break;
            }
            case 'wrap': {
              const res = findTextNodeAndRange(editorEl, op.target, { caseSensitive: !!op.caseSensitive, occurrence: op.occurrence || 'first' });
              const tag = (op.tag || '').toLowerCase();
              const allowed = ['strong','em','u','mark','code','a','h1','h2','h3','blockquote'];
              if (res && tag && allowed.includes(tag)){
                const el = wrapRangeWithTag(res.node, res.start, res.end, tag);
                if (tag === 'a' && op.href) el.setAttribute('href', op.href);
                changed = true;
              }
              break;
            }
            case 'formatBlock': {
              const res = findTextNodeAndRange(editorEl, op.target, { caseSensitive: !!op.caseSensitive, occurrence: op.occurrence || 'first' });
              const tag = (op.tag || '').toLowerCase();
              const allowedBlocks = ['p','h1','h2','h3','blockquote','pre'];
              if (res && tag && allowedBlocks.includes(tag)){
                const blk = closestBlockElement(res.node);
                if (blk){ replaceTagName(blk, tag); changed = true; }
              }
              break;
            }
            case 'insertList': {
              const res = findTextNodeAndRange(editorEl, op.target, { caseSensitive: !!op.caseSensitive, occurrence: op.occurrence || 'first' });
              const listType = (op.listType || '').toLowerCase(); // 'ul' | 'ol'
              if (res && (listType==='ul' || listType==='ol')){
                const blk = closestBlockElement(res.node);
                if (blk){
                  const text = blk.textContent || '';
                  const list = document.createElement(listType);
                  const li = document.createElement('li');
                  li.textContent = text;
                  list.appendChild(li);
                  blk.replaceWith(list);
                  changed = true;
                }
              }
              break;
            }
            default:
              // unknown op -> ignore
              break;
          }
        } catch(err){
          console.warn('Operation failed', op, err);
        }
      }
      if (changed){ dispatchChange(); }
      return changed;
    }

    // Backward compatibility: if newContent provided, append by default unless overwrite=true
    const newContent = editData.newContent || editData.changes?.newContent;
    const overwrite = !!(editData.overwrite || editData.changes?.overwrite);
    if (newContent){
      if (overwrite){
        if (newContent !== editorEl.innerHTML){ editorEl.innerHTML = newContent; changed = true; }
      } else {
        editorEl.insertAdjacentHTML('beforeend', newContent);
        changed = true;
      }
    }

    if (changed){ dispatchChange(); }
    return changed;
  } catch (error) {
    console.error('Failed to apply edit:', error);
    return false;
  }
}

export async function sendChatMessage(message, mode) {
  const config = await getAiConfig();
  
  if (!config.model) {
    throw new Error('No AI model configured. Please set a model in Settings.');
  }
  
  // Get document context based on mode
  const context = getDocumentContext(mode || config.mode);
  
  // Build the full prompt with appropriate system instructions
  let systemPrompt = 'You are a helpful AI assistant for document editing and writing.';
  
  if (mode === 'edit' && context) {
    systemPrompt = `You are an AI document editor. You can read and modify the current document without overwriting existing content unless explicitly asked.

IMPORTANT: When in edit mode, you MUST respond with valid JSON ONLY in this exact format:
{
  "type": "edit",
  "explanation": "Brief description of what you're changing and why",
  "changes": {
    "newTitle": "New title (optional)",
    "operations": [
      // Use these non-destructive operations to write new content and format text
      // Append content at end of document
      { "type": "append", "html": "<p>New paragraph</p>" },
      // Prepend content at start of document
      { "type": "prepend", "html": "<h2>Introduction</h2>" },
      // Insert a block after the block containing the target text
      { "type": "insertAfter", "target": "Conclusion", "html": "<p>Next steps...</p>", "occurrence": "first|last", "caseSensitive": false },
      // Insert a block before the block containing the target text
      { "type": "insertBefore", "target": "Overview", "html": "<h3>Background</h3>" },
      // Replace only the matching text with provided HTML (use for rewriting a sentence)
      { "type": "replace", "target": "old sentence", "html": "<strong>new sentence</strong>", "occurrence": "first" },
      // Wrap matching text with inline tag (formatting)
      { "type": "wrap", "target": "important term", "tag": "strong" }
    ],
    "overwrite": false, // if true AND newContent is provided, replace entire document content
    "newContent": "<div>Optional full HTML replacement</div>"
  }
}

Rules:
- Prefer operations for incremental edits and formatting (bold/italic/heading/lists/links) instead of replacing the full content.
- For formatting, use wrap with tag: strong, em, u, mark, code, a (with href), or headings h1-h3.
- For inserting sections, prefer insertBefore/insertAfter relative to landmark text.
- Return ONLY JSON — no extra commentary or markdown fences.

Current document state:
Title: "${context.title}"
Content: ${context.content}`;
  }
  
  let fullPrompt = systemPrompt;
  
  if (context && mode !== 'edit') {
    if (typeof context === 'string') {
      fullPrompt += `\n\nDocument context:\n${context}`;
    }
  }
  
  fullPrompt += `\n\nUser: ${message}`;
  
  let apiUrl;
  let requestBody;
  
  if (config.provider === 'ollama') {
    apiUrl = `${config.baseUrl}/api/generate`;
    requestBody = {
      model: config.model,
      prompt: fullPrompt,
      stream: false
    };
  } else if (config.provider === 'lmstudio') {
    apiUrl = `${config.baseUrl}/v1/chat/completions`;
    const messages = [{ role: 'system', content: systemPrompt }];
    
    if (context && mode !== 'edit' && typeof context === 'string') {
      messages.push({ role: 'system', content: context });
    }
    
    messages.push({ role: 'user', content: message });
    
    requestBody = {
      model: config.model,
      messages: messages,
      temperature: 0.7
    };
  } else {
    throw new Error('Unsupported AI provider');
  }
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    let aiResponse;
    if (config.provider === 'ollama') {
      aiResponse = data.response;
    } else if (config.provider === 'lmstudio') {
      aiResponse = data.choices[0]?.message?.content || 'No response';
    }
    
    // Handle edit mode responses
    if (mode === 'edit' && aiResponse) {
      try {
        // Clean up the response - sometimes AI adds markdown code blocks or extra text
        let jsonStr = aiResponse.trim();
        
        // Remove markdown code block markers if present
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.slice(7);
        }
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.slice(3);
        }
        if (jsonStr.endsWith('```')) {
          jsonStr = jsonStr.slice(0, -3);
        }
        
        // Try to find JSON in the response
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
        
        const editData = JSON.parse(jsonStr);
        if (editData.type === 'edit' && editData.changes) {
          return {
            isEdit: true,
            explanation: editData.explanation || 'Document edit',
            changes: editData.changes,
            originalResponse: aiResponse
          };
        }
      } catch (e) {
        // If JSON parsing fails, return as regular message with error note
        return `I couldn't format my response properly. Here's what I wanted to say: ${aiResponse}\n\n(Note: In edit mode, I should respond with structured changes, but there was a formatting error.)`;
      }
    }
    
    return aiResponse;
    
  } catch (error) {
    console.error('AI request failed:', error);
    throw new Error(`Failed to get AI response: ${error.message}`);
  }
}

export function createChatbotUI() {
  const chatbot = document.createElement('div');
  chatbot.id = 'aiChatbot';
  chatbot.className = 'ai-chatbot';
  chatbot.innerHTML = `
    <div class="ai-chatbot-header">
      <div class="ai-chatbot-title">
        <span class="material-symbols-outlined sparkle-icon">auto_awesome</span>
        <span>CompactB</span>
      </div>
      <button class="close-btn" onclick="hideChatbot()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="ai-chatbot-mode">
      <select id="aiModeSelect">
        <option value="ask-without-context">Ask (without context)</option>
        <option value="ask">Ask (with context)</option>
        <option value="edit">Edit document</option>
      </select>
    </div>
    <div class="ai-chatbot-messages" id="aiMessages"></div>
    <div class="ai-chatbot-input">
      <input type="text" id="aiInput" placeholder="Ask CompactB..." />
    </div>
    <div class="ai-chatbot-resize-handle"></div>
  `;
  
  // Add to editor-wrap
  const editorWrap = document.querySelector('.editor-wrap');
  if (editorWrap) {
    editorWrap.appendChild(chatbot);
    editorWrap.classList.add('with-ai');
    
    // Make the chatbot resizable
    makeResizable(chatbot);
    
    // Bind input events
    bindChatbotEvents();
  }
  
  return chatbot;
}

function makeResizable(chatbot) {
  const resizeHandle = chatbot.querySelector('.ai-chatbot-resize-handle');
  let isResizing = false;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
  });
  
  function handleResize(e) {
    if (!isResizing) return;
    
    const rect = chatbot.getBoundingClientRect();
    const newWidth = rect.right - e.clientX;
    
    if (newWidth >= 200 && newWidth <= 600) {
      chatbot.style.width = `${newWidth}px`;
    }
  }
  
  function stopResize() {
    isResizing = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }
}

async function bindChatbotEvents() {
  const input = document.getElementById('aiInput');
  const modeSelect = document.getElementById('aiModeSelect');
  const messagesContainer = document.getElementById('aiMessages');

  // Load and set current mode
  const currentMode = await getSetting('aiMode', 'ask-without-context');
  modeSelect.value = currentMode;

  // Save mode when changed
  modeSelect.addEventListener('change', async () => {
    await setSetting('aiMode', modeSelect.value);
  });

  function addMessage(role, content, isError = false) {
    const messageId = `msg-${Date.now()}-${Math.random()}`;
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = `message ${role} ${isError ? 'error' : ''}`;
    messageEl.innerHTML = `
      <div class="message-avatar">
        ${role === 'user' ? 
          '<span class="material-symbols-outlined">person</span>' : 
          '<span class="material-symbols-outlined sparkle-icon">auto_awesome</span>'
        }
      </div>
      <div class="message-content">${content}</div>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return messageId;
  }
  
  // Utility: escape HTML
  function escapeHtml(str){
    return (str||'').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
  }
  
  // Utility: strip HTML tags to text
  function stripHtml(html){
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || div.innerText || '';
  }
  
  // Compute a simple word-level diff using LCS
  function diffWords(oldText, newText, limit = 2000){
    const a = (oldText||'').trim().split(/(\s+|\b)/).filter(t=>t.length>0);
    const b = (newText||'').trim().split(/(\s+|\b)/).filter(t=>t.length>0);
    // Fallback for very large inputs
    if (a.length * b.length > limit*limit){
      const previewNew = escapeHtml(newText.slice(0, 500));
      return { html: `<em class="muted">Diff too large to compute quickly. Showing first 500 chars of proposal:</em><div class="diff-fallback">${previewNew}...</div>`, adds: 0, dels: 0 };
    }
    const n = a.length, m = b.length;
    const dp = Array.from({length: n+1}, ()=> new Array(m+1).fill(0));
    for (let i=1;i<=n;i++){
      for (let j=1;j<=m;j++){
        if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1] + 1; else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
    // Backtrack
    let i=n, j=m; const seq = [];
    while(i>0 && j>0){
      if (a[i-1] === b[j-1]){ seq.push({type:'same', text:a[i-1]}); i--; j--; }
      else if (dp[i-1][j] >= dp[i][j-1]){ seq.push({type:'del', text:a[i-1]}); i--; }
      else { seq.push({type:'add', text:b[j-1]}); j--; }
    }
    while(i>0){ seq.push({type:'del', text:a[i-1]}); i--; }
    while(j>0){ seq.push({type:'add', text:b[j-1]}); j--; }
    seq.reverse();
    let adds=0, dels=0;
    const html = seq.map(part=>{
      const t = escapeHtml(part.text);
      if (part.type==='add'){ adds++; return `<ins class="diff-ins">${t}</ins>`; }
      if (part.type==='del'){ dels++; return `<del class="diff-del">${t}</del>`; }
      return t;
    }).join('');
    return { html, adds, dels };
  }
  
  // Create in-document diff preview overlay
  function createDiffPreview(changes) {
    const titleEl = document.getElementById('docTitle');
    const editorEl = document.getElementById('editor');
    
    if (!titleEl || !editorEl) return null;

    // Clone the current document elements for preview
    const previewTitleEl = titleEl.cloneNode(true);
    const previewEditorEl = editorEl.cloneNode(true);
    
    // Create a temporary container to simulate changes
    const tempContainer = document.createElement('div');
    tempContainer.style.display = 'none';
    document.body.appendChild(tempContainer);
    tempContainer.appendChild(previewTitleEl);
    tempContainer.appendChild(previewEditorEl);
    
    // Store original content for comparison
    const originalTitle = titleEl.textContent || '';
    const originalContent = editorEl.innerHTML || '';
    
    try {
      // Apply changes to preview elements by replicating applyDocumentEdit logic
      let hasChanges = false;
      
      // Handle title change
      if (changes.newTitle && changes.newTitle !== originalTitle) {
        previewTitleEl.textContent = changes.newTitle;
        hasChanges = true;
      }
      
      // Handle operations or content changes
      const ops = Array.isArray(changes?.operations) ? changes.operations : [];
      if (ops.length > 0) {
        // Apply operations to preview (simplified version)
        for (const op of ops) {
          hasChanges = true;
          switch(op.type) {
            case 'append':
              if (op.html) previewEditorEl.insertAdjacentHTML('beforeend', op.html);
              break;
            case 'prepend':
              if (op.html) previewEditorEl.insertAdjacentHTML('afterbegin', op.html);
              break;
            // Add more operation types as needed
          }
        }
      } else if (changes.newContent) {
        if (changes.overwrite) {
          previewEditorEl.innerHTML = changes.newContent;
        } else {
          previewEditorEl.insertAdjacentHTML('beforeend', changes.newContent);
        }
        hasChanges = true;
      }
      
      if (!hasChanges) return null;
      
      // Create diff overlay
      const overlay = document.createElement('div');
      overlay.className = 'document-diff-overlay';
      
      overlay.innerHTML = `
        <div class="document-diff-container">
          <div class="diff-preview-header">
            <h3>Preview Changes</h3>
            <div class="diff-legend">
              <div class="diff-legend-item">
                <div class="diff-legend-color deletion"></div>
                <span>Deletions</span>
              </div>
              <div class="diff-legend-item">
                <div class="diff-legend-color addition"></div>
                <span>Additions</span>
              </div>
            </div>
            <button class="diff-close-btn" title="Close preview">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="diff-preview-body">
            <div class="diff-preview-document">
              <div id="previewTitle" style="font-size: 18px; font-weight: 600; margin-bottom: 20px;"></div>
              <div id="previewContent"></div>
            </div>
          </div>
          <div class="diff-preview-actions">
            <button class="diff-preview-btn cancel">Close</button>
            <button class="diff-preview-btn confirm">Apply Changes</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(overlay);
      
      // Populate preview with diff highlighting
      const previewTitle = overlay.querySelector('#previewTitle');
      const previewContent = overlay.querySelector('#previewContent');
      
      // Title diff highlighting
      if (changes.newTitle && changes.newTitle !== originalTitle) {
        const titleWords = originalTitle.split(' ');
        const newTitleWords = changes.newTitle.split(' ');
        
        let titleHtml = '';
        const maxLen = Math.max(titleWords.length, newTitleWords.length);
        for (let i = 0; i < maxLen; i++) {
          const oldWord = titleWords[i] || '';
          const newWord = newTitleWords[i] || '';
          
          if (oldWord && !newWord) {
            titleHtml += `<span class="diff-deletion">${escapeHtml(oldWord)}</span> `;
          } else if (!oldWord && newWord) {
            titleHtml += `<span class="diff-addition">${escapeHtml(newWord)}</span> `;
          } else if (oldWord !== newWord) {
            titleHtml += `<span class="diff-deletion">${escapeHtml(oldWord)}</span> <span class="diff-addition">${escapeHtml(newWord)}</span> `;
          } else {
            titleHtml += `${escapeHtml(oldWord)} `;
          }
        }
        previewTitle.innerHTML = titleHtml;
      } else {
        previewTitle.textContent = originalTitle;
      }
      
      // Content diff highlighting (simplified)
      const originalText = editorEl.textContent || '';
      const previewText = previewEditorEl.textContent || '';
      
      if (originalText !== previewText) {
        // For now, show the new content with addition highlighting
        // In a more sophisticated implementation, you'd do word-level diffing
        const contentElements = previewEditorEl.children;
        previewContent.innerHTML = '';
        
        for (const element of contentElements) {
          const clonedEl = element.cloneNode(true);
          // Mark new/changed content as additions
          if (!editorEl.contains(element) || element.innerHTML !== editorEl.querySelector(element.tagName.toLowerCase())?.innerHTML) {
            clonedEl.classList.add('diff-addition');
          }
          previewContent.appendChild(clonedEl);
        }
      } else {
        previewContent.innerHTML = previewEditorEl.innerHTML;
      }
      
      // Clean up temporary container
      document.body.removeChild(tempContainer);
      
      return overlay;
      
    } catch (error) {
      // Clean up on error
      if (tempContainer.parentNode) {
        document.body.removeChild(tempContainer);
      }
      console.error('Failed to create diff preview:', error);
      return null;
    }
  }

  function addEditProposal(explanation, changes, originalResponse) {
    const messageId = `msg-${Date.now()}-${Math.random()}`;
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = 'message assistant edit-proposal';

    const ops = Array.isArray(changes?.operations) ? changes.operations : [];
    const hasOps = ops.length > 0;
    
    // Capture current document state (plain text for comparison)
    const curTitle = document.getElementById('docTitle')?.textContent || '';
    const curContentText = document.getElementById('editor')?.textContent || '';
    const newTitle = changes.newTitle ?? curTitle;
    const newContentText = changes.newContent ? stripHtml(changes.newContent) : curContentText;

    const titleDiff = !hasOps ? diffWords(curTitle, newTitle) : { html: '', adds: 0, dels: 0 };
    const contentDiff = !hasOps ? diffWords(curContentText, newContentText) : { html: '', adds: 0, dels: 0 };
    
    const hasTitleChange = (newTitle !== curTitle);
    const hasContentChange = (newContentText !== curContentText);

    const opsHtml = hasOps ? `<div class="ops-list">${ops.map(op=>{
      const t = op.type;
      if (t==='append') return `<div class="op-item"><span class="op-badge">append</span> Add at end</div>`;
      if (t==='prepend') return `<div class="op-item"><span class="op-badge">prepend</span> Add at start</div>`;
      if (t==='insertAfter') return `<div class="op-item"><span class="op-badge">insertAfter</span> After "${escapeHtml(op.target||'')}"</div>`;
      if (t==='insertBefore') return `<div class="op-item"><span class="op-badge">insertBefore</span> Before "${escapeHtml(op.target||'')}"</div>`;
      if (t==='replace') return `<div class="op-item"><span class="op-badge">replace</span> Replace "${escapeHtml(op.target||'')}" with HTML</div>`;
      if (t==='wrap') return `<div class="op-item"><span class="op-badge">wrap</span> Wrap "${escapeHtml(op.target||'')}" in <code>${escapeHtml(op.tag||'')}</code></div>`;
      if (t==='formatBlock') return `<div class="op-item"><span class="op-badge">formatBlock</span> Change "${escapeHtml(op.target||'')}" to <code>${escapeHtml(op.tag||'')}</code></div>`;
      if (t==='insertList') return `<div class="op-item"><span class="op-badge">insertList</span> Make "${escapeHtml(op.target||'')}" into ${op.listType||'ul'} list</div>`;
      return `<div class="op-item"><span class="op-badge">${escapeHtml(t||'op')}</span></div>`;
    }).join('')}</div>` : '';

    messageEl.innerHTML = `
      <div class="message-avatar">
        <span class="material-symbols-outlined sparkle-icon">auto_awesome</span>
      </div>
      <div class="message-content">
        <div class="edit-explanation">${escapeHtml(explanation || 'Proposed changes')}</div>
        <div class="edit-preview">
          ${hasOps ? opsHtml : ''}
          ${!hasOps ? (hasTitleChange ? `<div class="diff-section"><strong>Title:</strong><div class="diff-container">${titleDiff.html}</div></div>` : '<div class="diff-section"><strong>Title:</strong> <em>No change</em></div>') : ''}
          ${!hasOps ? (hasContentChange ? `<details class="diff-section"><summary><strong>Content:</strong> ${contentDiff.adds} insertions, ${contentDiff.dels} deletions (click to expand)</summary><div class="diff-container">${contentDiff.html}</div></details>` : '<div class="diff-section"><strong>Content:</strong> <em>No change</em></div>') : ''}
        </div>
        <div class="edit-actions">
          <button class="edit-btn preview-btn">Preview</button>
          <button class="edit-btn accept-btn">Accept</button>
          <button class="edit-btn deny-btn">Deny</button>
        </div>
      </div>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Bind action buttons
    const previewBtn = messageEl.querySelector('.preview-btn');
    const acceptBtn = messageEl.querySelector('.accept-btn');
    const denyBtn = messageEl.querySelector('.deny-btn');
    // Attach the changes object safely (avoid JSON-in-attribute issues)
    acceptBtn._changes = changes;

    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        const overlay = createDiffPreview(changes);
        if (!overlay) return;
        const close = () => overlay.remove();
        overlay.querySelector('.diff-close-btn')?.addEventListener('click', close);
        overlay.querySelector('.diff-preview-btn.cancel')?.addEventListener('click', close);
        overlay.querySelector('.diff-preview-btn.confirm')?.addEventListener('click', () => {
          try {
            applyDocumentEdit(changes);
            close();
            messageEl.querySelector('.edit-actions').innerHTML = '<span class="edit-status accepted">✓ Changes applied</span>';
          } catch (err) {
            console.error('Failed to apply changes', err);
            messageEl.querySelector('.edit-actions').innerHTML = '<span class="edit-status error">✗ Failed to apply changes</span>';
          }
        });
      });
    }

    acceptBtn.addEventListener('click', () => {
      const changes = acceptBtn._changes;
      if (applyDocumentEdit(changes)) {
        messageEl.querySelector('.edit-actions').innerHTML = '<span class="edit-status accepted">✓ Changes applied</span>';
      } else {
        messageEl.querySelector('.edit-actions').innerHTML = '<span class="edit-status error">✗ Failed to apply changes</span>';
      }
    });

    denyBtn.addEventListener('click', () => {
      messageEl.querySelector('.edit-actions').innerHTML = '<span class="edit-status denied">✗ Changes denied</span>';
      document.querySelector('.document-diff-overlay')?.remove();
    });

    return messageId;
  }
  
  async function sendMessage() {
    const message = input.value.trim();
    if (!message) return;
    
    const mode = modeSelect.value;
    
    // Add user message
    addMessage('user', message);
    input.value = '';
    input.disabled = true;
    
    let thinkingId;
    try {
      // Add thinking message
      thinkingId = addMessage('assistant', 'Thinking...');
      
      // Get AI response
      const response = await sendChatMessage(message, mode);
      
      // Remove thinking message
      const thinkingEl = document.getElementById(thinkingId);
      if (thinkingEl) {
        thinkingEl.remove();
      }
      
      // Handle edit proposals
      if (response && typeof response === 'object' && response.isEdit) {
        addEditProposal(response.explanation, response.changes, response.originalResponse);
      } else {
        // Regular message
        addMessage('assistant', response || 'No response');
      }
      
    } catch (error) {
      // Replace thinking message with error
      const thinkingEl = thinkingId ? document.getElementById(thinkingId) : null;
      if (thinkingEl) {
        thinkingEl.querySelector('.message-content').textContent = `Error: ${error.message}`;
        thinkingEl.classList.add('error');
      } else {
        addMessage('assistant', `Error: ${error.message}`, true);
      }
    } finally {
      input.disabled = false;
      input.focus();
    }
  }
  
  // Submit on Enter (without Shift) while focused in the input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// Global functions for UI interaction
window.hideChatbot = function() {
  const chatbot = document.getElementById('aiChatbot');
  if (chatbot) {
    chatbot.remove();
  }
  const wrap = document.querySelector('.editor-wrap');
  if (wrap){ wrap.classList.remove('with-ai'); }
};

window.showChatbot = function() {
  // Remove existing chatbot if any
  const existing = document.getElementById('aiChatbot');
  if (existing) {
    existing.remove();
  }
  
  createChatbotUI();
  const wrap = document.querySelector('.editor-wrap');
  if (wrap){ wrap.classList.add('with-ai'); }
};