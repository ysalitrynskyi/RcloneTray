'use strict'

export const DISCARD_PROMPT = {
  type: 'question' as const,
  title: 'Unsaved changes',
  message: 'Discard unsaved changes?',
  detail: 'This window has changes that were not saved.',
  buttons: ['Keep editing', 'Discard'],
  defaultId: 0,
  cancelId: 0,
  noLink: true
}

const DISCARD_BUTTON_INDEX = 1

export interface UnloadGuardTarget {
  webContents: {
    on(event: 'will-prevent-unload', listener: (event: { preventDefault: () => void }) => void): unknown
  }
}

/**
 * The page asks to stay open (beforeunload) only while a tracked field is
 * edited. Electron then raises will-prevent-unload; preventDefault there means
 * "close anyway", so it is called only when the user picks Discard.
 */
export function installUnloadGuard<W extends UnloadGuardTarget>(
  win: W,
  askUser: (win: W, options: typeof DISCARD_PROMPT) => number
): void {
  win.webContents.on('will-prevent-unload', (event) => {
    if (askUser(win, DISCARD_PROMPT) === DISCARD_BUTTON_INDEX) {
      event.preventDefault()
    }
  })
}
