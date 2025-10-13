// Summary Tool for Buddy Docs
import { getSetting } from './idb.js';

// Extract plain text from HTML
function extractText(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

// Stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will', 'with',
  'the', 'this', 'but', 'they', 'have', 'had', 'what', 'when', 'where', 'who',
  'which', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now'
]);

// Calculate TF-IDF scores
function calculateTFIDF(sentences) {
  const documentFreq = {};
  const termFreq = [];
  
  // Calculate term frequency for each sentence
  sentences.forEach(sentence => {
    const words = sentence.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    
    const tf = {};
    words.forEach(word => {
      tf[word] = (tf[word] || 0) + 1;
      documentFreq[word] = (documentFreq[word] || 0) + 1;
    });
    termFreq.push(tf);
  });
  
  // Calculate TF-IDF
  const numDocs = sentences.length;
  return termFreq.map(tf => {
    const tfidf = {};
    Object.keys(tf).forEach(word => {
      const idf = Math.log(numDocs / (documentFreq[word] || 1));
      tfidf[word] = tf[word] * idf;
    });
    return tfidf;
  });
}

// Build word co-occurrence graph
function buildWordGraph(sentences) {
  const graph = {};
  const windowSize = 5; // Words within 5 positions are considered related
  
  sentences.forEach(sentence => {
    const words = sentence.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    
    // Build co-occurrence relationships
    for (let i = 0; i < words.length; i++) {
      const word1 = words[i];
      if (!graph[word1]) graph[word1] = {};
      
      for (let j = i + 1; j < Math.min(i + windowSize, words.length); j++) {
        const word2 = words[j];
        if (!graph[word2]) graph[word2] = {};
        
        // Bidirectional edges with weight based on distance
        const weight = 1 / (j - i);
        graph[word1][word2] = (graph[word1][word2] || 0) + weight;
        graph[word2][word1] = (graph[word2][word1] || 0) + weight;
      }
    }
  });
  
  return graph;
}

// TextRank algorithm for word importance
function textRank(graph, iterations = 20, dampingFactor = 0.85) {
  const scores = {};
  const words = Object.keys(graph);
  
  // Initialize scores
  words.forEach(word => scores[word] = 1.0);
  
  // Iterate to convergence
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = {};
    
    words.forEach(word => {
      let score = (1 - dampingFactor);
      const neighbors = Object.keys(graph[word] || {});
      
      neighbors.forEach(neighbor => {
        const neighborOutWeight = Object.values(graph[neighbor] || {})
          .reduce((sum, w) => sum + w, 0);
        
        if (neighborOutWeight > 0) {
          score += dampingFactor * (graph[word][neighbor] / neighborOutWeight) * scores[neighbor];
        }
      });
      
      newScores[word] = score;
    });
    
    Object.assign(scores, newScores);
  }
  
  return scores;
}

// Calculate semantic similarity between sentences
function calculateSimilarity(sent1Words, sent2Words, wordScores) {
  const set1 = new Set(sent1Words);
  const set2 = new Set(sent2Words);
  const intersection = [...set1].filter(w => set2.has(w));
  
  if (intersection.length === 0) return 0;
  
  // Weighted Jaccard similarity using word importance scores
  const intersectionScore = intersection.reduce((sum, w) => sum + (wordScores[w] || 1), 0);
  const union = new Set([...set1, ...set2]);
  const unionScore = [...union].reduce((sum, w) => sum + (wordScores[w] || 1), 0);
  
  return intersectionScore / unionScore;
}

