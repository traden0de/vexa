import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyVersion, detectVersion, formatChangelogSection, insertChangelogSection, nextVersion } from './version'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'vx-ver-'))
const entry = { added: ['CSV export'], changed: [], fixed: ['Crash on empty email'], removed: [], security: [] }

describe('version', () => {
  it('bumps semver', () => {
    expect(nextVersion('1.4.2', 'patch')).toBe('1.4.3')
    expect(nextVersion('1.4.2', 'minor')).toBe('1.5.0')
    expect(nextVersion('1.4.2', 'major')).toBe('2.0.0')
    expect(nextVersion('garbage', 'minor')).toBe('0.1.0')
  })

  it('updates package.json and package-lock.json keeping formatting', () => {
    const d = tmp()
    writeFileSync(join(d, 'package.json'), '{\n    "name": "x",\n    "version": "1.2.3",\n    "deps": { "version": "9" }\n}\n')
    writeFileSync(join(d, 'package-lock.json'), JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.3' } } }))
    expect(detectVersion(d)).toEqual({ version: '1.2.3', files: ['package.json'] })
    applyVersion(d, '1.3.0')
    const pkg = readFileSync(join(d, 'package.json'), 'utf8')
    expect(pkg).toContain('    "version": "1.3.0"')
    expect(pkg).toContain('"version": "9"')
    expect(JSON.parse(readFileSync(join(d, 'package-lock.json'), 'utf8')).packages[''].version).toBe('1.3.0')
  })

  it('handles pyproject and Cargo sections', () => {
    const d = tmp()
    writeFileSync(join(d, 'pyproject.toml'), '[build-system]\nversion = "0"\n\n[project]\nname = "x"\nversion = "0.3.1"\n')
    writeFileSync(join(d, 'Cargo.toml'), '[package]\nname = "x"\nversion = "0.3.1"\n\n[dependencies]\nserde = { version = "1" }\n')
    expect(detectVersion(d).files).toEqual(['pyproject.toml', 'Cargo.toml'])
    applyVersion(d, '0.4.0')
    expect(readFileSync(join(d, 'pyproject.toml'), 'utf8')).toContain('[build-system]\nversion = "0"')
    expect(readFileSync(join(d, 'pyproject.toml'), 'utf8')).toContain('version = "0.4.0"')
    expect(readFileSync(join(d, 'Cargo.toml'), 'utf8')).toContain('version = "0.4.0"')
  })

  it('creates VERSION when nothing stores a version', () => {
    const d = tmp()
    expect(detectVersion(d).version).toBe('0.0.0')
    applyVersion(d, '0.1.0')
    expect(readFileSync(join(d, 'VERSION'), 'utf8').trim()).toBe('0.1.0')
  })

  it('writes changelog sections in order', () => {
    const s1 = formatChangelogSection('1.0.0', '2026-01-01', entry)
    expect(s1).toBe('## [1.0.0] - 2026-01-01\n\n### Added\n- CSV export\n\n### Fixed\n- Crash on empty email\n')
    const first = insertChangelogSection(null, s1)
    expect(first.startsWith('# Changelog')).toBe(true)
    const second = insertChangelogSection(first, formatChangelogSection('1.1.0', '2026-02-01', entry))
    expect(second.indexOf('[1.1.0]')).toBeLessThan(second.indexOf('[1.0.0]'))
    const withUnreleased = insertChangelogSection('# Changelog\n\n## [Unreleased]\n- wip\n\n' + s1, '## [1.0.1] - x\n')
    expect(withUnreleased.indexOf('[Unreleased]')).toBeLessThan(withUnreleased.indexOf('[1.0.1]'))
  })
})
