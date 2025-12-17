'use strict'

import * as path from 'path'
import { Tray, Menu, shell, MenuItemConstructorOptions } from 'electron'
import isDev from 'electron-is-dev'
import * as settings from './settings'
import * as rclone from './rclone'
import * as dialogs from './dialogs'
import { Bookmark, ServeProtocol } from './types'

/**
 * Host the initialized Tray object.
 */
let trayIndicator: Tray | null = null

/**
 * Host the atomic timer
 */
let refreshTrayMenuAtomicTimer: NodeJS.Timeout | null = null

/**
 * Tray icons
 */
const icons: { default?: string; connected?: string } = {}

/**
 * Label for platform's file browser
 */
const fileExplorerLabel: string = process.platform === 'darwin'
  ? 'Finder'
  : process.platform === 'win32'
    ? 'Explorer'
    : 'File Browser'

type BookmarkAction = 
  | 'mount' 
  | 'unmount' 
  | 'open-mounted' 
  | 'download' 
  | 'stop-downloading'
  | 'upload' 
  | 'stop-uploading' 
  | 'toggle-automatic-upload'
  | 'open-local' 
  | 'serve-start' 
  | 'serve-stop' 
  | 'open-ncdu'
  | 'open-web-browser' 
  | 'open-config' 
  | 'delete-bookmark'

/**
 * Do action with bookmark
 */
function bookmarkActionRouter(this: Bookmark | null, action: BookmarkAction, ...args: unknown[]): void {
  switch (action) {
    case 'mount':
      if (this) rclone.mount(this)
      break
    case 'unmount':
      if (this) rclone.unmount(this)
      break
    case 'open-mounted':
      if (this) rclone.openMountPoint(this)
      break
    case 'download':
      if (this) rclone.download(this)
      break
    case 'stop-downloading':
      if (this) rclone.stopDownload(this)
      break
    case 'upload':
      if (this) rclone.upload(this)
      break
    case 'stop-uploading':
      if (this) rclone.stopUpload(this)
      break
    case 'toggle-automatic-upload':
      if (this) rclone.toggleAutomaticUpload(this)
      break
    case 'open-local':
      if (this) rclone.openLocal(this)
      break
    case 'serve-start':
      if (this) rclone.serveStart(args[0] as ServeProtocol, this)
      break
    case 'serve-stop':
      if (this) rclone.serveStop(args[0] as ServeProtocol, this)
      break
    case 'open-ncdu':
      if (this) rclone.openNCDU(this)
      break
    case 'open-web-browser':
      shell.openExternal(args[0] as string)
      break
    case 'open-config':
      shell.openPath(rclone.getConfigFile())
      break
    case 'delete-bookmark':
      if (this) rclone.deleteBookmark(this.$name)
      break
    default:
      console.error('No such action', action, args, this)
  }
}

interface BookmarkMenuResult {
  template: MenuItemConstructorOptions
  isConnected: boolean
}

/**
 * Bookmark submenu
 */
