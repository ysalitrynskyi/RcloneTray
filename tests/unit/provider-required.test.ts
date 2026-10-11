import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import type { Provider, ProviderOption } from '../../src/types'
import { displayDefault, findMissingRequiredOption, isOptionHidden, selectConfigFields } from '../../src/rclone/provider-fields'

const providers = JSON.parse(
  readFileSync(new URL('../fixtures/providers-v1.74.4.json', import.meta.url), 'utf8')
) as Provider[]

function provider(prefix: string): Provider {
  return providers.find((item) => item.Prefix === prefix) as Provider
}

describe('required options with a default', () => {
  it('accepts untouched pixeldrain, iclouddrive and oos defaults', () => {
    expect(findMissingRequiredOption(provider('pixeldrain').Options, {})).toBeUndefined()
    expect(findMissingRequiredOption(provider('iclouddrive').Options, {})?.Name).not.toBe('service')
    expect(findMissingRequiredOption(provider('oos').Options, {})?.Name).not.toBe('provider')
  })

  it('still reports a required option with no default', () => {
    expect(findMissingRequiredOption(provider('hdfs').Options, {})?.Name).toBe('namenode')
    expect(findMissingRequiredOption(provider('hdfs').Options, { namenode: 'h:8020' })).toBeUndefined()
  })

  it('every required, ungated option with a non-empty default is satisfied untouched', () => {
    let checked = 0
    for (const item of providers) {
      for (const option of item.Options) {
        if (!option.Required || isOptionHidden(option.Hide) || option.Provider || !displayDefault(option)) {
          continue
        }
        checked++
        expect(findMissingRequiredOption([option], {}), `${item.Prefix}.${option.Name}`).toBeUndefined()
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3)
  })

  it('does not write a config line for an untouched default', () => {
    expect(selectConfigFields(provider('pixeldrain').Options, { api_url: 'https://pixeldrain.com/api' }, 'create').set).toEqual({})
  })

  it('in update mode a stored value satisfies Required', () => {
    const namenode = provider('hdfs').Options.find((o) => o.Name === 'namenode') as ProviderOption
    expect(findMissingRequiredOption([namenode], {}, { namenode: 'h:8020' })).toBeUndefined()
    expect(findMissingRequiredOption([namenode], {}, {})?.Name).toBe('namenode')
  })

  it('applies Required to options gated on a defaulted option', () => {
    const gated = provider('storj').Options.map((o) => ({ ...o, Required: o.Name === 'access_grant' }))
    expect(findMissingRequiredOption(gated, {})?.Name).toBe('access_grant')
    expect(findMissingRequiredOption(gated, { provider: 'new' })).toBeUndefined()
  })
})
