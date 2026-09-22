import type { IpcChannel, IpcContract, IpcEventName, IpcEvents } from '@shared/ipc'

/** Typed call into the main process. Errors carry the main-process message only. */
export async function call<C extends IpcChannel>(
  channel: C,
  ...args: Parameters<IpcContract[C]>
): Promise<Awaited<ReturnType<IpcContract[C]>>> {
  try {
    return (await window.veltrix.invoke(channel, ...args)) as Awaited<ReturnType<IpcContract[C]>>
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}

export function on<E extends IpcEventName>(event: E, cb: (payload: IpcEvents[E]) => void): () => void {
  return window.veltrix.on(event, cb)
}
