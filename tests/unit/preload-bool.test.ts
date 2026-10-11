import { describe, expect, it } from 'vitest'
import { parseBool } from '../../src/rclone/provider-fields'
import { loadPreloadFunctions } from './helpers/preload-source'

const { parseBoolLoose } = loadPreloadFunctions<{ parseBoolLoose: (value: unknown) => boolean }>(['parseBoolLoose'])

describe('preload boolean parsing matches the main process', () => {
  const samples: unknown[] = [
    true, false, null, undefined, 0, 1, 2, -1,
    'true', 'True', 'TRUE', ' true ', 't', 'T', 'yes', 'Yes', 'YES', 'on', 'ON', '1',
    'false', 'False', 'f', 'no', 'off', '0', '', 'unset', 'maybe'
  ]

  it('agrees with parseBool for every sample', () => {
    for (const sample of samples) {
      expect(parseBoolLoose(sample), JSON.stringify(sample)).toBe(parseBool(sample))
    }
  })

  it('accepts True, TRUE, t, yes and 1', () => {
    for (const sample of ['True', 'TRUE', 't', 'yes', '1', 1]) {
      expect(parseBoolLoose(sample), String(sample)).toBe(true)
    }
  })
})
