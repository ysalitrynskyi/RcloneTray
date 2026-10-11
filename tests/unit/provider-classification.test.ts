import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import type { Provider, ProviderOption } from '../../src/types'
import { displayDefault, fieldKind, selectConfigFields } from '../../src/rclone/provider-fields'

const providers = JSON.parse(
  readFileSync(new URL('../fixtures/providers-v1.74.4.json', import.meta.url), 'utf8')
) as Provider[]

function option(partial: Partial<ProviderOption> & { Name: string }): ProviderOption {
  return { Help: '', Required: false, Advanced: false, Hide: 0, ...partial }
}

const all = providers.flatMap((provider) => provider.Options.map((item) => ({ prefix: provider.Prefix, item })))

describe('list and tristate classification across every rclone v1.74.4 option', () => {
  it('never turns a list option into a tristate select', () => {
    const lists = all.filter(({ item }) => {
      return item.Type === 'CommaSepList' || item.Type === 'SpaceSepList' || item.Type === 'stringArray' || Array.isArray(item.Default)
    })
    expect(lists.length).toBeGreaterThan(10)
    for (const { prefix, item } of lists) {
      expect(['string', 'password'], `${prefix}.${item.Name}`).toContain(fieldKind(item))
    }
  })

  it('classifies every Tristate option as tristate and nothing else', () => {
    const tristates = all.filter(({ item }) => item.Type === 'Tristate')
    expect(tristates.length).toBe(13)
    for (const { prefix, item } of tristates) {
      expect(fieldKind(item), `${prefix}.${item.Name}`).toBe('tristate')
    }
    const others = all.filter(({ item }) => item.Type !== 'Tristate')
    for (const { prefix, item } of others) {
      expect(fieldKind(item), `${prefix}.${item.Name}`).not.toBe('tristate')
    }
  })

  it('shows list defaults as text joined by the list separator', () => {
    const namenode = providers.find((p) => p.Prefix === 'hdfs')!.Options.find((o) => o.Name === 'namenode')!
    expect(displayDefault(namenode)).toBe('')
    const ciphers = providers.find((p) => p.Prefix === 'sftp')!.Options.find((o) => o.Name === 'ciphers')!
    expect(displayDefault(ciphers)).toBe('')
    expect(displayDefault(option({ Name: 'a', Type: 'CommaSepList', Default: ['x', 'y'], DefaultStr: '[x y]' }))).toBe('x,y')
    expect(displayDefault(option({ Name: 'a', Type: 'SpaceSepList', Default: ['x', 'y'], DefaultStr: '[x y]' }))).toBe('x y')
    expect(displayDefault(option({ Name: 'a', Type: 'stringArray', Default: [], DefaultStr: '[]' }))).toBe('')
  })

  it('writes list text as typed and leaves empty lists unset on create', () => {
    const namenode = option({ Name: 'namenode', Type: 'CommaSepList', Default: [], DefaultStr: '' })
    const created = selectConfigFields([namenode], { namenode: 'host1:8020,host2:8020' }, 'create')
    expect(created.set).toEqual({ namenode: 'host1:8020,host2:8020' })
    expect(selectConfigFields([namenode], { namenode: '' }, 'create')).toEqual({ set: {}, obscure: [], unset: [] })
    const ciphers = option({ Name: 'ciphers', Type: 'SpaceSepList', Default: [], DefaultStr: '' })
    expect(selectConfigFields([ciphers], { ciphers: 'aes128-ctr aes256-ctr' }, 'update').set).toEqual({ ciphers: 'aes128-ctr aes256-ctr' })
  })
})
