import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { withConfigLock } from '../../src/rclone/config-lock'
import { createRemote, deleteRemote, rollbackCreatedRemote, updateRemote } from '../../src/rclone/config-mutations'
import { resetConfigSessionForTests } from '../../src/rclone/config-repository'
import { listConfigSections } from '../../src/rclone/config-text'
import { changesAutoUploadTarget } from '../../src/rclone/auto-upload'

const empty = { set: {}, unset: [] as string[] }

describe('config lock', () => {
  it('runs tasks one after another even when each one awaits', async () => {
    const order: string[] = []
    const task = (name: string, ms: number) => withConfigLock(async () => {
      order.push(`start ${name}`)
      await new Promise((resolve) => setTimeout(resolve, ms))
      order.push(`end ${name}`)
    })
    await Promise.all([task('a', 30), task('b', 1), task('c', 1)])
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
  })

  it('keeps running after a task fails and still reports the failure', async () => {
    const failing = withConfigLock(() => {
      throw new Error('boom')
    })
    const next = withConfigLock(() => 'ok')
    await expect(failing).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })
})

describe('config mutations', () => {
  let file = ''

  beforeEach(() => {
    resetConfigSessionForTests()
    file = join(mkdtempSync(join(tmpdir(), 'rclonetray-mut-')), 'rclone.conf')
    writeFileSync(file, '[keep]\ntype = local\nnote = ab#cd\n')
  })

  it('does not lose either remote when two creates run at once', async () => {
    await Promise.all([
      createRemote(file, 'one', 'local', empty),
      createRemote(file, 'two', 'local', { set: { x: '1' }, unset: [] })
    ])
    expect(listConfigSections(readFileSync(file, 'latin1'))).toEqual(['keep', 'one', 'two'])
  })

  it('rejects a second create of the same name and leaves the first alone', async () => {
    const results = await Promise.allSettled([
      createRemote(file, 'dup', 'local', { set: { x: '1' }, unset: [] }),
      createRemote(file, 'dup', 'local', { set: { x: '2' }, unset: [] })
    ])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
    const text = readFileSync(file, 'utf8')
    expect(text.match(/\[dup\]/g)).toHaveLength(1)
    expect(text).toContain('x = 1')
  })

  it('applies an update to the file as it is when the lock is taken, not as it was earlier', async () => {
    const slow = withConfigLock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
      writeFileSync(file, readFileSync(file, 'utf8') + '\n[ext]\ntype = local\n')
    })
    const update = updateRemote(file, 'keep', { set: { note: 'new' }, unset: [] })
    await Promise.all([slow, update])
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('[ext]')
    expect(text).toContain('note = new')
  })

  it('reports no change and writes nothing when there is nothing to update', async () => {
    const before = readFileSync(file, 'utf8')
    await expect(updateRemote(file, 'keep', empty)).resolves.toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(readdirSync(join(file, '..'))).toEqual(['rclone.conf'])
  })

  it('refuses to update a remote that is gone instead of recreating it', async () => {
    await expect(updateRemote(file, 'gone', { set: { a: 'b' }, unset: [] })).rejects.toThrow(/does not exist/)
    expect(listConfigSections(readFileSync(file, 'latin1'))).toEqual(['keep'])
  })

  it('refuses every change on an encrypted config', async () => {
    writeFileSync(file, '# Encrypted rclone configuration File\nRCLONE_ENCRYPT_V0:\nAAAA\n')
    await expect(createRemote(file, 'n', 'local', empty)).rejects.toThrow(/encrypted/)
    await expect(updateRemote(file, 'n', empty)).rejects.toThrow(/encrypted/)
    await expect(deleteRemote(file, 'n')).rejects.toThrow(/encrypted/)
  })

  it('rolls back only the section the create added and keeps changes made since', async () => {
    await createRemote(file, 'made', 'local', empty)
    writeFileSync(file, readFileSync(file, 'utf8') + '\n[late]\ntype = local\n')
    await rollbackCreatedRemote(file, 'made')
    expect(listConfigSections(readFileSync(file, 'latin1'))).toEqual(['keep', 'late'])
  })

  it('deletes every block of a duplicated remote', async () => {
    writeFileSync(file, '[a]\ntype = local\n[b]\ntype = local\n[a]\nx = 1\n')
    await deleteRemote(file, 'a')
    expect(readFileSync(file, 'utf8')).toBe('[b]\ntype = local\n')
  })
})

describe('changesAutoUploadTarget', () => {
  const existing = { _rclonetray_local_path_map: 'C:\\data', _rclonetray_remote_path: 'bucket' }

  it('is false for unrelated fields and for the same values', () => {
    expect(changesAutoUploadTarget({ set: { host: 'h' }, unset: [] }, existing)).toBe(false)
    expect(changesAutoUploadTarget({ set: { _rclonetray_local_path_map: 'C:\\data', _rclonetray_remote_path: 'bucket' }, unset: [] }, existing)).toBe(false)
    expect(changesAutoUploadTarget({ set: {}, unset: [] }, existing)).toBe(false)
    expect(changesAutoUploadTarget({ set: {}, unset: ['_rclonetray_remote_path'] }, {})).toBe(false)
  })

  it('is true when the watched folder or the remote path changes or is cleared', () => {
    expect(changesAutoUploadTarget({ set: { _rclonetray_local_path_map: 'C:\\other' }, unset: [] }, existing)).toBe(true)
    expect(changesAutoUploadTarget({ set: { _rclonetray_remote_path: 'elsewhere' }, unset: [] }, existing)).toBe(true)
    expect(changesAutoUploadTarget({ set: {}, unset: ['_rclonetray_local_path_map'] }, existing)).toBe(true)
  })
})
