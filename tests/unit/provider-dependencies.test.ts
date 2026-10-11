import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import type { Provider } from '../../src/types'
import { buildActiveValues, selectConfigFields } from '../../src/rclone/provider-fields'

const providers = JSON.parse(
  readFileSync(new URL('../fixtures/providers-v1.74.4.json', import.meta.url), 'utf8')
) as Provider[]

describe('provider-dependent options use defaults too', () => {
  const storj = providers.find((item) => item.Prefix === 'storj') as Provider

  it('keeps storj access_grant when provider was left at its default', () => {
    expect(buildActiveValues(storj.Options).provider).toBe('existing')
    const result = selectConfigFields(storj.Options, { access_grant: 'grant-token' }, 'create')
    expect(result.set).toEqual({ access_grant: 'grant-token' })
  })

  it('drops access_grant when the user switches provider to new', () => {
    const result = selectConfigFields(storj.Options, { provider: 'new', access_grant: 'grant-token' }, 'create')
    expect(result.set.access_grant).toBeUndefined()
    expect(result.set.provider).toBe('new')
  })

  it('a stored provider overrides the default, a submitted one overrides both', () => {
    expect(selectConfigFields(storj.Options, { access_grant: 'x' }, 'update', { provider: 'new' }).set).toEqual({})
    const merged = buildActiveValues(storj.Options, { provider: 'existing' }, { provider: 'new' })
    expect(merged.provider).toBe('existing')
  })
})
