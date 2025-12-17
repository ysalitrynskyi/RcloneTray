'use strict'

import * as path from 'path'
import { shell, app, BrowserWindow, Menu, Notification, dialog, MenuItemConstructorOptions } from 'electron'
import electronContextMenu from 'electron-context-menu'
import isDev from 'electron-is-dev'
import * as settings from './settings'
import { DialogProps, DialogWindow, Bookmark } from './types'

/**
 * Set the background color
 */
const backgroundColor: string | undefined = process.platform === 'darwin'
  ? '#ececec'
  : process.platform === 'win32'
    ? '#ffffff'
    : '#dddddd'

/**
 * Dialog names that should be opened with single instances
 */
const dialogsSingletoneInstances: Record<string, DialogWindow | null> = {}

interface DialogOptions extends Electron.BrowserWindowConstructorOptions {
  $singleId?: string | number
}

/**
 * Simple factory for the dialogs
 */
function createNewDialog(dialogName: string, options?: DialogOptions, props?: DialogProps): DialogWindow | null {
  let singleId: string | undefined
  
  if (options?.$singleId) {
    singleId = dialogName + '/' + options.$singleId.toString()
    delete options.$singleId
    
    if (Object.prototype.hasOwnProperty.call(dialogsSingletoneInstances, singleId) && dialogsSingletoneInstances[singleId]) {
      dialogsSingletoneInstances[singleId]!.focus()
      return dialogsSingletoneInstances[singleId]
    }
  }

  // Dialog options.
  const dialogOptions: Electron.BrowserWindowConstructorOptions = {
    maximizable: false,
    minimizable: true,
    resizable: false,
    fullscreenable: false,
    useContentSize: true,
    show: false,
    backgroundColor: backgroundColor,
    zoomToPageWidth: true,
    autoHideMenuBar: true,
    skipTaskbar: false,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, 'dialogs-preload.js'),
      devTools: isDev,
      defaultEncoding: 'UTF-8',
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      sandbox: true
    },
    ...options
  }

  // Instantinate the window.
  let theDialog: DialogWindow | null = new BrowserWindow(dialogOptions) as DialogWindow
  
  if (process.platform === 'darwin') {
    app.dock.show()

    // Resizing from renderer is blocking process, so next is workaround to get smooth resize without IPC
    theDialog.setSizeAsync = function (width: number, height: number): void {
      setImmediate(() => {
        theDialog?.setSize(width, height, true)
      })
    }
  }

  // Assign $props that we will use in window.getProps() as window properties (params) on load time.
  theDialog.$props = props || {}

  theDialog.on('ready-to-show', () => theDialog?.show())

  // and load the index.html of the app.
  theDialog.loadFile(path.join(__dirname, '..', 'src', 'ui', 'dialogs', dialogName + '.html'))

  // Emitted when the window is closed.
  theDialog.on('closed', function () {
    // Dereference the window object
    theDialog = null

    if (singleId) {
      delete dialogsSingletoneInstances[singleId]
    }

    // On macos hide the dock icon when no active windows by this app.
    if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length < 1) {
      app.dock.hide()
    }
  })

  // Open links in system default browser.
  theDialog.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (singleId) {
    dialogsSingletoneInstances[singleId] = theDialog
  }

  return theDialog
}

/**
 * Show About dialog
 */
export function about(): void {
  const aboutDialog = createNewDialog('About', {
    $singleId: 1,
    title: 'About',
    width: 400,
    height: 440,
    minimizable: false,
    alwaysOnTop: true,
    acceptFirstMouse: true,

    // Make the window sexy.
    vibrancy: 'appearance-based',
    titleBarStyle: 'hidden',
    backgroundColor: undefined
  })

  // Close when loose focus, but only when non-dev because even the dev tool trigger the close.
  if (!isDev && aboutDialog) {
    aboutDialog.on('blur', () => aboutDialog.close())
  }
}

/**
 * Show Preferences dialog
 */
export function preferences(): void {
  createNewDialog('Preferences', {
    $singleId: 1,
    width: 600,
    height: 300
  })
}

/**
 * Show new Bookmark dialog
 */
export function addBookmark(): void {
  createNewDialog('AddBookmark', {
    $singleId: 1,
    width: 600,
    height: 100
  })
}

/**
 * Show edit Bookmark dialog
 */
export function editBookmark(this: Bookmark): void {
  const props: DialogProps = { ...this }
  createNewDialog('EditBookmark', {
    $singleId: this.$name,
    width: 600,
    height: 460
  }, props)
}

/**
 * Show OS notification
 */
export function notification(message: string): void {
  new Notification({
    body: message
  }).show()
}

/**
 * Multi Instance error
 */
export function errorMultiInstance(): void {
  dialog.showErrorBox('', 'RcloneTray is already started and cannot be started twice.')
}

/**
 * Show the Uncaught Exception dialog
 * @returns Should exit (true if should exit)
 */
export function uncaughtException(detail: Error | unknown): boolean {
  const errorMessage = detail instanceof Error ? `${detail.message}\n${detail.stack}` : String(detail)
  
  if (app.isReady()) {
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      buttons: ['Quit RcloneTray', 'Continue'],
      defaultId: 0,
      title: 'Error',
      message: 'Unexpected runtime error.',
      detail: errorMessage
    })
    return choice === 0
  } else {
    dialog.showErrorBox('Unexpected runtime error. RcloneTray cannot start.', errorMessage)
    return true
  }
}

/**
 * Show confirm exit dialog.
 */
export function confirmExit(): boolean {
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['Yes', 'No'],
    title: 'Quit RcloneTray',
    message: 'Are you sure you want to quit?',
    detail: 'There are active processes that will be terminated.'
  })
  return choice === 0
}

/**
 * Show missing Rclone action dialog
 */
export function missingRclone(): number {
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['Go Rclone Website', 'Switch to bundled version', 'Quit'],
    title: 'Error',
    message: 'Seems that Rclone is not installed (or cannot be found) on your system.\n\nYou need to install Rclone to your system or to switch to use bundled version of Rclone.\n'
  })

  if (choice === 0) {
    shell.openExternal('https://rclone.org/downloads/')
    app.exit()
  } else if (choice === 1) {
    settings.set('rclone_use_bundled', true)
  } else {
    app.exit()
  }

  return choice
}

/**
 * Initialize module
 */
function init(): void {
  // Build the global menu
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Edit',
      submenu: [
        { role: 'redo' },
        { role: 'undo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    }
  ]

  template.push({
    role: 'window',
    submenu: [
      { role: 'minimize' },
      { role: 'close' }
    ]
  })

  if (process.platform === 'darwin') {
    // First "Application" menu on macOS
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'quit' }
      ]
    })

    // Edit menu
    const editMenu = template[1]
    if (editMenu.submenu && Array.isArray(editMenu.submenu)) {
      editMenu.submenu.push(
        { type: 'separator' },
        {
          label: 'Speech',
          submenu: [
            { role: 'startSpeaking' },
            { role: 'stopSpeaking' }
          ]
        }
      )
    }

    // Window menu
    template[2].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ]
  }

  if (isDev) {
    template.push({
      label: 'Debug',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }
      ]
    })
  }

  // Set the global menu, as it is part of the dialogs.
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  // Enable context menus.
  electronContextMenu({
    showCopyImageAddress: false,
    showSaveImageAs: false,
    showInspectElement: isDev
  })
}

// Do the initialization.
init()

export default {
  about,
  editBookmark,
  addBookmark,
  preferences,
  errorMultiInstance,
  uncaughtException,
  confirmExit,
  missingRclone,
  notification
}

