import { SettingKey, Settings } from '../types'
import { assertExistingRemoteName, assertNewRemoteName } from '../rclone/remote-name'

export { assertExistingRemoteName, assertNewRemoteName }

const SettingKeys: SettingKey[] = [
  'tray_menu_show_type',
  'rclone_use_bundled',
  'rclone_config',
  'custom_args',
  'rclone_cache_files',
  'rclone_cache_directories',
  'rclone_mount_vfs_cache_mode',
  'rclone_sync_enable',
  'rclone_sync_autoupload_delay',
  'rclone_ncdu_enable',
  'rclone_serving_http_enable',
  'rclone_serving_ftp_enable',
  'rclone_serving_restic_enable',
  'rclone_serving_webdav_enable',
  'rclone_serving_username',
  'rclone_serving_password',
  'rclone_sync_max_delete',
  'rclone_sync_backup_dir',
  'rclone_transfers',
  'rclone_checkers',
  'rclone_bwlimit',
  'notification_level',
  'rclone_serve_read_only',
  'rclone_mount_network_mode',
  'theme',
  'check_updates',
  'rclone_autoupload_names'
]

export function assertSettingKey(value: unknown): SettingKey {
  if (typeof value !== 'string' || !SettingKeys.includes(value as SettingKey)) {
    throw new Error(`Invalid setting key: ${String(value)}`)
  }
  return value as SettingKey
}

export function assertSettingsPatch(value: unknown): Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Settings update must be an object.')
  }
  Object.keys(value).forEach(assertSettingKey)
  return value as Partial<Settings>
}

export function assertBookmarkName(value: unknown): string {
  return assertNewRemoteName(value)
}

export function assertProviderName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Invalid provider name.')
  }
  return value
}
