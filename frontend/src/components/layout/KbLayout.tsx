import { Outlet, Link, useLocation, useParams } from 'react-router-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { useKbStore } from '@/store/kbStore'
import { useTreeStore } from '@/store/treeStore'
import { cn } from '@/utils'
import DocTree from '@/components/tree/DocTree'
import KbIcon from '@/components/kb/KbIcon'

const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 480
const DEFAULT_SIDEBAR_WIDTH = 260

export function KbLayout() {
  const { kbId } = useParams<{ kbId: string }>()
  const location = useLocation()
  const { sidebarOpen, toggleSidebar } =
    useUiStore()
  const { currentKb, fetchKbById } = useKbStore()
  const { fetchTree } = useTreeStore()
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH)

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [sidebarWidth])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const delta = e.clientX - startXRef.current
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidthRef.current + delta))
      setSidebarWidth(newWidth)
    }
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    if (kbId) {
      fetchKbById(kbId)
      fetchTree(kbId)
    }
  }, [kbId, fetchKbById, fetchTree])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar */}
      <aside
        className={cn(
          'relative flex flex-col border-r bg-background transition-none shrink-0',
          sidebarOpen ? '' : 'w-0 overflow-hidden border-r-0',
        )}
        style={sidebarOpen ? { width: sidebarWidth } : undefined}
      >
        {/* KB header */}
        <div className="px-4 py-3 border-b bg-background flex-shrink-0">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition">
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <Link to={`/kb/${kbId}`} className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition">
              <KbIcon
                icon={currentKb?.icon || '📚'}
                iconUrl={currentKb?.icon_url}
                className="w-6 h-6 flex-shrink-0"
                emojiClass="text-lg"
              />
              <span className="text-sm font-semibold truncate">{currentKb?.name}</span>
            </Link>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {kbId && <DocTree kbId={kbId} />}
        </div>
        {/* KB settings / trash links at bottom */}
        <div className="px-3 py-2 border-t flex-shrink-0 space-y-0.5">
          <Link
            to={`/kb/${kbId}/trash`}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition',
              location.pathname.endsWith('/trash')
                ? 'bg-red-50 text-red-600'
                : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            回收站
          </Link>
          <Link
            to={`/kb/${kbId}/settings`}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition',
              location.pathname.endsWith('/settings')
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            成员管理
          </Link>
        </div>

        {/* Resize handle */}
        {sidebarOpen && (
          <div
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
            onMouseDown={handleResizeMouseDown}
          />
        )}
      </aside>

      {/* Sidebar toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute left-0 top-1/2 z-10 flex h-8 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 bg-background shadow-sm hover:bg-accent transition-colors"
        style={{ left: sidebarOpen ? sidebarWidth : 0 }}
        aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
