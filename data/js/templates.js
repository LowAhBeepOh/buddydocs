export const TEMPLATES = {
  essay: {
    key: 'essay',
    title: 'Essay',
    type: 'document',
    description: 'A standard template for writing essays.',
    category: 'Study',
    content: `
      <h1>Essay Title</h1>
      <p><strong>Name:</strong> Your Name<br><strong>Date:</strong> YYYY-MM-DD</p>
      <h2>Introduction</h2>
      <p>Start with a hook to grab the reader's attention and provide some background information on your topic. End this paragraph with a clear thesis statement that presents your main argument.</p>
      <h2>Body Paragraph 1</h2>
      <p>Begin with a topic sentence that introduces the main idea of this paragraph. Provide evidence, examples, or quotes to support your point. Analyze the evidence and explain how it connects to your thesis.</p>
      <h2>Body Paragraph 2</h2>
      <p>Introduce your second point with a clear transition. Follow the same structure as the first body paragraph, providing evidence and analysis to support your thesis.</p>
      <h2>Conclusion</h2>
      <p>Restate your thesis in a new way. Summarize your main points and provide a final thought or insight on the topic. You can also suggest areas for further research or discussion.</p>
    `
  },
  cornell_notes: {
    key: 'cornell_notes',
    title: 'Cornell Notes',
    type: 'document',
    description: 'A system for taking, organizing, and reviewing notes.',
    category: 'Study',
    content: `
      <h1>Topic: [Subject of Notes]</h1>
      <p><strong>Course:</strong> [Course Name]<br><strong>Date:</strong> [Date]</p>
      <hr>
      <table>
        <tbody>
          <tr>
            <td style="width: 30%; border-right: 1px solid #ccc; padding-right: 10px; vertical-align: top;">
              <h2>Cues & Questions</h2>
              <p><em>After the lecture, pull out key ideas, questions, and vocabulary here.</em></p>
            </td>
            <td style="padding-left: 10px; vertical-align: top;">
              <h2>Notes</h2>
              <p><em>Take your notes in this section during the lecture.</em></p>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="border-top: 1px solid #ccc; padding-top: 10px;">
              <h2>Summary</h2>
              <p><em>After reviewing your notes, write a brief summary of the key points from this page.</em></p>
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
    description: 'A standard structure for documenting a scientific experiment.',
    category: 'Study',
    content: `
      <h1>Lab Report: [Title of Experiment]</h1>
      <p><strong>Name:</strong> Your Name<br><strong>Date:</strong> YYYY-MM-DD</p>
      <h2>1. Introduction</h2>
      <p>State the objective of the experiment and provide a brief background. Include your hypothesis.</p>
      <h2>2. Materials & Methods</h2>
      <p>List all materials and equipment used. Describe the procedure in enough detail that someone else could replicate the experiment.</p>
      <h2>3. Results</h2>
      <p>Present your findings using a combination of text, tables, and figures. Do not interpret the results here.</p>
      <h2>4. Discussion</h2>
      <p>Analyze and interpret your results. Discuss any sources of error and suggest improvements. Relate your findings back to your original hypothesis.</p>
      <h2>5. Conclusion</h2>
      <p>Briefly summarize the key findings of your experiment.</p>
    `
  },
  reading_log: {
    key: 'reading_log',
    title: 'Reading Log',
    type: 'document',
    description: 'Track and reflect on books, articles, or other readings.',
    category: 'Log',
    content: `
      <h1>Reading Log</h1>
      <p><strong>Title:</strong> [Book/Article Title]<br><strong>Author:</strong> [Author Name]</p>
      <h2>Summary</h2>
      <p>Write a brief summary of the reading for this entry.</p>
      <h2>Key Takeaways & Quotes</h2>
      <ul>
        <li>"A quote that stood out to you." - Page [Number]</li>
      </ul>
      <h2>Reflections</h2>
      <p>What are your thoughts, questions, or connections to this reading?</p>
    `
  },
  journal: {
    key: 'journal',
    title: 'Journal',
    type: 'document',
    description: 'A simple, flexible entry for daily thoughts and reflections.',
    category: 'Log',
    content: `
      <h1>Journal Entry: [Date]</h1>
      <h2>Today's Thoughts</h2>
      <p>Write about your day, what's on your mind, or anything else you want to document.</p>
      <h2>Highlights & Challenges</h2>
      <p>What was the best part of your day? What was a challenge you faced?</p>
    `
  },
  story_outline: {
    key: 'story_outline',
    title: 'Story Outline',
    type: 'document',
    description: 'A basic three-act structure to plan your narrative.',
    category: 'Creative',
    content: `
      <h1>Story Outline: [Working Title]</h1>
      <h2>Act I: The Setup</h2>
      <p><strong>Exposition:</strong> Introduce the main character and their world.<br><strong>Inciting Incident:</strong> The event that kicks off the story.</p>
      <h2>Act II: The Confrontation</h2>
      <p><strong>Rising Action:</strong> A series of challenges and obstacles.<br><strong>Midpoint:</strong> A major turning point in the story.</p>
      <h2>Act III: The Resolution</h2>
      <p><strong>Climax:</strong> The final confrontation.<br><strong>Resolution:</strong> The aftermath and new normal.</p>
    `
  },
  character_profile: {
    key: 'character_profile',
    title: 'Character Profile',
    type: 'document',
    description: 'Flesh out your characters with this detailed profile.',
    category: 'Creative',
    content: `
      <h1>Character Profile: [Character Name]</h1>
      <h2>Core Details</h2>
      <p><strong>Age:</strong> <br><strong>Occupation:</strong> <br><strong>Goal:</strong> What do they want?</p>
      <h2>Personality</h2>
      <p><strong>Strengths:</strong> <br><strong>Weaknesses:</strong> </p>
      <h2>Backstory</h2>
      <p>A brief summary of their history and what made them who they are.</p>
    `
  },
  recipe: {
    key: 'recipe',
    title: 'Recipe',
    type: 'document',
    description: 'A simple card to save your favorite recipes.',
    category: 'Personal',
    content: `
      <h1>Recipe: [Recipe Name]</h1>
      <h2>Ingredients</h2>
      <ul>
        <li></li>
        <li></li>
      </ul>
      <h2>Instructions</h2>
      <ol>
        <li></li>
        <li></li>
      </ol>
    `
  },
  to_do_list: {
    key: 'to_do_list',
    title: 'To-Do List',
    type: 'list',
    description: 'A checklist for tasks and goals.',
    category: 'Personal',
    content: `
      <h1>To-Do List</h1>
      <ul>
        <li>Task 1</li>
        <li>Task 2</li>
        <li>Task 3</li>
      </ul>
    `
  }
};
