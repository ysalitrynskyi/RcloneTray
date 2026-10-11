import { EventEmitter } from 'events'
import { describe, expect, it } from 'vitest'
import { DISCARD_PROMPT, installUnloadGuard } from '../../src/dialog-guard'

function fakeWindow(): { webContents: EventEmitter } {
  return { webContents: new EventEmitter() }
}

describe('unsaved changes guard', () => {
  it('asks Keep editing / Discard and allows the unload on Discard', () => {
    const win = fakeWindow()
    const asked: unknown[] = []
    installUnloadGuard(win, (target, options) => {
      asked.push([target === win, options.buttons])
      return 1
    })
    let allowed = false
    win.webContents.emit('will-prevent-unload', { preventDefault: () => { allowed = true } })
    expect(asked).toEqual([[true, ['Keep editing', 'Discard']]])
    expect(allowed).toBe(true)
  })

  it('keeps the window open on Keep editing', () => {
    const win = fakeWindow()
    installUnloadGuard(win, () => 0)
    let allowed = false
    win.webContents.emit('will-prevent-unload', { preventDefault: () => { allowed = true } })
    expect(allowed).toBe(false)
  })

  it('uses a safe default button', () => {
    expect(DISCARD_PROMPT.buttons[DISCARD_PROMPT.defaultId]).toBe('Keep editing')
    expect(DISCARD_PROMPT.buttons[DISCARD_PROMPT.cancelId]).toBe('Keep editing')
  })
})