function generateBookmarkActionsSubmenu(bookmark: Bookmark): BookmarkMenuResult {
  // If by some reason bookmark is broken, then show actions menu.
  if (!bookmark.$name || !bookmark.type) {
    return {
      template: {
        label: bookmark.$name || '<Unknown>',
        enabled: false,
        type: 'submenu',
        submenu: [
          {
            label: 'Fix config file',
            click: () => bookmarkActionRouter.call(null, 'open-config')
          },
          {
            label: 'Delete',
            enabled: !!bookmark.$name,
            click: () => bookmarkActionRouter.call(bookmark, 'delete-bookmark')
          }
        ]
      },
      isConnected: false
    }
  }

  // Main template
  const template: MenuItemConstructorOptions = {
    type: 'submenu',
    submenu: []
  }

  const submenu = template.submenu as MenuItemConstructorOptions[]

  // Mount
  const isMounted = rclone.getMountStatus(bookmark)
  submenu.push({
    label: 'Mount',
    click: () => bookmarkActionRouter.call(bookmark, 'mount'),
    checked: !!isMounted,
    enabled: isMounted === false
  })

  if (isMounted !== false) {
    submenu.push(
      {
        label: 'Unmount',
        click: () => bookmarkActionRouter.call(bookmark, 'unmount')
      },
      {
        label: `Open In ${fileExplorerLabel}`,
        enabled: !!isMounted,
        click: () => bookmarkActionRouter.call(bookmark, 'open-mounted')
      }
    )
  }

  // Download/Upload
  let isDownload = false
  let isUpload = false
  let isAutomaticUpload = false
  
  if (settings.get('rclone_sync_enable') && bookmark._rclonetray_local_path_map && bookmark._rclonetray_local_path_map.trim()) {
    isDownload = rclone.isDownload(bookmark)
    isUpload = rclone.isUpload(bookmark)
    isAutomaticUpload = rclone.isAutomaticUpload(bookmark)
    
    submenu.push(
      {
        type: 'separator'
      },
      {
        type: 'checkbox',
        label: 'Download',
        enabled: !isAutomaticUpload && !isUpload && !isDownload,
        checked: isDownload,
        click: () => bookmarkActionRouter.call(bookmark, 'download')
      },
      {
        type: 'checkbox',
        label: 'Upload',
        enabled: !isAutomaticUpload && !isUpload && !isDownload,
        checked: isUpload,
        click: () => bookmarkActionRouter.call(bookmark, 'upload')
      },
      {
        type: 'checkbox',
        label: 'Automatic Upload',
        checked: isAutomaticUpload,
        click: () => bookmarkActionRouter.call(bookmark, 'toggle-automatic-upload')
      }
    )

    if (isDownload) {
      submenu.push({
        label: 'Stop Downloading',
        click: () => bookmarkActionRouter.call(bookmark, 'stop-downloading')
      })
    }

    if (isUpload) {
      submenu.push({
        label: 'Stop Uploading',
        click: () => bookmarkActionRouter.call(bookmark, 'stop-uploading')
      })
    }

    submenu.push({
      label: 'Show In Finder',
      click: () => bookmarkActionRouter.call(bookmark, 'open-local')
    })
  }

  // Serving.
  let isServing = false
  const availableServingProtocols = rclone.getAvailableServeProtocols()
  const protocolKeys = Object.keys(availableServingProtocols) as ServeProtocol[]
  const availableServingProtocolsLen = protocolKeys.length

  if (availableServingProtocolsLen) {
    submenu.push({
      type: 'separator'
    })

    protocolKeys.forEach((protocol, i) => {
      const servingURI = rclone.serveStatus(protocol, bookmark)

      // Add separator before the menu item, only if current serve method is in process.
      if (servingURI !== false) {
        isServing = true
        if (i > 0) {
          submenu.push({
            type: 'separator'
          })
        }
      }

      submenu.push({
        type: 'checkbox',
        label: `Serve ${availableServingProtocols[protocol]}`,
        click: () => bookmarkActionRouter.call(bookmark, 'serve-start', protocol),
        enabled: servingURI === false,
        checked: !!servingURI
      })

      if (servingURI !== false) {
        submenu.push(
          {
            label: 'Stop',
            click: () => bookmarkActionRouter.call(bookmark, 'serve-stop', protocol)
          },
          {
            label: `Open "${servingURI}"`,
            click: () => bookmarkActionRouter.call(bookmark, 'open-web-browser', servingURI),
            enabled: !!servingURI
          }
        )

        // Add separator after the menu item, only if current serve method is in process.
        if (i < availableServingProtocolsLen - 1) {
          submenu.push({
            type: 'separator'
          })
        }
      }
    })
  }

  // NCDU
  if (settings.get('rclone_ncdu_enable')) {
    submenu.push(
      {
        type: 'separator'
      },
      {
        label: 'Console Browser',
        click: () => bookmarkActionRouter.call(bookmark, 'open-ncdu')
      }
    )
  }

  // Set the menu item state if there is any kind of connection or current running process.
  const isConnected = !!(isMounted || isDownload || isUpload || isServing || isAutomaticUpload)

  // Bookmark controls.
  submenu.push(
    {
      type: 'separator'
    },
    {
      label: 'Edit',
      enabled: !isConnected,
      click: () => dialogs.editBookmark.call(bookmark)
    }
  )

  // Set the bookmark label
  let label = bookmark.$name

  if (settings.get('tray_menu_show_type')) {
    label += ' - ' + bookmark.type.toUpperCase()
  }

  if (process.platform === 'darwin') {
    // Because Apple likes rhombuses.
    label = (isConnected ? '◆ ' : '') + label
  } else {
    label = (isConnected ? '● ' : '○ ') + label
  }

  // Usually should not goes here.
  if (!label) {
    label = '<Unknown>'
  }

  template.label = label

  return {
    template,
    isConnected
  }
}

