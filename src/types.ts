/**
 * Shared type definitions for RcloneTray
 */

// Settings types
export interface Settings {
  tray_menu_show_type: boolean
  rclone_use_bundled: boolean
  rclone_config: string
  custom_args: string
  rclone_cache_files: number
  rclone_cache_directories: number
  rclone_sync_enable: boolean
  rclone_sync_autoupload_delay: number
  rclone_ncdu_enable: boolean
  rclone_serving_http_enable: boolean
  rclone_serving_ftp_enable: boolean
  rclone_serving_restic_enable: boolean
  rclone_serving_webdav_enable: boolean
  rclone_serving_username: string
  rclone_serving_password: string
}

export type SettingKey = keyof Settings
export type SettingValue = Settings[SettingKey]

// Provider types
export interface ProviderOption {
  Name: string
  Help: string
  Default?: string | number | boolean
  Required: boolean
  Advanced: boolean
  Hide: boolean
  IsPassword?: boolean
  Provider?: string
  Examples?: Array<{ Value: string | number; Label?: string }>
  $Type?: string
  $Label?: string
  $Namespace?: string
}

export interface Provider {
  Name: string
  Prefix: string
  Description: string
  Options: ProviderOption[]
}

export interface ProvidersCache {
  [prefix: string]: Provider
}

// Bookmark types
export interface Bookmark {
  $name: string
  type: string
  _rclonetray_remote_path?: string
  _rclonetray_local_path_map?: string
  _rclonetray_custom_args?: string
  [key: string]: string | undefined
}

export interface BookmarksCache {
  [name: string]: Bookmark
}

// Process types
export interface ProcessData {
  OK: boolean
  mountpoint?: string
  protocol?: string
  URI?: string
}

export interface ProcessRegistryEntry {
  bookmarkName: string
  processName: string
  process: import('child_process').ChildProcess
  data: ProcessData
  lineBuffer?: string
}

export interface ProcessRegistry {
  [id: string]: ProcessRegistryEntry
}

// Automatic upload types
export interface AutomaticUploadEntry {
  watcher: import('chokidar').FSWatcher | null
  timer: NodeJS.Timeout | null
}

export interface AutomaticUploadRegistry {
  [bookmarkName: string]: AutomaticUploadEntry
}

// Rclone cache types
export interface RcloneCache {
  version: string | null
  configFile: string
  providers: ProvidersCache
  bookmarks: BookmarksCache
}

// Serve protocols
export type ServeProtocol = 'http' | 'ftp' | 'webdav' | 'restic'

export interface ServeProtocols {
  http?: string
  ftp?: string
  webdav?: string
  restic?: string
}

// Dialog props
export interface DialogProps {
  $name?: string
  type?: string
  [key: string]: unknown
}

// IPC Channel definitions
export type IPCChannels = {
  // App info
  'get-app-path': { args: []; return: string }
  'get-app-name': { args: []; return: string }
  'get-app-version': { args: []; return: string }
  
  // Settings
  'get-setting': { args: [key: SettingKey]; return: SettingValue }
  'settings-merge': { args: [data: Partial<Settings>]; return: void }
  'settings-get': { args: [key: SettingKey]; return: SettingValue }
  
  // Rclone
  'get-rclone-version': { args: []; return: string }
  'get-rclone-providers': { args: []; return: ProvidersCache }
  'get-rclone-book': { args: [type: string, name: string, options: Record<string, string>]; return: void }
  'get-rclone-delete-book': { args: [name: string]; return: void }
  'get-rclone-update-book': { args: [name: string, options: Record<string, string>]; return: void }
  'get-rclone-get-config-file': { args: []; return: string }
  'rclone-get-config': { args: []; return: BookmarksCache }
  'get-provider-data': { args: [providerName: string]; return: Provider }
  
  // Autostart
  'is-autostart': { args: []; return: boolean }
  
  // Dialog
  'get-props': { args: []; return: DialogProps }
  'show-message-box': { args: [{ message: string }]; return: number }
  'confirm-dialog': { args: [{ message: string }]; return: number }
  'select-directory': { args: [{ defaultDirectory?: string }]; return: string | null }
  'select-file': { args: [defaultFile?: string]; return: string[] }
}

// Menu item types for Electron
export interface TrayMenuItem {
  label?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  click?: () => void
  enabled?: boolean
  checked?: boolean
  accelerator?: string
  role?: string
  submenu?: TrayMenuItem[]
}

// BrowserWindow with custom props
export interface DialogWindow extends Electron.BrowserWindow {
  $props?: DialogProps
  setSizeAsync?: (width: number, height: number) => void
}

