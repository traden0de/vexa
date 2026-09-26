import type { AttentionKind, Task } from '@shared/types'
import { call } from './api'
import i18n from './i18n'

/** Desktop notification for a task that started waiting for the user. */
export function notifyTask(task: Task, kind: AttentionKind, projectName: string | undefined, onClick: () => void): void {
  if (typeof Notification === 'undefined') return
  const body = i18n.t(`notif_${kind}`) + (projectName ? ` · ${projectName}` : '')
  const n = new Notification(`#${task.seq} ${task.title}`, { body, tag: `task-${task.id}` })
  n.onclick = () => {
    void call('window:focus')
    onClick()
  }
}

/** Shows the number of waiting tasks on the taskbar button. */
export function updateBadge(count: number): void {
  void call('window:badge', count, count > 0 ? badgeImage(count) : undefined).catch(() => {})
}

function badgeImage(count: number): string | undefined {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const css = getComputedStyle(document.documentElement)
  ctx.fillStyle = css.getPropertyValue('--bad').trim() || 'red'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${count > 9 ? 17 : 21}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(count > 99 ? '99+' : String(count), size / 2, size / 2 + 1)
  return canvas.toDataURL('image/png')
}
