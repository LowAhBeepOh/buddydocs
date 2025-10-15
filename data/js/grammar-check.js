// Intelligent Review System for Buddy Docs
// Provides context-aware writing suggestions with actionable improvements

// Extract plain text from HTML
function extractText(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

// Sentence tokenizer
function getSentences(text) {
  // Split on sentence boundaries while preserving the text
  const sentences = [];
  const regex = /[^.!?]+[.!?]+/g;
  let match;
  let lastIndex = 0;
  
  while ((match = regex.exec(text)) !== null) {
    sentences.push({
      text: match[0].trim(),
      start: match.index,
      end: regex.lastIndex
    });
    lastIndex = regex.lastIndex;
  }
  
  // Catch any remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      sentences.push({
        text: remaining,
        start: lastIndex,
        end: text.length
      });
    }
  }
  
  return sentences;
}

// Word tokenizer
function getWords(text) {
  return text.match(/\b[a-z]+\b/gi) || [];
}

// Intelligent analysis rules
const analysisRules = [
  // Critical spelling errors only (very common typos)
  {
    pattern: /\b(teh)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Typo detected',
    suggestion: 'the',
    explanation: 'Common keyboard slip'
  },
  {
    pattern: /\b(recieve)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Incorrect spelling',
    suggestion: 'receive',
    explanation: '"I before E except after C"'
  },
  {
    pattern: /\b(occured)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Missing double consonant',
    suggestion: 'occurred',
    explanation: 'Double the R before adding -ed'
  },
  {
    pattern: /\b(seperate)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Incorrect spelling',
    suggestion: 'separate',
    explanation: 'Remember: there\'s "a rat" in separate'
  },
  {
    pattern: /\b(definately)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Incorrect spelling',
    suggestion: 'definitely',
    explanation: 'Ends with -itely, not -ately'
  },
  // Repeated words (actual duplicates)
  {
    pattern: /\b(\w+)\s+\1\b/gi,
    type: 'error',
    category: 'Clarity',
    message: 'Duplicate word',
    fix: (match, word) => word,
    explanation: 'Remove the repeated word'
  },
  // Could of/should of/would of (common error)
  {
    pattern: /\b(could|should|would)\s+of\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Incorrect verb form',
    fix: (match, modal) => `${modal} have`,
    explanation: 'Use "have" not "of" after modal verbs'
  },
  // Then vs Than in comparisons
  {
    pattern: /\b(better|worse|more|less|greater|smaller)\s+then\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Wrong comparison word',
    fix: (match, adj) => `${adj} than`,
    explanation: 'Use "than" for comparisons, "then" for time'
  },
  // Subject-verb agreement
  {
    pattern: /\b(he|she|it)\s+(are|were)\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Subject-verb disagreement',
    fix: (match, subject, verb) => `${subject} ${verb === 'are' ? 'is' : 'was'}`,
    explanation: 'Singular subjects need singular verbs'
  },
  // Wordy phrases with clear alternatives
  {
    pattern: /\bin\s+order\s+to\b/gi,
    type: 'clarity',
    category: 'Clarity',
    message: 'Wordy phrase',
    suggestion: 'to',
    explanation: 'Simplify: just use "to"'
  },
  {
    pattern: /\bdue\s+to\s+the\s+fact\s+that\b/gi,
    type: 'clarity',
    category: 'Clarity',
    message: 'Wordy phrase',
    suggestion: 'because',
    explanation: 'Simplify: use "because" instead'
  },
  {
    pattern: /\bat\s+this\s+point\s+in\s+time\b/gi,
    type: 'clarity',
    category: 'Clarity',
    message: 'Wordy phrase',
    suggestion: 'now',
    explanation: 'Simplify: just say "now"'
  }
];

// Advanced readability analysis
function analyzeReadability(text) {
  const sentences = getSentences(text);
  const words = getWords(text);
  const issues = [];
  
  if (sentences.length === 0 || words.length === 0) return issues;
  
  // Check for overly long sentences
  sentences.forEach(sentence => {
    const sentenceWords = getWords(sentence.text);
    if (sentenceWords.length > 35) {
      issues.push({
        type: 'readability',
        category: 'Readability',
        message: 'Long sentence detected',
        original: sentence.text.slice(0, 50) + '...',
        suggestion: null,
        explanation: `This sentence has ${sentenceWords.length} words. Consider breaking it into 2-3 shorter sentences for better clarity.`,
        position: sentence.start,
        length: sentence.text.length
      });
    }
  });
  
  // Check for very short sentences in a row (choppy writing)
  for (let i = 0; i < sentences.length - 2; i++) {
    const s1 = getWords(sentences[i].text);
    const s2 = getWords(sentences[i + 1].text);
    const s3 = getWords(sentences[i + 2].text);
    
    if (s1.length <= 5 && s2.length <= 5 && s3.length <= 5) {
      issues.push({
        type: 'readability',
        category: 'Readability',
        message: 'Choppy writing detected',
        original: sentences[i].text + ' ' + sentences[i + 1].text,
        suggestion: null,
        explanation: 'Three very short sentences in a row. Consider combining some for better flow.',
        position: sentences[i].start,
        length: sentences[i + 2].end - sentences[i].start
      });
      i += 2; // Skip ahead to avoid duplicate warnings
    }
  }
  
  return issues;
}

