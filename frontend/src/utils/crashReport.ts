/**
 * Crash reports and unsaved-content drafts, persisted to localStorage.
 *
 * Both exist because the app previously had no error boundary: a render-phase
 * throw blanked the screen and took every piece of unsaved editor state with
 * it, leaving nothing to diagnose from and nothing to recover.
 */

const CRASH_PREFIX = 'kf_crash_'
const DRAFT_PREFIX = 'kf_draft_'
const MAX_CRASH_REPORTS = 5

export interface CrashReport {
  id: string
  at: string
  label: string
  url: string
  userAgent: string
  message: string
  stack?: string
  componentStack?: string | null
  captured?: Record<string, unknown>
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    // Quota exceeded or storage disabled (private mode). Not worth failing the
    // caller over — the console trace remains.
    return false
  }
}

function keysWithPrefix(prefix: string): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) out.push(k)
    }
  } catch {
    /* storage unavailable */
  }
  return out.sort()
}

/** Persist a crash report and return its localStorage key. */
export function saveCrashReport(
  input: Omit<CrashReport, 'id' | 'at' | 'url' | 'userAgent'>,
): string {
  const id = `${CRASH_PREFIX}${Date.now()}`
  const report: CrashReport = {
    id,
    at: new Date().toISOString(),
    url: typeof location !== 'undefined' ? location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    ...input,
  }

  // Trim oldest first so a crash loop can't fill the quota.
  const existing = keysWithPrefix(CRASH_PREFIX)
  for (const k of existing.slice(0, Math.max(0, existing.length - (MAX_CRASH_REPORTS - 1)))) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }

  safeSet(id, JSON.stringify(report, null, 2))
  return id
}

export function listCrashReports(): CrashReport[] {
  return keysWithPrefix(CRASH_PREFIX)
    .map((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || 'null') as CrashReport | null
      } catch {
        return null
      }
    })
    .filter((r): r is CrashReport => r !== null)
}

export function clearCrashReports(): void {
  for (const k of keysWithPrefix(CRASH_PREFIX)) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Drafts — content the user typed or pasted that is not yet on the server
// ---------------------------------------------------------------------------

export interface Draft {
  docId: string
  at: string
  /** Free-form label describing where the draft came from, e.g. 'md-paste'. */
  source: string
  content: string
}

function draftKey(docId: string): string {
  return `${DRAFT_PREFIX}${docId}`
}

/**
 * Stash content that only exists in memory. Called before any operation that
 * could crash (e.g. converting pasted markdown), so the text survives.
 */
export function saveDraft(docId: string, source: string, content: string): void {
  if (!docId || !content) return
  const draft: Draft = { docId, at: new Date().toISOString(), source, content }
  safeSet(draftKey(docId), JSON.stringify(draft))
}

export function loadDraft(docId: string): Draft | null {
  if (!docId) return null
  try {
    const raw = localStorage.getItem(draftKey(docId))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

export function clearDraft(docId: string): void {
  if (!docId) return
  try {
    localStorage.removeItem(draftKey(docId))
  } catch {
    /* ignore */
  }
}
