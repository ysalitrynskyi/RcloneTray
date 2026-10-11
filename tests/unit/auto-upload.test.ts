import { describe, expect, it } from 'vitest'
import { AUTO_UPLOAD_IGNORED, automaticUploadDelay } from '../../src/rclone/auto-upload'

describe('automatic upload timing', () => {
  it('waits the debounce delay and then fires anyway after the maximum', () => {
    expect(automaticUploadDelay(0, 1000, 5000, 60000)).toBe(5000)
    expect(automaticUploadDelay(0, 60000, 5000, 60000)).toBe(0)
  })

  it('ignores housekeeping files', () => {
    expect(AUTO_UPLOAD_IGNORED.test('C:\\Photos\\.DS_Store')).toBe(true)
    expect(AUTO_UPLOAD_IGNORED.test('/home/a/Thumbs.db')).toBe(true)
    expect(AUTO_UPLOAD_IGNORED.test('/home/a/notes.txt')).toBe(false)
  })
})
