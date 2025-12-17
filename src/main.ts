'use strict'

import * as path from 'path'
import { app, BrowserWindow, Menu, dialog, ipcMain, Notification, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import isDev from 'electron-is-dev'
import * as dialogs from './dialogs'
import * as tray from './tray'
import * as rclone from './rclone'
import * as settings from './settings'
import { DialogWindow, SettingKey, Settings } from './types'

// Error handler

ipcMain.handle('get-app-path', () => app.getAppPath())
ipcMain.handle('get-app-name', () => app.getName())
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.on('refresh-tray', () => {
  tray.refresh()
})

ipcMain.handle('get-setting', (_event: IpcMainInvokeEvent, key: SettingKey) => {
  return settings.get(key)
})

ipcMain.handle('settings-merge', (_event: IpcMainInvokeEvent, data: Partial<Settings>) => {
  return settings.merge(data)
})

ipcMain.handle('get-rclone-version', () => {
  return rclone.getVersion()
})

ipcMain.handle('get-rclone-providers', () => {
  return rclone.getProviders()
})

ipcMain.handle('get-rclone-book', (_event: IpcMainInvokeEvent, type: string, name: string, options: Record<string, string>) => {
  return rclone.addBookmark(type, name, options)
})

ipcMain.handle('get-rclone-delete-book', (_event: IpcMainInvokeEvent, name: string) => {
  return rclone.deleteBookmark(name)
})

ipcMain.handle('get-rclone-update-book', (_event: IpcMainInvokeEvent, name: string, options: Record<string, string>) => {
  return rclone.updateBookmark(name, options)
})

ipcMain.handle('get-rclone-get-config-file', () => {
  return rclone.getConfigFile()
})

ipcMain.on('get-provider-data', (event: IpcMainEvent, providerName: string) => {
  const provider = rclone.getProvider(providerName)
  event.reply('provider-data-reply', provider)
})

ipcMain.handle('rclone-get-config', async () => {
  return rclone.getConfig()
})

ipcMain.handle('settings-get', async (_event: IpcMainInvokeEvent, key: SettingKey) => {
  return settings.get(key)
})

ipcMain.on('settings-set', (_event: IpcMainEvent, key: SettingKey, value: Settings[SettingKey]) => {
  settings.set(key, value as never)
})

ipcMain.on('set-autostart', (_event: IpcMainEvent, state: boolean) => {
  app.setLoginItemSettings({ openAtLogin: state })
})

ipcMain.handle('is-autostart', async () => {
  const loginSettings = app.getLoginItemSettings()
  return loginSettings.openAtLogin
})

ipcMain.handle('get-props', async () => {
  const window = BrowserWindow.getFocusedWindow() as DialogWindow | null
  return window?.$props || {}
})

ipcMain.on('popup-context-menu', (_event: IpcMainEvent, menuTemplate: Electron.MenuItemConstructorOptions[]) => {
  const menu = Menu.buildFromTemplate(menuTemplate)
  menu.popup({ window: BrowserWindow.getFocusedWindow() || undefined })
})

ipcMain.handle('show-message-box', async (_event: IpcMainInvokeEvent, { message }: { message: string }) => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const response = await dialog.showMessageBox(focusedWindow as BrowserWindow, {
    message,
    buttons: ['OK']
  })
  return response.response
})

ipcMain.handle('confirm-dialog', async (_event: IpcMainInvokeEvent, { message }: { message: string }) => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const response = await dialog.showMessageBox(focusedWindow as BrowserWindow, {
    type: 'question',
    buttons: ['Yes', 'No'],
    defaultId: 0,
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

ipcMain.on('resize-window', (_event: IpcMainEvent, newHeight: number) => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) return

  const [width] = window.getSize()
  if (process.platform === 'darwin') {
    window.setSize(width, newHeight, true)
  } else {
    window.setSize(width, newHeight)
  }
})

ipcMain.handle('select-directory', async (_event: IpcMainInvokeEvent, { defaultDirectory }: { defaultDirectory?: string }) => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(focusedWindow as BrowserWindow, {
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

ipcMain.handle('select-file', async (_event: IpcMainInvokeEvent, defaultFile?: string) => {
  const window = BrowserWindow.getFocusedWindow()
  const { filePaths } = await dialog.showOpenDialog(window as BrowserWindow, {
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
    app.relaunch()
    app.quit()
  }
})

process.on('uncaughtException', function (error: Error) {
  if (dialogs.uncaughtException(error)) {
    app.exit()
  }
})

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

// For debugging purposes.
if (isDev) {
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
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron')
    })
  } catch (err) { }

  // @TODO Remove before release
  ;(global as Record<string, unknown>).$main = {
    app: app,
    __dirname: __dirname,
    require: require
  }
}

// Focus the app if a second instance is going to start.
app.on('second-instance', () => app.focus())

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function () {
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

