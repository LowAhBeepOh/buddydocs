// Material Design 3 Ripple Effect
function createRipple(event) {
    const button = event.currentTarget;
    
    // Remove any existing ripple
    const ripple = button.querySelector('.ripple');
    if (ripple) {
        ripple.remove();
    }
    
    // Create new ripple element
    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    
    // Position the ripple
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
    circle.classList.add('ripple');
    
    // Add ripple to element
    button.appendChild(circle);
    
    // Remove ripple after animation completes
    setTimeout(() => {
        if (circle) {
            circle.remove();
        }
    }, 600);
}

// Apply ripple effect to all buttons and cards
function initRippleEffect() {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', createRipple);
    });
    
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('click', function() {
            // Add a subtle scale animation
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
}

// State animations for hover effects
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

// Notification interactions
function initNotificationInteractions() {
    // Close button for plan card
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
    
    // Action buttons
    const actionButtons = document.querySelectorAll('.notification-actions button');
    actionButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const notification = this.closest('.notification-card');
            
            // Add a confirmation animation
            this.classList.add('clicked');
            
            // If it's an allow/reject button, hide the notification
            if (this.classList.contains('allow-button') || this.classList.contains('reject-button')) {
                notification.style.animation = 'fadeOut 0.3s ease-out forwards';
                setTimeout(() => {
                    notification.style.display = 'none';
                }, 300);
            }
        });
    });
}

// Filter dropdown interaction
function initFilterDropdown() {
    const filterDropdown = document.querySelector('.filter-dropdown');
    if (filterDropdown) {
        filterDropdown.addEventListener('click', function(e) {
            e.stopPropagation();
            // Remove any existing dropdown menu
            const existingMenu = document.querySelector('.dropdown-menu');
            if (existingMenu) {
                existingMenu.remove();
                return;
            }
            // Create dropdown menu element
            const options = ['All', 'Document', 'Wiki', 'List', 'Interactive', 'Fiction'];
            const menu = document.createElement('div');
            menu.className = 'dropdown-menu';
            // Position menu below the filter dropdown
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
                    // Update filter dropdown text
                    filterDropdown.querySelector('span').textContent = option;
                    // Call filterDocuments on DocumentManager instance
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

// New button interaction
function initNewButton() {
    const newButton = document.querySelector('.new-button');
    if (newButton) {
        newButton.addEventListener('click', function() {
            // In a real app, this would open a new document dialog
            this.classList.add('clicked');
            
            // Visual feedback
            const originalText = this.textContent;
            this.textContent = 'Creating...';
            
            setTimeout(() => {
                this.textContent = originalText;
                this.classList.remove('clicked');
            }, 1000);
        });
    }
}

// Add staggered animation to cards
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
        }, 300 + (50 * index)); // Start after cards have animated
    });
}

// Initialize profile picture and avatar styling
function initProfilePictures() {
    const profilePics = document.querySelectorAll('.user-profile img, .notification-avatar img, .avatar img');
    
    profilePics.forEach(pic => {
        // Ensure images load properly
        pic.addEventListener('error', function() {
            // If image fails to load, replace with a colored background and initial
            const container = this.parentElement;
            const initial = container.getAttribute('data-initial') || '?';
            
            // Remove the image
            this.remove();
            
            // Add initial text
            const span = document.createElement('span');
            span.textContent = initial;
            container.appendChild(span);
            
            // Add styling
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.backgroundColor = 'var(--md-sys-color-primary-container)';
            container.style.color = 'var(--md-sys-color-on-primary-container)';
        });
    });
}

// Handle mobile responsiveness
function initMobileResponsiveness() {
    const handleResize = () => {
        const isMobile = window.innerWidth <= 768;
        const isSmallMobile = window.innerWidth <= 480;
        
        // Adjust notification actions on mobile
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
    
    // Initial check
    handleResize();
    
    // Listen for window resize
    window.addEventListener('resize', handleResize);
}

// Initialize all interactions when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add keyframes for fadeOut animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(10px); }
        }
        
        .clicked {
            transform: scale(0.95);
            transition: transform 0.1s ease;
        }
    `;
    document.head.appendChild(style);
    
    // Initialize all interactions
    initRippleEffect();
    initStateAnimations();
    initNotificationInteractions();
    initFilterDropdown();
    // Note: New button is now handled by DocumentManager
    // initNewButton();
    initProfilePictures();
    
    // Make ripple effect available globally for dynamic elements
    window.createRipple = createRipple;
    window.initRippleEffect = initRippleEffect;
    
    // Start staggered animations
    setTimeout(animateCardsStaggered, 100);
});