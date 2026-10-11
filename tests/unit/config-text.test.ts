import { mkdtempSync, readFileSync, writeFileSync, lstatSync, readdirSync, symlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, beforeEach } from 'vitest'
import { editConfigText, isEncryptedRcloneConfig, listConfigSections } from '../../src/rclone/config-text'
import { backupConfigOnce, readConfigText, resetConfigSessionForTests, writeConfigText } from '../../src/rclone/config-repository'

const otherSections = [
  '[keepme]',
  'type = s3',
  'secret = ab#cd',
  'other = a;b',
  'connection_string = DefaultEndpointsProtocol=https;AccountName=x;AccountKey=abc==',
  'token = {"access_token":"abc==","expiry":"x"}',
  'unc = \\\\server\\share\\file',
  'long = \\\\?\\C:\\Windows\\Temp',
  '',
  '  [indented]',
  'type = local',
  '',
  '; a comment',
  '# another',
  ''
].join('\n')

describe('config text editor', () => {
  it('appends a remote without rewriting sections that contain ; # = JSON UNC or an indented header', () => {
    const next = editConfigText(otherSections, {
      section: 'newone',
      createType: 'local',
      set: { _rclonetray_local_path_map: 'C:\\tmp\\photos' }
    })
    expect(next.startsWith(otherSections)).toBe(true)
    expect(next).toContain('[newone]\ntype = local\n_rclonetray_local_path_map = C:\\tmp\\photos\n')
    expect(listConfigSections(next)).toEqual(['keepme', 'indented', 'newone'])
  })

  it('updates one key inside a section and leaves every other line byte-identical', () => {
    const next = editConfigText(otherSections, {
      section: 'keepme',
      set: { type: 'b2' }
    })
    expect(next).toContain('type = b2\n')
    expect(next).not.toContain('type = s3\n')
    expect(next).toContain('secret = ab#cd\n')
    expect(next).toContain('  [indented]\n')
    expect(next).toContain('; a comment\n')
    expect(next).toContain('# another\n')
    expect(next).toContain('unc = \\\\server\\share\\file\n')
    expect(next).toContain('token = {"access_token":"abc==","expiry":"x"}\n')
  })

  it('refuses to merge a new remote into an existing section', () => {
    expect(() => editConfigText(otherSections, { section: 'keepme', createType: 's3' })).toThrow(/already exists/)
    expect(() => editConfigText(otherSections, { section: 'indented', createType: 'local' })).toThrow(/already exists/)
  })

  it('does not recreate a section that has disappeared', () => {
    expect(() => editConfigText(otherSections, { section: 'gone', set: { host: 'x' } })).toThrow(/does not exist/)
  })

  it('removes a cleared password line and nothing else', () => {
    const source = '[pw]\ntype = sftp\npass = SECRET\nhost = h\n'
    expect(editConfigText(source, { section: 'pw', unset: ['pass'] })).toBe('[pw]\ntype = sftp\nhost = h\n')
  })

  it('keeps a UTF-8 BOM and does not drop the first remote', () => {
    const source = '\uFEFF[keep]\ntype = local\nsecret = ab#cd\n'
    const next = editConfigText(source, { section: 'other', createType: 'sftp', set: { host: 'h' } })
    expect(next.startsWith(source)).toBe(true)
    expect(listConfigSections(next)[0]).toBe('keep')
  })

  it('refuses an encrypted config', () => {
    const encrypted = '# Encrypted rclone configuration File\nRCLONE_ENCRYPT_V0:\nAAAA\n'
    expect(isEncryptedRcloneConfig(encrypted)).toBe(true)
    expect(() => editConfigText(encrypted, { section: 'x', createType: 'local' })).toThrow(/encrypted/)
  })

  it('starts a new line when the last line has no trailing newline (LF)', () => {
    expect(editConfigText('[a]\ntype = s3', { section: 'a', set: { region: 'x' } })).toBe('[a]\ntype = s3\nregion = x\n')
    expect(editConfigText('[a]', { section: 'a', set: { region: 'x' } })).toBe('[a]\nregion = x\n')
  })

  it('starts a new line when the last line has no trailing newline (CRLF)', () => {
    expect(editConfigText('[a]\r\ntype = s3', { section: 'a', set: { region: 'x' } })).toBe('[a]\r\ntype = s3\r\nregion = x\r\n')
  })

  it('removes every block of a duplicated section', () => {
    const source = '[a]\ntype = s3\nx = 1\n\n[b]\ntype = local\n\n[a]\nx = 2\n'
    expect(editConfigText(source, { section: 'a', removeSection: true })).toBe('[b]\ntype = local\n\n')
    expect(listConfigSections(editConfigText(source, { section: 'a', removeSection: true }))).toEqual(['b'])
  })

  it('updates the definition rclone actually uses when a section is duplicated', () => {
    const source = '[a]\ntype = s3\nx = 1\n\n[b]\ntype = local\n\n[a]\nx = 2\ny = 3\nx = 4\n'
    const next = editConfigText(source, { section: 'a', set: { x: '9', z: '5' } })
    expect(next).toBe('[a]\ntype = s3\nx = 1\n\n[b]\ntype = local\n\n[a]\nx = 2\ny = 3\nx = 9\nz = 5\n')
  })

  it('appends a key that is new to the last block of a duplicated section', () => {
    const source = '[a]\ntype = s3\n\n[b]\ntype = local\n\n[a]\nx = 2\n'
    expect(editConfigText(source, { section: 'a', set: { region: 'r' } })).toBe('[a]\ntype = s3\n\n[b]\ntype = local\n\n[a]\nx = 2\nregion = r\n')
  })

  it('unsets a key from every block of a duplicated section', () => {
    const source = '[a]\npass = one\ntype = s3\n[b]\ntype = local\n[a]\npass = two\n'
    expect(editConfigText(source, { section: 'a', unset: ['pass'] })).toBe('[a]\ntype = s3\n[b]\ntype = local\n[a]\n')
  })

  it('treats a header with spaces inside the brackets as the trimmed name', () => {
    const source = '[ a ]\ntype = s3\n[\tb\t]\ntype = local\n'
    expect(listConfigSections(source)).toEqual(['a', 'b'])
    expect(editConfigText(source, { section: 'a', set: { region: 'r' } })).toBe('[ a ]\ntype = s3\nregion = r\n[\tb\t]\ntype = local\n')
    expect(editConfigText(source, { section: 'b', removeSection: true })).toBe('[ a ]\ntype = s3\n')
    expect(() => editConfigText(source, { section: 'a', createType: 's3' })).toThrow(/already exists/)
  })

  it('edits and removes keys written as "key: value"', () => {
    const source = '[a]\ntype: s3\nregion :old\npass: secret\n'
    expect(editConfigText(source, { section: 'a', set: { region: 'new' }, unset: ['pass'] })).toBe('[a]\ntype: s3\nregion = new\n')
    expect(editConfigText(source, { section: 'a', set: { type: 's3' } })).toBe(source)
  })

  it('ignores a commented-out key and a key that merely contains the name', () => {
    const source = '[a]\ntype = s3\n; region = old\n# region: old\nsubregion = keep\n'
    expect(editConfigText(source, { section: 'a', set: { region: 'new' } })).toBe('[a]\ntype = s3\n; region = old\n# region: old\nsubregion = keep\nregion = new\n')
  })

  it('inserts new keys after the last key line, not under the next remote comment', () => {
    const source = '[a]\ntype = s3\n\n; a trailing note\n\n# second remote\n[b]\ntype = local\n'
    expect(editConfigText(source, { section: 'a', set: { region: 'r' } })).toBe('[a]\ntype = s3\nregion = r\n\n; a trailing note\n\n# second remote\n[b]\ntype = local\n')
  })

  it('inserts right after the header of a section with no keys', () => {
    expect(editConfigText('[a]\n\n[b]\ntype = local\n', { section: 'a', set: { region: 'r' } })).toBe('[a]\nregion = r\n\n[b]\ntype = local\n')
  })

  it('separates a new section from the previous content with one blank line', () => {
    expect(editConfigText('[a]\ntype = s3\n', { section: 'n', createType: 'local' })).toBe('[a]\ntype = s3\n\n[n]\ntype = local\n')
    expect(editConfigText('[a]\ntype = s3', { section: 'n', createType: 'local' })).toBe('[a]\ntype = s3\n\n[n]\ntype = local\n')
    expect(editConfigText('[a]\ntype = s3\n\n', { section: 'n', createType: 'local' })).toBe('[a]\ntype = s3\n\n[n]\ntype = local\n')
    expect(editConfigText('[a]\r\ntype = s3\r\n', { section: 'n', createType: 'local' })).toBe('[a]\r\ntype = s3\r\n\r\n[n]\r\ntype = local\r\n')
    expect(editConfigText('', { section: 'n', createType: 'local' })).toBe('[n]\ntype = local\n')
  })

  it('removes one section without touching the neighbours', () => {
    const source = '[a]\ntype = local\nsecret = ab#cd\n\n[b]\ntype = sftp\n\n[c]\ntoken = {"a":"b="}\n'
    const next = editConfigText(source, { section: 'b', removeSection: true })
    expect(next).toBe('[a]\ntype = local\nsecret = ab#cd\n\n[c]\ntoken = {"a":"b="}\n')
  })
})

