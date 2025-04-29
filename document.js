class DocumentStorage {
    constructor() {
        this.dbName = 'buddyDocsDB';
        this.dbVersion = 1;
        this.db = null;
        this.initDB();
    }

    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('Error opening database:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('documents')) {
                    const store = db.createObjectStore('documents', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('lastModified', 'lastModified', { unique: false });
                    console.log('Object store created');
                }
            };
        });
    }

    addDocument(doc) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readwrite');
            const store = transaction.objectStore('documents');
            
            doc.created = new Date().toISOString();
            doc.lastModified = doc.created;
            
            const request = store.add(doc);
            
            request.onsuccess = (event) => {
                console.log('Document added with ID:', event.target.result);
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('Error adding document:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    getAllDocuments() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readonly');
            const store = transaction.objectStore('documents');
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('Error getting documents:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    getDocument(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readonly');
            const store = transaction.objectStore('documents');
            const request = store.get(id);
            
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('Error getting document:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    updateDocument(doc) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readwrite');
            const store = transaction.objectStore('documents');
            
            doc.lastModified = new Date().toISOString();
            
            const request = store.put(doc);
            
            request.onsuccess = (event) => {
                console.log('Document updated successfully');
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('Error updating document:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    deleteDocument(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readwrite');
            const store = transaction.objectStore('documents');
            const request = store.delete(id);
            
            request.onsuccess = (event) => {
                console.log('Document deleted successfully');
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error('Error deleting document:', event.target.error);
                reject(event.target.error);
            };
        });
    }
}

class DocumentManager {
    constructor() {
        this.storage = new DocumentStorage();
        this.currentDocument = null;
        this.editor = null;
        this.documentTypes = ['Document', 'Wiki', 'List', 'Interactive', 'Fiction'];
        this.currentFilter = 'all';
        this.searchQuery = ''; // new property for search query
        this.unsavedChanges = false;
        this.isReaderMode = false;
        this.initUI();
    }

