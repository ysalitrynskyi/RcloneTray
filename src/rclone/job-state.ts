export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type JobKind = 'mount' | 'download' | 'upload' | 'serve' | 'ncdu' | 'sync-preview' | 'other'

export interface JobState {
  id: string
  bookmarkName: string
  kind: JobKind
  label: string
  status: JobStatus
  startedAt: string
  endedAt?: string
  pid?: number
  uri?: string
  message?: string
  logTail: string[]
}

const jobs: Record<string, JobState> = {}
const MaxLogLines = 80

function now(): string {
  return new Date().toISOString()
}

export function startJob(job: Omit<JobState, 'startedAt' | 'status' | 'logTail'> & Partial<Pick<JobState, 'status' | 'logTail'>>): JobState {
  const next: JobState = {
    ...job,
    status: job.status || 'running',
    startedAt: now(),
    logTail: job.logTail || []
  }
  jobs[next.id] = next
  return next
}

export function updateJob(id: string, patch: Partial<Omit<JobState, 'id' | 'startedAt' | 'logTail'>>): JobState | null {
  if (!jobs[id]) {
    return null
  }
  jobs[id] = { ...jobs[id], ...patch }
  return jobs[id]
}

export function appendJobLog(id: string, line: string): void {
  const job = jobs[id]
  if (!job) {
    return
  }
  job.logTail = [...job.logTail, line].slice(-MaxLogLines)
}

export function finishJob(id: string, status: Exclude<JobStatus, 'pending' | 'running'>, message?: string): void {
  if (jobs[id]?.endedAt) {
    return
  }
  updateJob(id, {
    status,
    endedAt: now(),
    message
  })
}

export function getJobStates(): JobState[] {
  return Object.values(jobs).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function resetJobStates(): void {
  Object.keys(jobs).forEach((key) => {
    delete jobs[key]
  })
}
