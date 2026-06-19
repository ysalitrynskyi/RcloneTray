'use strict'

import { contextBridge, ipcRenderer } from 'electron'

// Define interfaces for window globals
interface OptionFieldDefinition {
  $Type?: string
  $Label?: string
  $RequireRestart?: boolean
  $Namespace?: string
  Name: string
  Help?: string
  Default?: string | number | boolean
  Value?: string | number | boolean
  Required?: boolean
  Provider?: string
  Examples?: Array<{ Value: string | number; Label?: string }>
  Advanced?: boolean
  Hide?: boolean
}

interface TabsElement extends HTMLDivElement {
  addTab: (label: string, content: DocumentFragment | HTMLElement) => void
}

interface DependencyItem {
  rule: string
  row: HTMLElement
}

const optionFieldDependencyRegistry: DependencyItem[] = []
const optionFieldDependencyValues: Record<string, string> = {}

function resetOptionFieldDependencies(): void {
  optionFieldDependencyRegistry.length = 0
  Object.keys(optionFieldDependencyValues).forEach((key) => {
    delete optionFieldDependencyValues[key]
  })
}

function addOptionFieldDependency(item: DependencyItem): void {
  optionFieldDependencyRegistry.push(item)
}

function selectOptionFieldDependencies(): void {
  const activeValues = Object.values(optionFieldDependencyValues)
  optionFieldDependencyRegistry.forEach((depItem: DependencyItem) => {
    const invert = depItem.rule.startsWith('!')
    const rule = (invert ? depItem.rule.substring(1) : depItem.rule).split(',').map((item) => item.trim())
    let match = rule.some((item) => activeValues.includes(item))
    match = invert ? !match : match
    if (match) {
      depItem.row.style.display = ''
      depItem.row.querySelectorAll('input,textarea,select').forEach((inputEl) => {
        (inputEl as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).disabled = false
      })
    } else {
      depItem.row.style.display = 'none'
      depItem.row.querySelectorAll('input,textarea,select').forEach((inputEl) => {
        (inputEl as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).disabled = true
      })
    }
  })
}

function setOptionFieldDependencyValue(key: string, value: string): void {
  optionFieldDependencyValues[key] = value
  selectOptionFieldDependencies()
}

