import { readFileSync } from 'fs'
import ts from 'typescript'

const preloadSource = readFileSync(new URL('../../../src/dialogs-preload.ts', import.meta.url), 'utf8')

function extractFunction(name: string): string {
  const start = preloadSource.search(new RegExp(`^function ${name}\\(`, 'm'))
  if (start < 0) {
    throw new Error(`Function ${name} not found in dialogs-preload.ts`)
  }
  const end = preloadSource.indexOf('\n}\n', start)
  if (end < 0) {
    throw new Error(`Function ${name} has no closing brace at column 0`)
  }
  return preloadSource.slice(start, end + 2)
}

/**
 * The preload is sandboxed and cannot import local modules, so its pure helpers
 * are compiled out of the real source here and exercised directly.
 */
export function loadPreloadFunctions<T extends Record<string, (...args: never[]) => unknown>>(names: string[]): T {
  const body = names.map(extractFunction).join('\n')
  const js = ts.transpileModule(body, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None }
  }).outputText
  const factory = new Function(`${js}\nreturn { ${names.join(', ')} }`)
  return factory() as T
}
