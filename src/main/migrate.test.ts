import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateFromVeltrix } from './migrate'

describe('migrateFromVeltrix', () => {
  it('copies the old database and agents once, keeping the old folder', () => {
    const appData = mkdtempSync(join(tmpdir(), 'vx-appdata-'))
    const old = join(appData, 'Veltrix')
    mkdirSync(join(old, 'agents'), { recursive: true })
    writeFileSync(join(old, 'veltrix.db'), 'db')
    writeFileSync(join(old, 'veltrix.db-wal'), 'wal')
    writeFileSync(join(old, 'agents', 'planner.md'), 'agent')
    const userData = join(appData, 'Vexa')

    expect(migrateFromVeltrix(appData, userData)).toBe(true)
    expect(readFileSync(join(userData, 'vexa.db'), 'utf8')).toBe('db')
    expect(readFileSync(join(userData, 'vexa.db-wal'), 'utf8')).toBe('wal')
    expect(readFileSync(join(userData, 'agents', 'planner.md'), 'utf8')).toBe('agent')
    expect(existsSync(join(old, 'veltrix.db'))).toBe(true)
    // Second start: nothing to do.
    expect(migrateFromVeltrix(appData, userData)).toBe(false)
  })

  it('does nothing without old data', () => {
    const appData = mkdtempSync(join(tmpdir(), 'vx-appdata-'))
    expect(migrateFromVeltrix(appData, join(appData, 'Vexa'))).toBe(false)
  })
})
