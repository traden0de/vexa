import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cache } from 'react'

export const REPO = 'https://github.com/traden0de/vexa'

export type NoteGroup = { heading: string | null; items: string[] }

export type Release = {
  version: string
  date: string | null
  /** Direct link to the installer of this exact version (pinned, so it never 404s after a newer release). */
  installer: string
  page: string
  intro: string | null
  notes: NoteGroup[]
}

type Published = { version: string; date: string | null; installer: string; body: string }

/**
 * The latest published GitHub release is the source of truth for what can be downloaded:
 * package.json may already be bumped for a version whose installer is not built yet.
 */
async function latestPublished(): Promise<Published | null> {
  if (process.env.VEXA_SITE_OFFLINE) return null
  try {
    const res = await fetch('https://api.github.com/repos/traden0de/vexa/releases/latest', {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
      },
      signal: AbortSignal.timeout(8000),
      cache: 'force-cache'
    })
    if (!res.ok) return null
    const r = (await res.json()) as {
      tag_name: string
      published_at?: string
      body?: string
      assets?: { name: string; browser_download_url: string }[]
    }
    const exe = r.assets?.find((a) => a.name.endsWith('-setup.exe'))
    if (!exe) return null
    return {
      version: r.tag_name.replace(/^v/, ''),
      date: r.published_at?.slice(0, 10) ?? null,
      installer: exe.browser_download_url,
      body: r.body ?? ''
    }
  } catch {
    return null
  }
}

async function readRepoFile(name: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), '..', name), 'utf8')
  } catch {
    return null
  }
}

/** Splits a Keep a Changelog section into an intro paragraph and "### Heading" + "- item" groups. */
export function parseSection(md: string): { intro: string | null; notes: NoteGroup[] } {
  const notes: NoteGroup[] = []
  const intro: string[] = []
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const h = /^#{3,4}\s+(.*)$/.exec(line)
    const item = /^[-*]\s+(.*)$/.exec(line)
    if (h) notes.push({ heading: h[1], items: [] })
    else if (item) {
      if (!notes.length) notes.push({ heading: null, items: [] })
      notes[notes.length - 1].items.push(item[1])
    } else if (/^\s+\S/.test(line) && notes.at(-1)?.items.length) {
      const items = notes[notes.length - 1].items
      items[items.length - 1] += ' ' + line.trim()
    } else if (line.trim() && !notes.length) intro.push(line.trim())
  }
  return { intro: intro.length ? intro.join(' ') : null, notes }
}

function changelogSection(changelog: string, version: string): { body: string; date: string | null } | null {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['))
  const date = /\]\s*-\s*(\d{4}-\d{2}-\d{2})/.exec(lines[start])?.[1] ?? null
  return { body: lines.slice(start + 1, end < 0 ? undefined : end).join('\n'), date }
}

export const getRelease = cache(async (): Promise<Release> => {
  const [published, pkgRaw, changelog] = await Promise.all([
    latestPublished(),
    readRepoFile('package.json'),
    readRepoFile('CHANGELOG.md')
  ])
  const version = published?.version ?? (pkgRaw ? (JSON.parse(pkgRaw) as { version: string }).version : '0.0.0')
  const section = changelog ? changelogSection(changelog, version) : null
  // Release notes on GitHub are the CHANGELOG section followed by the install footer.
  const body = section?.body ?? published?.body.split(/^## (Install|Установка)/m)[0] ?? ''
  return {
    version,
    date: section?.date ?? published?.date ?? null,
    installer: published?.installer ?? `${REPO}/releases/download/v${version}/Vexa-${version}-setup.exe`,
    page: `${REPO}/releases/tag/v${version}`,
    ...parseSection(body)
  }
})
