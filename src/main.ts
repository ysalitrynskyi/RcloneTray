'use strict'

import * as path from 'path'
import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, Notification, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import isDev from 'electron-is-dev'
import * as dialogs from './dialogs'
import * as tray from './tray'
import * as rclone from './rclone'
import * as settings from './settings'
import { DialogWindow, SettingKey, Settings } from './types'
import { assertBookmarkName, assertExistingRemoteName, assertProviderName, assertSettingKey, assertSettingsPatch } from './ipc/validation'

// Error handler

function windowFromSender(sender: Electron.WebContents): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(sender) || undefined
}

function showMessageBox(sender: Electron.WebContents | undefined, options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const owner = sender ? windowFromSender(sender) : undefined
  return owner
    ? dialog.showMessageBox(owner, options)
    : dialog.showMessageBox(options)
}

function showOpenDialog(sender: Electron.WebContents | undefined, options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  const owner = sender ? windowFromSender(sender) : undefined
  return owner
    ? dialog.showOpenDialog(owner, options)
    : dialog.showOpenDialog(options)
}

ipcMain.handle('get-app-path', () => app.getAppPath())
ipcMain.handle('get-app-name', () => app.getName())
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.on('refresh-tray', () => {
  tray.refresh()
})

ipcMain.handle('get-setting', (_event: IpcMainInvokeEvent, key: SettingKey) => {
  return settings.get(assertSettingKey(key))
})

ipcMain.handle('settings-merge', async (_event: IpcMainInvokeEvent, data: Partial<Settings>) => {
  const patch = assertSettingsPatch(data)
  await settings.merge(patch)
  if (patch.theme === 'light' || patch.theme === 'dark' || patch.theme === 'system') {
    nativeTheme.themeSource = patch.theme
  }
})