// Advanced summary using multiple techniques
export function generateBasicSummary(content, length = 'medium') {
  const text = extractText(content);
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  
  if (sentences.length === 0) {
    return 'No content to summarize.';
  }
  
  if (sentences.length <= 3) {
    return sentences.join(' ');
  }

  // Determine how many sentences to include
  let targetCount;
  switch (length) {
    case 'short':
      targetCount = Math.min(3, Math.ceil(sentences.length * 0.15));
      break;
    case 'long':
      targetCount = Math.min(10, Math.ceil(sentences.length * 0.4));
      break;
    default: // medium
      targetCount = Math.min(5, Math.ceil(sentences.length * 0.25));
  }

  // Build word graph and calculate importance scores
  const wordGraph = buildWordGraph(sentences);
  const wordScores = textRank(wordGraph);
  
  // Calculate TF-IDF scores
  const tfidfScores = calculateTFIDF(sentences);
  
  // Score each sentence using multiple factors
  const scoredSentences = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    
    let score = 0;
    
    // 1. Position score (first and last sentences are important)
    if (index === 0) score += 5;
    if (index === sentences.length - 1) score += 3;
    if (index < 3) score += 2; // Early sentences are generally important
    
    // 2. TextRank word importance score
    const textRankScore = words.reduce((sum, word) => sum + (wordScores[word] || 0), 0) / words.length;
    score += textRankScore * 10;
    
    // 3. TF-IDF score
    const tfidf = tfidfScores[index] || {};
    const tfidfScore = Object.values(tfidf).reduce((sum, val) => sum + val, 0) / words.length;
    score += tfidfScore * 8;
    
    // 4. Sentence length score (prefer medium-length sentences)
    const wordCount = words.length;
    if (wordCount >= 8 && wordCount <= 25) {
      score += 3;
    } else if (wordCount < 5 || wordCount > 35) {
      score *= 0.6;
    }
    
    // 5. Named entity and proper noun detection (capitalized words)
    const capitalizedWords = sentence.match(/\b[A-Z][a-z]+/g) || [];
    score += capitalizedWords.length * 0.5;
    
    // 6. Numerical data presence (numbers often indicate important facts)
    const numbers = sentence.match(/\d+/g) || [];
    score += numbers.length * 0.8;
    
    // 7. Keyword density (words that appear frequently in the document)
    const importantWords = words.filter(w => wordScores[w] > 1.5);
    score += importantWords.length * 1.2;
    
    return { sentence: sentence.trim(), score, index, words };
  });

  // Sort by score and select top sentences
  const topSentences = scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, targetCount);
  
  // Remove redundant sentences using similarity threshold
  const finalSentences = [];
  const similarityThreshold = 0.7;
  
  topSentences.forEach(sent => {
    let isRedundant = false;
    
    for (const existing of finalSentences) {
      const similarity = calculateSimilarity(sent.words, existing.words, wordScores);
      if (similarity > similarityThreshold) {
        isRedundant = true;
        break;
      }
    }
    
    if (!isRedundant) {
      finalSentences.push(sent);
    }
  });
  
  // Sort by original order for coherent reading
  finalSentences.sort((a, b) => a.index - b.index);

  return finalSentences.map(s => s.sentence).join(' ');
}

// AI-powered summary (requires AI to be enabled)
export async function generateAISummary(content, length = 'medium') {
  const aiEnabled = await getSetting('aiEnabled', false);
  
  if (!aiEnabled) {
    throw new Error('AI is not enabled. Please enable AI in settings to use AI-powered summaries.');
  }

  const text = extractText(content);
  
  if (!text.trim()) {
    return 'No content to summarize.';
  }

  let prompt;
  switch (length) {
    case 'short':
      prompt = `Summarize the following text in 2-3 concise sentences:\n\n${text}`;
      break;
    case 'long':
      prompt = `Provide a detailed summary of the following text, covering all main points:\n\n${text}`;
      break;
    default: // medium
      prompt = `Summarize the following text in 4-5 sentences, capturing the key points:\n\n${text}`;
  }

  // This would integrate with the AI system
  // For now, return a placeholder that indicates AI would be used
  return `[AI Summary would be generated here using the AI system]\n\nPrompt: ${prompt.substring(0, 100)}...`;
}

