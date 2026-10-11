import { ProviderOption } from '../types'

/** rclone OptionHideConfigurator. Hide is a bitmask, not a boolean. */
export const CONFIGURATOR_HIDE_BIT = 2

/**
 * Backends where the remote root lists every bucket/container and a sync
 * can delete them. `gcs` is the real prefix (`gsc` was a typo). `hubic`
 * is no longer shipped by rclone.
 */
export const BUCKET_BASED_PREFIXES = new Set([
  'b2',
  'swift',
  's3',
  'gcs',
  'azureblob',
  'oracleobjectstorage',
  'qingstor',
  'storj'
])

const HUMAN_TEXT_TYPES = new Set([
  'string',
  'SizeSuffix',
  'Duration',
  'Time',
  'Bits',
  'Encoding',
  'CommaSepList',
  'SpaceSepList',
  'stringArray',
  'mtime|atime|btime|ctime'
])

export type NormalizedFieldKind = 'boolean' | 'tristate' | 'number' | 'password' | 'string' | 'text' | 'directory' | 'file'

export function isOptionHidden(hide: unknown): boolean {
  if (hide === true) {
    return true
  }
  if (typeof hide === 'number' && Number.isFinite(hide)) {
    return (hide & CONFIGURATOR_HIDE_BIT) !== 0
  }
  return false
}

export function isBucketBasedPrefix(prefix: string | undefined): boolean {
  return !!prefix && BUCKET_BASED_PREFIXES.has(prefix)
}

export function providerDocsUrl(prefix: string): string {
  return `https://rclone.org/${prefix}/`
}

