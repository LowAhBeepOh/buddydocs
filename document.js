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
                    store.createIndex('deadline', 'deadline', { unique: false });
                    store.createIndex('completed', 'completed', { unique: false });
                    console.log('Object store created');
                }
            };
        });
    }

    addDocument(doc) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                this.initDB().then(db => {
                    this.db = db;
                    this._addDocumentToDB(doc, resolve, reject);
                }).catch(err => {
                    console.error('Failed to initialize database:', err);
                    reject(err);
                });
            } else {
                this._addDocumentToDB(doc, resolve, reject);
            }
        });
    }
    
    _addDocumentToDB(doc, resolve, reject) {
        try {
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
        } catch (err) {
            console.error('Error accessing database:', err);
            reject(err);
        }
    }

    getAllDocuments() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                this.initDB().then(db => {
                    this.db = db;
                    this._getAllDocumentsFromDB(resolve, reject);
                }).catch(err => {
                    console.error('Failed to initialize database:', err);
                    reject(err);
                });
            } else {
                this._getAllDocumentsFromDB(resolve, reject);
            }
        });
    }
    
    _getAllDocumentsFromDB(resolve, reject) {
        try {
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
        } catch (err) {
            console.error('Error accessing database:', err);
            reject(err);
        }
    }

    getDocument(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                this.initDB().then(db => {
                    this.db = db;
                    this._getDocumentFromDB(id, resolve, reject);
                }).catch(err => {
                    console.error('Failed to initialize database:', err);
                    reject(err);
                });
            } else {
                this._getDocumentFromDB(id, resolve, reject);
            }
        });
    }
    
    _getDocumentFromDB(id, resolve, reject) {
        try {
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
        } catch (err) {
            console.error('Error accessing database:', err);
            reject(err);
        }
    }

    updateDocument(doc) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                this.initDB().then(db => {
                    this.db = db;
                    this._updateDocumentInDB(doc, resolve, reject);
                }).catch(err => {
                    console.error('Failed to initialize database:', err);
                    reject(err);
                });
            } else {
                this._updateDocumentInDB(doc, resolve, reject);
            }
        });
    }
    
    _updateDocumentInDB(doc, resolve, reject) {
        try {
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
        } catch (err) {
            console.error('Error accessing database:', err);
            reject(err);
        }
    }

    deleteDocument(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                this.initDB().then(db => {
                    this.db = db;
                    this._deleteDocumentFromDB(id, resolve, reject);
                }).catch(err => {
                    console.error('Failed to initialize database:', err);
                    reject(err);
                });
            } else {
                this._deleteDocumentFromDB(id, resolve, reject);
            }
        });
    }
    
    _deleteDocumentFromDB(id, resolve, reject) {
        try {
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
        } catch (err) {
            console.error('Error accessing database:', err);
            reject(err);
        }
    }
}

