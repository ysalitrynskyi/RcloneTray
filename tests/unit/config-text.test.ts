import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, lstatSync, readdirSync, symlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editConfigText, isEncryptedRcloneConfig, listConfigSections } from '../../src/rclone/config-text'
import { backupConfigOnce, readConfigText, resetConfigSessionForTests, writeConfigText } from '../../src/rclone/config-repository'

type FsCall = (...args: string[]) => void

const hooks = vi.hoisted(() => ({
  rename: null as null | ((real: FsCall, from: string, to: string) => void),
  copy: null as null | ((real: FsCall, from: string, to: string) => void)
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const patched = {
    ...actual,
    renameSync: (from: string, to: string) => (hooks.rename ? hooks.rename(actual.renameSync as FsCall, from, to) : actual.renameSync(from, to)),
    copyFileSync: (from: string, to: string) => (hooks.copy ? hooks.copy(actual.copyFileSync as FsCall, from, to) : actual.copyFileSync(from, to))
  }
  return { ...patched, default: patched }
})

function sharingViolation(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

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

  afterEach(() => {
    hooks.rename = null
    hooks.copy = null
  })

  it('backs up once per path', () => {
    const filePath = join(dir, 'rclone.conf')
    writeFileSync(filePath, otherSections, { encoding: 'utf8' })
    const backup = backupConfigOnce(filePath)
    expect(backup).toBeTruthy()
    expect(readFileSync(backup as string, 'utf8')).toBe(otherSections)
    expect(backupConfigOnce(filePath)).toBeNull()
  })

  it('does not count a failed backup copy as done', () => {
    const filePath = join(dir, 'rclone.conf')
    writeFileSync(filePath, otherSections, { encoding: 'utf8' })
    hooks.copy = () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    }
    expect(() => backupConfigOnce(filePath)).toThrow(/disk full/)
    hooks.copy = null
    const backup = backupConfigOnce(filePath)
    expect(backup).toBeTruthy()
    expect(readFileSync(backup as string, 'utf8')).toBe(otherSections)
  })

  it('keeps only the three newest backups', () => {
    const filePath = join(dir, 'rclone.conf')
    writeFileSync(filePath, otherSections, { encoding: 'utf8' })
    const old = ['2020-01-01T00-00-00-000Z', '2020-01-02T00-00-00-000Z', '2020-01-03T00-00-00-000Z', '2020-01-04T00-00-00-000Z', '2020-01-05T00-00-00-000Z']
    old.forEach((stamp) => writeFileSync(`${filePath}.${stamp}.bak`, 'old'))
    writeFileSync(join(dir, 'rclone.conf.notes.txt'), 'keep me')
    const backup = backupConfigOnce(filePath) as string
    const remaining = readdirSync(dir).filter((name) => name.endsWith('.bak')).sort()
    expect(remaining).toHaveLength(3)
    expect(remaining).toContain(basename(backup))
    expect(remaining).toContain('rclone.conf.2020-01-05T00-00-00-000Z.bak')
    expect(remaining).toContain('rclone.conf.2020-01-04T00-00-00-000Z.bak')
    expect(readdirSync(dir)).toContain('rclone.conf.notes.txt')
  })

  it('removes the temp file when the replace fails after it was written', () => {
    const filePath = join(dir, 'rclone.conf')
    writeFileSync(filePath, '[a]\ntype = local\n')
    const attempted: string[] = []
    hooks.rename = (_real, from) => {
      attempted.push(from)
      expect(readFileSync(from, 'utf8')).toBe('[a]\ntype = sftp\n')
      throw sharingViolation('EXDEV')
    }
    expect(() => writeConfigText(filePath, '[a]\ntype = sftp\n')).toThrow(/EXDEV/)
    expect(attempted).toHaveLength(1)
    expect(readdirSync(dir)).toEqual(['rclone.conf'])
    expect(readFileSync(filePath, 'utf8')).toBe('[a]\ntype = local\n')
  })

  it('retries a rename that fails with EPERM, EBUSY or EACCES, then succeeds', () => {
    const filePath = join(dir, 'rclone.conf')
    writeFileSync(filePath, '[a]\ntype = local\n')
    for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
      let calls = 0
      hooks.rename = (real, from, to) => {
        calls++
        if (calls <= 2) {
          throw sharingViolation(code)
        }
        real(from, to)
      }
      writeConfigText(filePath, `[a]\ntype = ${code}\n`)
      expect(calls).toBe(3)
      expect(readFileSync(filePath, 'utf8')).toBe(`[a]\ntype = ${code}\n`)
    }
    expect(readdirSync(dir)).toEqual(['rclone.conf'])
  })

  it('gives up on a rename that keeps failing and leaves no temp file', () => {
    const filePath = join(dir, 'rclone.conf')
    writeFileSync(filePath, '[a]\ntype = local\n')
    let calls = 0
    hooks.rename = () => {
      calls++
      throw sharingViolation('EBUSY')
    }
    expect(() => writeConfigText(filePath, '[a]\ntype = sftp\n')).toThrow(/EBUSY/)
    expect(calls).toBeGreaterThan(1)
    expect(readdirSync(dir)).toEqual(['rclone.conf'])
    expect(readFileSync(filePath, 'utf8')).toBe('[a]\ntype = local\n')
  })

  it('does not retry an error that is not a sharing violation', () => {
    const filePath = join(dir, 'rclone.conf')
    let calls = 0
    hooks.rename = () => {
      calls++
      throw sharingViolation('ENOENT')
    }
    expect(() => writeConfigText(filePath, '[a]\n')).toThrow(/ENOENT/)
    expect(calls).toBe(1)
  })

  it('keeps bytes that are not UTF-8 in other sections and writes UTF-8 values correctly', () => {
    const filePath = join(dir, 'rclone.conf')
    const before = Buffer.concat([
      Buffer.from('[old]\ntype = local\nnote = caf', 'latin1'),
      Buffer.from([0xE9, 0xFF, 0x80]),
      Buffer.from('\n\n[target]\ntype = local\n', 'latin1')
    ])
    writeFileSync(filePath, before)
    const next = editConfigText(readConfigText(filePath), { section: 'target', set: { path: 'C:\\Users\\Иван\\Документы' } })
    writeConfigText(filePath, next)
    const after = readFileSync(filePath)
    expect(after.subarray(0, before.length - 'type = local\n'.length).equals(before.subarray(0, before.length - 'type = local\n'.length))).toBe(true)
    expect(after.includes(Buffer.from([0xE9, 0xFF, 0x80]))).toBe(true)
    expect(after.includes(Buffer.from('\uFFFD', 'utf8'))).toBe(false)
    const tail = after.subarray(before.length).toString('utf8')
    expect(tail).toBe('path = C:\\Users\\Иван\\Документы\n')
  })

  it('finds, creates and removes a remote with a non-ASCII name', () => {
    const raw = Buffer.from('[Файл]\ntype = local\n\n[x]\ntype = local\n', 'utf8').toString('latin1')
    expect(listConfigSections(raw)).toEqual(['Файл', 'x'])
    expect(() => editConfigText(raw, { section: 'Файл', createType: 'local' })).toThrow(/already exists/)
    const created = editConfigText(raw, { section: 'Диск', createType: 'local' })
    expect(Buffer.from(created, 'latin1').toString('utf8')).toBe('[Файл]\ntype = local\n\n[x]\ntype = local\n\n[Диск]\ntype = local\n')
    const removed = editConfigText(created, { section: 'Файл', removeSection: true })
    expect(Buffer.from(removed, 'latin1').toString('utf8')).toBe('[x]\ntype = local\n\n[Диск]\ntype = local\n')
  })

  it('does not trim a trailing byte that is whitespace in latin1 but part of a UTF-8 letter', () => {
    const raw = Buffer.from('[a]\ntype = local\npath = Р\n', 'utf8').toString('latin1')
    const next = editConfigText(raw, { section: 'a', set: { other: 'x' } })
    expect(Buffer.from(next, 'latin1').toString('utf8')).toBe('[a]\ntype = local\npath = Р\nother = x\n')
    expect(editConfigText(raw, { section: 'a', set: { path: 'Р' } })).toBe(raw)
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
