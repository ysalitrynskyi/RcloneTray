import { spawnSync } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { editConfigText } from '../../src/rclone/config-text'

const rclone = process.env.RCLONETRAY_RCLONE_PATH
const describeReal = rclone ? describe : describe.skip

const otherSections = [
  '[keepme]',
  'type = local',
  'secret = ab#cd',
  'other = a;b',
  'connection_string = DefaultEndpointsProtocol=https;AccountName=x;AccountKey=abc==',
  'token = {"access_token":"abc==","expiry":"x"}',
  'unc = \\\\server\\share\\file',
  '',
  '  [indented]',
  'type = local',
  '',
  '; a comment',
  '# another',
  ''
].join('\n')

describeReal('real rclone v1.74.4 config behaviour', () => {
  it('still parses sections after a byte-preserving edit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rclonetray-real-'))
    const file = join(dir, 'rclone.conf')
    const next = editConfigText(otherSections, {
      section: 'newone',
      createType: 'local'
    })
    expect(next.startsWith(otherSections)).toBe(true)
    writeFileSync(file, next, { encoding: 'utf8' })
    const dumped = spawnSync(rclone as string, ['config', 'dump', '--ask-password=false', '--config', file], {
      encoding: 'utf8',
      windowsHide: true
    })
    expect(dumped.status).toBe(0)
    const parsed = JSON.parse(dumped.stdout) as Record<string, Record<string, string>>
    expect(parsed.keepme.secret).toBe('ab#cd')
    expect(parsed.keepme.other).toBe('a;b')
    expect(parsed.keepme.connection_string).toContain('AccountKey=abc==')
    expect(parsed.keepme.token).toContain('access_token')
    expect(parsed.keepme.unc.replace(/\//g, '\\')).toContain('\\\\server\\share')
    expect(parsed.indented.type).toBe('local')
    expect(parsed.newone.type).toBe('local')
  })

  it('obscures a password that starts with a dash', () => {
    const result = spawnSync(rclone as string, ['obscure', '--', '-secret'], {
      encoding: 'utf8',
      windowsHide: true
    })
    expect(result.status).toBe(0)
    const obscured = result.stdout.trim()
    expect(obscured).not.toBe('-secret')
    expect(obscured.length).toBeGreaterThan(8)
  })

  it('rejects serve http --attr-timeout', () => {
    const result = spawnSync(rclone as string, ['serve', 'http', 'local:', '--attr-timeout', '3s', '--ask-password=false'], {
      encoding: 'utf8',
      windowsHide: true
    })
    const text = `${result.stdout}\n${result.stderr}`
    expect(text).toMatch(/unknown flag: --attr-timeout/)
  })
})