async function checkForUpdate(): Promise<void> {
  if (!settings.get('check_updates')) {
    return
  }
  try {
    const response = await fetch('https://api.github.com/repos/ysalitrynskyi/RcloneTray/releases/latest', {
      headers: { 'User-Agent': 'RcloneTray', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) {
      return
    }
    const body = await response.json() as { tag_name?: string }
    const latest = String(body.tag_name || '').replace(/^v/, '')
    const current = app.getVersion()
    if (latest && latest !== current && latest.split('.').some((part, index) => Number(part) > Number(current.split('.')[index] || 0))) {
      dialogs.notification(`RcloneTray ${latest} is available. You are on ${current}.`, 'info')
    }
  } catch {
    // Update checks are optional and must not affect startup.
  }
}

ipcMain.handle('get-rclone-version', () => {
  return rclone.getVersion()
})

ipcMain.handle('get-rclone-providers', () => {
  return rclone.getProviders()
})

ipcMain.handle('get-rclone-book', (_event: IpcMainInvokeEvent, type: string, name: string, options: Record<string, unknown>) => {
  return rclone.addBookmark(assertProviderName(type), assertBookmarkName(name), options)
})

ipcMain.handle('get-rclone-delete-book', (_event: IpcMainInvokeEvent, name: string) => {
  return rclone.deleteBookmark(assertExistingRemoteName(name))
})

ipcMain.handle('get-rclone-update-book', (_event: IpcMainInvokeEvent, name: string, options: Record<string, unknown>) => {
  return rclone.updateBookmark(assertExistingRemoteName(name), options)
})

ipcMain.handle('get-rclone-get-config-file', () => {
  return rclone.getConfigFile()
})

ipcMain.on('get-provider-data', (event: IpcMainEvent, providerName: string) => {
  try {
    const provider = rclone.getProvider(providerName)
    event.reply('provider-data-reply', provider)
  } catch (error) {
    console.error('get-provider-data failed:', error)
    // Always reply so the renderer can stop waiting and show a useful message
    // instead of an empty form with only the Name field.
    event.reply('provider-data-reply', null)
  }
})

ipcMain.handle('get-provider-data', async (_event: IpcMainInvokeEvent, providerName: string) => {
  await rclone.getProviders()
  return rclone.getProvider(assertProviderName(providerName))
})

ipcMain.handle('get-job-state', () => {
  return rclone.getJobStates()
})

ipcMain.handle('stop-job', (_event: IpcMainInvokeEvent, id: string) => {
  if (typeof id !== 'string' || !id) {
    throw new Error('Missing job.')
  }
  rclone.stopJob(id)
})

ipcMain.handle('clear-finished-jobs', () => {
  return rclone.clearFinishedJobs()
})

ipcMain.handle('test-remote-connection', (_event: IpcMainInvokeEvent, name: string) => {
  return rclone.testRemoteConnection(assertExistingRemoteName(name))
})

ipcMain.handle('rclone-get-config', async () => {
  return rclone.getConfig()
})

ipcMain.handle('settings-get', async (_event: IpcMainInvokeEvent, key: SettingKey) => {
  return settings.get(assertSettingKey(key))
})

ipcMain.on('settings-set', (_event: IpcMainEvent, key: SettingKey, value: Settings[SettingKey]) => {
  settings.set(key, value as never)
})

ipcMain.on('set-autostart', (_event: IpcMainEvent, state: boolean) => {
  if (process.platform === 'linux') {
    setLinuxAutostart(Boolean(state))
    return
  }
  app.setLoginItemSettings({ openAtLogin: state })
})

ipcMain.handle('is-autostart', async () => {
  if (process.platform === 'linux') {
    return linuxAutostartEnabled()
  }
  const loginSettings = app.getLoginItemSettings() as Electron.LoginItemSettings & { executableWillLaunchAtLogin?: boolean }
  if (process.platform === 'win32' && typeof loginSettings.executableWillLaunchAtLogin === 'boolean') {
    return loginSettings.openAtLogin && loginSettings.executableWillLaunchAtLogin
  }
  return loginSettings.openAtLogin
})

ipcMain.handle('get-props', async (event: IpcMainInvokeEvent) => {
  const window = windowFromSender(event.sender) as DialogWindow | undefined
  return window?.$props || {}
})

ipcMain.on('popup-context-menu', (event: IpcMainEvent, menuTemplate: Electron.MenuItemConstructorOptions[]) => {
  const menu = Menu.buildFromTemplate(menuTemplate)
  menu.popup({ window: windowFromSender(event.sender) })
})

ipcMain.handle('show-select-menu', async (event: IpcMainInvokeEvent, payload: { items?: Array<{ label: string; value: string }> }) => {
  const items = Array.isArray(payload?.items) ? payload.items : []
  return await new Promise<string | null>((resolve) => {
    let settled = false
    const finish = (value: string | null): void => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    const menu = Menu.buildFromTemplate(items.map((item) => ({
      label: String(item.label),
      click: () => finish(String(item.value))
    })))
    menu.popup({
      window: BrowserWindow.fromWebContents(event.sender) || undefined,
      callback: () => finish(null)
    })
  })
})

ipcMain.handle('show-message-box', async (event: IpcMainInvokeEvent, { message }: { message: string }) => {
  const response = await showMessageBox(event.sender, {
    message,
    buttons: ['OK']
  })
  return response.response
})

ipcMain.handle('confirm-dialog', async (event: IpcMainInvokeEvent, { message }: { message: string }) => {
  const response = await showMessageBox(event.sender, {
    type: 'question',
    buttons: ['Cancel', 'Confirm'],
    defaultId: 0,
    cancelId: 0,
    message: message
  })
  return response.response
})

ipcMain.on('error-box', (_event: IpcMainEvent, { message }: { message: string }) => {
  dialog.showErrorBox('Error', message)
})

ipcMain.on('show-notification', (_event: IpcMainEvent, { message }: { message: string }) => {
  new Notification({ title: 'Notification', body: message.toString() }).show()
})

ipcMain.on('resize-window', (event: IpcMainEvent, newHeight: number) => {
  const window = windowFromSender(event.sender)
  if (!window) return

  const [width] = window.getSize()
  if (process.platform === 'darwin') {
    window.setSize(width, newHeight, true)
  } else {
    window.setSize(width, newHeight)
  }
})

ipcMain.handle('select-directory', async (event: IpcMainInvokeEvent, { defaultDirectory }: { defaultDirectory?: string }) => {
  const result = await showOpenDialog(event.sender, {
    title: 'Select Directory',
    defaultPath: defaultDirectory || app.getPath('home'),
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.filePaths.length > 0) {
    return result.filePaths[0]
  } else {
    return null
  }
})

ipcMain.handle('select-file', async (event: IpcMainInvokeEvent, defaultFile?: string) => {
  const { filePaths } = await showOpenDialog(event.sender, {
    title: 'Select File',
    defaultPath: defaultFile || app.getPath('home'),
    properties: ['openFile', 'showHiddenFiles']
  })
  return filePaths
})

ipcMain.on('check-require-restart', async () => {
  const choice = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Restart', 'Ignore'],
    title: 'Restart is required',
    message: 'You have changed a setting that requires restart to take effect.'
  })

  if (choice.response === 0) {
    rclone.requestRelaunch()
  }
})

process.on('uncaughtException', function (error: Error) {
  if (dialogs.uncaughtException(error)) {
    rclone.stopAllProcesses()
    app.exit()
  }
})

if (process.env.APPIMAGE) {
  app.commandLine.appendSwitch('no-sandbox')
}

function autostartDesktopPath(): string {
  return path.join(os.homedir(), '.config', 'autostart', 'RcloneTray.desktop')
}

function linuxAutostartEnabled(): boolean {
  return fs.existsSync(autostartDesktopPath())
}

function setLinuxAutostart(enabled: boolean): void {
  const desktopPath = autostartDesktopPath()
  if (!enabled) {
    fs.rmSync(desktopPath, { force: true })
    return
  }
  fs.mkdirSync(path.dirname(desktopPath), { recursive: true })
  const executable = process.env.APPIMAGE || process.execPath
  const body = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=RcloneTray',
    'Comment=Rclone tray',
    `Exec=${executable}`,
    'X-GNOME-Autostart-enabled=true',
    'Terminal=false',
    ''
  ].join('\n')
  fs.writeFileSync(desktopPath, body, { mode: 0o644 })
}

