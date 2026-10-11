import { spawnSync } from 'child_process'
import { describe, expect, it } from 'vitest'
import { obscureSecret } from '../../src/rclone/obscure'
import { shouldAppendPerformanceFlags } from '../../src/rclone/command'

const rclone = process.env.RCLONETRAY_RCLONE_PATH
const itReal = rclone ? it : it.skip

function node(script: string) {
  return { args: ['-e', script] }
}

describe('obscureSecret with a stand-in process', () => {
  it('passes the secret on stdin and never in the arguments', async () => {
    const script = `
      let data = ''
      process.stdin.on('data', (c) => { data += c })
      process.stdin.on('end', () => { process.stdout.write(JSON.stringify({ args: process.argv.slice(1), data }) + '\\n') })
    `
    const out = await obscureSecret(process.execPath, 'mount', node(script))
    expect(JSON.parse(out)).toEqual({ args: [], data: 'mount' })
  })

  it('ends stdin so a reader that waits for end-of-input finishes', async () => {
    const script = "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('done\\n'))"
    await expect(obscureSecret(process.execPath, '-', node(script))).resolves.toBe('done')
  })

  it('gives up on a process that never answers', async () => {
    const started = Date.now()
    await expect(obscureSecret(process.execPath, 'x', { ...node('setInterval(() => {}, 1000)'), timeoutMs: 300 })).rejects.toThrow(/in time/)
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('keeps the secret out of the error text', async () => {
    const script = "process.stderr.write('bad input: hunter2 and more\\n'); process.exit(3)"
    const error = await obscureSecret(process.execPath, 'hunter2', node(script)).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('exit 3')
    expect((error as Error).message).not.toContain('hunter2')
  })

  it('keeps the secret out of the error when the binary is missing', async () => {
    const error = await obscureSecret('definitely-not-a-real-rclone-binary', 'hunter2').catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain('hunter2')
  })

  it('keeps the secret out of the error when the process exits silently', async () => {
    const error = await obscureSecret(process.execPath, 'hunter2', node('process.exit(1)')).catch((e: Error) => e)
    expect((error as Error).message).not.toContain('hunter2')
  })
})

describe('performance flags', () => {
  it('only follow the command verb, never a value that looks like one', () => {
    expect(shouldAppendPerformanceFlags(['mount', 'remote:', 'X:'])).toBe(true)
    expect(shouldAppendPerformanceFlags(['sync', 'a', 'b'])).toBe(true)
    expect(shouldAppendPerformanceFlags(['obscure', '--', 'mount'])).toBe(false)
    expect(shouldAppendPerformanceFlags(['obscure', '--', 'sync'])).toBe(false)
    expect(shouldAppendPerformanceFlags(['config', 'dump'])).toBe(false)
    expect(shouldAppendPerformanceFlags([])).toBe(false)
  })
})

describe('obscureSecret with the real rclone', () => {
  for (const secret of ['-', 'mount', 'serve', 'ncdu', '--flag', '  padded  ', 'pä ss"w\'d é Р', 'a\tb']) {
    itReal(`stores ${JSON.stringify(secret)} and reveals it unchanged`, async () => {
      const obscured = await obscureSecret(rclone as string, secret, { timeoutMs: 20000 })
      expect(obscured.length).toBeGreaterThan(8)
      expect(obscured).not.toBe(secret)
      const revealed = spawnSync(rclone as string, ['reveal', '--', obscured], { encoding: 'utf8', windowsHide: true })
      expect(revealed.status).toBe(0)
      expect(revealed.stdout.replace(/\r?\n$/, '')).toBe(secret)
    })
  }
})
