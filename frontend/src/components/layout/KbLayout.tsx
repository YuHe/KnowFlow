import { Outlet, Link, useLocation, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, MessageSquare, Clock, AlignLeft, Share2 } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { useKbStore } from '@/store/kbStore'
import { useTreeStore } from '@/store/treeStore'
import { cn } from '@/utils'
import DocTree from '@/components/tree/DocTree'

export function KbLayout() {
  const { kbId } = useParams<{ kbId: string }>()
  const location = useLocation()
  const { sidebarOpen, outlineOpen, commentPanelOpen, versionPanelOpen, toggleSidebar, openRightPanel, closeAllPanels } =
    useUiStore()
  const { currentKb, fetchKbById } = useKbStore()
  const { fetchTree } = useTreeStore()

  const isRightPanelOpen = outlineOpen || commentPanelOpen || versionPanelOpen

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
          'relative flex flex-col border-r bg-background transition-all duration-200 shrink-0',
          sidebarOpen ? 'w-[260px]' : 'w-0 overflow-hidden border-r-0',
        )}
      >
        {/* KB header */}
        <div className="px-4 py-3 border-b bg-background flex-shrink-0">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition">
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <span className="text-lg">{currentKb?.icon || '📚'}</span>
            <span className="text-sm font-semibold truncate flex-1 min-w-0">{currentKb?.name}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {kbId && <DocTree kbId={kbId} />}
        </div>
        {/* KB settings link at bottom */}
        <div className="px-3 py-2 border-t flex-shrink-0">
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
      </aside>

      {/* Sidebar toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute left-0 top-1/2 z-10 flex h-8 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 bg-background shadow-sm hover:bg-accent transition-colors"
        style={{ left: sidebarOpen ? '260px' : '0' }}
        aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/* Right Panel Tabs */}
        <div className="flex shrink-0 border-l">
          {/* Tab buttons */}
          <div className="flex w-10 flex-col items-center border-r py-4 gap-1">
            <button
              onClick={() => outlineOpen ? closeAllPanels() : openRightPanel('outline')}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                outlineOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              title="文档大纲"
              aria-label="文档大纲"
            >
              <AlignLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => commentPanelOpen ? closeAllPanels() : openRightPanel('comments')}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                commentPanelOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              title="评论"
              aria-label="评论"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
            <button
              onClick={() => versionPanelOpen ? closeAllPanels() : openRightPanel('versions')}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                versionPanelOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              title="版本历史"
              aria-label="版本历史"
            >
              <Clock className="h-4 w-4" />
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="分享"
              aria-label="分享"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          {/* Right Panel Content */}
          <div
            className={cn(
              'transition-all duration-200 overflow-hidden',
              isRightPanelOpen ? 'w-[220px]' : 'w-0',
            )}
          >
            <div className="h-full w-[220px] overflow-y-auto p-3">
              {outlineOpen && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">文档大纲</h3>
                  {/* OutlinePanel will be rendered via Outlet */}
                </div>
              )}
              {commentPanelOpen && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">评论</h3>
                </div>
              )}
              {versionPanelOpen && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">版本历史</h3>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
