'use strict'

const path = require('path')
const { app, BrowserWindow, Menu, dialog, ipcMain, Notification } = require('electron')
const isDev = require('electron-is-dev')
const dialogs = require('./dialogs')
const tray = require('./tray')
const rclone = require('./rclone')
const settings = require('./settings')

// Error handler

ipcMain.handle('get-app-path', () => app.getAppPath())
ipcMain.handle('get-app-name', () => app.getName())
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.on('refresh-tray', async () => {
  tray.refresh()
})

ipcMain.on('rclone', () => rclone)
ipcMain.on('settings', () => tray)
ipcMain.handle('get-setting', (event, key) => {
  return settings.get(key)
})
ipcMain.handle('settings-merge', (data) => {
  return settings.merge(data)
})
ipcMain.handle('get-rclone-version', () => {
  return rclone.getVersion()
})
ipcMain.handle('get-rclone-providers', () => {
  return rclone.getProviders()
})
ipcMain.handle('get-rclone-book', (type, name, options) => {
  return rclone.addBookmark(type, name, options)
})
ipcMain.handle('get-rclone-delete-book', (name) => {
  return rclone.deleteBookmark(name)
})
ipcMain.handle('get-rclone-update-book', (name, options) => {
  return rclone.updateBookmark(name, options)
})
ipcMain.handle('get-rclone-get-config-file', () => {
  return rclone.getConfigFile()
})

ipcMain.on('get-provider-data', (event, providerName) => {
  const provider = rclone.getProvider(providerName) // Fetch provider data
  event.reply('provider-data-reply', provider)
})

ipcMain.handle('rclone-get-config', async () => {
  return rclone.getConfig()
})

ipcMain.handle('settings-get', async (event, key) => {
  return settings.get(key)
})

ipcMain.on('settings-set', (event, key, value) => {
  settings.set(key, value)
})

ipcMain.on('set-autostart', (event, state) => {
  app.setLoginItemSettings({ openAtLogin: state })
})

ipcMain.handle('is-autostart', async () => {
  const settings = app.getLoginItemSettings()
  return settings.openAtLogin
})

ipcMain.handle('get-props', async () => {
  const window = BrowserWindow.getFocusedWindow()
  return window ? window.$props : {}
})

ipcMain.on('popup-context-menu', (event, menuTemplate) => {
  const menu = Menu.buildFromTemplate(menuTemplate)
  menu.popup(BrowserWindow.getFocusedWindow())
})

ipcMain.handle('show-message-box', async (event, { message }) => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const response = await dialog.showMessageBox(focusedWindow, {
    message,
    buttons: ['OK']
  })
  return response.response
})

ipcMain.handle('confirm-dialog', async (event, { message }) => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const response = await dialog.showMessageBox(focusedWindow, {
    type: 'question',
    buttons: ['Yes', 'No'],
    defaultId: 0,
    message: message
  })
  return response.response
})

ipcMain.on('error-box', (event, { message }) => {
  BrowserWindow.getFocusedWindow()
  dialog.showErrorBox('Error', message)
})

ipcMain.on('show-notification', (event, { message }) => {
  new Notification({ title: 'Notification', body: message.toString() }).show()
})

ipcMain.on('resize-window', (event, newHeight) => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) return

  const [width] = window.getSize()
  if (process.platform === 'darwin') {
    window.setSize(width, newHeight, true)
  } else {
    window.setSize(width, newHeight)
  }
})

ipcMain.handle('select-directory', async (event, { defaultDirectory }) => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(focusedWindow, {
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

ipcMain.handle('select-file', async (event, defaultFile) => {
  const window = BrowserWindow.getFocusedWindow()
  const { filePaths } = await dialog.showOpenDialog(window, {
    title: 'Select File',
    defaultPath: defaultFile || app.getPath('home'),
    properties: ['openFile', 'showHiddenFiles']
  })
  return filePaths
})

ipcMain.on('check-require-restart', async (event) => {
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

process.on('uncaughtException', function (error) {
  if (dialogs.uncaughtException(error)) {
    app.exit()
  }
})

// if (process.arch !== 'x64' && process.arch !== 'arm64') {
//   throw new Error('The application can be started on 64-bit platforms only.')
// }

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
    // Inspector is already open, so close it before opening again
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
  global.$main = {
    app: app,
    __dirname: __dirname,
    require: require
  }
}

// Focus the app if a second instance is going to start.
app.on('second-instance', app.focus)

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
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
app.on('window-all-closed', function (event) {
  event.preventDefault()
})
