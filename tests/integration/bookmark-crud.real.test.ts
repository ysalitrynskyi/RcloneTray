import { spawnSync } from 'child_process'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const rcloneBinary = process.env.RCLONETRAY_RCLONE_PATH
const describeReal = rcloneBinary ? describe : describe.skip

const dirs = vi.hoisted(() => ({ config: '' }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.env.TEMP || '/tmp',
    quit: vi.fn(),
    on: vi.fn()
  },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
  powerMonitor: { on: vi.fn() }
}))

vi.mock('electron-is-dev', () => ({ default: false }))

vi.mock('../../src/settings', () => {
  const values: Record<string, unknown> = { rclone_use_bundled: true, rclone_autoupload_names: '' }
  const api = {
    get: (key: string) => values[key],
    set: (key: string, value: unknown) => {
      values[key] = value
    }
  }
  return { ...api, default: api }
})

vi.mock('../../src/dialogs', () => {
  const api = {
    notification: vi.fn(),
    missingRclone: vi.fn(),
    confirmExit: vi.fn(),
    confirmAutomaticUploadAsync: vi.fn().mockResolvedValue(true)
  }
  return { ...api, default: api }
})

vi.mock('chokidar', () => ({
  default: { watch: () => ({ on() { return this }, close: () => Promise.resolve() }) }
}))

type Api = typeof import('../../src/rclone')

function reveal(obscured: string): string {
  const result = spawnSync(rcloneBinary as string, ['reveal', '--', obscured], { encoding: 'utf8', windowsHide: true })
  return result.stdout.replace(/\r?\n$/, '')
}

function section(text: string, name: string): string {
  const start = text.indexOf(`[${name}]`)
  if (start < 0) {
    return ''
  }
  const next = text.indexOf('\n[', start + 1)
  return text.slice(start, next < 0 ? undefined : next)
}

describeReal('bookmark create, update and delete against the real rclone', () => {
  let rclone: Api
  let configFile = ''
  let workDir = ''

  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'rclonetray-crud-'))
    configFile = join(workDir, 'rclone.conf')
    writeFileSync(configFile, '[keep]\ntype = local\nnote = ab#cd\n')
    process.env.RCLONETRAY_CONFIG_FILE = configFile
    dirs.config = configFile
    rclone = (await import('../../src/rclone')) as Api
    rclone.init()
    await rclone.getProviders()
    await vi.waitFor(() => expect(Object.keys(rclone.getBookmarks())).toContain('keep'), { timeout: 20000 })
  }, 60000)

  afterAll(() => {
    delete process.env.RCLONETRAY_CONFIG_FILE
  })

  it('keeps a change another writer made while the password was being hidden', async () => {
    const pending = rclone.addBookmark('sftp', 'race', { host: 'h', user: 'u', pass: 'pw' })
    appendFileSync(configFile, '\n[ext]\ntype = local\n')
    await pending
    const text = readFileSync(configFile, 'utf8')
    expect(text).toContain('[ext]')
    expect(section(text, 'race')).toContain('host = h')
    expect(text).toContain('[keep]')
  }, 30000)

  it('creates two remotes at once without losing either', async () => {
    await Promise.all([
      rclone.addBookmark('sftp', 'par1', { host: 'h1', user: 'u', pass: 'pw1' }),
      rclone.addBookmark('sftp', 'par2', { host: 'h2', user: 'u', pass: 'pw2' })
    ])
    const names = Object.keys(rclone.getBookmarks())
    expect(names).toEqual(expect.arrayContaining(['keep', 'race', 'ext', 'par1', 'par2']))
  }, 30000)

  for (const secret of ['-', 'mount', 'sync']) {
    it(`stores the password ${JSON.stringify(secret)}`, async () => {
      const name = `pw-${secret.replace(/[^a-z]/g, 'dash')}`
      await rclone.addBookmark('sftp', name, { host: 'h', user: 'u', pass: secret })
      const line = /^pass\s*=\s*(.+)$/m.exec(section(readFileSync(configFile, 'utf8'), name))
      expect(line).toBeTruthy()
      expect(reveal((line as RegExpExecArray)[1].trim())).toBe(secret)
    }, 30000)
  }

  it('deletes every block of a duplicated remote', async () => {
    appendFileSync(configFile, '\n[dupe]\ntype = local\n\n[other]\ntype = local\n\n[dupe]\nnote = again\n')
    await rclone.addBookmark('local', 'refresh', {})
    expect(Object.keys(rclone.getBookmarks())).toContain('dupe')
    await rclone.deleteBookmark('dupe')
    expect(readFileSync(configFile, 'utf8')).not.toContain('[dupe]')
    expect(Object.keys(rclone.getBookmarks())).not.toContain('dupe')
    expect(Object.keys(rclone.getBookmarks())).toContain('other')
  }, 30000)

  describe('automatic upload watcher', () => {
    const name = 'watched'
    let folderA = ''
    let folderB = ''

    beforeAll(async () => {
      folderA = mkdtempSync(join(workDir, 'a-'))
      folderB = mkdtempSync(join(workDir, 'b-'))
      await rclone.addBookmark('sftp', name, { host: 'h', user: 'u', _rclonetray_local_path_map: folderA, _rclonetray_remote_path: 'dir' })
      rclone.toggleAutomaticUpload(name)
      await vi.waitFor(() => expect(rclone.isAutomaticUpload(name)).toBe(true), { timeout: 5000 })
    }, 30000)

    it('stays on when a save changes nothing', async () => {
      await rclone.updateBookmark(name, {})
      expect(rclone.isAutomaticUpload(name)).toBe(true)
    })

    it('stays on when the save fails', async () => {
      const ghost = 'ghost'
      await rclone.addBookmark('sftp', ghost, { host: 'h', user: 'u', _rclonetray_local_path_map: folderA })
      rclone.toggleAutomaticUpload(ghost)
      await vi.waitFor(() => expect(rclone.isAutomaticUpload(ghost)).toBe(true), { timeout: 5000 })
      writeFileSync(configFile, readFileSync(configFile, 'utf8').replace(/\[ghost\][\s\S]*?(?=\n\[|$)/, ''))
      await expect(rclone.updateBookmark(ghost, { user: 'x' })).rejects.toThrow(/does not exist/)
      expect(rclone.isAutomaticUpload(ghost)).toBe(true)
      rclone.toggleAutomaticUpload(ghost)
      expect(rclone.isAutomaticUpload(ghost)).toBe(false)
    })

    it('stays on after a save that does not touch the watched folder', async () => {
      await rclone.updateBookmark(name, { user: 'someone' })
      expect(rclone.isAutomaticUpload(name)).toBe(true)
      expect(readFileSync(configFile, 'utf8')).toContain('user = someone')
    })

    it('is restarted on the new folder after the watched folder changes', async () => {
      await rclone.updateBookmark(name, { _rclonetray_local_path_map: folderB })
      expect(rclone.isAutomaticUpload(name)).toBe(true)
      expect(rclone.getBookmark(name)._rclonetray_local_path_map).toBe(folderB)
    })

    it('is stopped when the watched folder is cleared', async () => {
      await rclone.updateBookmark(name, { _rclonetray_local_path_map: '' })
      expect(rclone.isAutomaticUpload(name)).toBe(false)
    })
  })
})
