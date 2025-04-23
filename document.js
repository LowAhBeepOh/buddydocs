// Document Management System for Buddy Docs

// IndexedDB setup
class DocumentStorage {
    constructor() {
        this.dbName = 'buddyDocsDB';
        this.dbVersion = 1;
        this.db = null;
        this.initDB();
    }

    // Initialize the database
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
                
                // Create object store for documents
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

    // Add a new document
    addDocument(doc) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readwrite');
            const store = transaction.objectStore('documents');
            
            // Add timestamp
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

    // Get all documents
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

    // Get a document by ID
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

    // Update a document
    updateDocument(doc) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['documents'], 'readwrite');
            const store = transaction.objectStore('documents');
            
            // Update timestamp
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

    // Delete a document
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

// Document Manager Class
class DocumentManager {
    constructor() {
        this.storage = new DocumentStorage();
        this.currentDocument = null;
        this.editor = null;
        this.documentTypes = ['Document', 'Wiki', 'List', 'Interactive', 'Fiction'];
        
        // Initialize UI elements
        this.initUI();
    }

    // Initialize UI elements and event listeners
    async initUI() {
        // Wait for DB to initialize
        await this.storage.initDB();
        
        // Add event listener to new button
        const newButton = document.querySelector('.new-button');
        if (newButton) {
            newButton.addEventListener('click', () => this.showNewDocumentDialog());
        }
        
        // Load existing documents
        this.loadDocuments();
        
        // Initialize editor container
        this.createEditorContainer();
    }

    // Create editor container
    createEditorContainer() {
        const appContainer = document.querySelector('.app-container');
        
        // Create editor container if it doesn't exist
        if (!document.querySelector('.editor-container')) {
            const editorContainer = document.createElement('div');
            editorContainer.className = 'editor-container';
            editorContainer.style.display = 'none';
            
            // Editor header
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
            
            const saveButton = document.createElement('button');
            saveButton.className = 'save-button';
            saveButton.textContent = 'Save';
            saveButton.addEventListener('click', () => this.saveDocument());
            
            editorHeader.appendChild(backButton);
            editorHeader.appendChild(titleInput);
            editorHeader.appendChild(saveButton);
            
            // Editor content
            const editorContent = document.createElement('div');
            editorContent.className = 'editor-content';
            editorContent.contentEditable = 'true';
            editorContent.setAttribute('placeholder', 'Start typing your document here...');
            
            // Add to container
            editorContainer.appendChild(editorHeader);
            editorContainer.appendChild(editorContent);
            
            appContainer.appendChild(editorContainer);
            
            // Set editor reference
            this.editor = {
                container: editorContainer,
                title: titleInput,
                content: editorContent
            };
        }
    }

