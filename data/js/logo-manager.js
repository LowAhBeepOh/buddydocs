class LogoManager {
  constructor() {
    this.logoElement = document.querySelector('.logo');
    this.defaultLogoSrc = 'data/assets/docslogo.svg';
    this.debugMode = false;
    this.specialLogos = [
      {
        // Pride Month (June 1-30)
        name: 'pride',
        src: 'data/assets/pride.svg',
        startDate: { month: 5, day: 1 }, // June 1 (0-indexed month)
        endDate: { month: 5, day: 30 }   // June 30
      },
      {
        // Halloween (October 31)
        name: 'halloween',
        src: 'data/assets/halloween.svg',
        date: { month: 9, day: 31 } // October 31
      },
      {
        // Christmas (December 1-31)
        name: 'christmas',
        src: 'data/assets/christmas.svg',
        startDate: { month: 11, day: 1 }, // December 1
        endDate: { month: 11, day: 31 }   // December 31
      }
    ];
    
    // Preload all logos when the manager initializes
    this.preloadLogos();
  }

  /**
   * Preloads all logo images to ensure smooth transitions
   */
  preloadLogos() {
    // Create an array of all logo sources to preload
    const logoUrls = [
      this.defaultLogoSrc,
      ...this.specialLogos.map(logo => logo.src)
    ];

    // Preload each logo
    logoUrls.forEach(logoUrl => {
      // Create an image object to preload
      const img = new Image();
      img.src = logoUrl;
    });
  }

  init() {
    this.updateLogo();
    // Check for logo updates once per day
    setInterval(() => this.updateLogo(), 1000 * 60 * 60 * 24);
  }

  updateLogo(forceDate) {
    let today, currentMonth, currentDate;
    
    if (forceDate && forceDate instanceof Date) {
      // Use the provided date for debugging
      today = forceDate;
      currentMonth = today.getMonth();
      currentDate = today.getDate();
      if (this.debugMode) console.log(`[LogoManager] Using debug date: ${today.toDateString()}`);
    } else {
      // Use current date
      today = new Date();
      currentMonth = today.getMonth();
      currentDate = today.getDate();
    }
    
    // Check each special logo to see if it should be displayed today
    for (const logo of this.specialLogos) {
      if (this.shouldShowLogo(logo, currentMonth, currentDate)) {
        this.setLogo(logo.src, logo.name);
        return;
      }
    }
    
    // If no special logo for today, use default
    this.setLogo(this.defaultLogoSrc, 'default');
  }

  shouldShowLogo(logo, currentMonth, currentDate) {
    // Check for single day event
    if (logo.date) {
      return (
        currentMonth === logo.date.month && 
        currentDate === logo.date.day
      );
    }
    
    // Check for date range event
    if (logo.startDate && logo.endDate) {
      const currentDateObj = new Date();
      currentDateObj.setMonth(currentMonth, currentDate);
      
      const startDate = new Date();
      startDate.setMonth(logo.startDate.month, logo.startDate.day);
      
      const endDate = new Date();
      endDate.setMonth(logo.endDate.month, logo.endDate.day);
      
      // Handle year transition (e.g., December to January)
      if (startDate > endDate) {
        if (currentMonth >= 11) { // December
          endDate.setFullYear(currentDateObj.getFullYear() + 1);
        } else {
          startDate.setFullYear(currentDateObj.getFullYear() - 1);
        }
      }
      
      return currentDateObj >= startDate && currentDateObj <= endDate;
    }
    
    return false;
  }

  setLogo(src, logoName = '') {
    // Only update if the source has changed to prevent unnecessary DOM updates
    if (this.logoElement) {
      const fullSrc = new URL(src, window.location.href).href;
      if (this.logoElement.src !== fullSrc) {
        // Create a new image to preload it
        const img = new Image();
        img.onload = () => {
          // Only update the source once the image is loaded
          this.logoElement.src = src;
          if (this.debugMode) {
            console.log(`[LogoManager] Logo changed to: ${logoName || 'default'}`);
          }
        };
        img.onerror = () => {
          console.error(`[LogoManager] Failed to load logo: ${src}`);
        };
        img.src = src;
      }
    }
  }
  
  /**
   * Toggle debug mode on/off
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebug(enabled = true) {
    this.debugMode = enabled;
    console.log(`[LogoManager] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    if (enabled) this.logAvailableLogos();
  }
  
  /**
   * Get a logo by name
   * @param {string} name - Name of the logo to get
   * @returns {Object|undefined} The logo object or undefined if not found
   */
  getLogo(name) {
    return this.specialLogos.find(logo => logo.name === name);
  }
  
  /**
   * Show a specific logo by name
   * @param {string} name - Name of the logo to show
   */
  showLogo(name) {
    if (name === 'default') {
      this.setLogo(this.defaultLogoSrc, 'default');
      console.log('[LogoManager] Showing default logo');
      return;
    }
    
    const logo = this.getLogo(name);
    if (logo) {
      this.setLogo(logo.src, logo.name);
    } else {
      console.error(`[LogoManager] Logo '${name}' not found. Available logos: ${this.specialLogos.map(l => l.name).join(', ')}`);
    }
  }
  
  /**
   * Log all available logos with their details
   */
  logAvailableLogos() {
    console.group('[LogoManager] Available Logos');
    console.log('Default logo:', this.defaultLogoSrc);
    console.log('Special logos:');
    this.specialLogos.forEach(logo => {
      if (logo.date) {
        console.log(`- ${logo.name}: ${logo.src} (Single day: ${logo.date.month + 1}/${logo.date.day})`);
      } else {
        console.log(`- ${logo.name}: ${logo.src} (Range: ${logo.startDate.month + 1}/${logo.startDate.day} - ${logo.endDate.month + 1}/${logo.endDate.day})`);
      }
    });
    console.groupEnd();
  }
  
  /**
   * Test a specific date
   * @param {string|Date} date - Date string or Date object to test
   */
  testDate(date) {
    const testDate = new Date(date);
    if (isNaN(testDate.getTime())) {
      console.error('[LogoManager] Invalid date provided');
      return;
    }
    this.updateLogo(testDate);
  }
}

  // Initialize the logo manager when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Create global instance for easy access from console
  window.logoManager = new LogoManager();
  window.logoManager.init();
  
  // Add helper functions to window for easier console access
  window.showLogo = (name) => window.logoManager.showLogo(name);
  window.testLogoDate = (date) => window.logoManager.testLogoDate(new Date(date));
  window.toggleLogoDebug = (enabled) => window.logoManager.toggleDebug(enabled);
});
