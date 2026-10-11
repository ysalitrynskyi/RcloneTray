import * as path from 'path'

/**
 * Where a remote is mounted.
 *
 * rclone refuses to mount on a directory that does not exist, and on macOS
 * /Volumes is owned by root, so RcloneTray cannot create a mountpoint there.
 * macOS and Linux therefore mount in a folder in the home directory, which
 * RcloneTray creates before mounting and removes once it is empty again.
 * On Windows, WinFsp picks a free drive letter.
 */
export function mountpointFor(platform: NodeJS.Platform, homeDir: string, type: string, name: string): string {
  if (platform === 'win32') {
    return '*'
  }
  return path.posix.join(homeDir, `mount.${type}.${name}`)
}
