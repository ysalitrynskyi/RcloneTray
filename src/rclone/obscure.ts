import { spawn } from 'child_process'

const OBSCURE_ARGS = ['--ask-password=false', 'obscure', '-']
const DEFAULT_TIMEOUT_MS = 15000

export interface ObscureOptions {
  timeoutMs?: number
  args?: string[]
}

function withoutSecret(text: string, secret: string): string {
  const cleaned = secret ? text.split(secret).join('***') : text
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, 300)
}

/**
 * Run `rclone obscure -` and hand the secret over on stdin. The secret never
 * appears in the argument list, so a value such as "-" or "mount" cannot be
 * mistaken for a flag or a command, and no error text can quote it.
 */
export function obscureSecret(executable: string, plain: string, options: ObscureOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let stdout = ''
    let stderr = ''
    const finish = (error: Error | null, value = ''): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve(value)
      }
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(executable, options.args || OBSCURE_ARGS, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      reject(new Error(`Cannot start rclone: ${withoutSecret(error instanceof Error ? error.message : String(error), plain)}`))
      return
    }
    timer = setTimeout(() => {
      child.kill()
      finish(new Error('rclone did not answer in time while hiding the password.'))
    }, timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.stdin?.on('error', () => undefined)
    child.on('error', (error) => {
      finish(new Error(`Cannot run rclone: ${withoutSecret(error.message, plain)}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        finish(null, stdout.trim())
        return
      }
      const detail = withoutSecret(stderr, plain)
      finish(new Error(`rclone obscure failed (exit ${code})${detail ? `: ${detail}` : ''}`))
    })
    child.stdin?.end(plain, 'utf8')
  })
}
