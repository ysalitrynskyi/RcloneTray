import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import type { Provider } from '../../src/types'

/**
 * Facts the config form relies on, captured from `rclone v1.74.4 config providers`
 * (Windows amd64, SHA256 ef097ef9de37a57feb7d9f9c7afb34148ad3c65be8025f1d8f7f521554a701ea).
 */
const providers = JSON.parse(
  readFileSync(new URL('../fixtures/providers-v1.74.4.json', import.meta.url), 'utf8')
) as Provider[]

describe('rclone v1.74.4 providers fixture', () => {
  const s3 = providers.find((provider) => provider.Prefix === 's3')

  it('loads the published provider list', () => {
    expect(providers.length).toBeGreaterThan(60)
    expect(s3).toBeTruthy()
  })

  it('encodes an unset S3 Tristate default as an object with DefaultStr unset', () => {
    const option = s3?.Options.find((item) => item.Name === 'use_multipart_etag')
    expect(option?.Type).toBe('Tristate')
    expect(option?.Default).toEqual({ Value: false, Valid: false })
    expect(option?.DefaultStr).toBe('unset')
  })

  it('encodes S3 chunk_size as bytes beside a SizeSuffix DefaultStr', () => {
    const option = s3?.Options.find((item) => item.Name === 'chunk_size')
    expect(option?.Type).toBe('SizeSuffix')
    expect(option?.Default).toBe(5242880)
    expect(option?.DefaultStr).toBe('5Mi')
  })

  it('sends Hide as a number bitmask', () => {
    const hides = new Set<unknown>()
    for (const provider of providers) {
      for (const option of provider.Options) {
        hides.add(option.Hide)
      }
    }
    expect([...hides].every((hide) => typeof hide === 'number')).toBe(true)
    expect(hides.has(0)).toBe(true)
    expect(hides.has(2)).toBe(true)
    expect(hides.has(3)).toBe(true)
  })
})