export function parseBool(value: unknown): boolean {
  if (value === true) {
    return true
  }
  if (value === false || value == null) {
    return false
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  const text = String(value).trim().toLowerCase()
  return text === 'true' || text === 'yes' || text === 't' || text === '1' || text === 'on'
}

const LIST_TYPES = new Set(['CommaSepList', 'SpaceSepList', 'stringArray'])

function isTristateValue(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const keys = Object.keys(value).sort()
  return keys.length === 2 && keys[0] === 'Valid' && keys[1] === 'Value'
}

export function fieldKind(option: ProviderOption): NormalizedFieldKind {
  if (option.$Type === 'directory' || option.$Type === 'file' || option.$Type === 'text') {
    return option.$Type
  }
  if (option.$Type === 'boolean') {
    return 'boolean'
  }
  if (option.IsPassword) {
    return 'password'
  }
  if (option.Type === 'bool') {
    return 'boolean'
  }
  if (option.Type === 'Tristate' || (!LIST_TYPES.has(option.Type ?? '') && isTristateValue(option.Default))) {
    return 'tristate'
  }
  if (option.Type === 'int') {
    return 'number'
  }
  if (option.Sensitive) {
    return 'password'
  }
  if (option.Type && HUMAN_TEXT_TYPES.has(option.Type)) {
    return 'string'
  }
  if (typeof option.Default === 'boolean') {
    return 'boolean'
  }
  if (typeof option.Default === 'number') {
    return 'number'
  }
  return 'string'
}

/** Kind of control the form renders. Only real rclone passwords are masked; other sensitive options stay visible text. */
export function controlKind(option: ProviderOption): NormalizedFieldKind {
  const kind = fieldKind(option)
  return kind === 'password' && !option.IsPassword ? 'string' : kind
}

/** Human text shown in the form. Never the raw SizeSuffix byte count. */
export function displayDefault(option: ProviderOption): string {
  if (fieldKind(option) === 'tristate') {
    return option.DefaultStr || 'unset'
  }
  if (Array.isArray(option.Default)) {
    return option.Default.map((item) => String(item)).join(option.Type === 'SpaceSepList' ? ' ' : ',')
  }
  if (option.Type === 'SizeSuffix' || option.Type === 'Duration' || option.Type === 'Time' || option.Type === 'Bits') {
    return option.DefaultStr || ''
  }
  if (typeof option.Default === 'string') {
    return option.Default
  }
  if (typeof option.Default === 'number' && fieldKind(option) === 'number') {
    return String(option.Default)
  }
  if (option.DefaultStr && option.DefaultStr !== 'unset') {
    return option.DefaultStr
  }
  return ''
}

/**
 * Values the form uses to decide which provider-dependent options show:
 * display defaults first, then stored values, then submitted values.
 */
export function buildActiveValues(
  options: ProviderOption[],
  submitted: Record<string, unknown> = {},
  stored: Record<string, unknown> = {}
): Record<string, unknown> {
  const active: Record<string, unknown> = {}
  for (const option of options) {
    const usual = displayDefault(option)
    if (usual) {
      active[option.Name] = usual
    }
  }
  return { ...active, ...stored, ...submitted }
}

export function isProviderOptionActive(option: ProviderOption, values: Record<string, unknown>): boolean {
  if (isOptionHidden(option.Hide)) {
    return false
  }
  if (!option.Provider) {
    return true
  }
  const invert = option.Provider.startsWith('!')
  const rules = (invert ? option.Provider.substring(1) : option.Provider)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const activeValues = Object.values(values).map((value) => String(value))
  const match = rules.some((rule) => activeValues.includes(rule))
  return invert ? !match : match
}

export function filterExamples<T extends { Provider?: string }>(examples: T[] | undefined, activeValues: string[]): T[] {
  if (!examples || examples.length === 0) {
    return []
  }
  return examples.filter((example) => {
    if (!example.Provider) {
      return true
    }
    const invert = example.Provider.startsWith('!')
    const rules = (invert ? example.Provider.substring(1) : example.Provider)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const match = rules.some((rule) => activeValues.includes(rule))
    return invert ? !match : match
  })
}

export interface ConfigFieldWrite {
  set: Record<string, string>
  /** Password keys in `set` that rclone must obscure. Sensitive non-passwords (OAuth tokens) are not listed. */
  obscure: string[]
  unset: string[]
}

function isRawUnitDefault(option: ProviderOption, text: string): boolean {
  if (option.Type !== 'SizeSuffix' && option.Type !== 'Duration' && option.Type !== 'Time' && option.Type !== 'Bits') {
    return false
  }
  return /^\d+$/.test(text) && String(option.Default) === text
}

/**
 * Fields to pass to the config writer.
 * Create: only non-empty values that differ from rclone's default.
 * Update: only keys the form actually submitted (dirty fields).
 */
export function remotePathSpec(name: string, remotePath: string | undefined): string {
  return `${name}:${remotePath || ''}`
}

export function selectConfigFields(
  options: ProviderOption[],
  submitted: Record<string, unknown>,
  mode: 'create' | 'update',
  context: Record<string, unknown> = {}
): ConfigFieldWrite {
  const set: Record<string, string> = {}
  const obscure: string[] = []
  const unset: string[] = []
  const activeValues = buildActiveValues(options, submitted, context)

  for (const option of options) {
    if (!Object.prototype.hasOwnProperty.call(submitted, option.Name)) {
      continue
    }
    if (!isProviderOptionActive(option, activeValues)) {
      continue
    }
    const raw = submitted[option.Name]
    const kind = fieldKind(option)

    if (kind === 'password') {
      const text = raw == null ? '' : String(raw)
      if (text && text === String(context[option.Name] ?? '')) {
        continue
      }
      if (!text) {
        if (mode === 'update') {
          unset.push(option.Name)
        }
        continue
      }
      set[option.Name] = text
      if (option.IsPassword) {
        obscure.push(option.Name)
      }
      continue
    }

    if (kind === 'boolean') {
      const checked = parseBool(raw)
      if (mode === 'create' && checked === parseBool(option.Default)) {
        continue
      }
      set[option.Name] = checked ? 'true' : 'false'
      continue
    }

    if (kind === 'tristate') {
      const text = raw == null ? '' : String(raw).trim()
      if (!text || text === 'unset' || text === '[object Object]') {
        if (mode === 'update') {
          unset.push(option.Name)
        }
        continue
      }
      set[option.Name] = text
      continue
    }

    if (raw !== null && typeof raw === 'object') {
      continue
    }

    const text = raw == null ? '' : String(raw).replace(/[\r\n]/g, '')
    if (!text || text === '[object Object]' || isRawUnitDefault(option, text)) {
      if (mode === 'update' && !text) {
        unset.push(option.Name)
      }
      continue
    }
    if (mode === 'create') {
      const usual = displayDefault(option)
      if (usual && text === usual) {
        continue
      }
    }
    set[option.Name] = text
  }

  return { set, obscure, unset }
}

export function providerNeedsOAuth(options: ProviderOption[]): boolean {
  return options.some((option) => option.Name === 'token' && !option.IsPassword)
}
