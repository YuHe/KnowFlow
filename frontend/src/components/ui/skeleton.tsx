import { cn } from '@/utils'

interface SkeletonProps {
  className?: string
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} />
  )
}

function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  )
}

function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-lg border p-4 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  )
}

function SkeletonDocItem() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 flex-1" />
    </div>
  )
}

function SkeletonDocList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonDocItem key={i} />
      ))}
    </div>
  )
}

function SkeletonPage() {
  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-1/4" />
      <div className="space-y-3">
        <SkeletonText lines={5} />
        <Skeleton className="h-32 w-full rounded-lg" />
        <SkeletonText lines={3} />
      </div>
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonDocItem, SkeletonDocList, SkeletonPage }
