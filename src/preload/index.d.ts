import type { PreloadBridge } from '../shared/ipc'

declare global {
  interface Window {
    veltrix: PreloadBridge
  }
}
