// IndexedDB Service for data management
class IndexedDBService {
    constructor() {
        this.dbName = 'BuddyDocsDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // User Profile store
                if (!db.objectStoreNames.contains('userProfile')) {
                    const userStore = db.createObjectStore('userProfile', { keyPath: 'id' });
                    userStore.createIndex('id', 'id', { unique: true });
                }
                
                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    const settingsStore = db.createObjectStore('settings', { keyPath: 'id' });
                    settingsStore.createIndex('id', 'id', { unique: true });
                }
                
                // Documents store
                if (!db.objectStoreNames.contains('documents')) {
                    const documentsStore = db.createObjectStore('documents', { keyPath: 'id' });
                    documentsStore.createIndex('id', 'id', { unique: true });
                }
            };
        });
    }

    async saveUserProfile(profile) {
        const transaction = this.db.transaction(['userProfile'], 'readwrite');
        const store = transaction.objectStore('userProfile');
        return store.put({ id: 'current', ...profile });
    }

    async getUserProfile() {
        const transaction = this.db.transaction(['userProfile'], 'readonly');
        const store = transaction.objectStore('userProfile');
        const request = store.get('current');
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || {});
            request.onerror = () => reject(request.error);
        });
    }

    async saveSettings(settings) {
        const transaction = this.db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        return store.put({ id: 'current', ...settings });
    }

    async getSettings() {
        const transaction = this.db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('current');
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || {});
            request.onerror = () => reject(request.error);
        });
    }

    async saveDocument(document) {
        const transaction = this.db.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');
        return store.put(document);
    }

    async getAllDocuments() {
        const transaction = this.db.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const request = store.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteUserProfile() {
        const transaction = this.db.transaction(['userProfile'], 'readwrite');
        const store = transaction.objectStore('userProfile');
        return store.delete('current');
    }

    async deleteSettings() {
        const transaction = this.db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        return store.delete('current');
    }

    async deleteAllDocuments() {
        const transaction = this.db.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');
        return store.clear();
    }

    async exportData() {
        const [userProfile, settings, documents] = await Promise.all([
            this.getUserProfile(),
            this.getSettings(),
            this.getAllDocuments()
        ]);

        return {
            userProfile,
            settings,
            documents,
            exportDate: new Date().toISOString()
        };
    }
}

// Global IndexedDB service instance
const dbService = new IndexedDBService();

function createRipple(event) {
    const button = event.currentTarget;
    
    const ripple = button.querySelector('.ripple');
    if (ripple) {
        ripple.remove();
    }
    
    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
    circle.classList.add('ripple');
    
    button.appendChild(circle);
    
    setTimeout(() => {
        if (circle) {
            circle.remove();
        }
    }, 600);
}

function initRippleEffect() {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', createRipple);
    });
    
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('click', function() {
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
}

function initStateAnimations() {
    const interactiveElements = document.querySelectorAll('.card, button, .filter-dropdown, .search-button');
    
    interactiveElements.forEach(element => {
        element.addEventListener('mouseenter', function() {
            this.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        });
        
        element.addEventListener('mouseleave', function() {
            this.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        });
    });
}

function initNotificationInteractions() {
    const closeButton = document.querySelector('.close-button');
    if (closeButton) {
        closeButton.addEventListener('click', function(e) {
            e.stopPropagation();
            const planCard = document.querySelector('.plan-card');
            if (planCard) {
                planCard.style.animation = 'fadeOut 0.3s ease-out forwards';
                setTimeout(() => {
                    planCard.style.display = 'none';
                }, 300);
            }
        });
    }
    
    const actionButtons = document.querySelectorAll('.notification-actions button');
    actionButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const notification = this.closest('.notification-card');
            
            this.classList.add('clicked');
            
            if (this.classList.contains('allow-button') || this.classList.contains('reject-button')) {
                notification.style.animation = 'fadeOut 0.3s ease-out forwards';
                setTimeout(() => {
                    notification.style.display = 'none';
                }, 300);
            }
        });
    });
}

