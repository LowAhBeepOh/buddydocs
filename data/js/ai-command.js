import { getSetting, setSetting, listDocuments, getDocument, saveDocument, deleteDocument } from './idb.js';
import { isAiEnabled, getAiConfig, sendChatMessage } from './ai.js';

// Session memory for context
let sessionMemory = [];
const MAX_MEMORY_SIZE = 20; // Keep last 20 interactions

// Available themes mapping
const THEME_MAP = {
  'girly': 'pretty-pink',
  'pretty': 'pretty-pink',
  'pink': 'pretty-pink',
  'dark pink': 'dark-pink',
  'feminine': 'pretty-pink',
  'cute': 'pretty-pink',
  'dr pepper': 'dr-pepper',
  'cola': 'dr-pepper',
  'forest': 'forest',
  'green': 'forest',
  'nature': 'forest',
  'leaf': 'leaf',
  'light green': 'leaf',
  'pj': 'pj',
  'peanut butter': 'pj',
  'orange': 'pj',
  'baby blue': 'baby-blue',
  'light blue': 'baby-blue',
  'blue': 'baby-blue',
  'blueberries': 'blueberries',
  'dark blue': 'blueberries',
  'navy': 'blueberries',
  'light': 'light',
  'dark': 'dark',
  'system': 'system'
};

