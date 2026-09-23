import type { Dict } from './types'

export const en: Dict = {
  meta: {
    title: 'Vexa — a kanban board where Claude Code does the work',
    description:
      'Desktop app for Windows that runs Claude Code agents through plan, code, tests, review, security and release — one task at a time, one git branch per task. Uses your Claude subscription, no API keys.'
  },
  nav: { pipeline: 'Pipeline', features: 'Features', install: 'Install', faq: 'FAQ', github: 'GitHub', skip: 'Skip to content' },
  theme: { label: 'Theme', system: 'System', light: 'Light', dark: 'Dark' },
  lang: { label: 'Language' },
  hero: {
    eyebrow: 'Open source · Windows',
    title: ['A kanban board where ', 'Claude Code does the work'],
    lead:
      'Put a task on the board and Vexa takes it through planning, code, tests, code review and a security check on its own git branch. You approve the plan and accept the result — everything in between runs by itself.',
    note: 'Runs the Claude Code CLI you already have, on your Pro or Max subscription. No API keys, no terminal.',
    cli: 'what Vexa runs for every agent'
  },
  download: {
    main: 'Download for Windows',
    more: 'More download options',
    release: 'Release page on GitHub',
    all: 'All versions',
    source: 'Source code',
    platform: 'Windows 10/11 · x64 · MIT license'
  },
  board: {
    columns: { queue: 'Queue', progress: 'In progress', review: 'Review', done: 'Done' },
    cards: {
      queue: ['Export tasks to CSV', 'Dark theme for the settings page'],
      progress: 'Fix scroll after CLAUDE.md generation',
      review: 'Rate-limit the login endpoint',
      done: 'Custom branch names'
    },
    stage: 'tests',
    iteration: 'fix 2/3',
    bump: 'minor',
    merged: 'merged',
    types: { feature: 'feature', bug: 'bug', chore: 'chore' }
  },
  pipeline: {
    title: 'Every task, the same full cycle',
    lead: 'Six preset agents, each with its own prompt, model and permissions. Tasks run strictly one after another, so agents never trip over each other’s changes.',
    stages: [
      { name: 'Plan', who: 'planner', text: 'Reads the project and its CLAUDE.md, asks questions if the task is ambiguous, writes a plan.' },
      { name: 'Approve', who: 'you', text: 'Edit the plan, re-plan or approve it with one button.' },
      { name: 'Code', who: 'developer', text: 'Implements the plan on the task’s branch.' },
      { name: 'Tests', who: 'tester', text: 'Writes and runs tests for the change.' },
      { name: 'Review', who: 'reviewer', text: 'Reviews the diff and requests changes.' },
      { name: 'Security', who: 'security', text: 'Audits the change; high and critical findings block it.' },
      { name: 'Release', who: 'release', text: 'Proposes MAJOR / MINOR / PATCH and a CHANGELOG entry.' },
      { name: 'Merge', who: 'you', text: 'Review the diff and reports, accept — Vexa merges, bumps the version and tags.' }
    ],
    loop: 'Failed tests, requested changes and serious findings go back to the developer automatically',
    you: 'your call'
  },
  features: {
    title: 'Built for handing work off, not babysitting it',
    lead: 'Everything the CLI can do, behind buttons — with the git hygiene you would do by hand.',
    items: [
      { icon: 'queue', title: 'Sequential queue', text: 'Drag cards into the queue; one runs at a time, each on its own branch from the right base.' },
      { icon: 'questions', title: 'Planner asks first', text: 'When a choice changes the implementation, the planner asks with options. Tick “Discuss” to always talk it through.' },
      { icon: 'diff', title: 'Review in one place', text: 'Live agent log, a Monaco diff, every agent’s report, cost and time — then accept or send back.' },
      { icon: 'merge', title: 'Versions without conflicts', text: 'A --no-ff merge, the version bump in package.json, pyproject, Cargo or csproj, a CHANGELOG entry and a vX.Y.Z tag.' },
      { icon: 'agents', title: 'Your agents', text: 'Edit prompts, model, effort, permission mode and tools — globally or per project.' },
      { icon: 'git', title: 'Git screen', text: 'Status, commit with an AI-written message, branches, history, pull, push and stash.' },
      { icon: 'limits', title: 'Subscription limits', text: 'Your 5-hour and weekly usage in the status bar. At the limit the queue pauses and resumes after the reset.' },
      { icon: 'claudemd', title: 'Respects CLAUDE.md', text: 'Open any project; agents follow its CLAUDE.md. None yet? Generate one with /init from the Project screen.' },
      { icon: 'updates', title: 'Updates itself', text: 'New versions from GitHub Releases, downloaded only when you agree and never in the middle of a task.' },
      { icon: 'ui', title: 'Made to be comfortable', text: 'English and Russian, light and dark themes, a guided tour on first launch.' }
    ]
  },
  how: {
    title: 'Three steps',
    steps: [
      { title: 'Open a folder', text: 'Any git project. Vexa checks that claude and git are installed and that you are signed in.' },
      { title: 'Describe the task', text: 'Title, description, type and priority. Optionally a branch name and “Discuss before planning”.' },
      { title: 'Approve and accept', text: 'Approve the plan, go do something else, come back to a reviewed, tested, versioned change.' }
    ]
  },
  install: {
    title: 'Install',
    lead: 'A regular installer: choose a folder and you are done. Installed copies update themselves.',
    reqs: [
      { title: 'Windows 10 or 11', text: 'macOS and Linux are planned.' },
      { title: 'Claude Code', text: 'Installed and signed in with a Pro or Max subscription.' },
      { title: 'Git', text: 'Vexa creates a branch per task and merges locally.' }
    ],
    smartscreen: {
      title: '“Windows protected your PC”?',
      text: 'The installer is not code-signed yet. Click More info → Run anyway.'
    }
  },
  news: { title: 'What’s new', released: 'released', all: 'Full changelog' },
  faq: {
    title: 'Questions',
    items: [
      { q: 'Is it free?', a: 'Yes. Vexa is open source under the MIT license. You only need your own Claude subscription.' },
      { q: 'Do I need an API key?', a: 'No. Vexa starts the claude CLI installed on your computer, so work counts against your Pro or Max plan the same way as in the terminal.' },
      { q: 'Where does my code go?', a: 'Nowhere new. Vexa runs locally and talks only to the Claude Code CLI; nothing is sent to Vexa’s authors.' },
      { q: 'Can agents break my main branch?', a: 'Every task works on its own branch. Nothing lands on your base branch until you press Accept, and then it is a regular --no-ff merge you can revert.' },
      { q: 'Does it work with any language or framework?', a: 'Yes — agents work the way Claude Code does. Version bumps understand package.json, pyproject.toml, Cargo.toml, *.csproj and VERSION files.' },
      { q: 'macOS or Linux?', a: 'Not yet. Windows comes first; the app is built with Electron, so other platforms are a matter of time.' }
    ]
  },
  footer: {
    tagline: 'A desktop IDE for managing Claude Code agents.',
    license: 'MIT license',
    releases: 'Releases',
    issues: 'Report an issue'
  }
}