function initFilterDropdown() {
    const filterDropdown = document.querySelector('.filter-dropdown');
    if (filterDropdown) {
        filterDropdown.addEventListener('click', function(e) {
            e.stopPropagation();
            const existingMenu = document.querySelector('.dropdown-menu');
            if (existingMenu) {
                existingMenu.remove();
                return;
            }
            const options = ['All', 'Document', 'Wiki', 'List', 'Interactive', 'Fiction'];
            const menu = document.createElement('div');
            menu.className = 'dropdown-menu';
            const rect = filterDropdown.getBoundingClientRect();
            menu.style.position = 'absolute';
            menu.style.top = rect.bottom + 'px';
            menu.style.left = rect.left + 'px';
            menu.style.backgroundColor = 'var(--md-sys-color-surface)';
            menu.style.border = '1px solid var(--md-sys-color-outline-variant)';
            menu.style.borderRadius = 'var(--md-sys-shape-corner-medium)';
            menu.style.boxShadow = 'var(--md-sys-elevation-level2)';
            options.forEach(option => {
                const item = document.createElement('div');
                item.textContent = option;
                item.style.padding = '8px 16px';
                item.style.cursor = 'pointer';
                item.addEventListener('click', function(e) {
                    e.stopPropagation();
                    filterDropdown.querySelector('span').textContent = option;
                    window.documentManager.filterDocuments(option);
                    menu.remove();
                });
                item.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = 'var(--md-sys-color-surface-variant)';
                });
                item.addEventListener('mouseleave', function() {
                    this.style.backgroundColor = '';
                });
                menu.appendChild(item);
            });
            document.body.appendChild(menu);
        });
    }
}

function initNewButton() {
    const newButton = document.querySelector('.new-button');
    if (newButton) {
        newButton.addEventListener('click', function() {
            this.classList.add('clicked');
            
            const originalText = this.textContent;
            this.textContent = 'Creating...';
            
            setTimeout(() => {
                this.textContent = originalText;
                this.classList.remove('clicked');
            }, 1000);
        });
    }
}

function animateCardsStaggered() {
    const cards = document.querySelectorAll('.card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.animation = 'none';
        
        setTimeout(() => {
            card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 50 * index);
    });
    
    const notifications = document.querySelectorAll('.notification-card');
    notifications.forEach((notification, index) => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        notification.style.animation = 'none';
        
        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 300 + (50 * index));
    });
}

function initProfilePictures() {
    const profilePics = document.querySelectorAll('.user-profile img, .notification-avatar img, .avatar img');
    
    profilePics.forEach(pic => {
        pic.addEventListener('error', function() {
            const container = this.parentElement;
            const initial = container.getAttribute('data-initial') || '?';
            
            this.remove();
            
            const span = document.createElement('span');
            span.textContent = initial;
            container.appendChild(span);
            
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.backgroundColor = 'var(--md-sys-color-primary-container)';
            container.style.color = 'var(--md-sys-color-on-primary-container)';
        });
    });
}

function initMobileResponsiveness() {
    const handleResize = () => {
        const isMobile = window.innerWidth <= 768;
        const isSmallMobile = window.innerWidth <= 480;
        
        const notificationActions = document.querySelectorAll('.notification-actions');
        notificationActions.forEach(actionContainer => {
            if (isMobile) {
                actionContainer.style.flexDirection = 'column';
                actionContainer.style.alignItems = 'stretch';
                
                const buttons = actionContainer.querySelectorAll('button');
                buttons.forEach(button => {
                    button.style.width = '100%';
                    button.style.justifyContent = 'center';
                });
            } else {
                actionContainer.style.flexDirection = '';
                actionContainer.style.alignItems = '';
                
                const buttons = actionContainer.querySelectorAll('button');
                buttons.forEach(button => {
                    button.style.width = '';
                    button.style.justifyContent = '';
                });
            }
        });
    };
    
    handleResize();
    
    window.addEventListener('resize', handleResize);
}

