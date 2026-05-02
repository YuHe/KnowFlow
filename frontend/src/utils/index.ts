import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistance, format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'

// ============ Tailwind Class Merging ============

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ============ Date Utilities ============

export function formatDate(date: string | Date, pattern = 'yyyy-MM-dd HH:mm'): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, pattern, { locale: zhCN })
  } catch {
    return '无效日期'
  }
}

export function formatRelativeTime(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return formatDistance(d, new Date(), { addSuffix: true, locale: zhCN })
  } catch {
    return '未知时间'
  }
}

export function formatShortDate(date: string | Date): string {
  return formatDate(date, 'MM-dd HH:mm')
}

export function formatFullDate(date: string | Date): string {
  return formatDate(date, 'yyyy年MM月dd日 HH:mm')
}

// ============ String Utilities ============

export function truncate(str: string, maxLen: number, suffix = '...'): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - suffix.length) + suffix
}

export function countWords(text: string): number {
  if (!text || text.trim() === '') return 0
  // Count Chinese characters + space-separated words
  const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = text
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length
  return chineseCount + englishWords
}

export function stripHtml(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u4e00-\u9fa5]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export function capitalize(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ============ Async Utilities ============

export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
    }, ms)
  }
}

export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let lastTime = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastTime >= ms) {
      lastTime = now
      fn(...args)
    }
  }
}

// ============ ID Utilities ============

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
}

export function generateShortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

// ============ File Utilities ============

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

export function isImageFile(filename: string): boolean {
  const ext = getFileExtension(filename)
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
}

// ============ URL Utilities ============

export function buildUrl(base: string, params: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(base, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  })
  return url.toString()
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text)
  }
  // Fallback
  const el = document.createElement('textarea')
  el.value = text
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
  return Promise.resolve()
}

// ============ Array Utilities ============

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const groupKey = String(item[key])
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(item)
      return groups
    },
    {} as Record<string, T[]>,
  )
}

export function unique<T>(array: T[], key?: keyof T): T[] {
  if (!key) {
    return [...new Set(array)]
  }
  const seen = new Set()
  return array.filter((item) => {
    const val = item[key]
    if (seen.has(val)) return false
    seen.add(val)
    return true
  })
}

// ============ Object Utilities ============

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj }
  keys.forEach((key) => delete result[key])
  return result
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  keys.forEach((key) => {
    result[key] = obj[key]
  })
  return result
}

// ============ Number Utilities ============

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return String(num)
}

// ============ Error Utilities ============

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}