    async initUI() {
        await this.storage.initDB();
        
        const newButton = document.querySelector('.new-button');
        if (newButton) {
            newButton.addEventListener('click', () => this.showNewDocumentDialog());
        }
        
        // NEW SEARCH FEATURE: set up search input and toggle
        const searchInput = document.querySelector('.search-input');
        const searchButton = document.querySelector('.search-button');
        if (searchButton && searchInput) {
            searchButton.addEventListener('click', () => {
                if (searchInput.style.display === 'none' || !searchInput.style.display) {
                    searchInput.style.display = 'block';
                    searchInput.focus();
                } else {
                    searchInput.style.display = 'none';
                    this.searchQuery = '';
                    this.loadDocuments();
                }
            });
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.loadDocuments();
            });
        }
        
        this.loadDocuments();
        
        this.createEditorContainer();
        
        document.addEventListener('click', (e) => {
            const contextMenu = document.querySelector('.context-menu');
            if (contextMenu && !e.target.closest('.context-menu')) {
                contextMenu.remove();
            }
        });
    }

    createEditorContainer() {
        const appContainer = document.querySelector('.app-container');
        
        if (!document.querySelector('.editor-container')) {
            const editorContainer = document.createElement('div');
            editorContainer.className = 'editor-container';
            editorContainer.style.display = 'none';
            
            const editorHeader = document.createElement('div');
            editorHeader.className = 'editor-header';
            
            const backButton = document.createElement('button');
            backButton.className = 'back-button';
            backButton.innerHTML = '<span class="material-symbols-rounded">arrow_back</span>';
            backButton.addEventListener('click', () => this.closeEditor());
            
            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.className = 'editor-title';
            titleInput.placeholder = 'Document Title';

            // Add mode toggle button
            const modeToggleButton = document.createElement('button');
            modeToggleButton.className = 'mode-toggle-button';
            modeToggleButton.innerHTML = `
                <span class="material-symbols-rounded">edit</span>
                <span class="toggle-text">Edit mode</span>
            `;
            modeToggleButton.addEventListener('click', () => this.toggleMode());
            
            const saveButton = document.createElement('button');
            saveButton.className = 'save-button';
            saveButton.textContent = 'Save';
            saveButton.addEventListener('click', () => this.saveDocument());
            
            editorHeader.appendChild(backButton);
            editorHeader.appendChild(titleInput);
            editorHeader.appendChild(modeToggleButton);
            editorHeader.appendChild(saveButton);
            
            const toolbar = document.createElement('div');
            toolbar.className = 'editor-toolbar';
            
            const formatActions = [
                { icon: 'format_bold', command: 'bold' },
                { icon: 'format_italic', command: 'italic' },
                { icon: 'format_underlined', command: 'underline' },
                { icon: 'format_list_bulleted', command: 'insertUnorderedList' },
                { icon: 'format_list_numbered', command: 'insertOrderedList' }
            ];
            
            formatActions.forEach(action => {
                const button = document.createElement('button');
                button.className = 'toolbar-button';
                button.innerHTML = `<span class="material-symbols-rounded">${action.icon}</span>`;
                button.addEventListener('click', () => {
                    document.execCommand(action.command, false, null);
                    this.editor.content.focus();
                });
                toolbar.appendChild(button);
            });
            
            editorHeader.appendChild(toolbar);
            
            const optionsButton = document.createElement('button');
            optionsButton.className = 'options-button';
            optionsButton.innerHTML = '<span class="material-symbols-rounded">more_vert</span>';
            optionsButton.addEventListener('click', (e) => this.showDocumentOptions(e));
            
            editorHeader.appendChild(optionsButton);
            
            const editorContent = document.createElement('div');
            editorContent.className = 'editor-content';
            editorContent.contentEditable = 'true';
            editorContent.setAttribute('placeholder', 'Start typing your document here...');
            
            editorContainer.appendChild(editorHeader);
            editorContainer.appendChild(editorContent);
            
            appContainer.appendChild(editorContainer);
            
            this.editor = {
                container: editorContainer,
                title: titleInput,
                content: editorContent
            };
            
            editorContent.addEventListener('input', () => {
                this.unsavedChanges = true;
            });
            
            titleInput.addEventListener('input', () => {
                this.unsavedChanges = true;
            });
        }
    }

    toggleMode() {
        this.isReaderMode = !this.isReaderMode;
        const container = this.editor.container;
        const modeButton = container.querySelector('.mode-toggle-button');
        const content = this.editor.content;
        const titleInput = this.editor.title;

        if (this.isReaderMode) {
            container.classList.add('reader-mode');
            content.contentEditable = 'false';
            titleInput.readOnly = true;
            modeButton.innerHTML = `
                <span class="material-symbols-rounded">edit</span>
                <span class="toggle-text">Edit mode</span>
            `;
        } else {
            container.classList.remove('reader-mode');
            content.contentEditable = 'true';
            titleInput.readOnly = false;
            modeButton.innerHTML = `
                <span class="material-symbols-rounded">visibility</span>
                <span class="toggle-text">Reader mode</span>
            `;
        }
    }

    openDocument(doc) {
        this.currentDocument = doc;
        
        this.editor.title.value = doc.title;
        this.editor.content.innerHTML = doc.content;
        
        const documentsGrid = document.querySelector('.documents-grid');
        const filterSection = document.querySelector('.filter-section');
        let notificationSection = document.querySelector('.notification-section');
        
        if (!notificationSection) {
            notificationSection = document.createElement('div');
            notificationSection.className = 'notification-section';
            documentsGrid.parentNode.insertBefore(notificationSection, documentsGrid.nextSibling);
        }
        
        if (documentsGrid) documentsGrid.style.display = 'none';
        if (filterSection) filterSection.style.display = 'none';
        if (notificationSection) notificationSection.style.display = 'none';
        
        this.editor.container.style.display = 'flex';
        this.editor.content.focus();
        this.isReaderMode = false;
        this.editor.container.classList.remove('reader-mode');
        this.editor.content.contentEditable = 'true';
        this.editor.title.readOnly = false;
        const modeButton = this.editor.container.querySelector('.mode-toggle-button');
        if (modeButton) {
            modeButton.innerHTML = `
                <span class="material-symbols-rounded">visibility</span>
                <span class="toggle-text">Reader mode</span>
            `;
        }
    }

    closeEditor() {
        if (this.unsavedChanges && !confirm('You have unsaved changes. Are you sure you want to close?')) {
            return;
        }
        
        this.unsavedChanges = false;
        
        this.editor.container.style.display = 'none';
        document.querySelector('.documents-grid').style.display = 'grid';
        document.querySelector('.filter-section').style.display = 'block';
        
        if (this.userHasNoDocuments()) {
            document.querySelector('.notification-section').style.display = 'grid';
        }
        
        this.currentDocument = null;
    }

    hasUnsavedChanges() {
        if (!this.currentDocument) return false;
        
        const currentTitle = this.editor.title.value;
        const currentContent = this.editor.content.innerHTML;
        
        return currentTitle !== this.currentDocument.title || 
               currentContent !== this.currentDocument.content;
    }

    async saveDocument() {
        if (!this.currentDocument) return;
        
        this.currentDocument.title = this.editor.title.value;
        this.currentDocument.content = this.editor.content.innerHTML;
        
        try {
            await this.storage.updateDocument(this.currentDocument);
            this.loadDocuments();
            this.unsavedChanges = false;
            this.showSnackbar('Document saved successfully');
        } catch (error) {
            console.error('Error saving document:', error);
            this.showSnackbar('Error saving document', true);
        }
    }

    async loadDocuments() {
        try {
            const documents = await this.storage.getAllDocuments();
            if (document.querySelector('.documents-grid')) {
                this.renderDocuments(documents);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    }

    renderDocuments(docs) {
        const grid = document.querySelector('.documents-grid');
        const notificationSection = document.querySelector('.notification-section');
        
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (docs.length === 0) {
            grid.classList.remove('user-documents-grid');
            if (notificationSection) {
                notificationSection.style.display = 'grid';
            }
            this.createDemoLayout(grid);
            return;
        }
        // Apply type filter if any
        if (this.currentFilter !== 'all') {
            docs = docs.filter(doc => doc.type.toLowerCase() === this.currentFilter);
        }
        // NEW: Filter by search query (title or content)
        if (this.searchQuery !== '') {
            docs = docs.filter(doc => 
                doc.title.toLowerCase().includes(this.searchQuery) ||
                (doc.content && doc.content.toLowerCase().includes(this.searchQuery))
            );
        }
        if (notificationSection) {
            notificationSection.style.display = 'none';
        }
        grid.classList.add('user-documents-grid');
        
        docs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        
        docs.forEach(doc => {
            const card = this.createDocumentCard(doc);
            grid.appendChild(card);
        });
        
        setTimeout(() => {
            document.querySelectorAll('.document-card').forEach(card => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            });
        }, 10);
        
        initRippleEffect();
    }

    filterDocuments(filter) { // new method
        this.currentFilter = filter.toLowerCase();
        this.loadDocuments();
    }

    createDocumentCard(doc) {
        const card = document.createElement('div');
        card.className = 'card mini-card document-card';
        card.setAttribute('data-id', doc.id);
        
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        const date = new Date(doc.lastModified);
        const formattedDate = this.formatDate(date);
        
        // Captialize first letter of the doc type
        const displayType = doc.type.charAt(0).toUpperCase() + doc.type.slice(1);
        
        const avatar = document.createElement('div');
        avatar.className = `avatar ${this.getColorForType(doc.type)}`;
        avatar.setAttribute('data-initial', doc.title.charAt(0).toUpperCase());
        
        const initial = document.createElement('span');
        initial.textContent = doc.title.charAt(0).toUpperCase();
        avatar.appendChild(initial);
        
        const cardInfo = document.createElement('div');
        cardInfo.className = 'card-info';
        
        const cardTitle = document.createElement('div');
        cardTitle.className = 'card-title';
        cardTitle.textContent = doc.title;
        
        const cardSubtitle = document.createElement('div');
        cardSubtitle.className = 'card-subtitle';
        cardSubtitle.textContent = `${displayType} • ${formattedDate}`;
        
        cardInfo.appendChild(cardTitle);
        cardInfo.appendChild(cardSubtitle);
        
        // NEW: If a search query is active, and (if title doesn't match) content does, display snippet.
        if (this.searchQuery !== '') {
            const titleMatch = doc.title.toLowerCase().includes(this.searchQuery);
            if (!titleMatch && doc.content) {
                const contentLower = doc.content.toLowerCase();
                const index = contentLower.indexOf(this.searchQuery);
                if (index !== -1) {
                    const start = Math.max(0, index - 20);
                    const end = Math.min(doc.content.length, index + 20);
                    let snippet = doc.content.substring(start, end);
                    snippet = `Matched in content: ...${snippet}...`;
                    const searchInfo = document.createElement('div');
                    searchInfo.className = 'search-info';
                    searchInfo.textContent = snippet;
                    cardInfo.appendChild(searchInfo);
                }
            }
        }
        
        card.appendChild(avatar);
        card.appendChild(cardInfo);
        
        card.addEventListener('click', () => {
            this.getAndOpenDocument(doc.id);
        });
        
        return card;
    }

    async getAndOpenDocument(id) {
        try {
            const document = await this.storage.getDocument(id);
            if (document) {
                this.openDocument(document);
            }
        } catch (error) {
            console.error('Error opening document:', error);
            this.showSnackbar('Error opening document', true);
        }
    }

    formatDate(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) {
            return 'Just now';
        } else if (diffMin < 60) {
            return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
        } else if (diffHour < 24) {
            return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
        } else if (diffDay < 7) {
            return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    getColorForType(type) {
        const colorMap = {
            'document': 'blue',
            'wiki': 'green',
            'list': 'orange',
            'interactive': 'purple',
            'fiction': 'red'
        };
        
        return colorMap[type.toLowerCase()] || 'blue';
    }

    showSnackbar(message, isError = false) {
        const existingSnackbar = document.querySelector('.snackbar');
        if (existingSnackbar) {
            existingSnackbar.remove();
        }
        
        const snackbar = document.createElement('div');
        snackbar.className = `snackbar ${isError ? 'error' : ''}`;
        snackbar.textContent = message;
        
        document.body.appendChild(snackbar);
        
        setTimeout(() => {
            snackbar.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            snackbar.classList.remove('show');
            setTimeout(() => {
                snackbar.remove();
            }, 300);
        }, 3000);
    }

    userHasNoDocuments() {
        const grid = document.querySelector('.documents-grid');
        return !grid.querySelector('.document-card');
    }

    showDocumentOptions(event) {
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }
        
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        
        const options = [
            { label: 'Rename', icon: 'drive_file_rename_outline', action: () => this.showRenameDialog() },
            { label: 'Delete', icon: 'delete', action: () => this.deleteCurrentDocument() }
        ];
        
        options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'menu-item';
            button.innerHTML = `
                <span class="material-symbols-rounded">${option.icon}</span>
                <span>${option.label}</span>
            `;
            button.addEventListener('click', option.action);
            menu.appendChild(button);
        });
        
        const buttonRect = event.target.closest('button').getBoundingClientRect();
        menu.style.top = buttonRect.bottom + 8 + 'px';
        menu.style.right = (window.innerWidth - buttonRect.right) + 'px';
        
        document.body.appendChild(menu);
        event.stopPropagation();
    }

    showRenameDialog() {
        const currentTitle = this.currentDocument.title;
        
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog rename-dialog">
                <div class="dialog-header">Rename Document</div>
                <div class="dialog-content">
                    <input type="text" class="rename-input" value="${currentTitle}" placeholder="Document title">
                </div>
                <div class="dialog-actions">
                    <button class="cancel-button">Cancel</button>
                    <button class="rename-button">Rename</button>
                </div>
            </div>
        `;
        
        const input = dialog.querySelector('.rename-input');
        input.select();
        
        dialog.querySelector('.cancel-button').addEventListener('click', () => {
            dialog.remove();
        });
        
        dialog.querySelector('.rename-button').addEventListener('click', async () => {
            const newTitle = input.value.trim();
            if (newTitle && newTitle !== currentTitle) {
                this.currentDocument.title = newTitle;
                this.editor.title.value = newTitle;
                await this.storage.updateDocument(this.currentDocument);
                this.loadDocuments();
                this.showSnackbar('Document renamed successfully');
            }
            dialog.remove();
        });
        
        document.body.appendChild(dialog);
    }

    async deleteCurrentDocument() {
        if (confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
            try {
                await this.storage.deleteDocument(this.currentDocument.id);
                this.closeEditor();
                this.loadDocuments();
                this.showSnackbar('Document deleted successfully');
            } catch (error) {
                console.error('Error deleting document:', error);
                this.showSnackbar('Error deleting document', true);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const documentManager = new DocumentManager();
    window.documentManager = documentManager;
});