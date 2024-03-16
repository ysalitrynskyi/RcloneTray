'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('$main', {
  app: {
    getPath: () => ipcRenderer.invoke('get-app-path'),
    getName: () => ipcRenderer.invoke('get-app-name'),
    getVersion: () => ipcRenderer.invoke('get-app-version')
  },
  refreshTray: () => ipcRenderer.send('refresh-tray'),
  settingsMerge: (data) => ipcRenderer.send('settings-merge', data),
  getSetting: async (key) => {
    try {
      return await ipcRenderer.invoke('get-setting', key)
    } catch (error) {
      console.error('Error getting setting:', error)
    }
  },
  rclone: (() => {
    const invokeIpc = async (channel, ...args) => {
      try {
        return await ipcRenderer.invoke(channel, ...args)
      } catch (error) {
        console.error(`Error with IPC channel '${channel}':`, error)
      }
    }

    return {
      version: () => invokeIpc('get-rclone-version'),
      providers: () => invokeIpc('get-rclone-providers'),
      addBookmark: (type, name, options) => invokeIpc('get-rclone-book', type, name, options),
      delBookmark: (name) => invokeIpc('get-rclone-delete-book', name),
      updateBookmark: (name, options) => invokeIpc('get-rclone-update-book', name, options),
      getConfigFile: () => invokeIpc('get-rclone-get-config-file')
    }
  })(),
  setAutostart: (state) => ipcRenderer.send('set-autostart', state),
  isAutostart: () => ipcRenderer.invoke('is-autostart'),
  getProps: () => ipcRenderer.invoke('get-props'),
  loadStyles: async function () {
    const appPath = await this.app.getPath()
    const uiLink = document.createElement('link')
    uiLink.rel = 'stylesheet'
    uiLink.href = `${appPath}/src/ui/styles/ui.css`
    document.head.appendChild(uiLink)

    const platformLink = document.createElement('link')
    platformLink.rel = 'stylesheet'
    platformLink.href = `${appPath}/src/ui/styles/ui-${process.platform}.css`
    document.head.appendChild(platformLink)
  },
  loadAboutStyles: async function () {
    const appPath = await this.app.getPath()
    const aboutLink = document.createElement('link')
    aboutLink.rel = 'stylesheet'
    aboutLink.href = `${appPath}/src/ui/styles/about.css`
    document.head.appendChild(aboutLink)
  }
})

contextBridge.exposeInMainWorld('electronAPI', {
  popupContextMenu: (menuTemplate) => ipcRenderer.send('popup-context-menu', menuTemplate),
  messageBox: async (message) => {
    return await ipcRenderer.invoke('show-message-box', { message })
  },
  confirm: async (message) => {
    const choice = await ipcRenderer.invoke('confirm-dialog', { message })
    return choice === 0
  },
  errorBox: (message) => {
    ipcRenderer.send('error-box', { message })
  },
  notification: (message) => {
    ipcRenderer.send('show-notification', { message })
  },
  resizeToContent: () => {
    let newHeight = document.body.scrollHeight + (window.outerHeight - window.innerHeight)
    if (newHeight > window.screen.height * 0.85) {
      newHeight = Math.ceil(window.screen.height * 0.85)
      document.body.style.overflow = null
    } else {
      document.body.style.overflow = 'hidden'
    }
    ipcRenderer.send('resize-window', newHeight)
  },
  selectDirectory: async (defaultDirectory) => {
    return await ipcRenderer.invoke('select-directory', { defaultDirectory })
  },
  selectFile: async (defaultFile) => {
    return await ipcRenderer.invoke('select-file', defaultFile)
  },
  getTheFormData: (form) => {
    const values = {}
    Array.from(form.elements).forEach(element => {
      if (element.name && !element.disabled && !(element.type === 'radio' && !element.checked)) {
        const [namespace, name] = element.name.split('.')
        if (namespace && name) {
          if (!values[namespace]) values[namespace] = {}
          values[namespace][name] = element.value
        } else {
          values[element.name] = element.value
        }
      }
    })
    return values
  }
})

