import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useKbStore } from '@/store/kbStore'
import KbCreateDialog from '@/components/kb/KbCreateDialog'
import KbIcon from '@/components/kb/KbIcon'
import type { KnowledgeBase } from '@/types'

const HomePage: React.FC = () => {
  const { user } = useAuthStore()
  const { kbs, fetchKbs, isLoadingKbs, addKb } = useKbStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    fetchKbs()
  }, [fetchKbs])

  const handleKbCreated = (kb: KnowledgeBase) => {
    addKb(kb)
    setShowCreateDialog(false)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="bg-background border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-semibold">
          欢迎回来，{user?.display_name || user?.username}
        </h1>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建知识库
        </button>
      </div>

      <div className="p-8 max-w-6xl">
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">我的知识库</h2>
          </div>
          {isLoadingKbs ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border p-5 space-y-3 animate-pulse">
                  <div className="h-5 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : kbs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {kbs.map((kb) => (
                <Link
                  key={kb.id}
                  to={`/kb/${kb.id}`}
                  className="group bg-background border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <KbIcon icon={kb.icon || '📚'} iconUrl={kb.icon_url} className="w-8 h-8 flex-shrink-0" emojiClass="text-2xl" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-primary transition">
                        {kb.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {kb.visibility === 'public' ? '公开' : '私有'} · {kb.doc_count || 0} 篇文档
                      </p>
                    </div>
                  </div>
                  {kb.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{kb.description}</p>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="border border-dashed rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">还没有创建知识库</p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition"
              >
                新建知识库
              </button>
            </div>
          )}
        </section>
      </div>

      <KbCreateDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleKbCreated}
      />
    </div>
  )
}

export default HomePage
