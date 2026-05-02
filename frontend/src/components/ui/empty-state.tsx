import * as React from 'react'
import { cn } from '@/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

interface EmptySearchProps {
  query?: string
  className?: string
}

export function EmptySearch({ query, className }: EmptySearchProps) {
  return (
    <EmptyState
      title="未找到结果"
      description={query ? `没有与"${query}"相关的内容` : '请尝试不同的搜索词'}
      className={className}
    />
  )
}

export function EmptyDocs({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      title="还没有文档"
      description="创建您的第一篇文档，开始记录知识"
      action={
        onAdd ? (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            创建文档
          </button>
        ) : undefined
      }
    />
  )
}
