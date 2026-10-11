import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import type { Provider, ProviderOption } from '../../src/types'
import { controlKind } from '../../src/rclone/provider-fields'

const providers = JSON.parse(
  readFileSync(new URL('../fixtures/providers-v1.74.4.json', import.meta.url), 'utf8')
) as Provider[]

describe('masked inputs', () => {
  it('masks every IsPassword option and secret-like Sensitive options only', () => {
    let visibleSensitive = 0
    for (const item of providers) {
      for (const option of item.Options) {
        const kind = controlKind(option)
        if (option.IsPassword) {
          expect(kind, `${item.Prefix}.${option.Name}`).toBe('password')
        } else if (!option.Sensitive) {
          expect(kind, `${item.Prefix}.${option.Name}`).not.toBe('password')
        } else if (kind !== 'password') {
          visibleSensitive++
        }
      }
    }
    expect(visibleSensitive).toBeGreaterThan(20)
  })

  it('masks OAuth tokens and client secrets', () => {
    for (const [prefix, name] of [['drive', 'token'], ['drive', 'client_secret'], ['s3', 'secret_access_key']]) {
      const option = providers.find((p) => p.Prefix === prefix)!.Options.find((o) => o.Name === name) as ProviderOption
      expect(controlKind(option), `${prefix}.${name}`).toBe('password')
    }
  })

  it('shows sftp host and user, ftp host and user, and list options as plain text', () => {
    for (const [prefix, name] of [['sftp', 'host'], ['sftp', 'user'], ['ftp', 'host'], ['ftp', 'user'], ['hdfs', 'namenode']]) {
      const option = providers.find((p) => p.Prefix === prefix)!.Options.find((o) => o.Name === name) as ProviderOption
      expect(option.Sensitive || option.IsPassword, `${prefix}.${name} fixture`).toBeTruthy()
      expect(controlKind(option), `${prefix}.${name}`).toBe('string')
    }
  })
})
