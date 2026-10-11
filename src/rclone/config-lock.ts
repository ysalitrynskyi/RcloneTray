let tail: Promise<void> = Promise.resolve()

/**
 * Runs config changes one after another. Read the file, edit the text and
 * write it inside one task, with no await in between, so a change made by
 * another call is never overwritten with stale text.
 */
export function withConfigLock<T>(task: () => T | Promise<T>): Promise<T> {
  const run = tail.then(() => task())
  tail = run.then(() => undefined, () => undefined)
  return run
}