// Check for weak words and suggest stronger alternatives
function analyzeWordChoice(text) {
  const issues = [];
  const weakWords = [
    { word: /\bvery\s+(\w+)/gi, message: 'Weak intensifier', explanation: 'Instead of "very [word]", use a stronger single word. Example: "very big" → "huge", "very small" → "tiny"' },
    { word: /\breally\s+(\w+)/gi, message: 'Weak intensifier', explanation: 'Instead of "really [word]", use a stronger single word or remove "really" entirely.' },
    { word: /\bthing(s)?\b/gi, message: 'Vague noun', explanation: 'Replace "thing" with a specific noun. What exactly are you referring to?' },
    { word: /\bstuff\b/gi, message: 'Vague noun', explanation: 'Replace "stuff" with specific nouns. What exactly are you referring to?' },
    { word: /\ba\s+lot\s+of\b/gi, message: 'Informal phrase', explanation: 'In formal writing, use "many" (countable) or "much" (uncountable) instead of "a lot of".' },
    { word: /\bgot\b/gi, message: 'Weak verb', explanation: 'Replace "got" with a more specific verb: "obtained", "received", "became", etc.' },
    { word: /\bwent\b/gi, message: 'Weak verb', explanation: 'Replace "went" with a more specific verb: "traveled", "walked", "drove", "moved", etc.' }
  ];
  
  weakWords.forEach(({ word, message, explanation }) => {
    const regex = new RegExp(word.source, word.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        type: 'enhancement',
        category: 'Word Choice',
        message,
        original: match[0],
        suggestion: null,
        explanation,
        position: match.index,
        length: match[0].length
      });
    }
  });
  
  return issues;
}

// Main grammar check function
export function checkGrammar(content) {
  const text = extractText(content);
  const issues = [];

  // Run pattern-based rules
  analysisRules.forEach(rule => {
    let match;
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        type: rule.type,
        category: rule.category,
        message: rule.message,
        original: match[0],
        suggestion: rule.suggestion || (rule.fix ? rule.fix(...match) : null),
        explanation: rule.explanation || '',
        position: match.index,
        length: match[0].length
      });
    }
  });
  
  // Run advanced analysis
  const readabilityIssues = analyzeReadability(text);
  const wordChoiceIssues = analyzeWordChoice(text);
  
  issues.push(...readabilityIssues, ...wordChoiceIssues);

  // Sort by position
  issues.sort((a, b) => a.position - b.position);

  return issues;
}

// Auto-correct is intentionally conservative; return issues instead of mutating DOM
export function autoCorrect(content) {
  return checkGrammar(content).filter(i => i.type === 'error');
}

// Apply a specific fix to the editor while preserving formatting by mapping
// from plain-text index to DOM text nodes.
export function applyFix(editor, issue) {
  if (!issue || !issue.suggestion) return;
  const targetStart = issue.position;
  const targetEnd = issue.position + issue.length;

  let cursor = 0;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.nodeValue?.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });

  const toEdit = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeStart = cursor;
    const nodeEnd = cursor + node.nodeValue.length;

    // overlap with [targetStart, targetEnd)
    if (nodeEnd > targetStart && nodeStart < targetEnd) {
      const startInNode = Math.max(0, targetStart - nodeStart);
      const endInNode = Math.min(node.nodeValue.length, targetEnd - nodeStart);
      toEdit.push({ node, startInNode, endInNode });
    }
    cursor = nodeEnd;
    if (cursor >= targetEnd) break;
  }

  if (!toEdit.length) return;

  // If single-node match, simple replacement
  if (toEdit.length === 1) {
    const { node, startInNode, endInNode } = toEdit[0];
    node.nodeValue = node.nodeValue.slice(0, startInNode) + issue.suggestion + node.nodeValue.slice(endInNode);
    return;
  }

  // Multi-node span: replace first segment, remove middle nodes, and tail in last node
  const first = toEdit[0];
  const last = toEdit[toEdit.length - 1];
  first.node.nodeValue = first.node.nodeValue.slice(0, first.startInNode) + issue.suggestion;
  for (let i = 1; i < toEdit.length - 1; i++) {
    const mid = toEdit[i].node;
    if (mid.parentNode) mid.parentNode.removeChild(mid);
  }
  last.node.nodeValue = last.node.nodeValue.slice(last.endInNode);
}