/**
 * Refreshing try menu.
 */
function refreshTrayMenu(): void {
  // If by some reason some part of the code do this.refresh(),
  // before the tray icon initialization, must not continue because possible error.
  if (!trayIndicator) {
    return
  }

  if (isDev) {
    console.log('Refresh tray indicator menu')
  }

  const menuItems: MenuItemConstructorOptions[] = []
  let isConnected = false

  menuItems.push({
    label: 'New Bookmark',
    click: dialogs.addBookmark,
    accelerator: 'CommandOrControl+N'
  })

  const bookmarks = rclone.getBookmarks()

  if (Object.keys(bookmarks).length > 0) {
    menuItems.push({
      type: 'separator'
    })
    for (const key in bookmarks) {
      const bookmarkMenu = generateBookmarkActionsSubmenu(bookmarks[key])
      menuItems.push(bookmarkMenu.template)
      if (bookmarkMenu.isConnected) {
        isConnected = true
      }
    }
  }

  menuItems.push(
    {
      type: 'separator'
    },
    {
      label: 'Preferences',
      click: dialogs.preferences,
      accelerator: 'CommandOrControl+,'
    },
    {
      label: 'About',
      click: dialogs.about
    },
    {
      type: 'separator'
    },
    {
      accelerator: 'CommandOrControl+Q',
      role: 'quit'
    }
  )

  // Set the menu.
  trayIndicator.setContextMenu(Menu.buildFromTemplate(menuItems))

  // Set icon acording to the status
  if (icons.connected && icons.default) {
    trayIndicator.setImage(isConnected ? icons.connected : icons.default)
  }
}

/**
 * Refresh the tray menu.
 */
export function refresh(): void {
  // Use some kind of static variable to store the timer
  if (refreshTrayMenuAtomicTimer) {
    clearTimeout(refreshTrayMenuAtomicTimer)
  }

  // Set some delay to avoid multiple updates in close time.
  refreshTrayMenuAtomicTimer = setTimeout(refreshTrayMenu, 500)
}

/**
 * Initialize the tray menu.
 */
export function init(): void {
  if (trayIndicator) {
    // Avoid double tray loader
    console.error('Cannot start more than one tray indicators.')
    return
  }

  // Define icons based on platform
  const iconPath = path.join(__dirname, '..', 'src', 'ui', 'icons')

  if (process.platform === 'darwin') {
    icons.default = path.join(iconPath, 'iconTemplate.png')
    icons.connected = path.join(iconPath, 'icon-connectedTemplate.png')
  } else {
    icons.default = path.join(iconPath, `icon${process.platform === 'win32' ? '.ico' : '.png'}`)
    icons.connected = path.join(iconPath, `icon-connected${process.platform === 'win32' ? '.ico' : '.png'}`)
  }

  // Add system tray icon.
  trayIndicator = new Tray(icons.default)
}

export default { refresh, init }