function initProfileDropdown() {
    const userProfile = document.querySelector('.user-profile');
    if (userProfile) {
        userProfile.addEventListener('click', function(e) {
            e.stopPropagation();
            const existingMenu = document.querySelector('.profile-dropdown-menu');
            if (existingMenu) {
                existingMenu.remove();
                return;
            }
            
            const options = [
                { label: 'My Account', icon: 'person' },
                { label: 'Settings', icon: 'settings' },
                { label: 'Help', icon: 'help' }
            ];
            
            const menu = document.createElement('div');
            menu.className = 'context-menu profile-dropdown-menu';
            
            const rect = userProfile.getBoundingClientRect();
            menu.style.position = 'absolute';
            menu.style.top = rect.bottom + 8 + 'px';
            menu.style.right = (window.innerWidth - rect.right) + 'px';
            
            options.forEach(option => {
                const item = document.createElement('button');
                item.className = 'menu-item';
                item.innerHTML = `
                    <span class="material-symbols-rounded">${option.icon}</span>
                    <span>${option.label}</span>
                `;
                
                item.addEventListener('click', function(e) {
                    e.stopPropagation();
                    // Handle menu item click
                    console.log(`Clicked on ${option.label}`);
                    menu.remove();
                    
                    if (option.label === 'Settings') {
                        showSettingsContainer();
                    }
                });
                
                menu.appendChild(item);
            });
            
            document.body.appendChild(menu);
        });
    }
    
    // Close dropdown when clicking elsewhere
    document.addEventListener('click', function() {
        const menu = document.querySelector('.profile-dropdown-menu');
        if (menu) {
            menu.remove();
        }
    });
}

// Function to show settings container
async function showSettingsContainer() {
    // Hide any existing settings container
    const existingSettings = document.querySelector('.settings-container');
    if (existingSettings) {
        existingSettings.remove();
        return;
    }
    
    // Initialize IndexedDB if not already done
    if (!dbService.db) {
        await dbService.init();
    }
    
    // Create settings container
    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'settings-container';
    
    // Create settings sidebar
    const settingsSidebar = document.createElement('div');
    settingsSidebar.className = 'settings-sidebar';
    
    // Create settings content area
    const settingsContent = document.createElement('div');
    settingsContent.className = 'settings-content';
    
    // Add settings categories
    const categories = [
        { name: 'General', icon: 'settings' },
        { name: 'User', icon: 'person' },
        { name: 'Appearance', icon: 'palette' },
        { name: 'Data', icon: 'database' },
        { name: 'Accessibility', icon: 'accessibility' },
        { name: 'About', icon: 'info' }
    ];
    
    categories.forEach((category, index) => {
        const categoryItem = document.createElement('div');
        categoryItem.className = 'settings-category' + (index === 0 ? ' active' : '');
        categoryItem.innerHTML = `
            <span class="material-symbols-rounded">${category.icon}</span>
            <span>${category.name}</span>
        `;
        
        categoryItem.addEventListener('click', async function() {
            // Remove active class from all categories
            document.querySelectorAll('.settings-category').forEach(item => {
                item.classList.remove('active');
            });
            
            // Add active class to clicked category
            categoryItem.classList.add('active');
            
            // Update content area based on category
            if (category.name === 'User') {
                await showUserSettings(settingsContent);
            } else if (category.name === 'Data') {
                await showDataSettings(settingsContent);
            } else {
                settingsContent.innerHTML = `
                    <h2>${category.name}</h2>
                    <p>This section is coming soon!</p>
                `;
            }
        });
        
        settingsSidebar.appendChild(categoryItem);
    });
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'settings-close-button';
    closeButton.innerHTML = '<span class="material-symbols-rounded">close</span>';
    closeButton.addEventListener('click', function() {
        settingsContainer.remove();
    });
    
    // Set initial content
    settingsContent.innerHTML = `
        <h2>General</h2>
        <p>This section is coming soon!</p>
    `;
    
    // Assemble settings container
    settingsContainer.appendChild(closeButton);
    settingsContainer.appendChild(settingsSidebar);
    settingsContainer.appendChild(settingsContent);
    
    // Add to document
    document.querySelector('.app-container').appendChild(settingsContainer);
}

