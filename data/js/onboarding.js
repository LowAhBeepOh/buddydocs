// Onboarding.js - Handles the multi-step onboarding flow
import { setSetting, getSetting } from './idb.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize onboarding
  initOnboarding();
  // Initialize background animation
  initBackgroundAnimation();
});

function initOnboarding() {
  // Elements
  const steps = document.querySelectorAll('.step-pill');
  const stepContents = document.querySelectorAll('.step-content');
  const nextButtons = document.querySelectorAll('.next-btn');
  const prevButtons = document.querySelectorAll('.prev-btn');
  const skipButtons = document.querySelectorAll('.skip-btn');
  const skipOnboardingBtn = document.getElementById('skipOnboarding');
  const completeBtn = document.getElementById('completeBtn');
  
  // File inputs
  const fileImport = document.getElementById('fileImport');
  const profilePicture = document.getElementById('profilePicture');
  const profilePreview = document.getElementById('profilePreview');
  
  // Form inputs
  const userName = document.getElementById('userName');
  const password = document.getElementById('password');
  const togglePassword = document.querySelector('.toggle-password');
  const themeOptions = document.querySelectorAll('.theme-option');
  
  // Current step
  let currentStep = 1;
  let selectedTheme = 'light';
  
  // Update progress indicators
  function updateProgress(step) {
    // Update step indicators
    steps.forEach((stepEl, index) => {
      if (index + 1 < step) {
        stepEl.classList.add('completed');
        stepEl.classList.remove('active');
      } else if (index + 1 === step) {
        stepEl.classList.add('active');
        stepEl.classList.remove('completed');
      } else {
        stepEl.classList.remove('active', 'completed');
      }
    });
  }
  
  // Show step
  function showStep(step) {
    stepContents.forEach((content, index) => {
      if (index + 1 === step) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
    
    updateProgress(step);
    currentStep = step;
    
    // Add entrance animation
    const activeContent = document.querySelector('.step-content.active');
    activeContent.style.animation = 'none';
    setTimeout(() => {
      activeContent.style.animation = 'fadeIn 0.5s ease';
    }, 10);
  }
  
  // Next button click
  nextButtons.forEach(button => {
    button.addEventListener('click', () => {
      const nextStep = parseInt(button.dataset.next);
      showStep(nextStep);
    });
  });
  
  // Previous button click
  prevButtons.forEach(button => {
    button.addEventListener('click', () => {
      const prevStep = parseInt(button.dataset.prev);
      showStep(prevStep);
    });
  });
  
  // Skip button click
  skipButtons.forEach(button => {
    button.addEventListener('click', () => {
      const nextStep = parseInt(button.dataset.next);
      showStep(nextStep);
    });
  });
  
  // Skip onboarding completely
  skipOnboardingBtn.addEventListener('click', async () => {
    // Save minimal settings and redirect to index
    await setSetting('onboardingCompleted', true);
    await setSetting('theme', 'light');
    await setSetting('initials', 'BD');
    window.location.href = 'index.html';
  });
  
  // File import
  fileImport.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      // Handle file import logic here
      // For now, just proceed to next step
      showStep(3);
    }
  });
  
  // Profile picture upload
  profilePicture.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = (event) => {
        profilePreview.innerHTML = '';
        profilePreview.style.backgroundImage = `url(${event.target.result})`;
        profilePreview.style.backgroundSize = 'cover';
        profilePreview.style.backgroundPosition = 'center';
      };
      
      reader.readAsDataURL(file);
    }
  });
  
  // Click on profile picture to trigger file input
  profilePreview.addEventListener('click', () => {
    profilePicture.click();
  });
  
  // Username input to generate initials
  userName.addEventListener('input', (e) => {
    const name = e.target.value;
    if (name) {
      const initials = name.split(' ')
        .map(part => part.charAt(0))
        .join('')
        .toUpperCase()
        .substring(0, 2);
      
      if (!profilePreview.style.backgroundImage) {
        const initialsEl = profilePreview.querySelector('.initials');
        if (initialsEl) {
          initialsEl.textContent = initials || 'BD';
        }
      }
    }
  });
  
  // Toggle password visibility
  togglePassword?.addEventListener('click', () => {
    const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
    password.setAttribute('type', type);
    
    const icon = togglePassword.querySelector('.material-symbols-outlined');
    icon.textContent = type === 'password' ? 'visibility' : 'visibility_off';
  });
  
  // Theme selection
  themeOptions.forEach(option => {
    option.addEventListener('click', () => {
      themeOptions.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      selectedTheme = option.dataset.theme;
      
      // Preview theme
      if (selectedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (selectedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        // System theme would check user's preference, but for preview just use light
        document.documentElement.setAttribute('data-theme', 'light');
      }
    });
  });
  
  // Complete setup
  completeBtn.addEventListener('click', async () => {
    // Save all settings
    const userNameValue = userName.value;
    const passwordValue = password.value;
    const profilePicData = profilePreview.style.backgroundImage ? 
      profilePreview.style.backgroundImage.slice(4, -1).replace(/"/g, "") : 
      null;
    
    // Generate initials from name
    let initials = 'BD';
    if (userNameValue) {
      initials = userNameValue.split(' ')
        .map(part => part.charAt(0))
        .join('')
        .toUpperCase()
        .substring(0, 2);
    }
    
    // Save to IndexedDB
    await setSetting('onboardingCompleted', true);
    
    if (userNameValue) {
      await setSetting('userName', userNameValue);
    }
    
    if (initials) {
      await setSetting('initials', initials);
    }
    
    if (profilePicData) {
      await setSetting('profilePicture', profilePicData);
    }
    
    if (passwordValue) {
      // In a real app, you'd want to hash this password
      await setSetting('hasPassword', true);
      await setSetting('password', passwordValue);
    }
    
    await setSetting('theme', selectedTheme);
    
    // Show completion screen
    showStep(6); // This is the completion screen (not in the step indicators)
    
    // Animate checkmark
    const checkmark = document.querySelector('.checkmark');
    checkmark.style.animation = 'none';
    setTimeout(() => {
      checkmark.style.animation = 'checkmarkAppear 0.5s ease-out';
    }, 10);
    
    // Redirect after a delay
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 5000); // Auto redirect after 5 seconds
  });
  
  // Initialize first step
  updateProgress(1);
  
  // Check if user has already completed onboarding
  checkOnboardingStatus();
}