    // Show new document dialog
    showNewDocumentDialog() {
        // Create dialog overlay
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        
        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'dialog new-document-dialog';
        
        // Dialog header
        const dialogHeader = document.createElement('div');
        dialogHeader.className = 'dialog-header';
        dialogHeader.textContent = 'Create New Document';
        
        // Dialog content
        const dialogContent = document.createElement('div');
        dialogContent.className = 'dialog-content';
        
        // Title input
        const titleLabel = document.createElement('label');
        titleLabel.textContent = 'Title';
        titleLabel.setAttribute('for', 'document-title');
        
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.id = 'document-title';
        titleInput.className = 'document-title-input';
        titleInput.placeholder = 'Enter document title';
        
        // Document type selection
        const typeLabel = document.createElement('label');
        typeLabel.textContent = 'Document Type';
        typeLabel.setAttribute('for', 'document-type');
        
        const typeSelect = document.createElement('select');
        typeSelect.id = 'document-type';
        typeSelect.className = 'document-type-select';
        
        this.documentTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.toLowerCase();
            option.textContent = type;
            typeSelect.appendChild(option);
        });
        
        // Dialog actions
        const dialogActions = document.createElement('div');
        dialogActions.className = 'dialog-actions';
        
        const cancelButton = document.createElement('button');
        cancelButton.className = 'cancel-button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        
        const createButton = document.createElement('button');
        createButton.className = 'create-button';
        createButton.textContent = 'Create';
        createButton.addEventListener('click', () => {
            const title = titleInput.value.trim();
            const type = typeSelect.value;
            
            if (title) {
                this.createNewDocument(title, type);
                document.body.removeChild(overlay);
            } else {
                titleInput.classList.add('error');
                setTimeout(() => titleInput.classList.remove('error'), 1000);
            }
        });
        
        // Assemble dialog
        dialogContent.appendChild(titleLabel);
        dialogContent.appendChild(titleInput);
        dialogContent.appendChild(typeLabel);
        dialogContent.appendChild(typeSelect);
        
        dialogActions.appendChild(cancelButton);
        dialogActions.appendChild(createButton);
        
        dialog.appendChild(dialogHeader);
        dialog.appendChild(dialogContent);
        dialog.appendChild(dialogActions);
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Focus title input
        titleInput.focus();
        
        // Add ripple effect to buttons
        [cancelButton, createButton].forEach(button => {
            button.addEventListener('click', createRipple);
        });
        
        // Add animation
        dialog.style.transform = 'scale(0.9)';
        dialog.style.opacity = '0';
        
        setTimeout(() => {
            dialog.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            dialog.style.transform = 'scale(1)';
            dialog.style.opacity = '1';
        }, 10);
    }

    // Create a new document
    async createNewDocument(title, type) {
        const newDoc = {
            title: title,
            type: type,
            content: '',
            author: 'You' // In a real app, this would be the current user
        };
        
        try {
            const id = await this.storage.addDocument(newDoc);
            newDoc.id = id;
            this.openDocument(newDoc);
            this.loadDocuments(); // Refresh document list
            
            // Show success message
            this.showSnackbar(`Created new ${type}: ${title}`);
        } catch (error) {
            console.error('Error creating document:', error);
            this.showSnackbar('Error creating document', true);
        }
    }

    // Open a document in the editor
    openDocument(doc) {
        this.currentDocument = doc;
        
        // Update editor
        this.editor.title.value = doc.title;
        this.editor.content.innerHTML = doc.content;
        
        // Get references to sections
        const documentsGrid = document.querySelector('.documents-grid');
        const filterSection = document.querySelector('.filter-section');
        let notificationSection = document.querySelector('.notification-section');
        
        // Create notification section if it doesn't exist
        if (!notificationSection) {
            notificationSection = document.createElement('div');
            notificationSection.className = 'notification-section';
            documentsGrid.parentNode.insertBefore(notificationSection, documentsGrid.nextSibling);
        }
        
        // Hide main view and show editor
        if (documentsGrid) documentsGrid.style.display = 'none';
        if (filterSection) filterSection.style.display = 'none';
        if (notificationSection) notificationSection.style.display = 'none';
        
        this.editor.container.style.display = 'flex';
        this.editor.content.focus();
    }

    // Close the editor and return to main view
    closeEditor() {
        // Confirm if there are unsaved changes
        if (this.hasUnsavedChanges()) {
            if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
                return;
            }
        }
        
        // Hide editor and show main view
        this.editor.container.style.display = 'none';
        document.querySelector('.documents-grid').style.display = 'grid';
        document.querySelector('.filter-section').style.display = 'block';
        
        // Only show notification section if there are no user documents
        if (this.userHasNoDocuments()) {
            document.querySelector('.notification-section').style.display = 'grid';
        }
        
        this.currentDocument = null;
    }

    // Check if there are unsaved changes
    hasUnsavedChanges() {
        if (!this.currentDocument) return false;
        
        const currentTitle = this.editor.title.value;
        const currentContent = this.editor.content.innerHTML;
        
        return currentTitle !== this.currentDocument.title || 
               currentContent !== this.currentDocument.content;
    }

    // Save the current document
    async saveDocument() {
        if (!this.currentDocument) return;
        
        // Update document with current values
        this.currentDocument.title = this.editor.title.value;
        this.currentDocument.content = this.editor.content.innerHTML;
        
        try {
            await this.storage.updateDocument(this.currentDocument);
            this.loadDocuments(); // Refresh document list
            this.showSnackbar('Document saved successfully');
        } catch (error) {
            console.error('Error saving document:', error);
            this.showSnackbar('Error saving document', true);
        }
    }

    // Load documents from storage and display them
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

    // Render documents in the grid
    renderDocuments(docs) {
        const grid = document.querySelector('.documents-grid');
        const notificationSection = document.querySelector('.notification-section');
        
        if (!grid) return;
        
        // Clear the entire grid first
        grid.innerHTML = '';
        
        // If no documents, create the original demo layout
        if (docs.length === 0) {
            grid.classList.remove('user-documents-grid');
            if (notificationSection) {
                notificationSection.style.display = 'grid';
            }
            this.createDemoLayout(grid);
            return;
        }
        
        // Hide notification section and set user documents grid
        if (notificationSection) {
            notificationSection.style.display = 'none';
        }
        grid.classList.add('user-documents-grid');
        
        // Sort documents by last modified date (newest first)
        docs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        
        // Create new document cards
        docs.forEach(doc => {
            const card = this.createDocumentCard(doc);
            grid.appendChild(card);
        });
        
        // Add a smooth transition effect
        setTimeout(() => {
            document.querySelectorAll('.document-card').forEach(card => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            });
        }, 10);
        
        // Re-initialize ripple effects
        initRippleEffect();
    }

    // Helper method to create the demo layout
    createDemoLayout(grid) {
        // Create left large card
        const largeCard = document.createElement('div');
        largeCard.className = 'card large-card';
        largeCard.innerHTML = `
            <div class="content-section">
                <div class="card-header">
                    <div class="avatar purple">
                        <span class="material-symbols-rounded">book</span>
                    </div>
                    <div class="card-info">
                        <div class="card-title">Welcome!</div>
                        <div class="card-subtitle">Get started by pressing "New"</div>
                    </div>
                </div>
            </div>
            <div class="image-section">
                <img src="data/assets/welcomeCanvasImage.png" alt="Welcome canvas">
            </div>
        `;

        // Create middle mini-cards column
        const miniCardsColumn = document.createElement('div');
        miniCardsColumn.className = 'mini-cards-column';

        // Mini card 1
        const miniCard1 = document.createElement('div');
        miniCard1.className = 'card mini-card';
        miniCard1.innerHTML = `
            <div class="avatar orange">
                <span class="material-symbols-rounded">list_alt</span>
            </div>
            <div class="card-info">
                <div class="card-title">List</div>
                <div class="card-subtitle">Make a list of stuff</div>
            </div>
        `;

        // Mini card 2
        const miniCard2 = document.createElement('div');
        miniCard2.className = 'card mini-card';
        miniCard2.innerHTML = `
            <div class="avatar green">
                <span class="material-symbols-rounded">travel_explore</span>
            </div>
            <div class="card-info">
                <div class="card-title">Wiki</div>
                <div class="card-subtitle">Create a knowledge base</div>
            </div>
        `;

        // Mini card 3
        const miniCard3 = document.createElement('div');
        miniCard3.className = 'card mini-card';
        miniCard3.innerHTML = `
            <div class="avatar blue">
                <span class="material-symbols-rounded">waving_hand</span>
            </div>
            <div class="card-info">
                <div class="card-title">Interactives</div>
                <div class="card-subtitle">Make interactive pages (soon)</div>
            </div>
        `;

        // Mini card 4
        const miniCard4 = document.createElement('div');
        miniCard4.className = 'card mini-card';
        miniCard4.innerHTML = `
            <div class="avatar red">
                <span class="material-symbols-rounded">task</span>
            </div>
            <div class="card-info">
                <div class="card-title">Buddy Docs</div>
                <div class="card-subtitle">For students - Version 0.XA (Beta)</div>
            </div>
        `;

        miniCardsColumn.appendChild(miniCard1);
        miniCardsColumn.appendChild(miniCard2);
        miniCardsColumn.appendChild(miniCard3);
        miniCardsColumn.appendChild(miniCard4);

        // Add all cards to grid
        grid.appendChild(largeCard);
        grid.appendChild(miniCardsColumn);

        // Initialize ripple effects for the new cards
        initRippleEffect();
    }

    // Create a document card element
    createDocumentCard(doc) {
        const card = document.createElement('div');
        card.className = 'card mini-card document-card';
        card.setAttribute('data-id', doc.id);
        
        // Add initial styles for animation
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        // Format date
        const date = new Date(doc.lastModified);
        const formattedDate = this.formatDate(date);
        
        // Create avatar with initial
        const avatar = document.createElement('div');
        avatar.className = `avatar ${this.getColorForType(doc.type)}`;
        avatar.setAttribute('data-initial', doc.title.charAt(0).toUpperCase());
        
        const initial = document.createElement('span');
        initial.textContent = doc.title.charAt(0).toUpperCase();
        avatar.appendChild(initial);
        
        // Card info
        const cardInfo = document.createElement('div');
        cardInfo.className = 'card-info';
        
        const cardTitle = document.createElement('div');
        cardTitle.className = 'card-title';
        cardTitle.textContent = doc.title;
        
        const cardSubtitle = document.createElement('div');
        cardSubtitle.className = 'card-subtitle';
        cardSubtitle.textContent = `${doc.type} • ${formattedDate}`;
        
        cardInfo.appendChild(cardTitle);
        cardInfo.appendChild(cardSubtitle);
        
        card.appendChild(avatar);
        card.appendChild(cardInfo);
        
        // Add click event to open document
        card.addEventListener('click', () => {
            this.getAndOpenDocument(doc.id);
        });
        
        return card;
    }

    // Get document by ID and open it
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

    // Format date for display
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

    // Get color class based on document type
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

    // Show a snackbar message
    showSnackbar(message, isError = false) {
        // Remove existing snackbar
        const existingSnackbar = document.querySelector('.snackbar');
        if (existingSnackbar) {
            existingSnackbar.remove();
        }
        
        // Create new snackbar
        const snackbar = document.createElement('div');
        snackbar.className = `snackbar ${isError ? 'error' : ''}`;
        snackbar.textContent = message;
        
        document.body.appendChild(snackbar);
        
        // Show snackbar
        setTimeout(() => {
            snackbar.classList.add('show');
        }, 10);
        
        // Hide snackbar after 3 seconds
        setTimeout(() => {
            snackbar.classList.remove('show');
            setTimeout(() => {
                snackbar.remove();
            }, 300);
        }, 3000);
    }

    // Helper method to check if user has no documents
    userHasNoDocuments() {
        const grid = document.querySelector('.documents-grid');
        return !grid.querySelector('.document-card');
    }
}

// Initialize document manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const documentManager = new DocumentManager();
    
    // Make available globally for debugging
    window.documentManager = documentManager;
});