contextBridge.exposeInMainWorld('htmlElements', {
  createTabsElement () {
    const container = document.createElement('div')
    const containerButtons = document.createElement('div')
    const containerContents = document.createElement('div')
    container.className = 'tabs'
    containerButtons.className = 'tab-buttons'
    containerContents.className = 'tab-contents'
    container.appendChild(containerButtons)
    container.appendChild(containerContents)

    container.addTab = function (label, content) {
      const tabsTabIndex = containerButtons.childNodes.length
      const button = document.createElement('div')
      button.tabsTabIndex = tabsTabIndex
      button.className = `tab-button${tabsTabIndex > 0 ? '' : ' active'}`
      button.innerText = label
      button.onclick = function () {
        containerButtons.childNodes.forEach((item, index) => {
          item.className = index === tabsTabIndex ? 'tab-button active' : 'tab-button'
        })
        containerContents.childNodes.forEach((item, index) => {
          item.style.display = index === tabsTabIndex ? '' : 'none'
        })
        window.electronAPI.resizeToContent()
      }

      const contentWrapper = document.createElement('div')
      contentWrapper.tabsTabIndex = tabsTabIndex
      contentWrapper.className = 'tab-content'
      contentWrapper.style.display = tabsTabIndex > 0 ? 'none' : ''
      contentWrapper.appendChild(content)

      containerContents.appendChild(contentWrapper)
      containerButtons.appendChild(button)
    }

    return container
  },
  createOptionsFields: function (optionFields, optionFieldsNamespace, optionValues) {
    optionValues = optionValues || {}
    const container = document.createDocumentFragment()

    optionFields.forEach((fieldDefinition) => {
      const optionField = this.createOptionField(
        fieldDefinition,
        optionFieldsNamespace,
        optionValues.hasOwnProperty(fieldDefinition.Name) ? optionValues[fieldDefinition.Name] : null
      )
      container.appendChild(optionField)
    })

    return container
  },
  checkForRequiredRestart: () => {
    ipcRenderer.send('check-require-restart')
  },
  createOptionField: (optionFieldDefinition, optionFieldNamespace, value) => {
    if (value === undefined || value === null) {
      value = optionFieldDefinition.Value
    }

    const row = document.createElement('div')
    const th = document.createElement('div')
    const td = document.createElement('div')
    let inputField

    switch (optionFieldDefinition.$Type) {
      case 'text':
        inputField = document.createElement('textarea')
        break
      case 'select':
        inputField = document.createElement('select')
        optionFieldDefinition.Examples.forEach((item) => {
          const option = document.createElement('option')
          option.value = item.Value
          option.innerText = item.Label || item.Value
          if (value === item.Value) option.selected = true
          inputField.appendChild(option)
        })
        break
      case 'boolean':
        inputField = document.createElement('input')
        inputField.type = 'checkbox'
        inputField.checked = [true, 'true', 1, '1'].includes(value)
        break
      case 'numeric':
        inputField = document.createElement('input')
        inputField.type = 'number'
        inputField.value = value
        break
      case 'password':
        inputField = document.createElement('input')
        inputField.type = 'password'
        inputField.value = value
        break
      case 'directory':
      case 'file':
        inputField = document.createElement('input')
        const browseButton = document.createElement('button')
        browseButton.style.margin = '.3rem 0'
        browseButton.innerText = 'Browse'
        browseButton.addEventListener('click', function (event) {
          event.preventDefault()
          const method = optionFieldDefinition.$Type === 'directory' ? 'selectDirectory' : 'selectFile'
          window.electronAPI[method](inputField.value).then(selectedPath => {
            if (selectedPath) {
              inputField.value = selectedPath[0] // Assuming the API returns an array
            }
          })
        })
        td.appendChild(browseButton)
        break
      default:
        inputField = document.createElement('input')
        break
    }

    row.className = 'row'
    th.className = 'cell-left'
    td.className = 'cell-right'
    row.appendChild(th)
    row.appendChild(td)

    if (optionFieldDefinition.Provider) {
      window.optionFieldDependencies.add({
        rule: optionFieldDefinition.Provider,
        row: row
      })
    }

    if (optionFieldNamespace) {
      inputField.name = optionFieldNamespace + '.' + optionFieldDefinition.Name
    } else {
      inputField.name = optionFieldDefinition.Name
    }
    inputField.id = 'field_' + optionFieldDefinition.Name
    inputField.placeholder = optionFieldDefinition.Default || ''

    td.appendChild(inputField)

    if ('$Type' in optionFieldDefinition) {
      if (optionFieldDefinition.$Type === 'boolean') {
        inputField.type = 'checkbox'
        inputField.value = 'true'
      } else if (optionFieldDefinition.$Type === 'numeric') {
        inputField.type = 'number'
      } else if (optionFieldDefinition.$Type === 'password') {
        inputField.type = 'password'
      } else if (optionFieldDefinition.$Type === 'directory') {
        const browseButton = document.createElement('button')
        browseButton.style.margin = '.3rem 0'
        browseButton.innerText = 'Browse'
        browseButton.addEventListener('click', function (event) {
          event.preventDefault()
          window.electronAPI.selectDirectory(inputField.value, function (selectedDirectory) {
            if (selectedDirectory) {
              inputField.value = selectedDirectory[0]
            }
          })
        })
        inputField.parentNode.insertBefore(browseButton, inputField.nextSibling)
      } else if (optionFieldDefinition.$Type === 'file') {
        const browseButton = document.createElement('button')
        browseButton.style.margin = '.3rem 0'
        browseButton.innerText = 'Browse'
        browseButton.addEventListener('click', function (event) {
          event.preventDefault()
          window.electronAPI.selectFile(inputField.value, function (selectedFile) {
            if (selectedFile) {
              inputField.value = selectedFile[0]
            }
          })
        })
        inputField.parentNode.insertBefore(browseButton, inputField.nextSibling)
      } else if (optionFieldDefinition.$Type === 'select') {
        optionFieldDefinition.Examples.forEach(function (item) {
          const selectOption = document.createElement('option')
          selectOption.value = item.Value
          selectOption.innerText = item.Label || item.Value
          if (value === item.Value) {
            selectOption.selected = 'selected'
          }
          inputField.appendChild(selectOption)
        })
      }
    }

    // Set examples
    if (optionFieldDefinition.Examples && optionFieldDefinition.$Type !== 'boolean' && optionFieldDefinition.$Type !== 'select') {
      const inputFieldOptions = document.createElement('datalist')
      inputFieldOptions.id = inputField.id + '_datalist'
      inputField.setAttribute('list', inputFieldOptions.id)
      td.appendChild(inputFieldOptions)
      optionFieldDefinition.Examples.forEach(function (item) {
        const datalistOption = document.createElement('option')
        datalistOption.value = item.Value
        datalistOption.innerText = item.Label || item.Value
        inputFieldOptions.appendChild(datalistOption)
      })

      // Until Electron fixes the datalist, we are stuck with next solution.
      inputField.addEventListener('click', function (event) {
        const { width, height } = event.target.getBoundingClientRect()
        if (event.offsetX < width - height) {
          return
        }
        event.preventDefault()
        const menuTemplate = []
        inputFieldOptions.childNodes.forEach(function (childNode) {
          if (childNode.value) {
            menuTemplate.push({
              label: childNode.value,
              click: function () {
                inputField.value = childNode.value
                inputField.dispatchEvent(new window.Event('change'))
              }
            })
          }
        })
        window.electronAPI.popupContextMenu(menuTemplate)
      })
    }

    // Trigger provider's show/hide
    inputField.addEventListener('change', function () {
      window.optionFieldDependencies.select(this.value)
    })
    window.optionFieldDependencies.select(this.value)

    // Flag that indicate app requires restart when form is saved.
    if ('$RequireRestart' in optionFieldDefinition) {
      inputField.addEventListener('change', function () {
        window.requireRestart = true
      }, { once: true })
    }

    // Setup field label.
    th.innerText = optionFieldDefinition.$Label || optionFieldDefinition.Name

    // Setup helping text.
    // It's not very reliable to convert urls to links with pattern, but don't want to include some full bloated
    // library just to show few links.
    if ('Help' in optionFieldDefinition && optionFieldDefinition.Help) {
      fieldHelpText.innerHTML = optionFieldDefinition.Help
        .replace(/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#/%?=~_|!:,.]*[-A-Z0-9+&@#/%=~_|])/ig, '<a target="_blank" href="$1">$1</a>')
        .replace(/\n/g, '<br />')
      td.appendChild(fieldHelpText)
      if (optionFieldDefinition.$Type === 'boolean') {
        fieldHelpText.className = 'label-help-inline'
      } else {
        fieldHelpText.className = 'label-help'
      }
    }

    // Make some fields required.
    if ('Required' in optionFieldDefinition && optionFieldDefinition.Required) {
      row.className += ' required'
      const requiredHelpText = document.createElement('div')
      requiredHelpText.innerText = 'required'
      requiredHelpText.className += ' label-required'
      th.appendChild(requiredHelpText)
    }

    return row
  }
})

contextBridge.exposeInMainWorld('optionFieldDependencies', {
  registry: [],
  add: function (item) {
    this.registry.push(item)
  },
  select: function (value) {
    this.registry.forEach(function (item) {
      const invert = item.rule.startsWith('!')
      const rule = (invert ? item.rule.substring(1) : item.rule).split(',')
      let match = rule.includes(value)
      match = invert ? !match : match
      if (match) {
        item.row.style.display = ''
        item.row.querySelectorAll('input,textarea,select').forEach(function (input) {
          input.disabled = false
        })
      } else {
        item.row.style.display = 'none'
        item.row.querySelectorAll('input,textarea,select').forEach(function (input) {
          input.disabled = true
        })
      }
    })
  }
})

contextBridge.exposeInMainWorld('api', {
  renderBookmarkSettings: (placeholderId, providerName, values) => {
    // Send an IPC message to the main process to retrieve the provider data
    ipcRenderer.once('provider-data-reply', (event, provider) => {
      const connectionFields = provider.Options.filter((item) => {
        return item.Name !== '_rclonetray_local_path_map' && item.Advanced !== true
      })

      const advancedFields = provider.Options.filter((item) => {
        return item.Name !== '_rclonetray_local_path_map' && item.Advanced === true
      })

      const mappingFields = provider.Options.filter((item) => {
        return item.Name === '_rclonetray_local_path_map'
      })

      // Asynchronously create the tabs element using a method exposed from another part of your contextBridge
      const tabs = window.htmlElements.createTabsElement()

      if (connectionFields.length) {
        tabs.addTab('Connection', window.htmlElements.createOptionsFields(connectionFields, 'options', values.options))
      }

      if (advancedFields.length) {
        tabs.addTab('Advanced', window.htmlElements.createOptionsFields(advancedFields, 'options', values.options))
      }

      ipcRenderer.invoke('get-setting', 'rclone_sync_enable').then((syncEnable) => {
        if (syncEnable && mappingFields.length) {
          tabs.addTab('Mappings', window.htmlElements.createOptionsFields(mappingFields, 'options', values.options))
        }

        const placeholder = document.getElementById(placeholderId)
        const range = document.createRange()
        range.selectNodeContents(placeholder)
        range.deleteContents()
        placeholder.appendChild(tabs)
      })
    })

    ipcRenderer.send('get-provider-data', providerName)
  }
})
