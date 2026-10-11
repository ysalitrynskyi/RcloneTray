import { describe, expect, it } from 'vitest'
import { extractServeUrl, isFatalLog, parseLogLine, redactSecrets } from '../../src/rclone/log-lines'
import { sanitizeCustomArgs, splitCommandArgs } from '../../src/rclone/custom-args'

describe('rclone log lines', () => {
  it('does not treat a per-file error or a matching file name as fatal for a transfer', () => {
    const perFile = parseLogLine('{"level":"error","msg":"Failed to copy: file in use","object":"docs/a.docx"}')
    expect(isFatalLog(perFile, 'transfer')).toBe(false)
    const named = parseLogLine('{"level":"debug","msg":"Size and modification time the same","object":"Failed to launch.txt"}')
    expect(named.message).not.toContain('Failed to launch.txt')
    expect(isFatalLog(named, 'transfer')).toBe(false)
    const notice = parseLogLine('{"level":"notice","msg":"Failed to copy: directory not found"}')
    expect(isFatalLog(notice, 'transfer')).toBe(false)
  })

  it('treats a critical mount line as fatal and a Mounting-on line as only an attempt', () => {
    const fatal = parseLogLine('{"level":"critical","msg":"Fatal error: failed to mount FUSE fs: cgofuse: cannot find winfsp"}')
    expect(isFatalLog(fatal, 'mount')).toBe(true)
    const attempt = parseLogLine('{"level":"debug","msg":"Mounting on \\"Z:\\" (\\"probe\\")"}')
    expect(isFatalLog(attempt, 'mount')).toBe(false)
  })

  it('extracts the URL from bracketed serve lines and from FTP', () => {
    expect(extractServeUrl('HTTP Server started on [http://127.0.0.1:8080/]')).toBe('http://127.0.0.1:8080/')
    expect(extractServeUrl('WebDav Server started on [http://127.0.0.1:9/]')).toBe('http://127.0.0.1:9/')
    expect(extractServeUrl('Serving restic REST API on [http://127.0.0.1:1/]')).toBe('http://127.0.0.1:1/')
    expect(extractServeUrl('Serving FTP on 127.0.0.1:2121')).toBe('ftp://127.0.0.1:2121')
    expect(extractServeUrl('Serving on http://127.0.0.1:8080/')).toBe('http://127.0.0.1:8080/')
  })

  it('redacts a serving password', () => {
    expect(redactSecrets('pass is s3cret and --pass s3cret', ['s3cret'])).toBe('pass is XXXX and --pass XXXX')
  })
})

describe('custom args', () => {
  it('keeps quoted values with spaces', () => {
    expect(splitCommandArgs('--exclude "My Documents" --transfers 4')).toEqual(['--exclude', 'My Documents', '--transfers', '4'])
  })

  it('strips daemon and log flags, and mount-only flags on sync', () => {
    expect(sanitizeCustomArgs(['--daemon', '--transfers', '2', '--log-file', 'out.log'], ['mount'])).toEqual(['--transfers', '2'])
    expect(sanitizeCustomArgs(['--vfs-cache-mode', 'full', '--bwlimit', '1M'], ['sync', 'a', 'b'])).toEqual(['--bwlimit', '1M'])
  })
})
