/** How long to wait before an automatic upload. A burst cannot postpone it past maxWaitMs. */
export function automaticUploadDelay(firstEventAt: number, now: number, delayMs: number, maxWaitMs: number): number {
  if (now - firstEventAt >= maxWaitMs) {
    return 0
  }
  return delayMs
}

export const AUTO_UPLOAD_IGNORED = /(^|[\\/])(\.DS_Store|Thumbs\.db|\.directory|desktop\.ini)$/i

const AUTO_UPLOAD_TARGET_KEYS = ['_rclonetray_local_path_map', '_rclonetray_remote_path']

/** True when a save changes the folder that is watched or the remote path it uploads to. */
export function changesAutoUploadTarget(fields: { set: Record<string, string>; unset: string[] }, existing: Record<string, unknown>): boolean {
  return AUTO_UPLOAD_TARGET_KEYS.some((key) => {
    const current = existing[key] == null ? '' : String(existing[key])
    if (Object.prototype.hasOwnProperty.call(fields.set, key)) {
      return fields.set[key] !== current
    }
    return fields.unset.includes(key) && current !== ''
  })
}