// Check the OS.
if (!['win32', 'linux', 'darwin'].includes(process.platform)) {
  throw new Error('Unsupported platform')
}

// win32 workaround for poor rendering.
if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

// Do not allow multiple instances.
if (!app.requestSingleInstanceLock()) {
  if (isDev) {
    console.log('There is already a started RcloneTray instance.')
  }
  app.focus()
  dialogs.errorMultiInstance()
  app.exit()
}

// Whether we are running inside the automated E2E harness.
const isTest = process.env.RCLONETRAY_TEST === '1'

// For debugging purposes (skipped under the E2E harness so we don't fight
// Playwright's own inspector/relaunch handling).
if (isDev && !isTest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const inspector = require('inspector')

  if (inspector.url()) {
    inspector.close()
  }

  try {
    inspector.open()
    console.log('Inspector opened successfully.')
  } catch (error) {
    console.error('Failed to open inspector:', error)
  }

  // load electron-reload
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron')
    })
  } catch {
    // electron-reload is optional in dev; ignore if unavailable.
  }
}

// Focus the app if a second instance is going to start.
app.on('second-instance', () => app.focus())

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function () {
  const theme = settings.get('theme')
  if (theme === 'light' || theme === 'dark' || theme === 'system') {
    nativeTheme.themeSource = theme
  }
  if (settings.isFirstRun()) {
    void dialog.showMessageBox({
      type: 'info',
      title: 'Welcome to RcloneTray',
      message: 'RcloneTray stays in the tray.',
      detail: 'Use New Remote to add a cloud. Preferences holds mount, sync, and serving options. An encrypted rclone config is left read-only.',
      buttons: ['OK']
    })
  }
  void checkForUpdate()
  // Initialize the tray.
  tray.init()

  // Initialize Rclone.
  rclone.init()
  rclone.onUpdate(tray.refresh)

  // Only on macOS is there app.dock.
  if (process.platform === 'darwin') {
    // Hide the app from dock and taskbar.
    app.dock.hide()
  }
})

// Prepare app to quit.
app.on('before-quit', rclone.prepareQuit)

// Should not quit when all windows are closed,
// because the application is staying as a system tray indicator.
app.on('window-all-closed', function (event: Electron.Event) {
  event.preventDefault()
})
