/**
 * Opt-in verbose logging for diagnosing the markdown-paste flow.
 *
 * Enabled at runtime, not build time, so a user hitting a bug can turn it on
 * without a redeploy:
 *
 *   localStorage.setItem('kf_debug', '1')   // enable, then reload
 *   localStorage.removeItem('kf_debug')     // disable
 *
 * Beyond console output, the last N entries are kept in memory so a crash
 * report can embed the run-up to the failure — the console is gone once the
 * page reloads, but the report is not.
 */

const FLAG = 'kf_debug'
const RING_SIZE = 200

interface Entry {
  at: string
  scope: string
  message: string
  data?: unknown
}

const ring: Entry[] = []

function enabled(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

/** Serialize defensively: a log call must never be the thing that throws. */
function preview(data: unknown): unknown {
  if (data === undefined) return undefined
  try {
    if (typeof data === 'string') {
      return data.length > 500 ? `${data.slice(0, 500)}…(${data.length} chars)` : data
    }
    const json = JSON.stringify(data, (_k, v) =>
      typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}…(${v.length})` : v,
    )
    return json && json.length > 2000 ? `${json.slice(0, 2000)}…` : JSON.parse(json ?? 'null')
  } catch {
    return String(data)
  }
}

export function debugLog(scope: string, message: string, data?: unknown): void {
  const entry: Entry = {
    at: new Date().toISOString(),
    scope,
    message,
    data: preview(data),
  }

  ring.push(entry)
  if (ring.length > RING_SIZE) ring.shift()

  if (enabled()) {
    if (entry.data === undefined) console.log(`[${scope}] ${message}`)
    else console.log(`[${scope}] ${message}`, entry.data)
  }
}

/** The recent log ring, for embedding in a crash report. */
export function recentLogs(): Entry[] {
  return [...ring]
}

export function isDebugEnabled(): boolean {
  return enabled()
}
