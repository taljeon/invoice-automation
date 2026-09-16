/** Pure request and ownership checks. No cloud clients or invoice logging. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_PAGES = 20

export class RequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

export function parseUploadPath(value: unknown): { jobId: string; fileName: string } | null {
  if (typeof value !== 'string') return null
  const match = /^uploads\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9][A-Za-z0-9._-]{0,179}\.pdf)$/i.exec(value)
  if (!match || match[2].includes('..')) return null
  return { jobId: match[1], fileName: match[2] }
}

export function ownsLegacyPath(value: unknown, uid: string): boolean {
  if (typeof value !== 'string' || !uid || uid.includes('/')) return false
  const prefix = `invoices/${uid}/`
  const filename = value.startsWith(prefix) ? value.slice(prefix.length) : ''
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.pdf$/i.test(filename) && !filename.includes('..')
}

export function ownsJobPath(job: Record<string, unknown> | undefined, uid: string, path: string): boolean {
  const parsed = parseUploadPath(path)
  return !!parsed && !!job && job.userId === uid && job.storagePath === path && job.fileName === parsed.fileName
}

export function canClaimJob(job: Record<string, unknown> | undefined, path: string): boolean {
  return !!job && typeof job.userId === 'string' && job.userId.length > 0 &&
    job.status === 'pending' && ownsJobPath(job, job.userId, path)
}

export async function authenticateBearer(
  header: string | undefined,
  verify: (token: string) => Promise<{ uid: string }>
): Promise<string> {
  const match = /^Bearer ([^\s]+)$/.exec(header || '')
  if (!match) throw new RequestError(401, 'Authentication required')
  try {
    const decoded = await verify(match[1])
    if (!decoded.uid) throw new Error('Missing uid')
    return decoded.uid
  } catch {
    throw new RequestError(401, 'Invalid authentication token')
  }
}

export function validatePageImages(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_PAGES &&
    value.every(page => typeof page === 'string' && page.length > 0 && page.length <= 8 * 1024 * 1024) &&
    value.reduce((sum, page) => sum + page.length, 0) <= 28 * 1024 * 1024
}
