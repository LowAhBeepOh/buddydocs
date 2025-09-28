import { getSetting } from './idb.js';

/**
 * Generates a response from the AI based on the given prompt
 * @param {string} prompt - The prompt to send to the AI
 * @param {Object} options - Additional options for the AI generation
 * @param {number} [options.max_tokens=100] - Maximum number of tokens to generate
 * @param {number} [options.temperature=0.7] - Temperature for generation (0-2, lower is more focused)
 * @returns {Promise<string>} The generated response
 */
export async function generateAiResponse(prompt, { max_tokens = 100, temperature = 0.7 } = {}) {
  try {
    const aiEnabled = await getSetting('aiEnabled', false);
    if (!aiEnabled) {
      throw new Error('AI features are not enabled');
    }

    const provider = await getSetting('aiProvider', 'ollama');
    const model = await getSetting('aiModel', 'llama3');
    const baseUrl = await getSetting('aiBaseUrl', 'http://localhost:11434');

    if (provider === 'ollama') {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature,
            num_predict: max_tokens,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.response || '';
    } else if (provider === 'lmstudio') {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature,
          max_tokens,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status} ${response.statusText}`);
      }
      return data.choices?.[0]?.message?.content || '';
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (error) {
    // Silently handle the error and return a fallback greeting
    const now = new Date();
    const h = now.getHours();
    let timeCategory;
    
    if (h < 12) timeCategory = 'morning';
    else if (h < 17) timeCategory = 'afternoon';
    else timeCategory = 'evening';
    
    const greetings = {
      morning: [
        { greeting: 'Good morning', sub: 'A new day to create something great' },
        { greeting: 'Morning', sub: 'What will you accomplish today?' },
        { greeting: 'New day, new possibilities', sub: 'Make it count' },
        { greeting: 'Rise and shine', sub: 'Your documents are ready when you are' },
        { greeting: 'Hello there', sub: 'Perfect time for focused work' }
      ],
      afternoon: [
        { greeting: 'Good afternoon', sub: 'How\'s your day going?' },
        { greeting: 'Afternoon check-in', sub: 'Making progress on your goals?' },
        { greeting: 'Afternoon energy', sub: 'Perfect time to tackle challenging tasks' },
        { greeting: 'Hello again', sub: 'What\'s next on your list?' }
      ],
      evening: [
        { greeting: 'Good evening', sub: 'Time to reflect on today\'s progress' },
        { greeting: 'Evening hours', sub: 'Perfect for wrapping up loose ends' },
        { greeting: 'Day\'s end', sub: 'Review and plan for tomorrow' },
        { greeting: 'Evening thoughts', sub: 'Capture them before they fade' }
      ]
    };
    
    const timeGreetings = greetings[timeCategory] || greetings['morning'];
    const randomGreeting = timeGreetings[Math.floor(Math.random() * timeGreetings.length)];
    
    return randomGreeting.greeting;
  }
}

/**
{{ ... }}
 * @param {Object} context - User context including name, time, recent docs, etc.
 * @returns {Promise<{greeting: string, sub: string}>} The generated greeting and subtext
 */
export async function generateWelcomeMessage(context) {
  try {
    const { name, time, date, recentDocuments = [], upcomingDeadlines = [], passedDeadlines = [] } = context;
    const tone = context.tone || 'friendly';
    
    // Base context for AI to understand its role
    const baseContext = 'You are a helpful assistant in a document editor. The user creates and manages their own documents. Focus on their work, goals, and current context.';
    
    // Tone-specific instructions
    let toneInstructions = '';
    switch (tone.toLowerCase()) {
      case 'maniac':
        toneInstructions = 'Be extremely energetic and chaotic, but focused on the user\'s work. Use exclamation points and dramatic language about their documents and deadlines.';
        break;
      case 'aggressive':
        toneInstructions = 'Be direct and no-nonsense. Focus on efficiency and results. Point out missed deadlines if any exist. No small talk.';
        break;
      case 'professional':
        toneInstructions = 'Be formal and business-like. Focus on productivity and task management. Use proper business language.';
        break;
      case 'motivational':
        toneInstructions = 'Be encouraging and inspiring. Highlight user achievements and progress. Use positive, action-oriented language.';
        break;
      case 'minimalist':
        toneInstructions = 'Be concise and straightforward. Keep greetings brief and factual. Focus only on essential information.';
        break;
      default:
        toneInstructions = `Be ${tone} and supportive, focusing on the user's work and goals.`;
    }
    
    // Build context about current time and date
    const now = new Date(date);
    const season = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Fall', 'Fall', 'Fall', 'Winter'][now.getMonth()];
    const dayType = now.getDay() === 0 || now.getDay() === 6 ? 'weekend' : 'weekday';
    
    // Generate greeting (max 5 words)
    const greetingPrompt = `${baseContext}\n\nGenerate a short greeting (max 5 words) for ${name}. Consider it's ${time} on a ${dayType} in ${season}. ${toneInstructions} Focus on their work context, avoid mentioning galleries or AI features. Do not use emojis.`;
    
    // Generate subtext (max 12 words) - be direct, no intros
    let subtextPrompt = `${baseContext}\n\nWrite a single, concise message (max 12 words) relevant to the user's current context. ${toneInstructions} `;
    
    // Add detailed user context
    let contextInfo = [];
    
    // Document context
    if (recentDocuments.length > 0) {
      contextInfo.push(`The user has worked on these documents recently: ${recentDocuments.slice(0, 3).join(', ')}`);
    }
    
    // Deadline context with urgency levels
    const urgentDeadlines = upcomingDeadlines.filter(d => new Date(d.date) - now < 86400000); // Within 24 hours
    if (urgentDeadlines.length > 0) {
      contextInfo.push(`${urgentDeadlines.length} urgent deadline(s) within 24 hours`);
    } else if (upcomingDeadlines.length > 0) {
      contextInfo.push(`${upcomingDeadlines.length} upcoming deadline(s)`);
    }
    
    if (passedDeadlines.length > 0) {
      contextInfo.push(`${passedDeadlines.length} deadline(s) have passed`);
    }
    
    if (contextInfo.length > 0) {
      subtextPrompt += `Current user context: ${contextInfo.join('; ')}. `;
    }
    
    // Final instruction to ensure natural, non-repetitive output
    subtextPrompt += `Create a smooth, natural message that incorporates this context without explicitly listing it.`;
    
    const [greeting, subtext] = await Promise.all([
      generateAiResponse(greetingPrompt, { max_tokens: 30, temperature: 0.7 }),
      generateAiResponse(subtextPrompt, { max_tokens: 50, temperature: 0.7 })
    ]);
    
    return {
      greeting: greeting.trim().replace(/"/g, '').substring(0, 50),
      sub: subtext.trim().replace(/"/g, '').substring(0, 100)
    };
  } catch (error) {
    console.error('Error generating welcome message:', error);
    // Fallback to dynamic greeting based on time of day
    const now = new Date();
    const h = now.getHours();
    let timeCategory;
    
    if (h < 12) timeCategory = 'morning';
    else if (h < 17) timeCategory = 'afternoon';
    else timeCategory = 'evening';
    
    const greetings = {
      morning: [
        { greeting: 'Good morning', sub: 'A new day to create something great' },
        { greeting: 'Morning', sub: 'What will you accomplish today?' },
        { greeting: 'New day, new possibilities', sub: 'Make it count' },
        { greeting: 'Rise and shine', sub: 'Your documents are ready when you are' },
        { greeting: 'Hello there', sub: 'Perfect time for focused work' }
      ],
      afternoon: [
        { greeting: 'Good afternoon', sub: 'How\'s your day going?' },
        { greeting: 'Afternoon check-in', sub: 'Making progress on your goals?' },
        { greeting: 'Afternoon energy', sub: 'Perfect time to tackle challenging tasks' },
        { greeting: 'Hello again', sub: 'What\'s next on your list?' }
      ],
      evening: [
        { greeting: 'Good evening', sub: 'Time to reflect on today\'s progress' },
        { greeting: 'Evening hours', sub: 'Perfect for wrapping up loose ends' },
        { greeting: 'Day\'s end', sub: 'Review and plan for tomorrow' },
        { greeting: 'Evening thoughts', sub: 'Capture them before they fade' }
      ]
    };
    
    const timeGreetings = greetings[timeCategory];
    const randomGreeting = timeGreetings[Math.floor(Math.random() * timeGreetings.length)];
    
    return {
      greeting: randomGreeting.greeting,
      sub: randomGreeting.sub
    };
  }
}