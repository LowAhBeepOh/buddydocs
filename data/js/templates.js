export const TEMPLATES = {
  // Study Templates
  essay: {
    key: 'essay',
    title: 'Essay',
    type: 'essay',
    description: 'Five-paragraph essay with introduction, body, and conclusion.',
    category: 'Study',
    icon: '📝',
    content: `
      <h1>Essay Title</h1>
      <p><strong>Name:</strong> Your Name<br><strong>Date:</strong> YYYY-MM-DD<br><strong>Class:</strong> [Class Name]</p>
      <h2>Introduction</h2>
      <p>Start with a hook to grab the reader's attention and provide some background information on your topic. End this paragraph with a clear thesis statement that presents your main argument.</p>
      <h2>Body Paragraph 1</h2>
      <p><strong>Topic Sentence:</strong> [Main idea]<br>Begin with a topic sentence that introduces the main idea of this paragraph. Provide evidence, examples, or quotes to support your point. Analyze the evidence and explain how it connects to your thesis.</p>
      <h2>Body Paragraph 2</h2>
      <p><strong>Topic Sentence:</strong> [Main idea]<br>Introduce your second point with a clear transition. Follow the same structure as the first body paragraph, providing evidence and analysis to support your thesis.</p>
      <h2>Body Paragraph 3</h2>
      <p><strong>Topic Sentence:</strong> [Main idea]<br>Present your third supporting point with evidence and analysis.</p>
      <h2>Conclusion</h2>
      <p>Restate your thesis in a new way. Summarize your main points and provide a final thought or insight on the topic. You can also suggest areas for further research or discussion.</p>
    `
  },
  cornell_notes: {
    key: 'cornell_notes',
    title: 'Cornell Notes',
    type: 'document',
    description: 'Organized note-taking system with cues, notes, and summary sections.',
    category: 'Study',
    icon: '📓',
    content: `
      <h1>Cornell Notes</h1>
      <p><strong>Course:</strong> [Course Name]<br><strong>Topic:</strong> [Subject of Notes]<br><strong>Date:</strong> [Date]<br><strong>Instructor:</strong> [Instructor Name]</p>
      <hr>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          <tr>
            <td style="width: 30%; border-right: 2px solid #ccc; padding-right: 12px; padding-bottom: 12px; vertical-align: top;">
              <h3 style="margin-top: 0;">Cues & Questions</h3>
              <p><em>After the lecture, write key ideas, questions, and vocabulary here.</em></p>
              <ul>
                <li></li>
                <li></li>
                <li></li>
              </ul>
            </td>
            <td style="padding-left: 12px; padding-bottom: 12px; vertical-align: top;">
              <h3 style="margin-top: 0;">Notes</h3>
              <p><em>Take your notes in this section during the lecture.</em></p>
              <p></p>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="border-top: 2px solid #ccc; padding-top: 12px;">
              <h3>Summary</h3>
              <p><em>After reviewing your notes, write a brief summary of the key points from this page.</em></p>
              <p></p>
            </td>
          </tr>
        </tbody>
      </table>
    `
  },
  lab_report: {
    key: 'lab_report',
    title: 'Lab Report',
    type: 'document',
    description: 'Scientific experiment documentation with hypothesis, methods, and results.',
    category: 'Study',
    icon: '🔬',
    content: `
      <h1>Lab Report: [Title of Experiment]</h1>
      <p><strong>Name:</strong> Your Name<br><strong>Date:</strong> YYYY-MM-DD<br><strong>Course:</strong> [Course Name]<br><strong>Lab Partner(s):</strong> [Names]</p>
      <h2>1. Introduction & Hypothesis</h2>
      <p><strong>Objective:</strong> State the objective of the experiment.<br><strong>Background:</strong> Provide a brief background and relevant theory.<br><strong>Hypothesis:</strong> What do you predict will happen and why?</p>
      <h2>2. Materials & Methods</h2>
      <p><strong>Materials:</strong></p>
      <ul>
        <li></li>
        <li></li>
      </ul>
      <p><strong>Procedure:</strong> Describe the steps in enough detail that someone else could replicate the experiment.</p>
      <ol>
        <li></li>
        <li></li>
      </ol>
      <h2>3. Results</h2>
      <p>Present your findings using text, tables, and/or figures. Do not interpret the results here.</p>
      <h2>4. Discussion & Analysis</h2>
      <p>Analyze and interpret your results. Did your results support your hypothesis? Discuss any sources of error and suggest improvements.</p>
      <h2>5. Conclusion</h2>
      <p>Briefly summarize the key findings and their significance.</p>
    `
  },
  study_guide: {
    key: 'study_guide',
    title: 'Study Guide',
    type: 'document',
    description: 'Comprehensive study guide for exams with key concepts and practice questions.',
    category: 'Study',
    icon: '📚',
    content: `
      <h1>Study Guide: [Subject/Chapter]</h1>
      <p><strong>Course:</strong> [Course Name]<br><strong>Exam Date:</strong> [Date]<br><strong>Created:</strong> [Date]</p>
      <h2>Key Concepts</h2>
      <ul>
        <li><strong>Concept 1:</strong> [Definition and explanation]</li>
        <li><strong>Concept 2:</strong> [Definition and explanation]</li>
        <li><strong>Concept 3:</strong> [Definition and explanation]</li>
      </ul>
      <h2>Important Formulas & Equations</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
      <h2>Key Dates & Events</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
      <h2>Practice Questions</h2>
      <ol>
        <li>Question 1?</li>
        <li>Question 2?</li>
        <li>Question 3?</li>
      </ol>
      <h2>Common Mistakes to Avoid</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
    `
  },
  project_plan: {
    key: 'project_plan',
    title: 'Project Plan',
    type: 'document',
    description: 'Organize your project with goals, timeline, and task breakdown.',
    category: 'Study',
    icon: '🎯',
    content: `
      <h1>Project Plan: [Project Name]</h1>
      <p><strong>Subject:</strong> [Subject]<br><strong>Due Date:</strong> [Date]<br><strong>Team Members:</strong> [Names]</p>
      <h2>Project Overview</h2>
      <p><strong>Objective:</strong> What is the goal of this project?<br><strong>Scope:</strong> What will be included?</p>
      <h2>Key Milestones</h2>
      <ul>
        <li><strong>Milestone 1:</strong> [Description] - Due: [Date]</li>
        <li><strong>Milestone 2:</strong> [Description] - Due: [Date]</li>
        <li><strong>Milestone 3:</strong> [Description] - Due: [Date]</li>
      </ul>
      <h2>Tasks & Responsibilities</h2>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
        <tr style="background: #152685ff;">
          <th style="border: 1px solid #ccc; padding: 8px; color: white;">Task</th>
          <th style="border: 1px solid #ccc; padding: 8px; color: white;">Assigned To</th>
          <th style="border: 1px solid #ccc; padding: 8px; color: white;">Due Date</th>
          <th style="border: 1px solid #ccc; padding: 8px; color: white;">Status</th>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px;"></td>
          <td style="border: 1px solid #ccc; padding: 8px;"></td>
          <td style="border: 1px solid #ccc; padding: 8px;"></td>
          <td style="border: 1px solid #ccc; padding: 8px;"></td>
        </tr>
      </table>
      <h2>Resources Needed</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
    `
  },

  // Log Templates
  reading_log: {
    key: 'reading_log',
    title: 'Reading Log',
    type: 'document',
    description: 'Track books and articles with summaries, quotes, and reflections.',
    category: 'Log',
    icon: '📖',
    content: `
      <h1>Reading Log</h1>
      <p><strong>Title:</strong> [Book/Article Title]<br><strong>Author:</strong> [Author Name]<br><strong>Date Started:</strong> [Date]<br><strong>Date Finished:</strong> [Date]</p>
      <h2>Summary</h2>
      <p>Write a brief summary of the main ideas and plot.</p>
      <h2>Key Takeaways</h2>
      <ul>
        <li></li>
        <li></li>
        <li></li>
      </ul>
      <h2>Memorable Quotes</h2>
      <ul>
        <li>"[Quote]" - Page [Number]</li>
        <li>"[Quote]" - Page [Number]</li>
      </ul>
      <h2>Personal Reflections</h2>
      <p>What are your thoughts? How did this reading connect to your life or other things you've learned?</p>
      <h2>Rating</h2>
      <p>⭐⭐⭐⭐⭐ (1-5 stars)</p>
    `
  },
  journal: {
    key: 'journal',
    title: 'Journal Entry',
    type: 'document',
    description: 'Daily reflection with thoughts, highlights, and gratitude.',
    category: 'Log',
    icon: '✍️',
    content: `
      <h1>Journal Entry</h1>
      <p><strong>Date:</strong> [Date]<br><strong>Mood:</strong> [Happy/Neutral/Sad/Excited/etc.]</p>
      <h2>Today's Highlights</h2>
      <p>What was the best part of your day?</p>
      <h2>Challenges & Lessons</h2>
      <p>What was difficult? What did you learn?</p>
      <h2>Thoughts & Reflections</h2>
      <p>What's on your mind? What are you thinking about?</p>
      <h2>Gratitude</h2>
      <p>What are you grateful for today?</p>
      <h2>Tomorrow's Goals</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
    `
  },

  // Creative Templates
  story_outline: {
    key: 'story_outline',
    title: 'Story Outline',
    type: 'document',
    description: 'Three-act story structure for planning narratives.',
    category: 'Creative',
    icon: '📖',
    content: `
      <h1>Story Outline: [Working Title]</h1>
      <p><strong>Genre:</strong> [Genre]<br><strong>Setting:</strong> [Time & Place]<br><strong>Target Audience:</strong> [Audience]</p>
      <h2>Act I: The Setup</h2>
      <p><strong>Exposition:</strong> Introduce the main character(s) and their world. What is the status quo?<br><strong>Inciting Incident:</strong> The event that kicks off the story and disrupts the status quo.</p>
      <h2>Act II: The Confrontation</h2>
      <p><strong>Rising Action:</strong> A series of challenges, obstacles, and complications that the protagonist must overcome.<br><strong>Midpoint:</strong> A major turning point or revelation that changes the direction of the story.</p>
      <h2>Act III: The Resolution</h2>
      <p><strong>Climax:</strong> The final confrontation where the main conflict reaches its peak.<br><strong>Falling Action:</strong> Events after the climax that lead toward resolution.<br><strong>Resolution:</strong> The aftermath and the new normal for the characters.</p>
      <h2>Key Themes</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
    `
  },
  character_profile: {
    key: 'character_profile',
    title: 'Character Profile',
    type: 'document',
    description: 'Detailed character development template for fiction writing.',
    category: 'Creative',
    icon: '👤',
    content: `
      <h1>Character Profile: [Character Name]</h1>
      <h2>Basic Information</h2>
      <p><strong>Age:</strong> <br><strong>Gender:</strong> <br><strong>Occupation:</strong> <br><strong>Location:</strong> </p>
      <h2>Physical Appearance</h2>
      <p><strong>Height/Build:</strong> <br><strong>Distinctive Features:</strong> <br><strong>Style:</strong> </p>
      <h2>Personality & Traits</h2>
      <p><strong>Strengths:</strong> <br><strong>Weaknesses:</strong> <br><strong>Fears:</strong> <br><strong>Desires:</strong> </p>
      <h2>Background & History</h2>
      <p>A brief summary of their past, family, and what shaped them into who they are.</p>
      <h2>Goals & Motivations</h2>
      <p><strong>Main Goal:</strong> What do they want most?<br><strong>Why:</strong> What motivates them?</p>
      <h2>Relationships</h2>
      <p>How do they relate to other characters? Allies? Enemies? Love interests?</p>
    `
  },
  poem_template: {
    key: 'poem_template',
    title: 'Poem',
    type: 'document',
    description: 'Creative space for writing poetry with structure guidance.',
    category: 'Creative',
    icon: '✨',
    content: `
      <h1>[Poem Title]</h1>
      <p><strong>Author:</strong> Your Name<br><strong>Date:</strong> [Date]<br><strong>Theme:</strong> [Theme]</p>
      <hr>
      <p style="line-height: 1.8; font-style: italic;">
        [Stanza 1]<br>
        <br>
        [Stanza 2]<br>
        <br>
        [Stanza 3]<br>
      </p>
      <hr>
      <h2>Notes</h2>
      <p><strong>Inspiration:</strong> What inspired this poem?<br><strong>Techniques Used:</strong> [Rhyme scheme, metaphor, alliteration, etc.]</p>
    `
  },

  // Personal Templates
  to_do_list: {
    key: 'to_do_list',
    title: 'To-Do List',
    type: 'document',
    description: 'Organize tasks and track progress.',
    category: 'Personal',
    icon: '✓',
    content: `
      <h1>To-Do List</h1>
      <p><strong>Date:</strong> [Date]<br><strong>Priority:</strong> [High/Medium/Low]</p>
      <h2>Tasks</h2>
      <ul>
        <li>☐ Task 1</li>
        <li>☐ Task 2</li>
        <li>☐ Task 3</li>
        <li>☐ Task 4</li>
        <li>☐ Task 5</li>
      </ul>
      <h2>Completed</h2>
      <ul>
        <li>☑ Completed task</li>
      </ul>
    `
  },
  meeting_notes: {
    key: 'meeting_notes',
    title: 'Meeting Notes',
    type: 'document',
    description: 'Capture meeting details, decisions, and action items.',
    category: 'Personal',
    icon: '💬',
    content: `
      <h1>Meeting Notes</h1>
      <p><strong>Date:</strong> [Date]<br><strong>Time:</strong> [Time]<br><strong>Location:</strong> [Location/Virtual]<br><strong>Attendees:</strong> [Names]</p>
      <h2>Agenda</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
      <h2>Discussion Points</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
      <h2>Decisions Made</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
      <h2>Action Items</h2>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
        <tr style="background: #f0f0f0;">
          <th style="border: 1px solid #ccc; padding: 8px;">Action</th>
          <th style="border: 1px solid #ccc; padding: 8px;">Owner</th>
          <th style="border: 1px solid #ccc; padding: 8px;">Due Date</th>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px;"></td>
          <td style="border: 1px solid #ccc; padding: 8px;"></td>
          <td style="border: 1px solid #ccc; padding: 8px;"></td>
        </tr>
      </table>
      <h2>Next Meeting</h2>
      <p><strong>Date:</strong> [Date]<br><strong>Time:</strong> [Time]</p>
    `
  },
  recipe: {
    key: 'recipe',
    title: 'Recipe',
    type: 'document',
    description: 'Save and organize your favorite recipes.',
    category: 'Personal',
    icon: '🍳',
    content: `
      <h1>Recipe: [Recipe Name]</h1>
      <p><strong>Cuisine:</strong> [Cuisine Type]<br><strong>Prep Time:</strong> [Time]<br><strong>Cook Time:</strong> [Time]<br><strong>Servings:</strong> [Number]</p>
      <h2>Ingredients</h2>
      <ul>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
      </ul>
      <h2>Instructions</h2>
      <ol>
        <li></li>
        <li></li>
        <li></li>
      </ol>
      <h2>Notes</h2>
      <p>Any tips, variations, or personal notes about this recipe?</p>
    `
  },

  // Math Templates
  math_spreadsheet: {
    key: 'math_spreadsheet',
    title: 'Math Spreadsheet',
    type: 'math',
    description: 'Mathematical spreadsheet with graphing capabilities.',
    category: 'Study',
    icon: '📊',
    content: `
      Math spreadsheet for calculations and visualizations.
    `
  }
};
