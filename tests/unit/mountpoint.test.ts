import { describe, expect, it } from 'vitest'
import { mountpointFor } from '../../src/rclone/mountpoint'

describe('mountpointFor', () => {
  it('mounts on macOS in a home folder that RcloneTray can create', () => {
    const mountpoint = mountpointFor('darwin', '/Users/someone', 'local', 'photos')
    expect(mountpoint).toBe('/Users/someone/mount.local.photos')
    expect(mountpoint.startsWith('/Volumes/')).toBe(false)
  })

  it('mounts on Linux in a home folder', () => {
    expect(mountpointFor('linux', '/home/someone', 'sftp', 'nas')).toBe('/home/someone/mount.sftp.nas')
  })

  it('lets WinFsp choose the drive letter on Windows', () => {
    expect(mountpointFor('win32', 'C:\\Users\\someone', 'drive', 'docs')).toBe('*')
  })
})
