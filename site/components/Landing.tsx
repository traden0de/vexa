import type { ReactNode } from 'react'
import {
  Bot,
  Check,
  FileCode2,
  FileDiff,
  GitBranch,
  GitMerge,
  Gauge,
  Languages,
  ListOrdered,
  MessagesSquare,
  RefreshCw,
  RotateCcw,
  ShieldAlert
} from 'lucide-react'
import type { Dict, FeatureIcon, Lang } from '@/content/types'
import { getRelease, REPO } from '@/lib/release'
import { DownloadButton } from './DownloadButton'
import { ThemeToggle } from './ThemeToggle'
import { Inline } from './Inline'

const FEATURE_ICONS: Record<FeatureIcon, typeof Bot> = {
  queue: ListOrdered,
  questions: MessagesSquare,
  diff: FileDiff,
  merge: GitMerge,
  agents: Bot,
  git: GitBranch,
  limits: Gauge,
  claudemd: FileCode2,
  updates: RefreshCw,
  ui: Languages
}

export async function Landing({ dict: d, lang }: { dict: Dict; lang: Lang }): Promise<ReactNode> {
  const release = await getRelease()
  const download = (
    <DownloadButton labels={d.download} version={release.version} installer={release.installer} releasePage={release.page} repo={REPO} />
  )

  return (
    <>
      <a className="skip" href="#main">
        {d.nav.skip}
      </a>
      <header className="top">
        <div className="wrap top-in">
          <a className="logo" href={lang === 'en' ? '/' : '/ru/'}>
            <img src="/icon.png" alt="" width={28} height={28} />
            <span>Vexa</span>
          </a>
          <nav className="top-nav" aria-label="Sections">
            <a href="#pipeline">{d.nav.pipeline}</a>
            <a href="#features">{d.nav.features}</a>
            <a href="#install">{d.nav.install}</a>
            <a href="#faq">{d.nav.faq}</a>
          </nav>
          <div className="top-tools">
            <nav className="lang" aria-label={d.lang.label}>
              <a href="/" hrefLang="en" aria-current={lang === 'en' ? 'page' : undefined}>
                EN
              </a>
              <a href="/ru/" hrefLang="ru" aria-current={lang === 'ru' ? 'page' : undefined}>
                RU
              </a>
            </nav>
            <ThemeToggle labels={d.theme} />
            <a className="icon-btn" href={REPO} aria-label={d.nav.github} title={d.nav.github}>
              <GitHubMark />
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">{d.hero.eyebrow}</p>
            <h1>
              {d.hero.title[0]}
              <em>{d.hero.title[1]}</em>
            </h1>
            <p className="lead">{d.hero.lead}</p>
            {download}
            <p className="hero-note">{d.hero.note}</p>
          </div>
          <BoardMock d={d} />
        </section>

        <div className="wrap">
          <figure className="cli">
            <pre>
              <code>
                <span className="cli-prompt">$</span> claude -p --output-format stream-json --permission-mode acceptEdits{' '}
                <span className="cli-dim">--append-system-prompt</span> <span className="cli-arg">&lt;developer.md&gt;</span>
              </code>
            </pre>
            <figcaption>{d.hero.cli}</figcaption>
          </figure>
        </div>

        <section id="pipeline" className="section wrap split-section">
          <div className="section-head">
            <h2>{d.pipeline.title}</h2>
            <p>{d.pipeline.lead}</p>
          </div>
          <Pipeline d={d} />
        </section>

        <section id="features" className="section wrap">
          <div className="section-head wide">
            <h2>{d.features.title}</h2>
            <p>{d.features.lead}</p>
          </div>
          <ul className="features">
            {d.features.items.map((f) => {
              const Icon = FEATURE_ICONS[f.icon]
              return (
                <li key={f.title}>
                  <Icon aria-hidden />
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="section wrap">
          <h2 className="center">{d.how.title}</h2>
          <ol className="steps">
            {d.how.steps.map((s, i) => (
              <li key={s.title}>
                <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="install" className="section wrap">
          <div className="install">
            <div className="install-main">
              <h2>{d.install.title}</h2>
              <p className="lead">{d.install.lead}</p>
              {download}
              <div className="smartscreen">
                <ShieldAlert aria-hidden />
                <div>
                  <b>{d.install.smartscreen.title}</b>
                  <p>{d.install.smartscreen.text}</p>
                </div>
              </div>
            </div>
            <ul className="reqs">
              {d.install.reqs.map((r) => (
                <li key={r.title}>
                  <Check aria-hidden />
                  <div>
                    <b>{r.title}</b>
                    <p>{r.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <article className="news" aria-labelledby="news-h">
            <header className="news-head">
              <h2 id="news-h">{d.news.title}</h2>
              <span className="tag">v{release.version}</span>
              {release.date && (
                <span className="faint">
                  {d.news.released} <time dateTime={release.date}>{formatDate(release.date, lang)}</time>
                </span>
              )}
            </header>
            {release.intro && <p>{release.intro}</p>}
            {release.notes.map((g, i) => (
              <div key={i} className="news-group">
                {g.heading && <h3>{g.heading}</h3>}
                <ul>
                  {g.items.map((it, j) => (
                    <li key={j}>
                      <Inline text={it} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <a className="more" href={`${REPO}/blob/main/CHANGELOG.md`}>
              {d.news.all} →
            </a>
          </article>
        </section>

        <section id="faq" className="section wrap split-section">
          <div className="section-head">
            <h2>{d.faq.title}</h2>
          </div>
          <div className="faq">
            {d.faq.items.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-in">
          <div className="logo">
            <img src="/icon.png" alt="" width={24} height={24} />
            <span>Vexa</span>
          </div>
          <p className="faint">{d.footer.tagline}</p>
          <nav className="foot-nav" aria-label="Links">
            <a href={REPO}>GitHub</a>
            <a href={`${REPO}/releases`}>{d.footer.releases}</a>
            <a href={`${REPO}/issues`}>{d.footer.issues}</a>
            <a href={`${REPO}/blob/main/LICENSE`}>{d.footer.license}</a>
          </nav>
        </div>
      </footer>
    </>
  )
}

function formatDate(iso: string, lang: Lang): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

function Pipeline({ d }: { d: Dict }): ReactNode {
  const stages = d.pipeline.stages.map((s, i) => ({ ...s, n: i + 1, you: i === 1 || i === 7 }))
  const Stage = ({ s }: { s: (typeof stages)[number] }): ReactNode => (
    <li className={s.you ? 'stage you' : 'stage'}>
      <span className="stage-n">{String(s.n).padStart(2, '0')}</span>
      <div>
        <div className="stage-head">
          <h3>{s.name}</h3>
          <span className="who">{s.you ? d.pipeline.you : s.who}</span>
        </div>
        <p>{s.text}</p>
      </div>
    </li>
  )
  return (
    <div className="pipeline">
      <ol>
        {stages.slice(0, 2).map((s) => (
          <Stage key={s.n} s={s} />
        ))}
      </ol>
      <div className="loop">
        <ol start={3}>
          {stages.slice(2, 6).map((s) => (
            <Stage key={s.n} s={s} />
          ))}
        </ol>
        <p className="loop-label">
          <RotateCcw aria-hidden />
          {d.pipeline.loop}
        </p>
      </div>
      <ol start={7}>
        {stages.slice(6).map((s) => (
          <Stage key={s.n} s={s} />
        ))}
      </ol>
    </div>
  )
}

/** The board drawn in HTML/CSS (not a screenshot), so it follows the page theme. */
function BoardMock({ d }: { d: Dict }): ReactNode {
  const b = d.board
  const stages = ['plan', 'code', 'tests', 'review', 'security', 'release']
  return (
    <div className="board" aria-hidden>
      <div className="board-bar">
        <img src="/icon.png" alt="" width={16} height={16} />
        <span>Vexa — my-app</span>
        <span className="board-branch">
          <GitBranch /> main
        </span>
        <span className="win-ctl">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="board-cols">
        <div className="col">
          <div className="col-head">
            {b.columns.queue} <span>2</span>
          </div>
          <div className="card">
            <div className="card-top">
              <span className="seq">#16</span>
              <span className="chip feature">{b.types.feature}</span>
            </div>
            <p>{b.cards.queue[0]}</p>
          </div>
          <div className="card">
            <div className="card-top">
              <span className="seq">#17</span>
              <span className="chip chore">{b.types.chore}</span>
            </div>
            <p>{b.cards.queue[1]}</p>
          </div>
        </div>
        <div className="col">
          <div className="col-head">
            {b.columns.progress} <span>1</span>
          </div>
          <div className="card active">
            <div className="card-top">
              <span className="seq">#15</span>
              <span className="chip bug">{b.types.bug}</span>
            </div>
            <p>{b.cards.progress}</p>
            <div className="track">
              {stages.map((s, i) => (
                <i key={s} className={i < 2 ? 'done' : i === 2 ? 'now' : undefined} />
              ))}
            </div>
            <div className="card-foot">
              <span className="pulse" /> {b.stage} · {b.iteration}
            </div>
          </div>
        </div>
        <div className="col">
          <div className="col-head">
            {b.columns.review} <span>1</span>
          </div>
          <div className="card">
            <div className="card-top">
              <span className="seq">#14</span>
              <span className="chip feature">{b.types.feature}</span>
            </div>
            <p>{b.cards.review}</p>
            <div className="card-foot">
              <span className="ver">0.3.1 → 0.4.0</span>
              <span className="chip bump">{b.bump}</span>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="col-head">
            {b.columns.done} <span>13</span>
          </div>
          <div className="card done">
            <div className="card-top">
              <span className="seq">#13</span>
              <span className="chip feature">{b.types.feature}</span>
            </div>
            <p>{b.cards.done}</p>
            <div className="card-foot">
              <Check /> {b.merged} · <span className="ver">v0.3.1</span>
            </div>
          </div>
        </div>
      </div>
      <div className="board-status">
        <span>5h</span>
        <span className="meter">
          <i style={{ width: '38%' }} />
        </span>
        <span>7d</span>
        <span className="meter">
          <i style={{ width: '21%' }} />
        </span>
      </div>
    </div>
  )
}

function GitHubMark(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
