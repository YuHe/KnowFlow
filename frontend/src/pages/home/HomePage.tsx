import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useKbStore } from '@/store/kbStore'
import { useAuthStore } from '@/store/authStore'
import { BookOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { formatRelativeTime } from '@/utils'

export default function HomePage() {
  const { user } = useAuthStore()
  const { kbs, isLoadingKbs, fetchKbs } = useKbStore()

  useEffect(() => {
    fetchKbs()
  }, [fetchKbs])

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            你好，{user?.display_name ?? user?.username}
          </h1>
          <p className="text-muted-foreground mt-1">管理你的知识库</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          新建知识库
        </Button>
      </div>

      {isLoadingKbs ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : kbs.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title="还没有知识库"
          description="创建您的第一个知识库，开始整理和分享知识"
          action={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              新建知识库
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kbs.map((kb) => (
            <Link
              key={kb.id}
              to={`/kb/${kb.id}`}
              className="group rounded-lg border p-4 hover:border-primary/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{kb.icon || '📚'}</span>
                <h3 className="font-semibold group-hover:text-primary transition-colors truncate">
                  {kb.name}
                </h3>
              </div>
              {kb.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {kb.description}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{kb.doc_count ?? 0} 篇文档</span>
                <span>·</span>
                <span>{kb.member_count ?? 0} 位成员</span>
                <span className="ml-auto">{formatRelativeTime(kb.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
