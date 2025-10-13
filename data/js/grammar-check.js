// Grammar Check Tool for Buddy Docs

// Extract plain text from HTML
function extractText(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

// Advanced grammar rules and patterns
const grammarRules = [
  // Capitalization
  {
    pattern: /(?:^|\.\s+|\!\s+|\?\s+)([a-z])/g,
    type: 'error',
    category: 'Capitalization',
    message: 'Sentence should start with a capital letter',
    fix: (match) => match.toUpperCase()
  },
  // Double spaces
  {
    pattern: /\s{2,}/g,
    type: 'warning',
    category: 'Spacing',
    message: 'Multiple spaces detected',
    fix: () => ' '
  },
  // Missing space after punctuation
  {
    pattern: /([.!?,;:])([A-Za-z])/g,
    type: 'warning',
    category: 'Spacing',
    message: 'Missing space after punctuation',
    fix: (match, p1, p2) => `${p1} ${p2}`
  },
  // Space before punctuation
  {
    pattern: /\s+([.!?,;:])/g,
    type: 'warning',
    category: 'Spacing',
    message: 'Unnecessary space before punctuation',
    fix: (match, p1) => p1
  },
  // Common misspellings (expanded list)
  {
    pattern: /\b(teh)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'the'
  },
  {
    pattern: /\b(recieve)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'receive'
  },
  {
    pattern: /\b(occured)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'occurred'
  },
  {
    pattern: /\b(seperate)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'separate'
  },
  {
    pattern: /\b(definately)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'definitely'
  },
  {
    pattern: /\b(wierd)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'weird'
  },
  {
    pattern: /\b(untill)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'until'
  },
  {
    pattern: /\b(alot)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'a lot'
  },
  {
    pattern: /\b(accomodate)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'accommodate'
  },
  {
    pattern: /\b(occassion)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'occasion'
  },
  {
    pattern: /\b(embarass)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'embarrass'
  },
  {
    pattern: /\b(goverment)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'government'
  },
  {
    pattern: /\b(enviroment)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'environment'
  },
  {
    pattern: /\b(begining)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'beginning'
  },
  {
    pattern: /\b(arguement)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'argument'
  },
  {
    pattern: /\b(noticable)\b/gi,
    type: 'error',
    category: 'Spelling',
    message: 'Common misspelling',
    suggestion: 'noticeable'
  },
  // Repeated words
  {
    pattern: /\b(\w+)\s+\1\b/gi,
    type: 'warning',
    category: 'Repetition',
    message: 'Repeated word detected',
    fix: (match, word) => word
  },
  // Its vs It's
  {
    pattern: /\bits\s+(?:is|has|been|was|will|would|should|could)\b/gi,
    type: 'suggestion',
    category: 'Grammar',
    message: 'Consider using "it\'s" (it is/it has)',
    suggestion: 'it\'s'
  },
  // Your vs You're
  {
    pattern: /\byour\s+(?:is|are|were|was|going|being|will|would|should|could)\b/gi,
    type: 'suggestion',
    category: 'Grammar',
    message: 'Consider using "you\'re" (you are)',
    suggestion: 'you\'re'
  },
  // Their vs They're vs There
  {
    pattern: /\btheir\s+(?:is|are|were|was|going|being|will|would)\b/gi,
    type: 'suggestion',
    category: 'Grammar',
    message: 'Consider using "they\'re" (they are) or "there"',
    suggestion: 'they\'re'
  },
  {
    pattern: /\bthey\'re\s+(?:house|car|dog|cat|book|idea|opinion|way|time|place)\b/gi,
    type: 'suggestion',
    category: 'Grammar',
    message: 'Consider using "their" (possessive)',
    suggestion: 'their'
  },
  // Then vs Than
  {
    pattern: /\bbetter\s+then\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Use "than" for comparisons',
    suggestion: 'better than'
  },
  {
    pattern: /\bmore\s+then\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Use "than" for comparisons',
    suggestion: 'more than'
  },
  {
    pattern: /\bless\s+then\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Use "than" for comparisons',
    suggestion: 'less than'
  },
  // Affect vs Effect
  {
    pattern: /\bwill\s+affect\s+(?:the|a|an)\s+\w+\s+(?:on|in)\b/gi,
    type: 'suggestion',
    category: 'Grammar',
    message: 'Consider using "effect" (noun) instead of "affect" (verb)',
    suggestion: 'effect'
  },
  // Could of, should of, would of
  {
    pattern: /\b(could|should|would)\s+of\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Use "have" instead of "of"',
    fix: (match, modal) => `${modal} have`
  },
  // A vs An
  {
    pattern: /\ba\s+([aeiou])/gi,
    type: 'warning',
    category: 'Grammar',
    message: 'Use "an" before vowel sounds',
    fix: (match, vowel) => `an ${vowel}`
  },
  {
    pattern: /\ban\s+([^aeiou])/gi,
    type: 'warning',
    category: 'Grammar',
    message: 'Use "a" before consonant sounds',
    fix: (match, consonant) => `a ${consonant}`
  },
  // Subject-verb agreement
  {
    pattern: /\b(he|she|it)\s+(are|were)\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Subject-verb agreement error',
    fix: (match, subject, verb) => `${subject} ${verb === 'are' ? 'is' : 'was'}`
  },
  {
    pattern: /\b(they|we|you)\s+(is|was)\b/gi,
    type: 'error',
    category: 'Grammar',
    message: 'Subject-verb agreement error',
    fix: (match, subject, verb) => `${subject} ${verb === 'is' ? 'are' : 'were'}`
  },
  // Passive voice detection (enhanced)
  {
    pattern: /\b(?:was|were|been|being)\s+\w+ed\b/gi,
    type: 'suggestion',
    category: 'Style',
    message: 'Passive voice detected - consider active voice for clarity',
    suggestion: null
  },
  // Redundant phrases
  {
    pattern: /\b(very|really|quite|rather|somewhat)\s+(very|really|quite|rather|somewhat)\b/gi,
    type: 'warning',
    category: 'Style',
    message: 'Redundant intensifiers',
    fix: (match, word1) => word1
  },
  {
    pattern: /\bfree\s+gift\b/gi,
    type: 'warning',
    category: 'Style',
    message: 'Redundant phrase (gifts are free by definition)',
    suggestion: 'gift'
  },
  {
    pattern: /\bpast\s+history\b/gi,
    type: 'warning',
    category: 'Style',
    message: 'Redundant phrase (history is always past)',
    suggestion: 'history'
  },
  {
    pattern: /\badvance\s+warning\b/gi,
    type: 'warning',
    category: 'Style',
    message: 'Redundant phrase (warnings are always in advance)',
    suggestion: 'warning'
  },
  // Clichés
  {
    pattern: /\bat\s+the\s+end\s+of\s+the\s+day\b/gi,
    type: 'suggestion',
    category: 'Style',
    message: 'Cliché phrase - consider more specific language',
    suggestion: null
  },
  {
    pattern: /\bthink\s+outside\s+the\s+box\b/gi,
    type: 'suggestion',
    category: 'Style',
    message: 'Cliché phrase - consider more specific language',
    suggestion: null
  },
  // Sentence fragments (basic detection)
  {
    pattern: /(?:^|\.\s+)(?:Because|Although|Since|While|If|Unless|When|Where)\s+[^.!?]+\./gi,
    type: 'warning',
    category: 'Structure',
    message: 'Possible sentence fragment - subordinate clause without main clause',
    suggestion: null
  },
  // Run-on sentences (basic detection)
  {
    pattern: /\b(and|but|or|so)\s+[^.!?]{100,}\b/gi,
    type: 'suggestion',
    category: 'Structure',
    message: 'Possible run-on sentence - consider breaking into shorter sentences',
    suggestion: null
  },
  // Wordiness
  {
    pattern: /\bin\s+order\s+to\b/gi,
    type: 'suggestion',
    category: 'Style',
    message: 'Wordy phrase - consider using "to"',
    suggestion: 'to'
  },
  {
    pattern: /\bdue\s+to\s+the\s+fact\s+that\b/gi,
    type: 'suggestion',
    category: 'Style',
    message: 'Wordy phrase - consider using "because"',
    suggestion: 'because'
  },
  {
    pattern: /\bin\s+spite\s+of\s+the\s+fact\s+that\b/gi,
    type: 'suggestion',
    category: 'Style',
    message: 'Wordy phrase - consider using "although"',
    suggestion: 'although'
  },
  {
    pattern: /\bat\s+this\s+point\s+in\s+time\b/gi,
    type: 'suggestion',
    category: 'Style',
    message: 'Wordy phrase - consider using "now"',
    suggestion: 'now'
  }
];

// Check grammar and return issues
export function checkGrammar(content) {
  const text = extractText(content);
  const issues = [];

  grammarRules.forEach(rule => {
    let match;
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        type: rule.type,
        category: rule.category,
        message: rule.message,
        original: match[0],
        suggestion: rule.suggestion || (rule.fix ? rule.fix(...match) : null),
        position: match.index,
        length: match[0].length
      });
    }
  });

  return issues;
}

