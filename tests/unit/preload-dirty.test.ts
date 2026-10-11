import { describe, expect, it } from 'vitest'
import { loadPreloadFunctions } from './helpers/preload-source'

interface FieldLike {
  type?: string
  checked?: boolean
  value: string
  dataset: Record<string, string | undefined>
}

const preload = loadPreloadFunctions<{
  fieldToken: (field: FieldLike) => string
  isTrackedFieldChanged: (field: FieldLike) => boolean
  anyTrackedFieldChanged: (fields: FieldLike[]) => boolean
  setFieldValueWithEvents: (
    field: { value: string; dispatchEvent: (event: { type: string }) => boolean },
    value: string,
    createEvent: (type: string) => { type: string }
  ) => void
  hasStoredFieldValue: (value: unknown) => boolean
  fieldPlaceholder: (hasSavedValue: boolean, defaultValue: unknown) => string
}>([
  'fieldToken',
  'isTrackedFieldChanged',
  'anyTrackedFieldChanged',
  'setFieldValueWithEvents',
  'hasStoredFieldValue',
  'fieldPlaceholder'
])

function tracked(value: string, type = 'text'): FieldLike {
  return { type, value, checked: type === 'checkbox' ? value === '1' : undefined, dataset: { track: '1', initial: value } }
}

describe('dialog dirty tracking', () => {
  it('is clean until a tracked field actually differs from its initial value', () => {
    const name = tracked('')
    expect(preload.anyTrackedFieldChanged([name])).toBe(false)
    name.value = 'work'
    expect(preload.anyTrackedFieldChanged([name])).toBe(true)
    name.value = ''
    expect(preload.anyTrackedFieldChanged([name])).toBe(false)
  })

  it('ignores untracked fields such as the provider search box', () => {
    const search: FieldLike = { type: 'text', value: 'drive', dataset: {} }
    expect(preload.isTrackedFieldChanged(search)).toBe(false)
    expect(preload.anyTrackedFieldChanged([search, tracked('x')])).toBe(false)
  })

  it('compares checkboxes by checked state', () => {
    const box = { type: 'checkbox', value: 'on', checked: false, dataset: { track: '1', initial: '0' } }
    expect(preload.isTrackedFieldChanged(box)).toBe(false)
    box.checked = true
    expect(preload.isTrackedFieldChanged(box)).toBe(true)
  })

  it('counts a cleared saved password as a change', () => {
    const pass = tracked('')
    pass.dataset.cleared = '1'
    expect(preload.isTrackedFieldChanged(pass)).toBe(true)
  })

  it('picks up a value set without any input event', () => {
    const local = tracked('')
    local.value = '/home/me/files'
    expect(preload.isTrackedFieldChanged(local)).toBe(true)
  })
})

describe('Browse button value', () => {
  it('sets the value and then fires input and change', () => {
    const seen: string[] = []
    const field = {
      value: '',
      dispatchEvent(event: { type: string }): boolean {
        seen.push(`${event.type}:${field.value}`)
        return true
      }
    }
    preload.setFieldValueWithEvents(field, '/data/sync', (type) => ({ type }))
    expect(seen).toEqual(['input:/data/sync', 'change:/data/sync'])
  })
})

describe('password field helpers', () => {
  it('shows the keep-saved placeholder only when a value is stored', () => {
    expect(preload.fieldPlaceholder(true, 'ignored')).toBe('Leave blank to keep the saved value')
    expect(preload.fieldPlaceholder(false, undefined)).toBe('')
    expect(preload.fieldPlaceholder(false, 'abc')).toBe('abc')
  })

  it('treats a missing or empty value as nothing saved', () => {
    expect(preload.hasStoredFieldValue(null)).toBe(false)
    expect(preload.hasStoredFieldValue(undefined)).toBe(false)
    expect(preload.hasStoredFieldValue('')).toBe(false)
    expect(preload.hasStoredFieldValue('secret')).toBe(true)
  })
})
