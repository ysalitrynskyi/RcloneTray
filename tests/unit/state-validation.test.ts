import { describe, expect, it, beforeEach } from 'vitest'
import { assertBookmarkName, assertProviderName, assertSettingKey, assertSettingsPatch } from '../../src/ipc/validation'
import { appendJobLog, finishJob, getJobStates, resetJobStates, startJob } from '../../src/rclone/job-state'

describe('IPC validation helpers', () => {
  it('accepts known settings keys and rejects unknown keys', () => {
    expect(assertSettingKey('rclone_config')).toBe('rclone_config')
    expect(() => assertSettingKey('bad_key')).toThrow('Invalid setting key')
  })

  it('validates settings patches', () => {
    expect(assertSettingsPatch({ rclone_use_bundled: false })).toEqual({ rclone_use_bundled: false })
    expect(() => assertSettingsPatch({ nope: true })).toThrow('Invalid setting key')
  })

  it('validates bookmark and provider names', () => {
    expect(assertBookmarkName('remote_1')).toBe('remote_1')
    expect(assertProviderName('s3')).toBe('s3')
    expect(() => assertBookmarkName('../escape')).toThrow('Invalid remote name')
    expect(() => assertProviderName('')).toThrow('Invalid provider name')
  })
})

describe('job state store', () => {
  beforeEach(() => {
    resetJobStates()
  })

  it('tracks and sorts jobs by newest first', async () => {
    startJob({ id: 'a', bookmarkName: 'one', kind: 'mount', label: 'mount one' })
    await new Promise((resolve) => setTimeout(resolve, 2))
    startJob({ id: 'b', bookmarkName: 'two', kind: 'upload', label: 'upload two' })
    expect(getJobStates().map((job) => job.id)).toEqual(['b', 'a'])
  })

  it('caps log tails and makes finish idempotent', () => {
    startJob({ id: 'job', bookmarkName: 'one', kind: 'upload', label: 'upload one' })
    Array.from({ length: 90 }, (_, index) => appendJobLog('job', `line-${index}`))
    finishJob('job', 'failed', 'first')
    finishJob('job', 'succeeded', 'second')
    const [job] = getJobStates()
    expect(job.status).toBe('failed')
    expect(job.message).toBe('first')
    expect(job.logTail).toHaveLength(80)
    expect(job.logTail[0]).toBe('line-10')
  })
})