function createHelpTextElement(help: string): HTMLDivElement {
  const fieldHelpText = document.createElement('div')
  const urlPattern = /\b(https?|ftp|file):\/\/[-A-Z0-9+&@#/%?=~_|!:,.]*[-A-Z0-9+&@#/%=~_|]/ig
  let lastIndex = 0
  let match: RegExpExecArray | null

  const appendTextWithBreaks = (text: string): void => {
    text.split('\n').forEach((part, index) => {
      if (index > 0) {
        fieldHelpText.appendChild(document.createElement('br'))
      }
      if (part) {
        fieldHelpText.appendChild(document.createTextNode(part))
      }
    })
  }

  while ((match = urlPattern.exec(help)) !== null) {
    appendTextWithBreaks(help.slice(lastIndex, match.index))
    const link = document.createElement('a')
    link.href = match[0]
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = match[0]
    fieldHelpText.appendChild(link)
    lastIndex = match.index + match[0].length
  }

  appendTextWithBreaks(help.slice(lastIndex))
  return fieldHelpText
}

function resizeToContentWindow(): void {
  let newHeight = document.body.scrollHeight + (window.outerHeight - window.innerHeight)
  if (newHeight > window.screen.height * 0.85) {
    newHeight = Math.ceil(window.screen.height * 0.85)
    document.body.style.overflow = ''
  } else {
    document.body.style.overflow = 'hidden'
  }
  ipcRenderer.send('resize-window', newHeight)
}

// Extend Window interface
declare global {
  interface Window {
    requireRestart?: boolean
    electronAPI: {
      popupContextMenu: (menuTemplate: unknown[]) => void
      messageBox: (message: string) => Promise<number>
      confirm: (message: string) => Promise<boolean>
      errorBox: (message: string) => void
      notification: (message: string) => void
      resizeToContent: () => void
      selectDirectory: (defaultDirectory?: string) => Promise<string | null>
      selectFile: (defaultFile?: string) => Promise<string[]>
      getTheFormData: (form: HTMLFormElement) => Record<string, unknown>
    }
    htmlElements: {
      createTabsElement: () => TabsElement
      createOptionsFields: (optionFields: OptionFieldDefinition[], optionFieldsNamespace?: string, optionValues?: Record<string, unknown>) => DocumentFragment
      createOptionField: (optionFieldDefinition: OptionFieldDefinition, optionFieldNamespace?: string, value?: unknown) => HTMLDivElement
      checkForRequiredRestart: () => void
    }
    optionFieldDependencies: {
      registry: DependencyItem[]
      add: (item: DependencyItem) => void
      select: (value: string) => void
      clear: () => void
    }
    api: {
      renderBookmarkSettings: (placeholderOrId: string | HTMLElement, providerName: string, values?: { options?: Record<string, unknown> }) => void
    }
  }
}

contextBridge.exposeInMainWorld('$main', {
  app: {
    getPath: (): Promise<string> => ipcRenderer.invoke('get-app-path'),
    getName: (): Promise<string> => ipcRenderer.invoke('get-app-name'),
    getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version')
  },
  refreshTray: (): void => { ipcRenderer.send('refresh-tray') },
  settingsMerge: (data: Record<string, unknown>): Promise<void> => ipcRenderer.invoke('settings-merge', data),
  getSetting: (key: string): Promise<unknown> => ipcRenderer.invoke('get-setting', key),
  rclone: (() => {
    const invokeIpc = async <T>(channel: string, ...args: unknown[]): Promise<T | undefined> => {
      try {
        return await ipcRenderer.invoke(channel, ...args) as T
      } catch (error) {
        // Do NOT swallow: callers (e.g. addBookmark) rely on the rejection to keep
        // the dialog open and show the real error. Strip Electron's IPC prefix so
        // the message stays readable.
        console.error(`Error with IPC channel '${channel}':`, error)
        const raw = error instanceof Error ? error.message : String(error)
        const cleaned = raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
        throw new Error(cleaned || raw)
      }
    }

    return {
      version: (): Promise<string | undefined> => invokeIpc<string>('get-rclone-version'),
      providers: (): Promise<Record<string, unknown> | undefined> => invokeIpc<Record<string, unknown>>('get-rclone-providers'),
      addBookmark: (type: string, name: string, options: Record<string, string>): Promise<void | undefined> => 
        invokeIpc<void>('get-rclone-book', type, name, options),
      delBookmark: (name: string): Promise<void | undefined> => invokeIpc<void>('get-rclone-delete-book', name),
      updateBookmark: (name: string, options: Record<string, string>): Promise<void | undefined> => 
        invokeIpc<void>('get-rclone-update-book', name, options),
      getConfigFile: (): Promise<string | undefined> => invokeIpc<string>('get-rclone-get-config-file')
    }
  })(),
  setAutostart: (state: boolean): void => { ipcRenderer.send('set-autostart', state) },
  isAutostart: (): Promise<boolean> => ipcRenderer.invoke('is-autostart'),
  getProps: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('get-props')
})

contextBridge.exposeInMainWorld('electronAPI', {
  popupContextMenu: (menuTemplate: unknown[]): void => { 
    ipcRenderer.send('popup-context-menu', menuTemplate) 
  },
  messageBox: async (message: string): Promise<number> => {
    return await ipcRenderer.invoke('show-message-box', { message })
  },
  confirm: async (message: string): Promise<boolean> => {
    const choice = await ipcRenderer.invoke('confirm-dialog', { message })
    return choice === 0
  },
  errorBox: (message: string): void => {
    ipcRenderer.send('error-box', { message })
  },
  notification: (message: string): void => {
    ipcRenderer.send('show-notification', { message })
  },
  resizeToContent: resizeToContentWindow,
  selectDirectory: async (defaultDirectory?: string): Promise<string | null> => {
    return await ipcRenderer.invoke('select-directory', { defaultDirectory })
  },
  selectFile: async (defaultFile?: string): Promise<string[]> => {
    return await ipcRenderer.invoke('select-file', defaultFile)
  },
  getTheFormData: (form: HTMLFormElement): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    Array.from(form.elements).forEach(element => {
      const el = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      if (el.name && !el.disabled && !(el.type === 'radio' && !(el as HTMLInputElement).checked)) {
        const fieldValue = el.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value
        const [namespace, name] = el.name.split('.')
        if (namespace && name) {
          if (!values[namespace]) values[namespace] = {}
          ;(values[namespace] as Record<string, unknown>)[name] = fieldValue
        } else {
          values[el.name] = fieldValue
        }
      }
    })
    return values
  }
})

