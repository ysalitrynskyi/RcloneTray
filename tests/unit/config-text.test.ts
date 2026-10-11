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
