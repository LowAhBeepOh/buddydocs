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

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (error) {
    console.error('Error generating AI response:', error);
    // Return a dynamic fallback response based on time of day
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
    
    return randomGreeting.greeting;
  }
}

/**
 * Generates an AI welcome message based on user context
 * @param {Object} context - User context including name, time, recent docs, etc.
 * @returns {Promise<{greeting: string, sub: string}>} The generated greeting and subtext
 */
export async function generateWelcomeMessage(context) {
  try {
    const { name, time, date, recentDocuments = [], upcomingDeadlines = [], passedDeadlines = [] } = context;
    const tone = context.tone || 'friendly';
    
    // Tone-specific instructions
    let toneInstructions = '';
    if (tone.toLowerCase() === 'maniac') {
      toneInstructions = 'Be extremely energetic, chaotic, and slightly unhinged. Use all caps, exclamation points, and dramatic language. Be overwhelming in a negative way, like a hyperactive salesperson or a malfunctioning AI. Never use "darling" or other endearments.';
    } else if (tone.toLowerCase() === 'aggressive') {
      toneInstructions = 'Be blunt, direct, and confrontational. Use short, sharp sentences. Don\'t hold back criticism. Be rude. Don\'t start the sentence with "Here is a response based on your settings" or something like that. And don\'t have text with "Don\'t waste my time." ';
    } else {
      toneInstructions = `Be ${tone} in tone.`;
    }
    
    // Generate greeting (max 5 words)
    const greetingPrompt = `Generate a short greeting (max 5 words) in a ${tone} tone for ${name} at ${time} on ${date}. ${toneInstructions} Do not use emojis.`;
    
    // Generate subtext (max 12 words) - be direct, no intros
    let subtextPrompt = `Write a single, concise message (max 12 words). ${toneInstructions} `;
    
    // Add context without assuming ownership
    let contextInfo = [];
    if (recentDocuments.length > 0) {
      contextInfo.push(`Recent documents the user has created (not you, the AI): ${recentDocuments.slice(0, 3).join(', ')}`);
    }
    
    if (upcomingDeadlines.length > 0) {
      contextInfo.push(`${upcomingDeadlines.length} upcoming deadlines`);
    }
    
    if (passedDeadlines.length > 0) {
      contextInfo.push(`${passedDeadlines.length} passed deadlines`);
    }
    
    if (contextInfo.length > 0) {
      subtextPrompt += `Context (use naturally, don't list): ${contextInfo.join('; ')}. `;
    }
    
    // Final instruction to ensure natural, non-repetitive output
    subtextPrompt += `Create a smooth, natural message that incorporates this context without explicitly listing it.`;
    
    const [greeting, subtext] = await Promise.all([
      generateAiResponse(greetingPrompt, { max_tokens: 30, temperature: 0.7 }),
      generateAiResponse(subtextPrompt, { max_tokens: 50, temperature: 0.7 })
    ]);
    
    return {
      greeting: greeting.trim().replace(/"/g, '').substring(0, 50), // Limit length and remove quotes
      sub: subtext.trim().replace(/"/g, '').substring(0, 100) // Limit length and remove quotes
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
