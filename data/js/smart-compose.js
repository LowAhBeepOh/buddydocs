import { getSetting, setSetting } from './idb.js';
import { SMART_COMPOSE_PHRASES } from './smart-compose-phrases.js';

class SmartCompose {
  constructor(editor) {
    this.editor = editor;
    this.phrases = {};
    this.userFrequencies = {};
    this.ngramModel = {};
    this.currentSuggestion = null;
    this.currentSuggestions = [];
    this.currentSuggestionIndex = 0;
    this.ghostElement = null;
    this.isEnabled = true;
    this.minTriggerLength = 2;
    this.maxSuggestions = 5;
    // Anti-repetition state
    this.recentCompletions = [];
    this.recentWords = [];
    this.recentLimit = 20;
    this.lastAcceptedPhrase = null;
    this.lastAcceptedCompletion = null;
    // POS data (from training/word_relations.json)
    this.posLexicon = {};
    this.posTransitions = {};
    // Cache last context text for POS-aware ranking
    this._lastContextText = '';
    
    this.init();
  }

  // Load optional training assets (corpus n-grams + POS relations)
  async loadTrainingAssets() {
    // Resolve relative to site root/pages: data/js/training/
    const basePath = './data/js/training';
    // Load corpus.txt and merge n-grams
    try {
      const res = await fetch(`${basePath}/corpus.txt`);
      if (res.ok) {
        const corpus = await res.text();
        this.buildNgramsFromCorpus(corpus);
      }
    } catch (_) { /* offline or file URL: ignore */ }

    // Load word_relations.json (POS lexicon and transitions)
    try {
      const res = await fetch(`${basePath}/word_relations.json`);
      if (res.ok) {
        const data = await res.json();
        this.posLexicon = data.pos_lexicon || {};
        this.posTransitions = data.pos_transitions || {};
      }
    } catch (_) { /* ignore */ }
  }