// Auto-correct common issues
export function autoCorrect(content) {
  let text = extractText(content);
  
  grammarRules.forEach(rule => {
    if (rule.fix) {
      text = text.replace(rule.pattern, rule.fix);
    } else if (rule.suggestion) {
      text = text.replace(rule.pattern, rule.suggestion);
    }
  });

  return text;
}

// Apply a specific fix to the editor
export function applyFix(editor, issue) {
  const content = editor.innerHTML;
  const text = extractText(content);
  
  // Find the issue in the text
  const before = text.substring(0, issue.position);
  const after = text.substring(issue.position + issue.length);
  
  // Replace with suggestion
  const newText = before + (issue.suggestion || '') + after;
  
  // Update editor (simplified - in production would need to preserve HTML structure)
  const temp = document.createElement('div');
  temp.textContent = newText;
  editor.innerHTML = temp.innerHTML;
}

// Show grammar check modal
export function showGrammarCheckModal(content, editor) {
  const issues = checkGrammar(content);
  
  const modal = document.createElement('div');
  modal.className = 'grammar-modal';
  modal.innerHTML = `
    <div class="grammar-card">
      <div class="grammar-header">
        <h3>
          <span class="material-symbols-outlined">spellcheck</span>
          Grammar & Spelling Check
        </h3>
        <button class="icon-btn close-grammar">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="grammar-body">
        <div class="grammar-stats">
          <div class="grammar-stat">
            <div class="grammar-stat-value">${issues.length}</div>
            <div class="grammar-stat-label">Total Issues</div>
          </div>
          <div class="grammar-stat">
            <div class="grammar-stat-value">${issues.filter(i => i.type === 'error').length}</div>
            <div class="grammar-stat-label">Errors</div>
          </div>
          <div class="grammar-stat">
            <div class="grammar-stat-value">${issues.filter(i => i.type === 'warning').length}</div>
            <div class="grammar-stat-label">Warnings</div>
          </div>
          <div class="grammar-stat">
            <div class="grammar-stat-value">${issues.filter(i => i.type === 'suggestion').length}</div>
            <div class="grammar-stat-label">Suggestions</div>
          </div>
        </div>
        <div class="grammar-issues" id="grammarIssues"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close button
  modal.querySelector('.close-grammar').addEventListener('click', () => {
    modal.remove();
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Display issues
  const issuesContainer = modal.querySelector('#grammarIssues');
  
  if (issues.length === 0) {
    issuesContainer.innerHTML = `
      <div class="grammar-no-issues">
        <span class="material-symbols-outlined">check_circle</span>
        <div style="font-weight: 600; margin-bottom: 4px;">No issues found!</div>
        <div>Your document looks great.</div>
      </div>
    `;
  } else {
    issues.forEach((issue, index) => {
      const issueEl = document.createElement('div');
      issueEl.className = `grammar-issue ${issue.type}`;
      issueEl.innerHTML = `
        <div class="grammar-issue-header">
          <span class="grammar-issue-type">${issue.category}</span>
        </div>
        <div class="grammar-issue-text">
          ${issue.message}
        </div>
        <div style="margin: 8px 0;">
          <span class="grammar-issue-original">${issue.original}</span>
          ${issue.suggestion ? `<span style="margin: 0 8px;">→</span><span class="grammar-issue-suggestion">${issue.suggestion}</span>` : ''}
        </div>
        ${issue.suggestion ? `
          <div class="grammar-issue-actions">
            <button class="grammar-issue-btn primary apply-fix" data-index="${index}">Apply Fix</button>
            <button class="grammar-issue-btn ignore-issue" data-index="${index}">Ignore</button>
          </div>
        ` : ''}
      `;

      // Apply fix button
      const applyBtn = issueEl.querySelector('.apply-fix');
      if (applyBtn) {
        applyBtn.addEventListener('click', () => {
          if (editor) {
            applyFix(editor, issue);
            modal.remove();
            // Show success message
            showToast('Fix applied successfully!');
          }
        });
      }

      // Ignore button
      const ignoreBtn = issueEl.querySelector('.ignore-issue');
      if (ignoreBtn) {
        ignoreBtn.addEventListener('click', () => {
          issueEl.style.opacity = '0.5';
          issueEl.style.pointerEvents = 'none';
        });
      }

      issuesContainer.appendChild(issueEl);
    });
  }
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