class DocumentManager {
    constructor() {
        this.storage = new DocumentStorage();
        this.currentDocument = null;
        this.editor = null;
        this.documentTypes = ['Document', 'Wiki', 'List', 'Interactive', 'Fiction'];
        this.currentFilter = 'all';
        this.searchQuery = '';
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
        const editorPage = document.querySelector('.editor-page');
        
        if (editorPage || !appContainer) {
            console.log('Editor container not created: already on editor page or app container not found');
            return;
        }
        
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
        if (doc.type === 'interactive') {
            window.location.href = `interactive-viewer.html?id=${doc.id}`;
        } else {
            window.location.href = `editor.html?id=${doc.id}`;
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
        
        if (this.currentFilter !== 'all') {
            docs = docs.filter(doc => doc.type.toLowerCase() === this.currentFilter);
        }
        
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
        
        // Sort documents: deadlines (not completed) first, then pinned, then by last modified date
        docs.sort((a, b) => {
            // First priority: documents with deadlines that aren't completed
            const aHasActiveDeadline = a.deadline && !a.completed;
            const bHasActiveDeadline = b.deadline && !b.completed;
            
            if (aHasActiveDeadline && !bHasActiveDeadline) return -1;
            if (!aHasActiveDeadline && bHasActiveDeadline) return 1;
            
            // If both have active deadlines, sort by closest deadline first
            if (aHasActiveDeadline && bHasActiveDeadline) {
                return new Date(a.deadline) - new Date(b.deadline);
            }
            
            // Second priority: pinned status
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            
            // Third priority: last modified date
            return new Date(b.lastModified) - new Date(a.lastModified);
        });
        
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

    filterDocuments(filter) {
        this.currentFilter = filter.toLowerCase();
        this.loadDocuments();
    }

    createDocumentCard(doc) {
        const card = document.createElement('div');
        card.className = 'card mini-card document-card';
        card.setAttribute('data-id', doc.id);
        
        if (doc.pinned) {
            card.classList.add('pinned');
        }
        
        // Add class for documents with deadlines
        if (doc.deadline) {
            card.classList.add('has-deadline');
            if (doc.completed) {
                card.classList.add('deadline-completed');
            }
        }
        
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        // Determine what date to show (deadline or last modified)
        let dateText;
        if (doc.deadline && !doc.completed) {
            const deadlineDate = new Date(doc.deadline);
            const now = new Date();
            const diffTime = deadlineDate - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                dateText = `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`;
                card.classList.add('deadline-overdue');
            } else if (diffDays === 0) {
                dateText = 'Due today';
                card.classList.add('deadline-today');
            } else {
                dateText = `${diffDays} day${diffDays !== 1 ? 's' : ''} left`;
            }
        } else if (doc.deadline && doc.completed) {
            dateText = 'Completed';
        } else {
            const date = new Date(doc.lastModified);
            dateText = this.formatDate(date);
        }
        
        const displayType = doc.type.charAt(0).toUpperCase() + doc.type.slice(1);
        
        const avatar = document.createElement('div');
        avatar.className = `avatar ${this.getColorForType(doc.type)}`;
        avatar.setAttribute('data-initial', doc.title.charAt(0).toUpperCase());
        
        const initial = document.createElement('span');
        initial.textContent = doc.title.charAt(0).toUpperCase();
        avatar.appendChild(initial);
        
        // Add indicators
        if (doc.pinned) {
            const pinIndicator = document.createElement('div');
            pinIndicator.className = 'pin-indicator';
            pinIndicator.innerHTML = '📌';
            avatar.appendChild(pinIndicator);
        }
        
        if (doc.deadline && !doc.completed) {
            const deadlineIndicator = document.createElement('div');
            deadlineIndicator.className = 'deadline-indicator';
            deadlineIndicator.innerHTML = '<span class="material-symbols-rounded">assignment_late</span>';
            deadlineIndicator.style.position = 'absolute';
            deadlineIndicator.style.top = '5px';
            deadlineIndicator.style.right = '5px';
            deadlineIndicator.style.color = '#ff4d00';
            deadlineIndicator.style.fontSize = '18px';
            avatar.appendChild(deadlineIndicator);
        } else if (doc.deadline && doc.completed) {
            const completedIndicator = document.createElement('div');
            completedIndicator.className = 'completed-indicator';
            completedIndicator.innerHTML = '<span class="material-symbols-rounded">task_alt</span>';
            completedIndicator.style.position = 'absolute';
            completedIndicator.style.top = '5px';
            completedIndicator.style.right = '5px';
            completedIndicator.style.color = '#4caf50';
            completedIndicator.style.fontSize = '18px';
            avatar.appendChild(completedIndicator);
        }
        
        const cardInfo = document.createElement('div');
        cardInfo.className = 'card-info';
        
        const cardTitle = document.createElement('div');
        cardTitle.className = 'card-title';
        cardTitle.textContent = doc.title;
        
        const cardSubtitle = document.createElement('div');
        cardSubtitle.className = 'card-subtitle';
        cardSubtitle.textContent = `${displayType} • ${dateText}`;
        
        // Add special styling for deadlines
        if (doc.deadline && !doc.completed) {
            if (card.classList.contains('deadline-overdue')) {
                cardSubtitle.style.color = '#ff4d00';
                cardSubtitle.style.fontWeight = 'bold';
            } else if (card.classList.contains('deadline-today')) {
                cardSubtitle.style.color = '#ff9800';
                cardSubtitle.style.fontWeight = 'bold';
            }
        }
        
        cardInfo.appendChild(cardTitle);
        cardInfo.appendChild(cardSubtitle);
        
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
        
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, doc);
        });
        
        return card;
    }

    showContextMenu(event, doc) {
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.style.position = 'fixed';
        contextMenu.style.left = event.clientX + 'px';
        contextMenu.style.top = event.clientY + 'px';
        contextMenu.style.zIndex = '1000';
        contextMenu.style.backgroundColor = 'var(--md-sys-color-surface-container)';
        contextMenu.style.border = '1px solid var(--md-sys-color-outline-variant)';
        contextMenu.style.borderRadius = '12px';
        contextMenu.style.boxShadow = 'var(--md-sys-elevation-level2)';
        contextMenu.style.minWidth = '120px';
        contextMenu.style.overflow = 'hidden';

        // Add Mark Done/Mark Undone option for documents with deadlines
        if (doc.deadline) {
            const completionOption = document.createElement('div');
            completionOption.className = 'context-menu-item';
            completionOption.style.padding = '12px 16px';
            completionOption.style.cursor = 'pointer';
            completionOption.style.display = 'flex';
            completionOption.style.alignItems = 'center';
            completionOption.style.gap = '12px';
            completionOption.style.fontSize = '14px';
            completionOption.style.color = 'var(--md-sys-color-on-surface)';
            completionOption.style.transition = 'background-color 0.2s';
            
            const completionIcon = document.createElement('span');
            completionIcon.className = 'material-symbols-rounded';
            completionIcon.style.fontSize = '16px';
            completionIcon.textContent = doc.completed ? 'remove_done' : 'task_alt';
            
            const completionText = document.createElement('span');
            completionText.textContent = doc.completed ? 'Mark Undone' : 'Mark Done';
            
            completionOption.appendChild(completionIcon);
            completionOption.appendChild(completionText);
            
            completionOption.addEventListener('mouseenter', () => {
                completionOption.style.backgroundColor = 'var(--md-sys-color-surface-container-high)';
            });
            
            completionOption.addEventListener('mouseleave', () => {
                completionOption.style.backgroundColor = 'transparent';
            });
            
            completionOption.addEventListener('click', () => {
                this.toggleDocumentCompletion(doc);
                contextMenu.remove();
            });
            
            contextMenu.appendChild(completionOption);
        }

        const pinOption = document.createElement('div');
        pinOption.className = 'context-menu-item';
        pinOption.style.padding = '12px 16px';
        pinOption.style.cursor = 'pointer';
        pinOption.style.display = 'flex';
        pinOption.style.alignItems = 'center';
        pinOption.style.gap = '12px';
        pinOption.style.fontSize = '14px';
        pinOption.style.color = 'var(--md-sys-color-on-surface)';
        pinOption.style.transition = 'background-color 0.2s';
        
        const pinIcon = document.createElement('span');
        pinIcon.style.fontSize = '16px';
        pinIcon.textContent = doc.pinned ? '📌' : '📌';
        
        const pinText = document.createElement('span');
        pinText.textContent = doc.pinned ? 'Unpin' : 'Pin to top';
        
        pinOption.appendChild(pinIcon);
        pinOption.appendChild(pinText);
        
        pinOption.addEventListener('mouseenter', () => {
            pinOption.style.backgroundColor = 'var(--md-sys-color-surface-container-high)';
        });
        
        pinOption.addEventListener('mouseleave', () => {
            pinOption.style.backgroundColor = 'transparent';
        });
        
        pinOption.addEventListener('click', () => {
            this.togglePinDocument(doc);
            contextMenu.remove();
        });

        const deleteOption = document.createElement('div');
        deleteOption.className = 'context-menu-item';
        deleteOption.style.padding = '12px 16px';
        deleteOption.style.cursor = 'pointer';
        deleteOption.style.display = 'flex';
        deleteOption.style.alignItems = 'center';
        deleteOption.style.gap = '12px';
        deleteOption.style.fontSize = '14px';
        deleteOption.style.color = 'var(--md-sys-color-error)';
        deleteOption.style.transition = 'background-color 0.2s';
        
        const deleteIcon = document.createElement('span');
        deleteIcon.style.fontSize = '16px';
        deleteIcon.textContent = '🗑️';
        
        const deleteText = document.createElement('span');
        deleteText.textContent = 'Delete';
        
        deleteOption.appendChild(deleteIcon);
        deleteOption.appendChild(deleteText);
        
        deleteOption.addEventListener('mouseenter', () => {
            deleteOption.style.backgroundColor = 'var(--md-sys-color-error-container)';
        });
        
        deleteOption.addEventListener('mouseleave', () => {
            deleteOption.style.backgroundColor = 'transparent';
        });
        
        deleteOption.addEventListener('click', () => {
            this.deleteDocumentFromCard(doc);
            contextMenu.remove();
        });

        contextMenu.appendChild(pinOption);
        contextMenu.appendChild(deleteOption);
        document.body.appendChild(contextMenu);

        const closeMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    async togglePinDocument(doc) {
        try {
            doc.pinned = !doc.pinned;
            await this.storage.updateDocument(doc);
            this.loadDocuments();
            const action = doc.pinned ? 'pinned' : 'unpinned';
            this.showSnackbar(`Document ${action} successfully`);
        } catch (error) {
            console.error('Error toggling pin status:', error);
            this.showSnackbar('Error updating document', true);
        }
    }

    async deleteDocumentFromCard(doc) {
        if (confirm(`Are you sure you want to delete "${doc.title}"? This action cannot be undone.`)) {
            try {
                await this.storage.deleteDocument(doc.id);
                this.loadDocuments();
                this.showSnackbar('Document deleted successfully');
            } catch (error) {
                console.error('Error deleting document:', error);
                this.showSnackbar('Error deleting document', true);
            }
        }
    }
    
    async toggleDocumentCompletion(doc) {
        try {
            doc.completed = !doc.completed;
            await this.storage.updateDocument(doc);
            this.loadDocuments();
            const action = doc.completed ? 'marked as done' : 'marked as not done';
            this.showSnackbar(`Document ${action} successfully`);
        } catch (error) {
            console.error('Error toggling document completion status:', error);
            this.showSnackbar('Error updating document', true);
        }
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

    createDemoLayout(grid) {
        // Create welcome container
        const welcomeContainer = document.createElement('div');
        welcomeContainer.className = 'welcome-container';
        welcomeContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            text-align: center;
            min-height: 400px;
            gap: 40px;
        `;

        // Create welcome content section
        const welcomeContent = document.createElement('div');
        welcomeContent.className = 'welcome-content';
        welcomeContent.style.cssText = `
            display: flex;
            align-items: center;
            gap: 60px;
            max-width: 1000px;
            width: 100%;
        `;

        // Create left side with welcome text and demo cards
        const leftSide = document.createElement('div');
        leftSide.className = 'welcome-left';
        leftSide.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 40px;
        `;

        // Welcome text section
        const welcomeText = document.createElement('div');
        welcomeText.className = 'welcome-text';
        welcomeText.innerHTML = `
            <h1 style="
                font-size: 32px;
                font-weight: 500;
                color: var(--md-sys-color-on-surface);
                margin: 0 0 16px 0;
                font-family: 'Inter Tight', sans-serif;
            ">Welcome to Buddy Docs!</h1>
            <p style="
                font-size: 18px;
                color: var(--md-sys-color-on-surface-variant);
                margin: 0 0 24px 0;
                line-height: 1.5;
            ">Let's get started</p>
            <div style="
                text-align: left;
                color: var(--md-sys-color-on-surface-variant);
                font-size: 16px;
                line-height: 1.6;
            ">
                <p style="margin: 8px 0;">• Create different types of docs</p>
                <p style="margin: 8px 0;">• Summarize documents</p>
                <p style="margin: 8px 0;">• Less lag on old laptops</p>
                <p style="margin: 8px 0;">• Personalized to you</p>
                <p style="margin: 8px 0;">• Many customization options</p>
                <p style="margin: 8px 0;">• No tracking, and no login needed</p>
                <p style="margin: 8px 0;">• Put deadlines on documents</p>
                <p style="margin: 8px 0;">• Easily export to Google Docs</p>
                <p style="margin: 8px 0;">• Integrated with apps from us</p>
                <p style="margin: 8px 0;">• Make interactive documents</p>
            </div>
        `;

        // Demo cards section
        const demoCards = document.createElement('div');
        demoCards.className = 'demo-cards';
        demoCards.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 20px;
        `;

        // Create demo document cards
        const demoCardData = [
            { title: 'Try making a document!', subtitle: 'Get Started', avatar: '📝', color: '#FF4D00' },
            { title: 'Edit your profile', subtitle: 'Get Started', avatar: '👤', color: '#FF4D00' },
            { title: 'Customize the app', subtitle: 'Get Started', avatar: '⚙️', color: '#FF4D00' },
            { title: 'Buddy Docs', subtitle: 'In development - ver 0.0.6', avatar: '🚀', color: '#FF4D00' }
        ];

        demoCardData.forEach(cardData => {
            const card = document.createElement('div');
            card.className = 'demo-card';
            card.style.cssText = `
                width: 300px;
                height: 80px;
                background: var(--md-sys-color-surface-container-low);
                border: 1px solid var(--md-sys-color-outline-variant);
                border-radius: 12px;
                display: flex;
                align-items: center;
                padding: 16px;
                gap: 16px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;

            card.innerHTML = `
                <div style="
                    width: 40px;
                    height: 40px;
                    background: ${cardData.color};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                ">${cardData.avatar}</div>
                <div style="flex: 1;">
                    <div style="
                        font-size: 16px;
                        font-weight: 500;
                        color: var(--md-sys-color-on-surface);
                        margin-bottom: 4px;
                    ">${cardData.title}</div>
                    <div style="
                        font-size: 14px;
                        color: var(--md-sys-color-on-surface-variant);
                    ">${cardData.subtitle}</div>
                </div>
            `;

            card.addEventListener('mouseenter', () => {
                card.style.backgroundColor = 'var(--md-sys-color-surface-container)';
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = 'var(--md-sys-elevation-level2)';
            });

            card.addEventListener('mouseleave', () => {
                card.style.backgroundColor = 'var(--md-sys-color-surface-container-low)';
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = 'none';
            });

            // Add click handler for the first card to open new document dialog
            if (cardData.title === 'Try making a document!') {
                card.addEventListener('click', () => {
                    this.showNewDocumentDialog();
                });
            }

            demoCards.appendChild(card);
        });

        // Right side with welcome image
        const rightSide = document.createElement('div');
        rightSide.className = 'welcome-right';
        rightSide.style.cssText = `
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const welcomeImage = document.createElement('img');
        welcomeImage.src = 'data/assets/welcomeCanvasImage.png';
        welcomeImage.alt = 'Welcome to Buddy Docs';
        welcomeImage.style.cssText = `
            width: 300px;
            height: 300px;
            object-fit: contain;
            border-radius: 12px;
        `;

        // Handle image load error
        welcomeImage.addEventListener('error', () => {
            // Create a placeholder if image fails to load
            const placeholder = document.createElement('div');
            placeholder.style.cssText = `
                width: 300px;
                height: 300px;
                background: linear-gradient(135deg, var(--md-sys-color-primary-container), var(--md-sys-color-tertiary-container));
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 64px;
                color: var(--md-sys-color-on-primary-container);
            `;
            placeholder.textContent = '📚';
            rightSide.replaceChild(placeholder, welcomeImage);
        });

        rightSide.appendChild(welcomeImage);

        // Assemble the layout
        leftSide.appendChild(welcomeText);
        leftSide.appendChild(demoCards);
        welcomeContent.appendChild(leftSide);
        welcomeContent.appendChild(rightSide);
        welcomeContainer.appendChild(welcomeContent);

        // Add responsive styles
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const handleResponsive = (e) => {
            if (e.matches) {
                welcomeContent.style.flexDirection = 'column';
                welcomeContent.style.gap = '40px';
                leftSide.style.alignItems = 'center';
                welcomeText.style.textAlign = 'center';
            } else {
                welcomeContent.style.flexDirection = 'row';
                welcomeContent.style.gap = '60px';
                leftSide.style.alignItems = 'stretch';
                welcomeText.style.textAlign = 'left';
            }
        };
        
        handleResponsive(mediaQuery);
        mediaQuery.addListener(handleResponsive);

        grid.appendChild(welcomeContainer);
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

    showNewDocumentDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <div class="dialog-header">Create New Document</div>
                <div class="dialog-content">
                    <input type="text" class="create-input" placeholder="Document title">
                    <select class="type-select">
                        ${this.documentTypes.map(type => 
                            `<option value="${type.toLowerCase()}">${type}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="dialog-actions">
                    <button class="cancel-button">Cancel</button>
                    <button class="create-button">Create</button>
                </div>
            </div>
        `;

        const input = dialog.querySelector('.create-input');
        const select = dialog.querySelector('.type-select');

        dialog.querySelector('.cancel-button').addEventListener('click', () => {
            dialog.remove();
        });

        dialog.querySelector('.create-button').addEventListener('click', async () => {
            const title = input.value.trim();
            if (!title) {
                input.classList.add('error');
                setTimeout(() => input.classList.remove('error'), 300);
                return;
            }

            const doc = {
                title: title,
                type: select.value,
                content: ''
            };

            try {
                const id = await this.storage.addDocument(doc);
                doc.id = id;
                this.loadDocuments();
                dialog.remove();
                this.openDocument(doc);
                this.showSnackbar('Document created successfully');
            } catch (error) {
                console.error('Error creating document:', error);
                this.showSnackbar('Error creating document', true);
            }
        });

        document.body.appendChild(dialog);
        input.focus();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const documentManager = new DocumentManager();
    window.documentManager = documentManager;
});