// Tool functions that AI can call
const AVAILABLE_TOOLS = {
  themes: async () => {
    const themes = Object.keys(THEME_MAP).map(key => ({
      name: key,
      value: THEME_MAP[key]
    }));
    return { type: 'themes', data: themes };
  },
  
  documents: async () => {
    const docs = await listDocuments({ includeArchived: false });
    const recent = docs.slice(0, 10).map(doc => ({
      id: doc.id,
      title: doc.title || 'Untitled',
      type: doc.type || 'document',
      dueDate: doc.dueDate,
      updatedAt: doc.updatedAt
    }));
    return { type: 'documents', data: recent };
  },
  
  settings: async () => {
    const currentTheme = await getSetting('theme', 'light');
    const displayName = await getSetting('displayName', 'Buddy');
    const aiEnabled = await getSetting('aiEnabled', false);
    return { 
      type: 'settings', 
      data: { currentTheme, displayName, aiEnabled }
    };
  },
  
  changeTheme: async (themeName) => {
    const normalizedTheme = themeName.toLowerCase().trim();
    const themeValue = THEME_MAP[normalizedTheme] || normalizedTheme;
    
    // Apply theme using the same method as theme.js
    const root = document.documentElement;
    let finalTheme = themeValue;
    if (finalTheme === 'system') {
      finalTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', finalTheme);
    
    // Update meta theme color matching theme.js implementation
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const computed = getComputedStyle(root);
      const bg = computed.getPropertyValue('--bg').trim() || '#000000';
      meta.setAttribute('content', bg);
    }
    
    // Save the original theme value (not the resolved one for system)
    await setSetting('theme', themeValue);
    
    return { 
      type: 'changeTheme', 
      data: { theme: themeValue, applied: true, resolvedTheme: finalTheme }
    };
  },

  // Advanced search for documents with multiple criteria
  searchDocuments: async (query, options = {}) => {
    const { includeArchived = false, type = null, hasDeadline = null, dateRange = null, tag = null, priority = null, pinned = null } = options;
    
    // Get all documents first
    let docs = await listDocuments({ search: query, includeArchived });
    
    // Apply additional filters
    if (type) {
      docs = docs.filter(doc => doc.type === type);
    }
    
    if (hasDeadline !== null) {
      if (hasDeadline) {
        docs = docs.filter(doc => doc.dueDate);
      } else {
        docs = docs.filter(doc => !doc.dueDate);
      }
    }
    
    if (tag) {
      docs = docs.filter(doc => Array.isArray(doc.tags) && doc.tags.map(t => t.toLowerCase()).includes(String(tag).toLowerCase()));
    }

    if (priority) {
      docs = docs.filter(doc => (doc.priority || '').toLowerCase() === String(priority).toLowerCase());
    }

    if (pinned !== null) {
      docs = docs.filter(doc => !!doc.pinned === !!pinned);
    }

    if (dateRange) {
      const now = new Date();
      let startDate, endDate;
      
      if (dateRange === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      } else if (dateRange === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
      } else if (dateRange === 'month') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
      }
      
      if (startDate && endDate) {
        docs = docs.filter(doc => {
          const docDate = new Date(doc.updatedAt);
          return docDate >= startDate && docDate <= endDate;
        });
      }
    }
    
    // Enhanced search scoring
    const scoredResults = docs.map(doc => {
      let score = 0;
      const title = (doc.title || '').toLowerCase();
      const content = (doc.content || '').toLowerCase();
      const searchTerm = query.toLowerCase();
      
      // Title matches get higher score
      if (title.includes(searchTerm)) score += 10;
      if (title.startsWith(searchTerm)) score += 5;
      
      // Content matches
      if (content.includes(searchTerm)) score += 3;
      
      // Boost recent documents
      const daysSinceUpdate = (Date.now() - doc.updatedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 7) score += 2;
      if (daysSinceUpdate < 1) score += 1;
      
      // Boost documents with deadlines
      if (doc.dueDate) score += 1;
      
      return { ...doc, searchScore: score };
    });
    
    // Sort by score and recency
    const results = scoredResults
      .sort((a, b) => b.searchScore - a.searchScore || b.updatedAt - a.updatedAt)
      .slice(0, 25)
      .map(doc => ({
        id: doc.id,
        title: doc.title || 'Untitled',
        type: doc.type || 'document',
        dueDate: doc.dueDate,
        updatedAt: doc.updatedAt,
        content: doc.content ? doc.content.substring(0, 250) + '...' : '',
        score: doc.searchScore,
        wordCount: doc.content ? doc.content.split(/\s+/).length : 0,
        hasDeadline: !!doc.dueDate,
        isOverdue: doc.dueDate ? new Date(doc.dueDate) < new Date() : false
      }));
    
    return { 
      type: 'searchDocuments', 
      data: { 
        query, 
        results, 
        totalFound: docs.length,
        filters: { includeArchived, type, hasDeadline, dateRange }
      } 
    };
  },

  // Get specific document by ID or title
  getDocument: async (identifier) => {
    let doc = null;
    
    // Try by ID first
    if (identifier && identifier.length > 10) {
      try {
        doc = await getDocument(identifier);
      } catch (e) {}
    }
    
    // If not found, search by title
    if (!doc) {
      const docs = await listDocuments({ search: identifier, includeArchived: true });
      doc = docs.find(d => d.title?.toLowerCase().includes((identifier||'').toLowerCase()));
    }
    
    if (!doc) {
      return { type: 'getDocument', data: null, error: 'Document not found' };
    }
    
    return {
      type: 'getDocument',
      data: {
        id: doc.id,
        title: doc.title || 'Untitled',
        type: doc.type || 'document',
        content: doc.content || '',
        dueDate: doc.dueDate,
        updatedAt: doc.updatedAt,
        archived: !!doc.archived,
        completed: !!doc.completed
      }
    };
  },

  // Summarize document(s)
  summarizeDocument: async (identifier) => {
    try {
      // Get the document first
      const docResult = await AVAILABLE_TOOLS.getDocument(identifier);
      if (!docResult.data) {
        return { type: 'summarizeDocument', data: null, error: 'Document not found' };
      }
      
      const doc = docResult.data;
      if (!doc.content || doc.content.trim().length < 50) {
        return { 
          type: 'summarizeDocument', 
          data: { 
            title: doc.title, 
            summary: 'Document is too short to summarize or has no content.' 
          } 
        };
      }
      
      // Use AI to summarize the document
      const summaryPrompt = `Summarize this document concisely in 2-3 sentences:\n\nTitle: ${doc.title}\nContent: ${doc.content}\n\nProvide a clear, helpful summary that captures the main points.`;
      
      const summary = await sendChatMessage(summaryPrompt, 'ask-without-context');
      
      return {
        type: 'summarizeDocument',
        data: {
          title: doc.title,
          summary: summary.trim(),
          wordCount: doc.content.split(/\s+/).length,
          type: doc.type
        }
      };
    } catch (error) {
      return { 
        type: 'summarizeDocument', 
        data: null, 
        error: `Failed to summarize: ${error.message}` 
      };
    }
  },

  // Mark document as complete (remove deadline)
  markComplete: async (identifier) => {
    try {
      const docResult = await AVAILABLE_TOOLS.getDocument(identifier);
      if (!docResult.data) {
        return { type: 'markComplete', data: null, error: 'Document not found' };
      }
      
      const doc = docResult.data;
      const updatedDoc = {
        ...doc,
        dueDate: null,
        completed: true,
        updatedAt: Date.now()
      };
      
      await saveDocument(updatedDoc);
      // Trigger UI refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-changed', { detail: { action: 'markComplete', doc: updatedDoc } }));
      }
      
      return {
        type: 'markComplete',
        data: {
          title: doc.title,
          success: true,
          message: `Document "${doc.title}" marked as complete and deadline removed.`
        }
      };
    } catch (error) {
      return { 
        type: 'markComplete', 
        data: null, 
        error: `Failed to mark complete: ${error.message}` 
      };
    }
  },

  // Add deadline to document
  addDeadline: async (identifier, deadline) => {
    try {
      const docResult = await AVAILABLE_TOOLS.getDocument(identifier);
      if (!docResult.data) {
        return { type: 'addDeadline', data: null, error: 'Document not found' };
      }
      
      const doc = docResult.data;
      
      // Parse deadline (support various formats)
      let dueDate = null;
      const now = new Date();
      
      if (deadline.toLowerCase().includes('today')) {
        dueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      } else if (deadline.toLowerCase().includes('tomorrow')) {
        dueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);
      } else if (deadline.match(/\d+\s*(day|days)/i)) {
        const days = parseInt(deadline.match(/\d+/)[0]);
        dueDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      } else if (deadline.match(/\d+\s*(week|weeks)/i)) {
        const weeks = parseInt(deadline.match(/\d+/)[0]);
        dueDate = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
      } else {
        // Try to parse as date string
        dueDate = new Date(deadline);
        if (isNaN(dueDate.getTime())) {
          return { 
            type: 'addDeadline', 
            data: null, 
            error: 'Invalid deadline format. Use formats like "today", "tomorrow", "3 days", "1 week", or a specific date.' 
          };
        }
      }
      
      const updatedDoc = {
        ...doc,
        dueDate: dueDate.toISOString(),
        completed: false,
        updatedAt: Date.now()
      };
      
      await saveDocument(updatedDoc);
      // Trigger UI refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-changed', { detail: { action: 'addDeadline', doc: updatedDoc } }));
      }
      
      return {
        type: 'addDeadline',
        data: {
          title: doc.title,
          deadline: dueDate.toLocaleDateString(),
          success: true,
          message: `Deadline set for "${doc.title}" on ${dueDate.toLocaleDateString()}.`
        }
      };
    } catch (error) {
      return { 
        type: 'addDeadline', 
        data: null, 
        error: `Failed to add deadline: ${error.message}` 
      };
    }
  },

  // Archive document
  archiveDocument: async (identifier) => {
    try {
      const docResult = await AVAILABLE_TOOLS.getDocument(identifier);
      if (!docResult.data) {
        return { type: 'archiveDocument', data: null, error: 'Document not found' };
      }
      
      const doc = docResult.data;
      const updatedDoc = {
        ...doc,
        archived: true,
        updatedAt: Date.now()
      };
      
      await saveDocument(updatedDoc);
      // Trigger UI refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-changed', { detail: { action: 'archiveDocument', doc: updatedDoc } }));
      }
      
      return {
        type: 'archiveDocument',
        data: {
          title: doc.title,
          success: true,
          message: `Document "${doc.title}" has been archived.`
        }
      };
    } catch (error) {
      return { 
        type: 'archiveDocument', 
        data: null, 
        error: `Failed to archive document: ${error.message}` 
      };
    }
  },

  // Delete document (requires confirmation)
  deleteDocument: async (identifier, confirmed = false) => {
    try {
      const docResult = await AVAILABLE_TOOLS.getDocument(identifier);
      if (!docResult.data) {
        return { type: 'deleteDocument', data: null, error: 'Document not found' };
      }
      
      const doc = docResult.data;
      
      if (!confirmed) {
        return {
          type: 'deleteDocument',
          data: {
            title: doc.title,
            requiresConfirmation: true,
            message: `Are you sure you want to delete "${doc.title}"? This action cannot be undone. To confirm, call [deleteDocument:${doc.title}:confirmed].`
          }
        };
      }
      
      await deleteDocument(doc.id);
      // Trigger UI refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-changed', { detail: { action: 'deleteDocument', doc: { id: doc.id, title: doc.title } } }));
      }
      
      return {
        type: 'deleteDocument',
        data: {
          title: doc.title,
          success: true,
          message: `Document "${doc.title}" has been permanently deleted.`
        }
      };
    } catch (error) {
      return { 
        type: 'deleteDocument', 
        data: null, 
        error: `Failed to delete document: ${error.message}` 
      };
    }
  },

  // Get session memory/context
  getContext: async () => {
    return {
      type: 'getContext',
      data: {
        recentInteractions: sessionMemory.slice(-10),
        totalInteractions: sessionMemory.length
      }
    };
  },

  // Add tags to document
  addTag: async (identifier, tag) => {
    try {
      const docResult = await AVAILABLE_TOOLS.getDocument(identifier);
      if (!docResult || docResult.error) {
        return { type: 'addTag', data: null, error: `Document not found: ${identifier}` };
      }
      
      const doc = docResult.data;
      if (!doc.tags) doc.tags = [];
      if (!doc.tags.includes(tag)) {
        doc.tags.push(tag);
        await saveDocument(doc);
        // Trigger UI refresh
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('document-changed', { detail: { action: 'addTag', doc } }));
        }
      }
      
      return {
        type: 'addTag',
        data: {
          title: doc.title,
          tag,
          allTags: doc.tags,
          success: true
        }
      };
    } catch (error) {
      return { type: 'addTag', data: null, error: `Failed to add tag: ${error.message}` };
    }
  },

  // Set document priority
  setPriority: async (identifier, priority) => {
    try {
      const docResult = await AVAILABLE_TOOLS.getDocument(identifier);
      if (!docResult || docResult.error) {
        return { type: 'setPriority', data: null, error: `Document not found: ${identifier}` };
      }
      
      const doc = docResult.data;
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      const normalizedPriority = priority.toLowerCase();
      
      if (!validPriorities.includes(normalizedPriority)) {
        return { type: 'setPriority', data: null, error: `Invalid priority. Use: ${validPriorities.join(', ')}` };
      }
      
      doc.priority = normalizedPriority;
      await saveDocument(doc);
      // Trigger UI refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-changed', { detail: { action: 'setPriority', doc } }));
      }
      
      return {
        type: 'setPriority',
        data: {
          title: doc.title,
          priority: normalizedPriority,
          success: true
        }
      };
    } catch (error) {
      return { type: 'setPriority', data: null, error: `Failed to set priority: ${error.message}` };
    }
  },

  // Pin/unpin document
  pinDocument: async (identifier, pinned = true) => {
    try {
      const docResult = await AVAILABLE_TOOLS.getDocument(identifier);
      if (!docResult || docResult.error) {
        return { type: 'pinDocument', data: null, error: `Document not found: ${identifier}` };
      }
      
      const doc = docResult.data;
      doc.pinned = pinned;
      await saveDocument(doc);
      // Trigger UI refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-changed', { detail: { action: 'pinDocument', doc } }));
      }
      
      return {
        type: 'pinDocument',
        data: {
          title: doc.title,
          pinned,
          success: true,
          message: `Document "${doc.title}" has been ${pinned ? 'pinned' : 'unpinned'}.`
        }
      };
    } catch (error) {
      return { type: 'pinDocument', data: null, error: `Failed to pin document: ${error.message}` };
    }
  },

  // Get document analytics/stats
  getDocumentStats: async () => {
    try {
      const docs = await listDocuments({ includeArchived: true });
      const now = new Date();
      
      const stats = {
        totalDocuments: docs.length,
        activeDocuments: docs.filter(d => !d.archived).length,
        archivedDocuments: docs.filter(d => d.archived).length,
        completedDocuments: docs.filter(d => d.completed).length,
        withDeadlines: docs.filter(d => d.dueDate).length,
        overdue: docs.filter(d => d.dueDate && new Date(d.dueDate) < now).length,
        pinned: docs.filter(d => d.pinned).length,
        totalWords: docs.reduce((sum, d) => sum + (d.content ? d.content.split(/\s+/).length : 0), 0),
        averageWordsPerDoc: 0,
        recentlyUpdated: docs.filter(d => (now - d.updatedAt) < 7 * 24 * 60 * 60 * 1000).length,
        byPriority: {
          urgent: docs.filter(d => d.priority === 'urgent').length,
          high: docs.filter(d => d.priority === 'high').length,
          medium: docs.filter(d => d.priority === 'medium').length,
          low: docs.filter(d => d.priority === 'low').length
        },
        topTags: {}
      };
      
      stats.averageWordsPerDoc = stats.totalDocuments > 0 ? Math.round(stats.totalWords / stats.totalDocuments) : 0;
      
      // Count tags
      docs.forEach(doc => {
        if (doc.tags) {
          doc.tags.forEach(tag => {
            stats.topTags[tag] = (stats.topTags[tag] || 0) + 1;
          });
        }
      });
      
      return {
        type: 'getDocumentStats',
        data: stats
      };
    } catch (error) {
      return { type: 'getDocumentStats', data: null, error: `Failed to get stats: ${error.message}` };
    }
  },

  // Quick actions for productivity
  quickActions: async () => {
    try {
      const docs = await listDocuments({ includeArchived: false });
      const now = new Date();
      
      const suggestions = [];
      
      // Overdue documents
      const overdue = docs.filter(d => d.dueDate && new Date(d.dueDate) < now);
      if (overdue.length > 0) {
        suggestions.push({
          type: 'overdue',
          message: `You have ${overdue.length} overdue document(s)`,
          documents: overdue.map(d => ({ title: d.title, dueDate: d.dueDate }))
        });
      }
      
      // Due soon (next 3 days)
      const dueSoon = docs.filter(d => {
        if (!d.dueDate) return false;
        const dueDate = new Date(d.dueDate);
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        return dueDate > now && dueDate <= threeDaysFromNow;
      });
      
      if (dueSoon.length > 0) {
        suggestions.push({
          type: 'due_soon',
          message: `${dueSoon.length} document(s) due in the next 3 days`,
          documents: dueSoon.map(d => ({ title: d.title, dueDate: d.dueDate }))
        });
      }
      
      // Documents without deadlines that might need them
      const noDeadlines = docs.filter(d => !d.dueDate && !d.completed && !d.archived).slice(0, 3);
      if (noDeadlines.length > 0) {
        suggestions.push({
          type: 'no_deadlines',
          message: `Consider adding deadlines to ${noDeadlines.length} document(s)`,
          documents: noDeadlines.map(d => ({ title: d.title }))
        });
      }
      
      // Recently updated (last 24 hours)
      const recentlyUpdated = docs.filter(d => (now - d.updatedAt) < 24 * 60 * 60 * 1000);
      if (recentlyUpdated.length > 0) {
        suggestions.push({
          type: 'recently_updated',
          message: `${recentlyUpdated.length} document(s) updated in the last 24 hours`,
          documents: recentlyUpdated.map(d => ({ title: d.title, updatedAt: d.updatedAt }))
        });
      }
      
      return {
        type: 'quickActions',
        data: {
          suggestions,
          totalSuggestions: suggestions.length
        }
      };
    } catch (error) {
      return { type: 'quickActions', data: null, error: `Failed to get quick actions: ${error.message}` };
    }
  },

  /* ... existing tools (themes, documents, settings, changeTheme) */
};