// Generate bullet points summary with key topics
export function generateBulletPoints(content) {
  const text = extractText(content);
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  
  if (sentences.length === 0) {
    return 'No content to summarize.';
  }

  // Build word graph and get important keywords
  const wordGraph = buildWordGraph(sentences);
  const wordScores = textRank(wordGraph);
  
  // Get top keywords
  const topKeywords = Object.entries(wordScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
  
  // Find sentences that contain these keywords
  const keywordSentences = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    
    // Count how many top keywords this sentence contains
    const keywordCount = words.filter(w => topKeywords.includes(w)).length;
    
    return {
      sentence: sentence.trim(),
      keywordCount,
      index,
      length: words.length
    };
  });
  
  // Select diverse sentences covering different topics
  const selectedSentences = [];
  const usedKeywords = new Set();
  const targetCount = Math.min(7, Math.ceil(sentences.length * 0.3));
  
  // Sort by keyword count and select diverse sentences
  keywordSentences
    .filter(s => s.length >= 5 && s.length <= 30) // Filter reasonable length
    .sort((a, b) => b.keywordCount - a.keywordCount)
    .forEach(sent => {
      if (selectedSentences.length >= targetCount) return;
      
      const sentWords = sent.sentence.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => topKeywords.includes(w));
      
      // Check if this sentence introduces new keywords
      const newKeywords = sentWords.filter(w => !usedKeywords.has(w));
      
      if (newKeywords.length > 0 || selectedSentences.length < 3) {
        selectedSentences.push(sent);
        sentWords.forEach(w => usedKeywords.add(w));
      }
    });
  
  // Sort by original order and format as bullets
  selectedSentences.sort((a, b) => a.index - b.index);
  
  return selectedSentences.map(s => `• ${s.sentence}`).join('\n');
}

// Show summary tool modal
export function showSummaryModal(content) {
  const modal = document.createElement('div');
  modal.className = 'summary-modal';
  modal.innerHTML = `
    <div class="summary-card">
      <div class="summary-header">
        <h3>
          <span class="material-symbols-outlined">summarize</span>
          Document Summary
        </h3>
        <button class="icon-btn close-summary">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="summary-body">
        <div class="summary-options">
          <button class="summary-option-btn active" data-type="basic" data-length="short">
            <span class="material-symbols-outlined">short_text</span>
            <span>Short</span>
          </button>
          <button class="summary-option-btn" data-type="basic" data-length="medium">
            <span class="material-symbols-outlined">subject</span>
            <span>Medium</span>
          </button>
          <button class="summary-option-btn" data-type="basic" data-length="long">
            <span class="material-symbols-outlined">article</span>
            <span>Long</span>
          </button>
          <button class="summary-option-btn" data-type="bullets">
            <span class="material-symbols-outlined">format_list_bulleted</span>
            <span>Bullets</span>
          </button>
        </div>
        <div class="summary-result" id="summaryResult">
          <div class="summary-loading">
            <span class="material-symbols-outlined">hourglass_empty</span>
            <div>Generating summary...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close button
  modal.querySelector('.close-summary').addEventListener('click', () => {
    modal.remove();
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Option buttons
  const optionButtons = modal.querySelectorAll('.summary-option-btn');
  optionButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      // Update active state
      optionButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Generate summary
      const type = btn.dataset.type;
      const length = btn.dataset.length;
      const resultDiv = modal.querySelector('#summaryResult');

      resultDiv.innerHTML = `
        <div class="summary-loading">
          <span class="material-symbols-outlined">hourglass_empty</span>
          <div>Generating summary...</div>
        </div>
      `;

      try {
        let summary;
        if (type === 'bullets') {
          summary = generateBulletPoints(content);
        } else if (type === 'ai') {
          summary = await generateAISummary(content, length);
        } else {
          summary = generateBasicSummary(content, length);
        }

        resultDiv.innerHTML = summary.split('\n').map(line => `<p>${line}</p>`).join('');
      } catch (error) {
        resultDiv.innerHTML = `<p style="color: #ef4444;">${error.message}</p>`;
      }
    });
  });

  // Generate initial summary
  setTimeout(() => {
    const activeBtn = modal.querySelector('.summary-option-btn.active');
    if (activeBtn) {
      activeBtn.click();
    }
  }, 100);
}
