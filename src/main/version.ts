import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import type { Bump, ChangelogEntry } from '@shared/types'

/** A file that stores the project version. */
interface Adapter {
  file: string
  read(content: string): string | null
  write(content: string, version: string): string
}

const jsonVersion = (file: string): Adapter => ({
  file,
  read: (c) => {
    try {
      const v = JSON.parse(c).version
      return typeof v === 'string' ? v : null
    } catch {
      return null
    }
  },
  // Replace only the first top-level "version" to keep formatting intact.
  write: (c, v) => c.replace(/("version"\s*:\s*")[^"]*(")/, `$1${v}$2`)
})

const packageLock: Adapter = {
  file: 'package-lock.json',
  read: () => null,
  write: (c, v) => {
    const j = JSON.parse(c)
    j.version = v
    if (j.packages?.['']) j.packages[''].version = v
    return JSON.stringify(j, null, 2) + '\n'
  }
}

/** `version = "x"` inside one of the given TOML sections. */
const tomlVersion = (file: string, sections: string[]): Adapter => {
  const find = (c: string): { start: number; end: number; version: string } | null => {
    for (const section of sections) {
      const header = c.search(new RegExp(`^\\[${section.replace('.', '\\.')}\\]\\s*$`, 'm'))
      if (header < 0) continue
      const rest = c.slice(header)
      const next = rest.slice(1).search(/^\[/m)
      const body = next < 0 ? rest : rest.slice(0, next + 1)
      const m = body.match(/^(version\s*=\s*")([^"]*)"/m)
      if (m && m.index !== undefined) {
        const start = header + m.index + m[1].length
        return { start, end: start + m[2].length, version: m[2] }
      }
    }
    return null
  }
  return {
    file,
    read: (c) => find(c)?.version ?? null,
    write: (c, v) => {
      const f = find(c)
      return f ? c.slice(0, f.start) + v + c.slice(f.end) : c
    }
  }
}

const plainVersion: Adapter = {
  file: 'VERSION',
  read: (c) => c.trim() || null,
  write: (_c, v) => v + '\n'
}

function csprojAdapters(root: string): Adapter[] {
  let files: string[] = []
  try {
    files = readdirSync(root).filter((f) => f.endsWith('.csproj'))
  } catch {
    // unreadable dir
  }
  return files.map((file) => ({
    file,
    read: (c) => c.match(/<Version>([^<]+)<\/Version>/)?.[1] ?? null,
    write: (c, v) => c.replace(/<Version>[^<]+<\/Version>/, `<Version>${v}</Version>`)
  }))
}

function adapters(root: string): Adapter[] {
  return [
    jsonVersion('package.json'),
    tomlVersion('pyproject.toml', ['project', 'tool.poetry']),
    tomlVersion('Cargo.toml', ['package', 'workspace.package']),
    ...csprojAdapters(root),
    plainVersion
  ]
}

export interface DetectedVersion {
  version: string
  files: string[]
}

/** Finds the current version and every file that stores it. Falls back to 0.0.0. */
export function detectVersion(root: string): DetectedVersion {
  let version: string | null = null
  const files: string[] = []
  for (const a of adapters(root)) {
    const p = join(root, a.file)
    if (!existsSync(p)) continue
    const v = a.read(readFileSync(p, 'utf8'))
    if (v && semver.valid(v)) {
      version ??= v
      files.push(a.file)
    }
  }
  return { version: version ?? '0.0.0', files }
}

export function nextVersion(current: string, bump: Bump): string {
  const base = semver.valid(current) ? current : '0.0.0'
  // Before 1.0.0 a breaking change still means 1.0.0 only when asked explicitly: keep semver semantics.
  return semver.inc(base, bump) ?? base
}

/** Writes the new version into every detected file (creates VERSION if none). Returns changed files. */
export function applyVersion(root: string, version: string): string[] {
  const detected = detectVersion(root)
  const changed: string[] = []
  const targets = detected.files.length ? detected.files : ['VERSION']
  for (const a of adapters(root)) {
    if (!targets.includes(a.file)) continue
    const p = join(root, a.file)
    const before = existsSync(p) ? readFileSync(p, 'utf8') : ''
    const after = a.write(before, version)
    if (after !== before) {
      writeFileSync(p, after, 'utf8')
      changed.push(a.file)
    }
  }
  if (targets.includes('package.json') && existsSync(join(root, 'package-lock.json'))) {
    const p = join(root, 'package-lock.json')
    try {
      writeFileSync(p, packageLock.write(readFileSync(p, 'utf8'), version), 'utf8')
      changed.push('package-lock.json')
    } catch {
      // malformed lock file: leave it alone
    }
  }
  return changed
}

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`

const GROUPS: [keyof ChangelogEntry, string][] = [
  ['added', 'Added'],
  ['changed', 'Changed'],
  ['fixed', 'Fixed'],
  ['removed', 'Removed'],
  ['security', 'Security']
]

export function formatChangelogSection(version: string, date: string, entry: ChangelogEntry): string {
  const parts = [`## [${version}] - ${date}`]
  for (const [key, title] of GROUPS) {
    const items = entry[key]?.filter((s) => s.trim()) ?? []
    if (items.length) parts.push(`### ${title}\n${items.map((s) => `- ${s.trim()}`).join('\n')}`)
  }
  return parts.join('\n\n') + '\n'
}

/** Inserts a section above the latest release (below the header and an optional [Unreleased] block). */
export function insertChangelogSection(existing: string | null, section: string): string {
  if (!existing?.trim()) return `${CHANGELOG_HEADER}\n${section}`
  const lines = existing.split('\n')
  const idx = lines.findIndex((l) => /^## \[(?!unreleased)/i.test(l))
  if (idx < 0) return existing.trimEnd() + '\n\n' + section
  return [...lines.slice(0, idx), section, ...lines.slice(idx)].join('\n')
}

export function writeChangelog(root: string, version: string, entry: ChangelogEntry, date = today()): void {
  const p = join(root, 'CHANGELOG.md')
  const existing = existsSync(p) ? readFileSync(p, 'utf8') : null
  writeFileSync(p, insertChangelogSection(existing, formatChangelogSection(version, date, entry)), 'utf8')
}

function today(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
