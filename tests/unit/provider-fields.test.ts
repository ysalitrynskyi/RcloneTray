import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import type { Provider, ProviderOption } from '../../src/types'
import {
  displayDefault,
  fieldKind,
  filterExamples,
  isOptionHidden,
  isProviderOptionActive,
  providerNeedsOAuth,
  selectConfigFields
} from '../../src/rclone/provider-fields'
import { remoteNameError } from '../../src/rclone/remote-name'

const providers = JSON.parse(
  readFileSync(new URL('../fixtures/providers-v1.74.4.json', import.meta.url), 'utf8')
) as Provider[]

function option(partial: Partial<ProviderOption> & { Name: string }): ProviderOption {
  return {
    Help: '',
    Required: false,
    Advanced: false,
    Hide: 0,
    ...partial
  }
}

describe('provider field rules', () => {
  const s3 = providers.find((provider) => provider.Prefix === 's3') as Provider

  it('hides configurator bits and still shows command-line-only options', () => {
    expect(isOptionHidden(0)).toBe(false)
    expect(isOptionHidden(1)).toBe(false)
    expect(isOptionHidden(2)).toBe(true)
    expect(isOptionHidden(3)).toBe(true)
    expect(isOptionHidden(true)).toBe(true)
    expect(isProviderOptionActive(option({ Name: 'token', Hide: 2 }), {})).toBe(false)
    expect(isProviderOptionActive(option({ Name: 'visible', Hide: 1 }), {})).toBe(true)
  })

  it('renders SizeSuffix and Tristate from the human string, not the raw default', () => {
    const chunk = s3.Options.find((item) => item.Name === 'chunk_size') as ProviderOption
    const etag = s3.Options.find((item) => item.Name === 'use_multipart_etag') as ProviderOption
    expect(fieldKind(chunk)).toBe('string')
    expect(displayDefault(chunk)).toBe('5Mi')
    expect(fieldKind(etag)).toBe('tristate')
    expect(displayDefault(etag)).toBe('unset')
    expect(selectConfigFields([chunk, etag], {
      chunk_size: 5242880,
      use_multipart_etag: { Value: false, Valid: false }
    }, 'create')).toEqual({ set: {}, obscure: [], unset: [] })
  })

  it('writes a changed size and skips an empty password on create', () => {
    const chunk = s3.Options.find((item) => item.Name === 'chunk_size') as ProviderOption
    const pass = option({ Name: 'secret_access_key', IsPassword: true, Type: 'string' })
    const result = selectConfigFields([chunk, pass], {
      chunk_size: '64M',
      secret_access_key: ''
    }, 'create')
    expect(result.set).toEqual({ chunk_size: '64M' })
    expect(result.obscure).toEqual([])
  })

  it('obscures a new password and removes a cleared one on update', () => {
    const pass = option({ Name: 'pass', IsPassword: true, Type: 'string' })
    const created = selectConfigFields([pass], { pass: '-secret' }, 'create')
    expect(created.set.pass).toBe('-secret')
    expect(created.obscure).toEqual(['pass'])
    const cleared = selectConfigFields([pass], { pass: '' }, 'update')
    expect(cleared.set).toEqual({})
    expect(cleared.unset).toEqual(['pass'])
  })

  it('does not obscure an OAuth token, and treats True as checked', () => {
    const drive = providers.find((provider) => provider.Prefix === 'drive') as Provider
    expect(providerNeedsOAuth(drive.Options)).toBe(true)
    const token = drive.Options.find((item) => item.Name === 'token') as ProviderOption
    expect(fieldKind(token)).toBe('password')
    const written = selectConfigFields([token], { token: '{"access_token":"abc"}' }, 'create')
    expect(written.obscure).toEqual([])
    expect(written.set.token).toContain('access_token')
    const flag = option({ Name: 'hard_delete', Type: 'bool', Default: false })
    expect(selectConfigFields([flag], { hard_delete: 'TRUE' }, 'update').set).toEqual({ hard_delete: 'true' })
  })

  it('filters examples by their provider', () => {
    const examples = [
      { Value: 'us-east-1', Provider: 'AWS' },
      { Value: 'auto', Provider: 'Other' },
      { Value: 'always' }
    ]
    expect(filterExamples(examples, ['AWS']).map((item) => item.Value)).toEqual(['us-east-1', 'always'])
  })
})

describe('remote names', () => {
  it('accepts the names rclone accepts', () => {
    expect(remoteNameError('my.remote')).toBeNull()
    expect(remoteNameError('has space')).toBeNull()
    expect(remoteNameError('name@x')).toBeNull()
    expect(remoteNameError('a+b')).toBeNull()
    expect(remoteNameError('café')).toBeNull()
    expect(remoteNameError('a'.repeat(40))).toBeNull()
  })

  it('rejects names rclone rejects, and single letters on Windows', () => {
    expect(remoteNameError('-bad')).toMatch(/cannot start/)
    expect(remoteNameError(' trailing')).toMatch(/cannot start/)
    expect(remoteNameError('trailing ')).toMatch(/end with a space/)
    expect(remoteNameError('a', 'win32')).toMatch(/drive/)
    expect(remoteNameError('a', 'linux')).toBeNull()
  })
})
