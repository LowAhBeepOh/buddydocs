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

document.addEventListener('DOMContentLoaded', function() {
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
    
    initRippleEffect();
    initStateAnimations();
    initNotificationInteractions();
    initFilterDropdown();
    initProfilePictures();
    
    window.createRipple = createRipple;
    window.initRippleEffect = initRippleEffect;
    
    setTimeout(animateCardsStaggered, 100);
});