const htmlElementsApi = {
  createTabsElement(): TabsElement {
    const container = document.createElement('div') as TabsElement
    const containerButtons = document.createElement('div')
    const containerContents = document.createElement('div')
    container.className = 'tabs'
    containerButtons.className = 'tab-buttons'
    containerContents.className = 'tab-contents'
    container.appendChild(containerButtons)
    container.appendChild(containerContents)

    container.addTab = function(label: string, content: DocumentFragment | HTMLElement): void {
      const tabsTabIndex = containerButtons.childNodes.length
      const button = document.createElement('div')
      ;(button as unknown as { tabsTabIndex: number }).tabsTabIndex = tabsTabIndex
      button.className = `tab-button${tabsTabIndex > 0 ? '' : ' active'}`
      button.innerText = label
      button.onclick = function(): void {
        containerButtons.childNodes.forEach((item, index) => {
          (item as HTMLElement).className = index === tabsTabIndex ? 'tab-button active' : 'tab-button'
        })
        containerContents.childNodes.forEach((item, index) => {
          (item as HTMLElement).style.display = index === tabsTabIndex ? '' : 'none'
        })
        resizeToContentWindow()
      }

      const contentWrapper = document.createElement('div')
      ;(contentWrapper as unknown as { tabsTabIndex: number }).tabsTabIndex = tabsTabIndex
      contentWrapper.className = 'tab-content'
      contentWrapper.style.display = tabsTabIndex > 0 ? 'none' : ''
      contentWrapper.appendChild(content)

      containerContents.appendChild(contentWrapper)
      containerButtons.appendChild(button)
    }

    return container
  },

  createOptionsFields(
    optionFields: OptionFieldDefinition[], 
    optionFieldsNamespace?: string, 
    optionValues?: Record<string, unknown>
  ): DocumentFragment {
    const values = optionValues || {}
    const container = document.createDocumentFragment()

    optionFields.forEach((fieldDefinition) => {
      const optionField = htmlElementsApi.createOptionField(
        fieldDefinition,
        optionFieldsNamespace,
        Object.prototype.hasOwnProperty.call(values, fieldDefinition.Name) ? values[fieldDefinition.Name] : null
      )
      container.appendChild(optionField)
    })

    return container
  },

  checkForRequiredRestart: (): void => {
    ipcRenderer.send('check-require-restart')
  },

  createOptionField(
    optionFieldDefinition: OptionFieldDefinition, 
    optionFieldNamespace?: string, 
    value?: unknown
  ): HTMLDivElement {
    if (value === undefined || value === null) {
      value = optionFieldDefinition.Value ?? optionFieldDefinition.Default
    }

    const row = document.createElement('div')
    const th = document.createElement('div')
    const td = document.createElement('div')
    let inputField: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

    switch (optionFieldDefinition.$Type) {
      case 'text':
        inputField = document.createElement('textarea')
        inputField.value = (value as string) || ''
        break
      case 'select':
        inputField = document.createElement('select')
        if (optionFieldDefinition.Examples) {
          optionFieldDefinition.Examples.forEach((item) => {
            const option = document.createElement('option')
            option.value = String(item.Value)
            option.innerText = item.Label || String(item.Value)
            if (String(value) === String(item.Value)) option.selected = true
            inputField.appendChild(option)
          })
        }
        break
      case 'boolean':
        inputField = document.createElement('input')
        inputField.type = 'checkbox'
        ;(inputField as HTMLInputElement).checked = [true, 'true', 1, '1'].includes(value as string | number | boolean)
        break
      case 'number':
      case 'numeric':
        inputField = document.createElement('input')
        inputField.type = 'number'
        inputField.value = value !== undefined && value !== null ? String(value) : ''
        break
      case 'password':
        inputField = document.createElement('input')
        inputField.type = 'password'
        inputField.value = (value as string) || ''
        break
      case 'directory':
        inputField = document.createElement('input')
        inputField.value = (value as string) || ''
        ;(inputField as HTMLInputElement & { _browseType: string })._browseType = 'directory'
        break
      case 'file':
        inputField = document.createElement('input')
        inputField.value = (value as string) || ''
        ;(inputField as HTMLInputElement & { _browseType: string })._browseType = 'file'
        break
      default:
        inputField = document.createElement('input')
        inputField.value = (value as string) || ''
        break
    }

    row.className = 'row'
    th.className = 'cell-left'
    td.className = 'cell-right'
    row.appendChild(th)
    row.appendChild(td)

    if (optionFieldDefinition.Provider) {
      addOptionFieldDependency({
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
    if ('placeholder' in inputField) {
      inputField.placeholder = String(optionFieldDefinition.Default ?? '')
    }

    td.appendChild(inputField)

    // Add browse button for directory/file types
    const browseType = (inputField as HTMLInputElement & { _browseType?: string })._browseType
    if (browseType) {
      const browseButton = document.createElement('button')
      browseButton.style.margin = '.3rem 0'
      browseButton.innerText = 'Browse'
      browseButton.addEventListener('click', async (event) => {
        event.preventDefault()
        if (browseType === 'directory') {
          const selectedPath = await ipcRenderer.invoke('select-directory', { defaultDirectory: inputField.value }) as string | null
          if (selectedPath) {
            inputField.value = selectedPath
          }
        } else {
          const selectedPaths = await ipcRenderer.invoke('select-file', inputField.value) as string[]
          if (selectedPaths && selectedPaths.length > 0) {
            inputField.value = selectedPaths[0]
          }
        }
      })
      td.appendChild(browseButton)
    }

    // Set examples
    if (optionFieldDefinition.Examples && optionFieldDefinition.$Type !== 'boolean' && optionFieldDefinition.$Type !== 'select') {
      const inputFieldOptions = document.createElement('datalist')
      inputFieldOptions.id = inputField.id + '_datalist'
      inputField.setAttribute('list', inputFieldOptions.id)
      td.appendChild(inputFieldOptions)
      optionFieldDefinition.Examples.forEach((item) => {
        const datalistOption = document.createElement('option')
        datalistOption.value = String(item.Value)
        datalistOption.innerText = item.Label || String(item.Value)
        inputFieldOptions.appendChild(datalistOption)
      })

      // Until Electron fixes the datalist, we are stuck with next solution.
      inputField.addEventListener('click', (event) => {
        const target = event.target as HTMLElement
        const { width, height } = target.getBoundingClientRect()
        if ((event as MouseEvent).offsetX < width - height) {
          return
        }
        event.preventDefault()
        const menuTemplate: Array<{ label: string; click: () => void }> = []
        inputFieldOptions.childNodes.forEach((childNode) => {
          const optionNode = childNode as HTMLOptionElement
          if (optionNode.value) {
            menuTemplate.push({
              label: optionNode.value,
              click: () => {
                inputField.value = optionNode.value
                inputField.dispatchEvent(new window.Event('change'))
              }
            })
          }
        })
        ipcRenderer.send('popup-context-menu', menuTemplate)
      })
    }

    // Trigger provider's show/hide
    const dependencyValueKey = inputField.name || inputField.id
    const updateDependencyValue = function(this: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
      const dependencyValue = this.type === 'checkbox' ? String((this as HTMLInputElement).checked) : this.value
      setOptionFieldDependencyValue(dependencyValueKey, dependencyValue)
    }
    inputField.addEventListener('change', updateDependencyValue)
    updateDependencyValue.call(inputField)

    // Flag that indicate app requires restart when form is saved.
    if (optionFieldDefinition.$RequireRestart) {
      inputField.addEventListener('change', () => {
        window.requireRestart = true
      }, { once: true })
    }

    // Setup field label.
    th.innerText = optionFieldDefinition.$Label || optionFieldDefinition.Name

    // Setup helping text.
    if (optionFieldDefinition.Help) {
      const fieldHelpText = createHelpTextElement(optionFieldDefinition.Help)
      td.appendChild(fieldHelpText)
      if (optionFieldDefinition.$Type === 'boolean') {
        fieldHelpText.className = 'label-help-inline'
      } else {
        fieldHelpText.className = 'label-help'
      }
    }

    // Make some fields required.
    if (optionFieldDefinition.Required) {
      row.className += ' required'
      const requiredHelpText = document.createElement('div')
      requiredHelpText.innerText = 'required'
      requiredHelpText.className += ' label-required'
      th.appendChild(requiredHelpText)
    }

    return row
  }
}

contextBridge.exposeInMainWorld('htmlElements', htmlElementsApi)

contextBridge.exposeInMainWorld('optionFieldDependencies', {
  registry: [] as DependencyItem[],
  add(item: DependencyItem): void {
    addOptionFieldDependency(item)
  },
  select(value: string): void {
    setOptionFieldDependencyValue('__external__', value)
  },
  clear(): void {
    resetOptionFieldDependencies()
  }
})

interface ProviderData {
  Options: OptionFieldDefinition[]
}

contextBridge.exposeInMainWorld('api', {
  renderBookmarkSettings(
    placeholderOrId: string | HTMLElement, 
    providerName: string, 
    values?: { options?: Record<string, unknown> }
  ): void {
    // Normalize values to have options object
    const normalizedValues = values || {}
    if (!normalizedValues.options) {
      normalizedValues.options = {}
    }

    const getPlaceholder = (): HTMLElement | null => {
      return typeof placeholderOrId === 'string'
        ? document.getElementById(placeholderOrId)
        : placeholderOrId
    }

    const renderError = (message: string): void => {
      const placeholderEl = getPlaceholder()
      if (!placeholderEl) {
        return
      }
      const range = document.createRange()
      range.selectNodeContents(placeholderEl)
      range.deleteContents()
      const msg = document.createElement('div')
      msg.style.cssText = 'padding:20px;color:#ff3b30;font-size:12px;'
      msg.textContent = message
      placeholderEl.appendChild(msg)
      resizeToContentWindow()
    }

    // Send an IPC message to the main process to retrieve the provider data
    ipcRenderer.once('provider-data-reply', (_event, provider: ProviderData | null) => {
      try {
        if (!provider || !Array.isArray(provider.Options)) {
          renderError('Could not load settings for this provider. Please try again.')
          return
        }

        resetOptionFieldDependencies()
        const visibleOptions = provider.Options.filter((item) => item.Hide !== true)

        const connectionFields = visibleOptions.filter((item) => {
          return item.Name !== '_rclonetray_local_path_map' && item.Advanced !== true
        })

        const advancedFields = visibleOptions.filter((item) => {
          return item.Name !== '_rclonetray_local_path_map' && item.Advanced === true
        })

        const mappingFields = visibleOptions.filter((item) => {
          return item.Name === '_rclonetray_local_path_map'
        })

        // Asynchronously create the tabs element using a method exposed from another part of your contextBridge
        const tabs = htmlElementsApi.createTabsElement()

        if (connectionFields.length) {
          tabs.addTab('Connection', htmlElementsApi.createOptionsFields(connectionFields, 'options', normalizedValues.options))
        }

        if (advancedFields.length) {
          tabs.addTab('Advanced', htmlElementsApi.createOptionsFields(advancedFields, 'options', normalizedValues.options))
        }

        ipcRenderer.invoke('get-setting', 'rclone_sync_enable')
          .then((syncEnable) => {
            if (syncEnable && mappingFields.length) {
              tabs.addTab('Mappings', htmlElementsApi.createOptionsFields(mappingFields, 'options', normalizedValues.options))
            }

            // Support both element ID (string) and DOM element
            const placeholder = getPlaceholder()

            if (placeholder) {
              const range = document.createRange()
              range.selectNodeContents(placeholder)
              range.deleteContents()
              placeholder.appendChild(tabs)
              resizeToContentWindow()
            }
          })
          .catch((error) => {
            console.error('Failed to render provider settings:', error)
            renderError('Could not render settings for this provider. Please try again.')
          })
      } catch (error) {
        console.error('Failed to render provider settings:', error)
        renderError('Could not render settings for this provider. Please try again.')
      }
    })

    ipcRenderer.send('get-provider-data', providerName)
  }
})