// Render Review side panel (right sidebar)
export function renderReviewPanel(editor) {
  const panel = document.getElementById('reviewSidebar');
  if (!panel) return;

  const content = editor.innerHTML;
  const issues = checkGrammar(content);

  // Categorize issues by type
  const errors = issues.filter(i => i.type === 'error').length;
  const clarity = issues.filter(i => i.type === 'clarity').length;
  const readability = issues.filter(i => i.type === 'readability').length;
  const enhancement = issues.filter(i => i.type === 'enhancement').length;

  const list = panel.querySelector('#reviewList');
  const stats = panel.querySelector('#reviewStats');
  if (stats) {
    stats.innerHTML = `
      <div class="grammar-stats">
        <div class="grammar-stat"><div class="grammar-stat-value">${issues.length}</div><div class="grammar-stat-label">Issues</div></div>
        <div class="grammar-stat"><div class="grammar-stat-value">${errors}</div><div class="grammar-stat-label">Errors</div></div>
        <div class="grammar-stat"><div class="grammar-stat-value">${clarity}</div><div class="grammar-stat-label">Clarity</div></div>
        <div class="grammar-stat"><div class="grammar-stat-value">${enhancement}</div><div class="grammar-stat-label">Style</div></div>
      </div>`;
  }

  if (!list) return;
  list.innerHTML = '';

  if (issues.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'grammar-no-issues';
    empty.innerHTML = `<span class="material-symbols-outlined">check_circle</span><div style="font-weight:600;margin-bottom:4px;">Excellent!</div><div>Your writing is clear and error-free.</div>`;
    list.appendChild(empty);
    return;
  }

  issues.forEach((issue, index) => {
    const item = document.createElement('div');
    item.className = `grammar-issue ${issue.type}`;
    
    // Build the issue card with explanation
    let html = `
      <div class="grammar-issue-header">
        <span class="grammar-issue-type">${issue.category}</span>
      </div>
      <div class="grammar-issue-text">${issue.message}</div>
    `;
    
    // Show original text
    if (issue.original) {
      html += `<div style="margin:8px 0;">
        <span class="grammar-issue-original">${escapeHtml(issue.original)}</span>`;
      
      // Show suggestion if available
      if (issue.suggestion) {
        html += `<span style="margin:0 8px;">→</span><span class="grammar-issue-suggestion">${escapeHtml(issue.suggestion)}</span>`;
      }
      html += `</div>`;
    }
    
    // Show explanation
    if (issue.explanation) {
      html += `<div class="grammar-issue-explanation">${issue.explanation}</div>`;
    }
    
    // Show action buttons
    if (issue.suggestion) {
      html += `<div class="grammar-issue-actions">
        <button class="grammar-issue-btn primary apply-fix" data-index="${index}">Apply Fix</button>
        <button class="grammar-issue-btn ignore-issue">Dismiss</button>
      </div>`;
    } else {
      html += `<div class="grammar-issue-actions">
        <button class="grammar-issue-btn ignore-issue">Dismiss</button>
      </div>`;
    }
    
    item.innerHTML = html;

    const applyBtn = item.querySelector('.apply-fix');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        applyFix(editor, issue);
        renderReviewPanel(editor);
        showToast('✓ Applied');
      });
    }
    const ignoreBtn = item.querySelector('.ignore-issue');
    if (ignoreBtn) {
      ignoreBtn.addEventListener('click', () => {
        item.style.opacity = '0.5';
        item.style.pointerEvents = 'none';
        setTimeout(() => item.remove(), 300);
      });
    }
    list.appendChild(item);
  });
}

// Helper to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Simple toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--primary);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 3000;
    animation: slideUp 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideDown 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Enable autocorrect on editor
export function enableAutoCorrect(editor) {
  let timeout;
  
  editor.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const content = editor.innerHTML;
      const issues = checkGrammar(content);
      
      // Auto-fix only errors (not warnings or suggestions)
      issues.filter(i => i.type === 'error' && i.suggestion).forEach(issue => {
        // Apply fix silently
        applyFix(editor, issue);
      });
    }, 1000); // Wait 1 second after typing stops
  });
}
