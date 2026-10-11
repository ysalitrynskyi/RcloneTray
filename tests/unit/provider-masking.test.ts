import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import type { Provider, ProviderOption } from '../../src/types'
import { controlKind } from '../../src/rclone/provider-fields'

const providers = JSON.parse(
  readFileSync(new URL('../fixtures/providers-v1.74.4.json', import.meta.url), 'utf8')
) as Provider[]

describe('masked inputs', () => {
  it('masks exactly the IsPassword options', () => {
    let sensitive = 0
    for (const item of providers) {
      for (const option of item.Options) {
        const kind = controlKind(option)
        if (option.IsPassword) {
          expect(kind, `${item.Prefix}.${option.Name}`).toBe('password')
        } else {
          expect(kind, `${item.Prefix}.${option.Name}`).not.toBe('password')
          if (option.Sensitive) sensitive++
        }
      }
    }
    expect(sensitive).toBeGreaterThan(20)
  })

  it('shows sftp host and user, ftp host and user, and list options as plain text', () => {
    for (const [prefix, name] of [['sftp', 'host'], ['sftp', 'user'], ['ftp', 'host'], ['ftp', 'user'], ['hdfs', 'namenode']]) {
      const option = providers.find((p) => p.Prefix === prefix)!.Options.find((o) => o.Name === name) as ProviderOption
      expect(option.Sensitive || option.IsPassword, `${prefix}.${name} fixture`).toBeTruthy()
      expect(controlKind(option), `${prefix}.${name}`).toBe('string')
    }
  })
})
