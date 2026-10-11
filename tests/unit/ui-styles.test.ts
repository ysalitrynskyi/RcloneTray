import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../src/ui/styles/ui.css', import.meta.url), 'utf8')

function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  expect(match, `rule ${selector}`).not.toBeNull()
  const result: Record<string, string> = {}
  for (const part of (match as RegExpExecArray)[1].split(';')) {
    const index = part.indexOf(':')
    if (index > 0) {
      result[part.slice(0, index).trim()] = part.slice(index + 1).trim()
    }
  }
  return result
}

describe('dialog tab buttons', () => {
  it('overrides the filled accent button background on inactive tabs', () => {
    const base = declarations('.tab-button')
    expect(base.background).toBe('transparent')
    expect(base.color).toBe('var(--text-2)')
  })

  it('fills only the active tab with the accent colour', () => {
    const active = declarations('.tab-button.active, .tab-button.active:hover')
    expect(active.background).toBe('var(--accent)')
    expect(active.color).toBe('var(--on-accent)')
  })
})
