import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync(new URL('../../src/ui/dialogs/Activity.html', import.meta.url), 'utf8')

function extract(name: string): string {
  const start = html.search(new RegExp(`^ {6}function ${name}\\(`, 'm'))
  if (start < 0) {
    throw new Error(`Function ${name} not found in Activity.html`)
  }
  const end = html.indexOf('\n      }\n', start)
  return html.slice(start, end + 9)
}

interface CardView {
  className: string
  title: string
  status: string
  meta: string
  progress: string
  logText: string
  fullLog: string
  canStop: boolean
  canCopy: boolean
}

const jobCardView = new Function(`${extract('jobCardView')}\nreturn jobCardView`)() as (job: Record<string, unknown>) => CardView

describe('Activity job card view', () => {
  it('shows Stop only while the job is running', () => {
    expect(jobCardView({ id: 'a', status: 'running' }).canStop).toBe(true)
    expect(jobCardView({ id: 'a', status: 'stopped' }).canStop).toBe(false)
    expect(jobCardView({ id: 'a', status: 'failed' }).canStop).toBe(false)
  })

  it('a card created before any output gets log, progress and Copy once output arrives', () => {
    const first = jobCardView({ id: 'a', status: 'running' })
    expect(first.logText).toBe('')
    expect(first.progress).toBe('')
    expect(first.canCopy).toBe(false)
    const later = jobCardView({ id: 'a', status: 'running', progress: '3 / 10', logTail: ['one', 'two'] })
    expect(later.logText).toBe('one\ntwo')
    expect(later.progress).toBe('3 / 10')
    expect(later.canCopy).toBe(true)
    expect(later.fullLog).toBe('one\ntwo')
  })

  it('keeps the last eight lines on screen and the whole tail for copying', () => {
    const lines = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`)
    const view = jobCardView({ id: 'a', status: 'running', logTail: lines })
    expect(view.logText.split('\n')).toHaveLength(8)
    expect(view.logText.endsWith('line 12')).toBe(true)
    expect(view.fullLog.split('\n')).toHaveLength(12)
  })

  it('keeps Copy log after the job finishes with log text', () => {
    const view = jobCardView({ id: 'a', status: 'stopped', logTail: ['done'] })
    expect(view.canStop).toBe(false)
    expect(view.canCopy).toBe(true)
  })
})