describe('config file writes', () => {
  let dir = ''

  beforeEach(() => {
    resetConfigSessionForTests()
    dir = mkdtempSync(join(tmpdir(), 'rclonetray-cfg-'))
  })

  it('backs up once and does not leave a temp file when the replace fails', () => {
    const filePath = join(dir, 'rclone.conf')
    writeFileSync(filePath, otherSections, { encoding: 'utf8' })
    const backup = backupConfigOnce(filePath)
    expect(backup).toBeTruthy()
    expect(readFileSync(backup as string, 'utf8')).toBe(otherSections)
    expect(backupConfigOnce(filePath)).toBeNull()

    writeFileSync(join(dir, 'not-a-dir'), 'x')
    expect(() => writeConfigText(join(dir, 'not-a-dir', 'rclone.conf'), 'nope')).toThrow()
    expect(readdirSync(dir).some((name) => name.includes('.tmp'))).toBe(false)
    expect(readConfigText(filePath)).toBe(otherSections)
  })

  it('writes through a symlink instead of replacing it', () => {
    const target = join(dir, 'real.conf')
    const link = join(dir, 'link.conf')
    writeFileSync(target, '[keep]\ntype = local\n', { encoding: 'utf8' })
    try {
      symlinkSync(target, link)
    } catch {
      return
    }
    writeConfigText(link, '[keep]\ntype = sftp\n')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('[keep]\ntype = sftp\n')
    rmSync(dir, { recursive: true, force: true })
  })
})
