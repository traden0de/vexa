import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The app used to be called Veltrix and kept its data in %APPDATA%\Veltrix\veltrix.db.
 * On the first start under the new name, copy that data over (the old folder is left untouched).
 */
export function migrateFromVeltrix(appData: string, userData: string): boolean {
  const oldDir = join(appData, 'Veltrix')
  const oldDb = join(oldDir, 'veltrix.db')
  const newDb = join(userData, 'vexa.db')
  if (!existsSync(oldDb) || existsSync(newDb)) return false
  mkdirSync(userData, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(oldDb + suffix)) cpSync(oldDb + suffix, newDb + suffix)
  }
  if (existsSync(join(oldDir, 'agents')) && !existsSync(join(userData, 'agents')))
    cpSync(join(oldDir, 'agents'), join(userData, 'agents'), { recursive: true })
  return true
}