// Initialize AI Command Bar
export async function initAiCommandBar() {
  const aiEnabled = await isAiEnabled();
  const commandBar = document.getElementById('aiCommandBar');
  
  if (!commandBar) return;
  
  if (aiEnabled) {
    commandBar.hidden = false;
    bindCommandBarEvents();
  } else {
    commandBar.hidden = true;
  }
}

function bindCommandBarEvents() {
  const input = document.getElementById('aiCommandInput');
  const output = document.getElementById('aiCommandOutput');
  
  if (!input || !output) return;
  
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await processCommand(input.value.trim());
    }
  });
  
  // Close output when clicking outside
  document.addEventListener('click', (e) => {
    if (!output.contains(e.target) && !input.contains(e.target)) {
      output.hidden = true;
    }
  });
}

async function processCommand(message) {
  if (!message) return;
  
  const input = document.getElementById('aiCommandInput');
  const output = document.getElementById('aiCommandOutput');
  
  if (!input || !output) return;
  
  // Clear input and show thinking state
  input.value = '';
  input.disabled = true;
  output.hidden = false;
  output.className = 'command-output thinking';
  output.innerHTML = `
    <div class="command-thinking">
      <span class="material-symbols-outlined">auto_awesome</span>
      <span>Thinking...</span>
    </div>
  `;
  
  try {
    // Create context from session memory
    const contextString = sessionMemory.length > 0 
      ? `Previous conversation context (last ${Math.min(sessionMemory.length, 5)} interactions):
${sessionMemory.slice(-5).map(mem => 
  `User: ${mem.userInput}\nAI: ${mem.aiResponse}${mem.toolsUsed.length > 0 ? `\nTools used: ${mem.toolsUsed.join(', ')}` : ''}`
).join('\n\n')}

Current request: ${message}`
      : message;

    // Create AI system prompt for command processing
    const systemPrompt = `You are an AI assistant for Buddy Docs. You can help users with various tasks by calling tools and providing responses.

Available tools you can call:
- [themes] - Get list of available themes
- [documents] - Get user's recent documents 
- [settings] - Get current app settings
- [changeTheme:themeName] - Change app theme (e.g., [changeTheme:girly], [changeTheme:dark])
- [searchDocuments:query] - Advanced search; supports filters via natural language or options (include archived, type, deadline, date range: today/week/month)
- [getDocument:identifier] - Get a specific document by ID or title
- [summarizeDocument:identifier] - Get an AI summary of a document
- [markComplete:identifier] - Mark document as complete and remove deadline
- [addDeadline:identifier:deadline] - Add deadline to document (e.g., [addDeadline:Essay:tomorrow])
- [archiveDocument:identifier] - Archive a document
- [deleteDocument:identifier] - Delete a document (requires user confirmation)
- [deleteDocument:identifier:confirmed] - Delete a document (requires confirmation)
- [addTag:identifier:tag] - Add a tag to a document
- [setPriority:identifier:priority] - Set priority (low, medium, high, urgent)
- [pinDocument:identifier:true|false] - Pin or unpin a document
- [getDocumentStats] - Get document analytics and stats
- [quickActions] - Get suggested next actions based on your docs
- [getContext] - Get conversation context/memory

For document operations, identifier can be:
- Document title (e.g., "My Essay", "Meeting Notes")
- Document ID
- Partial title match

For deadlines, use natural language like "today", "tomorrow", "3 days", "1 week", or specific dates.

Process the user's request:
1. Use session context if relevant
2. Call appropriate tools
3. Provide helpful responses
4. For destructive actions (delete), ask for confirmation first

User request: ${contextString}`;

    const response = await sendChatMessage(systemPrompt, 'ask-without-context');
    
    // Parse response for tool calls
    const toolCalls = extractToolCalls(response);
    let toolResults = [];
    let toolsUsed = [];
    
    // Execute tool calls
    for (const toolCall of toolCalls) {
      try {
        const result = await executeToolCall(toolCall);
        if (result) {
          toolResults.push(result);
          toolsUsed.push(`${toolCall.tool}${toolCall.param ? ':' + toolCall.param : ''}${toolCall.param2 ? ':' + toolCall.param2 : ''}`);
        }
      } catch (error) {
        console.error('Tool execution failed:', toolCall, error);
      }
    }
    
    // Generate final response with tool results
    let finalPrompt = `User request: ${message}

Tool results:
${toolResults.map(result => {
  if (result.error) {
    return `- ${result.type}: ERROR - ${result.error}`;
  }
  return `- ${result.type}: ${JSON.stringify(result.data)}`;
}).join('\n')}

Based on the tool results and any previous context, provide a helpful response to the user. Be conversational and helpful. Format your response properly with markdown if needed, but avoid using ** for bolding (use proper HTML tags instead).

If a document operation requires user confirmation, clearly state what needs confirmation and how to proceed.`;

    const finalResponse = await sendChatMessage(finalPrompt, 'ask-without-context');
    
    // Add to session memory
    addToMemory(message, finalResponse, toolsUsed);
    
    // Show response
    output.className = 'command-output';
    output.innerHTML = `
      ${toolCalls.length > 0 ? `
        <div class="command-tools">
          ${toolCalls.map(call => `<span class="command-tool">[${call.tool}${call.param ? ':' + call.param : ''}${call.param2 ? ':' + call.param2 : ''}]</span>`).join('')}
        </div>
      ` : ''}
      <div class="command-response">
        ${renderResponse(finalResponse)}
      </div>
    `;
    
  } catch (error) {
    console.error('Command processing failed:', error);
    output.className = 'command-output';
    output.innerHTML = `
      <div class="command-response">
        <p>Sorry, I encountered an error processing your request: ${error.message}</p>
      </div>
    `;
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function extractToolCalls(text) {
  const toolPattern = /\[([a-zA-Z]+)(?::([^:\]]+))?(?::([^\]]+))?\]/g;
  const calls = [];
  let match;
  
  while ((match = toolPattern.exec(text)) !== null) {
    calls.push({
      tool: match[1].toLowerCase(),
      param: match[2] ? match[2].trim() : null,
      param2: match[3] ? match[3].trim() : null
    });
  }
  
  return calls;
}

