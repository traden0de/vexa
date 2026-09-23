export type Lang = 'en' | 'ru'

export type FeatureIcon =
  | 'queue'
  | 'questions'
  | 'diff'
  | 'merge'
  | 'agents'
  | 'git'
  | 'limits'
  | 'claudemd'
  | 'updates'
  | 'ui'

export type Dict = {
  meta: { title: string; description: string }
  nav: { pipeline: string; features: string; install: string; faq: string; github: string; skip: string }
  theme: { label: string; system: string; light: string; dark: string }
  lang: { label: string }
  hero: { eyebrow: string; title: [string, string]; lead: string; note: string; cli: string }
  download: {
    main: string
    more: string
    release: string
    all: string
    source: string
    platform: string
  }
  board: {
    columns: { queue: string; progress: string; review: string; done: string }
    cards: { queue: [string, string]; progress: string; review: string; done: string }
    stage: string
    iteration: string
    bump: string
    merged: string
    types: { feature: string; bug: string; chore: string }
  }
  pipeline: {
    title: string
    lead: string
    stages: { name: string; who: string; text: string }[]
    loop: string
    you: string
  }
  features: { title: string; lead: string; items: { icon: FeatureIcon; title: string; text: string }[] }
  how: { title: string; steps: { title: string; text: string }[] }
  install: {
    title: string
    lead: string
    reqs: { title: string; text: string }[]
    smartscreen: { title: string; text: string }
  }
  news: { title: string; released: string; all: string }
  faq: { title: string; items: { q: string; a: string }[] }
  footer: { tagline: string; license: string; releases: string; issues: string }
}
