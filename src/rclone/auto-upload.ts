/** How long to wait before an automatic upload. A burst cannot postpone it past maxWaitMs. */
export function automaticUploadDelay(firstEventAt: number, now: number, delayMs: number, maxWaitMs: number): number {
  if (now - firstEventAt >= maxWaitMs) {
    return 0
  }
  return delayMs
}

export const AUTO_UPLOAD_IGNORED = /(^|[\\/])(\.DS_Store|Thumbs\.db|\.directory|desktop\.ini)$/i