  buildNgramsFromCorpus(text) {
    // Tokenize into words using normalizeText; build 2- and 3-grams
    const tokens = this.normalizeText(text).split(' ').filter(Boolean);
    if (tokens.length < 2) return;
    const boost = 1; // small boost to prime the model
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const context = tokens.slice(i, i + n - 1).join(' ');
        const nextWord = tokens[i + n - 1];
        if (!this.ngramModel[context]) this.ngramModel[context] = {};
        this.ngramModel[context][nextWord] = (this.ngramModel[context][nextWord] || 0) + boost;
      }
    }
    this.pruneNgramModel();
  }

  getPOS(word) {
    if (!word) return '';
    const w = word.toLowerCase();
    return this.posLexicon[w] || '';
  }

  async init() {
    await this.loadPhrases();
    await this.loadUserData();
    await this.loadTrainingAssets();
    this.setupEventListeners();
    this.createGhostElement();
  }

  async loadPhrases() {
    try {
      const data = SMART_COMPOSE_PHRASES;
      // Flatten the structured phrases into a single lookup object
      this.phrases = {};
      for (const category in data) {
        for (const phrase in data[category]) {
          const completions = data[category][phrase];
          if (Array.isArray(completions)) {
            this.phrases[phrase.toLowerCase()] = completions;
          } else {
            this.phrases[phrase.toLowerCase()] = [completions];
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load Smart Compose phrases:', error);
      this.phrases = {};
    }
  }

  async loadUserData() {
    try {
      this.userFrequencies = await getSetting('smartComposeFrequencies', {});
      this.ngramModel = await getSetting('smartComposeNgrams', {});
    } catch (error) {
      console.warn('Failed to load user Smart Compose data:', error);
      this.userFrequencies = {};
      this.ngramModel = {};
    }
  }

  async saveUserData() {
    try {
      await setSetting('smartComposeFrequencies', this.userFrequencies);
      await setSetting('smartComposeNgrams', this.ngramModel);
    } catch (error) {
      console.warn('Failed to save user Smart Compose data:', error);
    }
  }

  setupEventListeners() {
    this.editor.addEventListener('input', this.handleInput.bind(this));
    this.editor.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.editor.addEventListener('click', this.hideSuggestion.bind(this));
    this.editor.addEventListener('blur', this.hideSuggestion.bind(this));
    
    // Listen for selection changes to hide suggestions when cursor moves
    document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
  }

  createGhostElement() {
    this.ghostElement = document.createElement('span');
    this.ghostElement.className = 'smart-compose-ghost';
    this.ghostElement.style.cssText = `
      color: #999;
      pointer-events: none;
      user-select: none;
      position: absolute;
      z-index: 1000;
      white-space: pre;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      opacity: 0.6;
      display: none;
    `;
  }

  normalizeText(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getLastWords(text, count = 5) {
    const normalized = this.normalizeText(text);
    const words = normalized.split(' ').filter(Boolean);
    return words.slice(-count).join(' ');
  }

  getCurrentContext() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return { text: '', range: null };

    let range = selection.getRangeAt(0);
    let container = range.startContainer;

    // If the caret is in an element node (e.g., just after a <br> or inside <strong>),
    // coerce to a text node by inserting an empty text node if needed.
    if (container.nodeType !== Node.TEXT_NODE) {
      // Try to use a text node child near the offset
      if (container.childNodes && container.childNodes.length) {
        const idx = Math.min(range.startOffset, container.childNodes.length - 1);
        let candidate = container.childNodes[idx] || container.childNodes[container.childNodes.length - 1];
        if (candidate && candidate.nodeType === Node.TEXT_NODE) {
          container = candidate;
          // Reset range relative to this text node
          range = document.createRange();
          range.setStart(container, container.textContent.length);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // Insert a zero-width text node at caret position
          const textNode = document.createTextNode('');
          const caretRange = selection.getRangeAt(0).cloneRange();
          caretRange.insertNode(textNode);
          // Move caret after inserted text node
          range = document.createRange();
          range.setStart(textNode, 0);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          container = textNode;
        }
      } else {
        // Insert inside empty element
        const textNode = document.createTextNode('');
        container.appendChild(textNode);
        range = document.createRange();
        range.setStart(textNode, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        container = textNode;
      }
    }

    const fullText = container.textContent;
    const cursorPos = range.startOffset;
    const textBeforeCursor = fullText.substring(0, cursorPos);

    return {
      text: textBeforeCursor,
      range: range,
      textNode: container,
      cursorPos: cursorPos
    };
  }

  findPhraseMatches(text) {
    const matches = [];
    const lastWords = this.getLastWords(text);
    
    // Try different phrase lengths (2-5 words)
    for (let wordCount = 2; wordCount <= 5; wordCount++) {
      const words = lastWords.split(' ');
      if (words.length >= wordCount) {
        const phrase = words.slice(-wordCount).join(' ');
        if (this.phrases[phrase]) {
          matches.push({
            phrase: phrase,
            completions: this.phrases[phrase],
            score: wordCount * 10 // Longer phrases get higher scores
          });
        }
      }
    }

    return matches;
  }

  generateNgramSuggestions(text) {
    const suggestions = [];
    const words = this.normalizeText(text).split(' ').filter(Boolean);
    
    if (words.length < 2) return suggestions;

    // Try 2-gram and 3-gram predictions
    for (let n = 2; n <= 3; n++) {
      if (words.length >= n - 1) {
        const context = words.slice(-(n - 1)).join(' ');
        if (this.ngramModel[context]) {
          const lastWord = words[words.length - 1];
          const recentSet = new Set(this.recentWords.slice(-5));
          const predictions = Object.entries(this.ngramModel[context])
            // Filter out obvious loops (predicting the same last word or very recent words)
            .filter(([word]) => word !== lastWord && !recentSet.has(word))
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([word, count]) => ({
              phrase: context,
              completions: [' ' + word],
              score: count
            }));
          suggestions.push(...predictions);
        }
      }
    }

    return suggestions;
  }

  rankSuggestions(suggestions) {
    // Combine and rank suggestions by score and user frequency
    const repetitionRegex = /(\b\w+\b)(?:\s+\1){1,}/i; // single-word loops
    const multiRepeatRegex = /(\b\w+(?:\s+\w+){2,}\b)\s+\1/i; // repeated 3+ word chunk
    const recentCompletionSet = new Set(this.recentCompletions.slice(-5));
    const recentWordSet = new Set(this.recentWords.slice(-8));

    const scored = suggestions.map(suggestion => {
      const frequency = this.userFrequencies[suggestion.phrase] || 0;
      const completion = Array.isArray(suggestion.completions) ? suggestion.completions[0] : String(suggestion.completions);
      const normalizedFirstWord = this.normalizeText(completion).split(' ').filter(Boolean)[0] || '';
      const contextPhrase = (suggestion.phrase || '').toLowerCase();
      const preview = `${contextPhrase} ${this.normalizeText(completion)}`.trim();

      let penalty = 0;
      if (recentCompletionSet.has(completion)) penalty += 15;
      if (normalizedFirstWord && recentWordSet.has(normalizedFirstWord)) penalty += 5;
      if (repetitionRegex.test(completion)) penalty += 10;
      if (this.lastAcceptedPhrase && suggestion.phrase === this.lastAcceptedPhrase) penalty += 8;
      if (this.lastAcceptedCompletion && completion === this.lastAcceptedCompletion) penalty += 12;
      if (multiRepeatRegex.test(preview)) penalty += 15;

      // POS-aware small boost: if the POS of the next word is plausible after the previous POS
      let posBoost = 0;
      try {
        const prevWords = this.normalizeText(this._lastContextText || contextPhrase).split(' ').filter(Boolean);
        const prevWord = prevWords[prevWords.length - 1] || '';
        const prevPOS = this.getPOS(prevWord);
        const nextPOS = this.getPOS(normalizedFirstWord);
        if (prevPOS && nextPOS && this.posTransitions[prevPOS]) {
          if (this.posTransitions[prevPOS].includes(nextPOS)) posBoost = 3;
        }
      } catch (_) { /* ignore POS boost errors */ }

      const finalScore = Math.max(0, suggestion.score + frequency * 5 + posBoost - penalty);
      return { ...suggestion, finalScore };
    });

    return scored
      .filter(s => s.finalScore > 0)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, this.maxSuggestions);
  }

  async handleInput(event) {
    if (!this.isEnabled) return;
    
    // Only trigger on actual text input
    if (event.inputType !== 'insertText' && event.inputType !== 'insertCompositionText') {
      this.hideSuggestion();
      return;
    }

    const context = this.getCurrentContext();
  this._lastContextText = context.text || '';
    if (!context.text || context.text.length < this.minTriggerLength) {
      this.hideSuggestion();
      return;
    }

    // Find suggestions
    const phraseMatches = this.findPhraseMatches(context.text);
    const ngramSuggestions = this.generateNgramSuggestions(context.text);
    const allSuggestions = [...phraseMatches, ...ngramSuggestions];

    if (allSuggestions.length === 0) {
      this.hideSuggestion();
      return;
    }

    const rankedSuggestions = this.rankSuggestions(allSuggestions);
    this.currentSuggestions = rankedSuggestions;
    this.currentSuggestionIndex = 0;

    this.showSuggestion(rankedSuggestions[0], context);
    
    // Update n-gram model in background
    this.updateNgramModel(context.text);
  }

  showSuggestion(suggestion, context) {
    if (!suggestion || !context.range) return;

    const completion = suggestion.completions[0];
    this.currentSuggestion = {
      suggestion: suggestion,
      context: context,
      completion: completion
    };

    // Position ghost text
    this.positionGhostText(completion, context);
  }

  positionGhostText(completion, context) {
    const range = context.range.cloneRange();
    range.collapse(false); // Move to end of selection
    
    // Create a temporary element to measure position
    const tempElement = document.createElement('span');
    tempElement.style.cssText = 'position: absolute; visibility: hidden; white-space: pre;';
    tempElement.textContent = '|'; // Use a thin character for positioning
    
    try {
      range.insertNode(tempElement);
      const rect = tempElement.getBoundingClientRect();
      const editorRect = this.editor.getBoundingClientRect();
      
      this.ghostElement.textContent = completion;
      this.ghostElement.style.left = `${rect.left - editorRect.left}px`;
      this.ghostElement.style.top = `${rect.top - editorRect.top}px`;
      this.ghostElement.style.display = 'inline';
      
      // Append to editor if not already there
      if (!this.ghostElement.parentNode) {
        this.editor.style.position = 'relative';
        this.editor.appendChild(this.ghostElement);
      }
      
      tempElement.remove();
    } catch (error) {
      console.warn('Failed to position ghost text:', error);
      tempElement.remove();
    }
  }

  hideSuggestion() {
    if (this.ghostElement) {
      this.ghostElement.style.display = 'none';
    }
    this.currentSuggestion = null;
    this.currentSuggestions = [];
    this.currentSuggestionIndex = 0;
  }

  acceptSuggestion() {
    if (!this.currentSuggestion) return false;

    // Snapshot to avoid races with selectionchange that may clear currentSuggestion
    const snapshot = {
      completion: this.currentSuggestion?.completion || '',
      context: this.currentSuggestion?.context || null,
      phrase: this.currentSuggestion?.suggestion?.phrase || null,
    };

    if (!snapshot.context || !snapshot.completion) return false;
    const { textNode, cursorPos } = snapshot.context;
    // Normalize whitespace at boundary to avoid double spaces
    let insertTextStr = snapshot.completion;
    try {
      const prevChar = (textNode && typeof cursorPos === 'number' && cursorPos > 0)
        ? (textNode.textContent || '')[cursorPos - 1] || ''
        : '';
      if (/^\s/.test(insertTextStr) && (cursorPos === 0 || /\s/.test(prevChar))) {
        // Drop leading whitespace if previous char is also whitespace or at start
        insertTextStr = insertTextStr.replace(/^\s+/, '');
      }
    } catch (_) { /* noop: best-effort normalization */ }

    try {
      // Suppress selectionchange side-effects during insertion
      this._squelchSelectionChange = true;

      // Prefer execCommand for contenteditable to preserve formatting
      const selection = window.getSelection();
      const canInsertCmd = document.queryCommandSupported && document.queryCommandSupported('insertText');
      if (canInsertCmd) {
        document.execCommand('insertText', false, insertTextStr);
      } else if (selection && selection.rangeCount && textNode) {
        // Fallback: manual text insertion
        const newText = textNode.textContent.substring(0, cursorPos) + insertTextStr + textNode.textContent.substring(cursorPos);
        textNode.textContent = newText;
        const caret = document.createRange();
        caret.setStart(textNode, cursorPos + insertTextStr.length);
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
      }

      // Update user frequencies (use snapshot to avoid null deref)
      if (snapshot.phrase) {
        this.userFrequencies[snapshot.phrase] = (this.userFrequencies[snapshot.phrase] || 0) + 1;
        this.saveUserData();
      }

      // Record recent history to limit repetition
      try {
        this.lastAcceptedPhrase = snapshot.phrase || this.lastAcceptedPhrase;
        this.lastAcceptedCompletion = insertTextStr;
        this.recentCompletions.push(insertTextStr);
        if (this.recentCompletions.length > 10) this.recentCompletions.shift();
        const words = this.normalizeText(insertTextStr).split(' ').filter(Boolean);
        if (words.length) {
          this.recentWords.push(...words);
          if (this.recentWords.length > this.recentLimit) {
            this.recentWords = this.recentWords.slice(-this.recentLimit);
          }
        }
      } catch (_) { }

      this.hideSuggestion();
      return true;
    } catch (error) {
      console.warn('Failed to accept suggestion:', error);
      this.hideSuggestion();
      return false;
    } finally {
      this._squelchSelectionChange = false;
    }
  }

  cycleToNextSuggestion() {
    if (!this.currentSuggestion) return false;

    // Get current suggestion and find alternatives
    const currentSuggestion = this.currentSuggestions[this.currentSuggestionIndex];
    if (!currentSuggestion) return false;
    const completions = currentSuggestion.completions || [];

    if (completions.length > 1) {
      // Cycle through completions of the same phrase
      const currentCompletionIndex = completions.indexOf(this.currentSuggestion.completion);
      const nextCompletionIndex = (currentCompletionIndex + 1 + completions.length) % completions.length;
      this.currentSuggestion.completion = completions[nextCompletionIndex];
      this.positionGhostText(this.currentSuggestion.completion, this.currentSuggestion.context);
      return true;
    } else if (this.currentSuggestions.length > 1) {
      // Cycle through different suggestions
      this.currentSuggestionIndex = (this.currentSuggestionIndex + 1) % this.currentSuggestions.length;
      const nextSuggestion = this.currentSuggestions[this.currentSuggestionIndex];
      this.showSuggestion(nextSuggestion, this.currentSuggestion.context);
      return true;
    }

    return false;
  }

  updateNgramModel(text) {
    const words = this.normalizeText(text).split(' ').filter(Boolean);
    if (words.length < 2) return;

    // Update 2-grams and 3-grams
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const context = words.slice(i, i + n - 1).join(' ');
        const nextWord = words[i + n - 1];
        
        if (!this.ngramModel[context]) {
          this.ngramModel[context] = {};
        }
        this.ngramModel[context][nextWord] = (this.ngramModel[context][nextWord] || 0) + 1;
      }
    }

    // Limit model size to prevent memory issues
    this.pruneNgramModel();
  }

  pruneNgramModel() {
    const maxContexts = 1000;
    const maxWordsPerContext = 20;

    const contexts = Object.keys(this.ngramModel);
    if (contexts.length > maxContexts) {
      // Keep only the most frequent contexts
      const sortedContexts = contexts
        .map(context => ({
          context,
          totalCount: Object.values(this.ngramModel[context]).reduce((a, b) => a + b, 0)
        }))
        .sort((a, b) => b.totalCount - a.totalCount)
        .slice(0, maxContexts);

      const newModel = {};
      sortedContexts.forEach(({ context }) => {
        newModel[context] = this.ngramModel[context];
      });
      this.ngramModel = newModel;
    }

    // Prune words within each context
    for (const context in this.ngramModel) {
      const words = Object.entries(this.ngramModel[context]);
      if (words.length > maxWordsPerContext) {
        const topWords = words
          .sort(([,a], [,b]) => b - a)
          .slice(0, maxWordsPerContext);
        
        this.ngramModel[context] = Object.fromEntries(topWords);
      }
    }
  }

  handleKeyDown(event) {
    if (!this.currentSuggestion) return;

    switch (event.key) {
      case 'Tab':
      case 'ArrowRight':
        if (this.acceptSuggestion()) {
          event.preventDefault();
        }
        break;
      
      case 'Escape':
        this.hideSuggestion();
        event.preventDefault();
        break;
      
      case 'Alt':
        if (this.cycleToNextSuggestion()) {
          event.preventDefault();
        }
        break;
      
      default:
        // Hide suggestion on most other keys
        if (!['Shift', 'Control', 'Meta', 'CapsLock'].includes(event.key)) {
          this.hideSuggestion();
        }
        break;
    }
  }

  handleSelectionChange() {
    // Hide suggestion if cursor moves away from the suggestion context
    if (this._squelchSelectionChange) return;
    if (this.currentSuggestion) {
      const context = this.getCurrentContext();
      if (!context.range || context.textNode !== this.currentSuggestion.context.textNode) {
        this.hideSuggestion();
      }
    }
  }

  // Public API methods
  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
    this.hideSuggestion();
  }

  toggle() {
    if (this.isEnabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  // Method to add custom phrases programmatically
  addCustomPhrase(phrase, completions) {
    const normalizedPhrase = phrase.toLowerCase();
    if (!Array.isArray(completions)) {
      completions = [completions];
    }
    this.phrases[normalizedPhrase] = completions;
  }

  // Method to get statistics
  getStats() {
    return {
      totalPhrases: Object.keys(this.phrases).length,
      userFrequencies: Object.keys(this.userFrequencies).length,
      ngramContexts: Object.keys(this.ngramModel).length,
      isEnabled: this.isEnabled
    };
  }
}

// Export for use in editor
export { SmartCompose };