// Function to show user settings
async function showUserSettings(settingsContent) {
    const userProfile = await dbService.getUserProfile();
    
    settingsContent.innerHTML = `
        <h2>User Profile</h2>
        <div class="settings-section">
            <div class="profile-picture-section">
                <div class="profile-picture-preview">
                    <img id="profile-preview" src="${userProfile.profilePicture || 'https://placehold.co/120x120/FF4D00/FFFFFF'}" alt="Profile Picture">
                    <div class="profile-picture-overlay">
                        <span class="material-symbols-rounded">photo_camera</span>
                    </div>
                </div>
                <input type="file" id="profile-picture-input" accept="image/*" style="display: none;">
                <button class="upload-button" onclick="document.getElementById('profile-picture-input').click()">
                    <span class="material-symbols-rounded">upload</span>
                    Upload Photo
                </button>
            </div>
            
            <div class="profile-form">
                <div class="form-group">
                    <label for="display-name">Display Name</label>
                    <input type="text" id="display-name" value="${userProfile.displayName || ''}" placeholder="Enter your display name">
                </div>
                
                <div class="form-group">
                    <label for="full-name">Full Name</label>
                    <input type="text" id="full-name" value="${userProfile.fullName || ''}" placeholder="Enter your full name">
                </div>
                
                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" value="${userProfile.email || ''}" placeholder="Enter your email">
                </div>
                
                <div class="form-actions">
                    <button class="save-button" onclick="saveUserProfile()">
                        <span class="material-symbols-rounded">save</span>
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Handle profile picture upload
    const profileInput = document.getElementById('profile-picture-input');
    const profilePreview = document.getElementById('profile-preview');
    
    profileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                profilePreview.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

// Function to show data settings
async function showDataSettings(settingsContent) {
    const [userProfile, settings, documents] = await Promise.all([
        dbService.getUserProfile(),
        dbService.getSettings(),
        dbService.getAllDocuments()
    ]);
    
    settingsContent.innerHTML = `
        <h2>Data Management</h2>
        <div class="settings-section">
            <p class="data-description">Manage your data and export or delete specific information from Buddy Docs.</p>
            
            <div class="data-options">
                <div class="data-option">
                    <div class="data-option-header">
                        <div class="data-option-info">
                            <h3>User Profile</h3>
                            <p>Your personal information and profile picture</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggle-user-profile" ${Object.keys(userProfile).length > 0 ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="data-option">
                    <div class="data-option-header">
                        <div class="data-option-info">
                            <h3>Settings Data</h3>
                            <p>Your app preferences and settings</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggle-settings" ${Object.keys(settings).length > 0 ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="data-option">
                    <div class="data-option-header">
                        <div class="data-option-info">
                            <h3>Document Data</h3>
                            <p>All your documents and content (${documents.length} documents)</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggle-documents" ${documents.length > 0 ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="data-actions">
                <button class="export-button" onclick="exportSelectedData()">
                    <span class="material-symbols-rounded">download</span>
                    Export Selected Data
                </button>
                <button class="delete-button" onclick="deleteSelectedData()">
                    <span class="material-symbols-rounded">delete</span>
                    Delete Selected Data
                </button>
            </div>
        </div>
    `;
}

// Function to save user profile
async function saveUserProfile() {
    const displayName = document.getElementById('display-name').value;
    const fullName = document.getElementById('full-name').value;
    const email = document.getElementById('email').value;
    const profilePicture = document.getElementById('profile-preview').src;
    
    const userProfile = {
        displayName,
        fullName,
        email,
        profilePicture,
        lastUpdated: new Date().toISOString()
    };
    
    try {
        await dbService.saveUserProfile(userProfile);
        
        // Update the header profile picture
        const headerProfile = document.querySelector('.user-profile img');
        if (headerProfile) {
            headerProfile.src = profilePicture;
        }
        
        showNotification('Profile saved successfully!', 'success');
    } catch (error) {
        showNotification('Failed to save profile', 'error');
        console.error('Error saving profile:', error);
    }
}

// Function to export selected data
async function exportSelectedData() {
    const selectedData = {};
    
    if (document.getElementById('toggle-user-profile').checked) {
        selectedData.userProfile = await dbService.getUserProfile();
    }
    
    if (document.getElementById('toggle-settings').checked) {
        selectedData.settings = await dbService.getSettings();
    }
    
    if (document.getElementById('toggle-documents').checked) {
        selectedData.documents = await dbService.getAllDocuments();
    }
    
    if (Object.keys(selectedData).length === 0) {
        showNotification('Please select at least one data type to export', 'warning');
        return;
    }
    
    selectedData.exportDate = new Date().toISOString();
    
    const dataStr = JSON.stringify(selectedData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `buddydocs-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('Data exported successfully!', 'success');
}

