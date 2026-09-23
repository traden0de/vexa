import { contextBridge, ipcRenderer } from 'electron'
import type { PreloadBridge } from '@shared/ipc'

const bridge: PreloadBridge = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (event, cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: any): void => cb(payload)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  }
}

contextBridge.exposeInMainWorld('vexa', bridge)
