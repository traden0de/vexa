import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import i18n from './i18n'
import { useStore } from './store'

export type TourPart = 'welcome' | 'board'

/** Steps point at elements marked with data-tour="…"; a step without an element is shown centered. */
const PARTS: Record<TourPart, { key: string; target?: string; side?: 'top' | 'bottom' | 'left' | 'right' }[]> = {
  welcome: [
    { key: 'tw_welcome' },
    { key: 'tw_open', target: 'open-folder', side: 'bottom' },
    { key: 'tw_env', target: 'env', side: 'left' },
    { key: 'tw_settings', target: 'nav-settings', side: 'right' }
  ],
  board: [
    { key: 'tb_new', target: 'new-task', side: 'bottom' },
    { key: 'tb_board', target: 'board', side: 'bottom' },
    { key: 'tb_queue', target: 'queue', side: 'bottom' },
    { key: 'tb_flow', target: 'col-approval', side: 'right' },
    { key: 'tb_git', target: 'nav-git', side: 'right' },
    { key: 'tb_agents', target: 'nav-agents', side: 'right' },
    { key: 'tb_project', target: 'nav-project', side: 'right' },
    { key: 'tb_status', target: 'statusbar', side: 'top' }
  ]
}

let running = false

export function startTour(part: TourPart): void {
  if (running) return
  const t = i18n.t.bind(i18n)
  const steps: DriveStep[] = PARTS[part]
    .filter((s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`))
    .map((s) => ({
      element: s.target ? `[data-tour="${s.target}"]` : undefined,
      popover: { title: t(`${s.key}_t`), description: t(`${s.key}_d`), side: s.side, align: 'start' }
    }))
  if (!steps.length) return

  running = true
  const tour = driver({
    steps,
    showProgress: true,
    progressText: t('tour_progress', { current: '{{current}}', total: '{{total}}' }),
    nextBtnText: t('tour_next'),
    prevBtnText: t('tour_prev'),
    doneBtnText: t('tour_done'),
    popoverClass: 'vx-tour',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    onPopoverRender: (popover) => {
      const skip = document.createElement('button')
      skip.type = 'button'
      skip.className = 'vx-tour-skip'
      skip.textContent = t('tour_skip')
      skip.onclick = () => tour.destroy()
      popover.footer.prepend(skip)
    },
    onDestroyed: () => {
      running = false
      const s = useStore.getState()
      const seen = s.settings?.tourSeen ?? { welcome: false, board: false }
      void s.updateSettings({ tourSeen: { ...seen, [part]: true } })
    }
  })
  tour.drive()
}