async function executeToolCall(toolCall) {
  const { tool, param, param2 } = toolCall;
  
  if (tool === 'changetheme' && param) {
    return await AVAILABLE_TOOLS.changeTheme(param);
  } else if (tool === 'searchdocuments' && param) {
    // Support passing optional JSON-encoded filters as second parameter
    let options = {};
    try {
      if (param2) {
        options = JSON.parse(param2);
      }
    } catch (e) {
      // ignore if not JSON
    }
    return await AVAILABLE_TOOLS.searchDocuments(param, options);
  } else if (tool === 'getdocument' && param) {
    return await AVAILABLE_TOOLS.getDocument(param);
  } else if (tool === 'summarizedocument' && param) {
    return await AVAILABLE_TOOLS.summarizeDocument(param);
  } else if (tool === 'markcomplete' && param) {
    return await AVAILABLE_TOOLS.markComplete(param);
  } else if (tool === 'adddeadline' && param && param2) {
    return await AVAILABLE_TOOLS.addDeadline(param, param2);
  } else if (tool === 'archivedocument' && param) {
    return await AVAILABLE_TOOLS.archiveDocument(param);
  } else if (tool === 'deletedocument' && param) {
    // Only proceed when explicitly confirmed via third argument
    const isConfirmed = param2 === 'confirmed';
    return await AVAILABLE_TOOLS.deleteDocument(param, isConfirmed);
  } else if (tool === 'addtag' && param && param2) {
    return await AVAILABLE_TOOLS.addTag(param, param2);
  } else if (tool === 'setpriority' && param && param2) {
    return await AVAILABLE_TOOLS.setPriority(param, param2);
  } else if (tool === 'pindocument' && param) {
    const pinned = param2 === 'true' || param2 === true || param2 === '1';
    return await AVAILABLE_TOOLS.pinDocument(param, pinned);
  } else if (tool === 'getdocumentstats') {
    return await AVAILABLE_TOOLS.getDocumentStats();
  } else if (tool === 'quickactions') {
    return await AVAILABLE_TOOLS.quickActions();
  } else if (tool === 'getcontext') {
    return await AVAILABLE_TOOLS.getContext();
  } else if (AVAILABLE_TOOLS[tool]) {
    return await AVAILABLE_TOOLS[tool]();
  }
  
  return null;
}

function renderResponse(text) {
  if (!text) return '<p>No response</p>';
  
  // Simple markdown-like rendering to avoid ** issues
  let html = text
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Lists
    .replace(/^\* (.*$)/gm, '<li>$1</li>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    // Bold (convert ** to <strong>)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  // Wrap in paragraphs if not already wrapped
  if (!html.includes('<p>') && !html.includes('<h') && !html.includes('<li>')) {
    html = `<p>${html}</p>`;
  }
  
  // Wrap list items in ul
  if (html.includes('<li>')) {
    html = html
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/<\/ul>\s*<ul>/g, ''); // merge adjacent ul tags
  }
  
  return html;
}

// Add interaction to session memory
function addToMemory(userInput, aiResponse, toolsUsed = []) {
  const interaction = {
    timestamp: Date.now(),
    userInput: userInput.substring(0, 200), // Limit length
    aiResponse: aiResponse.substring(0, 200),
    toolsUsed,
    id: crypto.randomUUID()
  };
  
  sessionMemory.push(interaction);
  
  // Keep memory size manageable
  if (sessionMemory.length > MAX_MEMORY_SIZE) {
    sessionMemory = sessionMemory.slice(-MAX_MEMORY_SIZE);
  }
}