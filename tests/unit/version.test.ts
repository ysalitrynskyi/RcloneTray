import { describe, expect, it } from 'vitest'
import { isNewerVersion } from '../../src/version'

describe('update check version order', () => {
  it('compares numerically, part by part', () => {
    expect(isNewerVersion('1.8.1', '1.8.0')).toBe(true)
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('v2.0.0', '1.99.0')).toBe(true)
  })

  it('does not report an older release as an update', () => {
    expect(isNewerVersion('1.7.1', '1.8.0')).toBe(false)
    expect(isNewerVersion('1.8.0', '1.8.0')).toBe(false)
  })

  it('orders pre-releases before the final release', () => {
    expect(isNewerVersion('1.8.0', '1.8.0-rc.1')).toBe(true)
    expect(isNewerVersion('1.8.0-rc.1', '1.8.0')).toBe(false)
    expect(isNewerVersion('1.8.0-rc.2', '1.8.0-rc.1')).toBe(true)
  })
})