// Function to delete selected data
async function deleteSelectedData() {
    const selectedTypes = [];
    
    if (document.getElementById('toggle-user-profile').checked) {
        selectedTypes.push('User Profile');
    }
    
    if (document.getElementById('toggle-settings').checked) {
        selectedTypes.push('Settings Data');
    }
    
    if (document.getElementById('toggle-documents').checked) {
        selectedTypes.push('Document Data');
    }
    
    if (selectedTypes.length === 0) {
        showNotification('Please select at least one data type to delete', 'warning');
        return;
    }
    
    const confirmed = confirm(`Are you sure you want to delete the following data?\n\n${selectedTypes.join('\n')}\n\nThis action cannot be undone.`);
    
    if (!confirmed) return;
    
    try {
        if (document.getElementById('toggle-user-profile').checked) {
            await dbService.deleteUserProfile();
        }
        
        if (document.getElementById('toggle-settings').checked) {
            await dbService.deleteSettings();
        }
        
        if (document.getElementById('toggle-documents').checked) {
            await dbService.deleteAllDocuments();
        }
        
        showNotification('Selected data deleted successfully!', 'success');
        
        // Refresh the data settings view
        const settingsContent = document.querySelector('.settings-content');
        if (settingsContent) {
            await showDataSettings(settingsContent);
        }
    } catch (error) {
        showNotification('Failed to delete data', 'error');
        console.error('Error deleting data:', error);
    }
}

// Function to show notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.innerHTML = `
        <span class="material-symbols-rounded">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info'}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Function to load user profile
async function loadUserProfile() {
    try {
        const userProfile = await dbService.getUserProfile();
        if (userProfile.profilePicture) {
            const headerProfile = document.querySelector('.user-profile img');
            if (headerProfile) {
                headerProfile.src = userProfile.profilePicture;
            }
        }
    } catch (error) {
        console.error('Failed to load user profile:', error);
    }
}

// Initialize all UI components
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize IndexedDB
    try {
        await dbService.init();
        console.log('IndexedDB initialized successfully');
        
        // Load user profile after IndexedDB is initialized
        await loadUserProfile();
    } catch (error) {
        console.error('Failed to initialize IndexedDB:', error);
    }
    
    initRippleEffect();
    initStateAnimations();
    initNotificationInteractions();
    initFilterDropdown();
    initNewButton();
    animateCardsStaggered();
    initProfilePictures();
    initMobileResponsiveness();
    initProfileDropdown();
});