import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trash2, RotateCcw, X, ChevronLeft } from 'lucide-react'
import { docsApi } from '@/api/docs'
import type { DocumentListItem } from '@/types'
import { toast } from '@/components/ui/use-toast'

const TRASH_DAYS = 30

function daysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime()
  const expiry = deleted + TRASH_DAYS * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)))
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function TrashPage() {
  const { kbId } = useParams<{ kbId: string }>()
  const navigate = useNavigate()
  const [docs, setDocs] = useState<DocumentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)

  const load = async () => {
    if (!kbId) return
    setIsLoading(true)
    try {
      const items = await docsApi.getTrash(kbId)
      setDocs(items)
    } catch {
      toast({ title: '加载回收站失败', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [kbId])

  const handleRestore = async (doc: DocumentListItem) => {
    setActioningId(doc.id)
    try {
      await docsApi.restoreDoc(doc.id)
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
      toast({ title: `"${doc.title}" 已恢复` })
    } catch {
      toast({ title: '恢复失败', variant: 'destructive' })
    } finally {
      setActioningId(null)
    }
  }

  const handlePermanentDelete = async (doc: DocumentListItem) => {
    if (!confirm(`彻底删除"${doc.title}"？此操作不可撤销。`)) return
    setActioningId(doc.id)
    try {
      await docsApi.permanentDeleteDoc(doc.id)
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
      toast({ title: `"${doc.title}" 已彻底删除` })
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    } finally {
      setActioningId(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          返回
        </button>
        <Trash2 className="w-5 h-5 text-gray-400" />
        <h1 className="text-lg font-semibold text-gray-800">回收站</h1>
      </div>

      <p className="text-sm text-gray-500 mb-5">
        文档将在删除后 <span className="font-medium text-gray-700">{TRASH_DAYS} 天</span>内自动彻底删除。
      </p>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          加载中…
        </div>
      )}

      {/* Empty */}
      {!isLoading && docs.length === 0 && (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <Trash2 className="w-12 h-12 mb-3 opacity-30" />
          <p>回收站是空的</p>
        </div>
      )}

      {/* List */}
      {!isLoading && docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc) => {
            const days = doc.deleted_at ? daysRemaining(doc.deleted_at) : 0
            const isActioning = actioningId === doc.id
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.title || '无标题'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    删除于 {doc.deleted_at ? formatDate(doc.deleted_at) : '—'}
                    {days > 0 ? (
                      <span className="ml-2 text-amber-500">{days} 天后自动清除</span>
                    ) : (
                      <span className="ml-2 text-red-500">即将清除</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRestore(doc)}
                    disabled={isActioning}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition disabled:opacity-50"
                    title="恢复"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    恢复
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(doc)}
                    disabled={isActioning}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                    title="彻底删除"
                  >
                    <X className="w-3.5 h-3.5" />
                    彻底删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