// Check if user has already completed onboarding
async function checkOnboardingStatus() {
  const onboardingCompleted = await getSetting('onboardingCompleted', false);
  
  if (onboardingCompleted) {
    // User has already completed onboarding, redirect to index
    window.location.href = 'index.html';
  }
}

// Initialize background animation
function initBackgroundAnimation() {
  const canvas = document.getElementById('animationCanvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Set canvas dimensions to a scaled size to reduce pixel work, while keeping CSS at 100%
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const scale = prefersReducedMotion ? 0.6 : 0.85;
    canvas.width = Math.floor(window.innerWidth * scale * dpr);
    canvas.height = Math.floor(window.innerHeight * scale * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });
  
  // Get theme colors
  const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
  
  // Colors based on theme
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--onboarding-primary').trim() || '#0550FF';
  const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--onboarding-secondary').trim() || '#8B5CF6';
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--onboarding-accent').trim() || '#10B981';
  
  // Create particles (adaptive count)
  const particles = [];
  const area = Math.max(1, canvas.width * canvas.height);
  const baseParticles = Math.round(area / 120000); // ~17 for 1080p at default scale
  const particleCount = prefersReducedMotion ? Math.max(8, Math.min(16, baseParticles)) : Math.max(12, Math.min(36, baseParticles));
  
  class Particle {
    constructor() {
      this.reset();
    }
    
    reset() {
      // Random position
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      
      // Random size
      this.size = Math.random() * 5 + 2;
      
      // Random velocity
      this.vx = (Math.random() - 0.5) * 2;
      this.vy = (Math.random() - 0.5) * 2;
      
      // Random color
      const colors = [primaryColor, secondaryColor, accentColor];
      this.color = colors[Math.floor(Math.random() * colors.length)];
      
      // Random opacity
      this.alpha = Math.random() * 0.5 + 0.1;
      
      // Random blur amount
      this.blur = Math.random() * 5 + 2;
    }
    
    update() {
      // Move particle
      this.x += this.vx;
      this.y += this.vy;
      
      // Bounce off edges
      if (this.x < 0 || this.x > canvas.width) {
        this.vx *= -1;
      }
      
      if (this.y < 0 || this.y > canvas.height) {
        this.vy *= -1;
      }
      
      // Reset if out of bounds
      if (this.x < -50 || this.x > canvas.width + 50 || 
          this.y < -50 || this.y > canvas.height + 50) {
        this.reset();
      }
    }
    
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      // Using shadowBlur instead of filter:blur (much cheaper on many devices)
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.blur;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  
  // Create paths
  const paths = [];
  const pathCount = prefersReducedMotion ? 0 : 4;
  
  class Path {
    constructor() {
      this.reset();
    }
    
    reset() {
      // Path properties
      this.points = [];
      this.pointCount = Math.floor(Math.random() * 5) + 3;
      
      // Generate control points
      for (let i = 0; i < this.pointCount; i++) {
        this.points.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 1,
          vy: (Math.random() - 0.5) * 1
        });
      }
      
      // Path style
      const colors = [primaryColor, secondaryColor, accentColor];
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.lineWidth = Math.random() * 2 + 1;
      this.alpha = Math.random() * 0.3 + 0.1;
    }
    
    update() {
      // Move control points
      for (let i = 0; i < this.points.length; i++) {
        const point = this.points[i];
        point.x += point.vx;
        point.y += point.vy;
        
        // Bounce off edges
        if (point.x < 0 || point.x > canvas.width) {
          point.vx *= -1;
        }
        
        if (point.y < 0 || point.y > canvas.height) {
          point.vy *= -1;
        }
      }
    }
    
    draw() {
      if (this.points.length < 2) return;
      
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.lineWidth;
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      
      // Draw curve through points
      for (let i = 1; i < this.points.length; i++) {
        const prevPoint = this.points[i - 1];
        const currentPoint = this.points[i];
        
        // Calculate control points for smooth curve
        const cpX1 = prevPoint.x + (currentPoint.x - prevPoint.x) / 3;
        const cpY1 = prevPoint.y + (currentPoint.y - prevPoint.y) / 3;
        const cpX2 = prevPoint.x + 2 * (currentPoint.x - prevPoint.x) / 3;
        const cpY2 = prevPoint.y + 2 * (currentPoint.y - prevPoint.y) / 3;
        
        ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, currentPoint.x, currentPoint.y);
      }
      
      ctx.stroke();
      ctx.restore();
    }
  }
  
  // Initialize particles and paths
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }
  
  for (let i = 0; i < pathCount; i++) {
    paths.push(new Path());
  }
  
  // Animation loop with frame-rate throttling and page visibility pause
  const targetFps = prefersReducedMotion ? 24 : 45;
  const frameMs = 1000 / targetFps;
  let lastTime = performance.now();
  
  function animate(now = performance.now()) {
    if (document.hidden) {
      requestAnimationFrame(animate);
      return;
    }
    const dt = now - lastTime;
    if (dt < frameMs) {
      requestAnimationFrame(animate);
      return;
    }
    lastTime = now;
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw paths
    paths.forEach(path => {
      path.update();
      path.draw();
    });
    
    // Update and draw particles
    particles.forEach(particle => {
      particle.update();
      particle.draw();
    });
    
    // Continue animation
    requestAnimationFrame(animate);
  }
  
  // Start animation
  animate();
}