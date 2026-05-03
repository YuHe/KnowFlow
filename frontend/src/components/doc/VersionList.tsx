import { useState, useEffect } from 'react'
import { X, RotateCcw, Eye } from 'lucide-react'
import { versionsApi } from '@/api/versions'
import type { DocumentVersion, DocumentVersionDetail } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { formatDate } from '@/utils'
import { toast } from '@/components/ui/use-toast'

interface VersionListProps {
  docId: string
  kbId: string
  onClose: () => void
  onRestore?: () => Promise<void>
}

const REASON_LABELS: Record<string, string> = {
  manual: '手动保存',
  restore: '从版本恢复',
  pre_restore: '恢复前快照',
}

export default function VersionList({ docId, onClose, onRestore }: VersionListProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [previewVersion, setPreviewVersion] = useState<DocumentVersionDetail | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const loadVersions = async () => {
    setLoading(true)
    try {
      const data = await versionsApi.getVersions(docId)
      setVersions(data)
    } catch {
      toast({ title: '加载版本历史失败', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVersions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  const handleRestore = async (version: DocumentVersion) => {
    if (restoringId) return
    setRestoringId(version.id)
    try {
      await versionsApi.restoreVersion(docId, version.id)
      toast({ title: `已恢复到版本 v${version.version_num}` })
      await loadVersions()
      setPreviewVersion(null)
      // Notify parent to reload the document content
      await onRestore?.()
    } catch {
      toast({ title: '恢复版本失败', variant: 'destructive' })
    } finally {
      setRestoringId(null)
    }
  }

  const handlePreview = async (version: DocumentVersion) => {
    if (previewVersion?.id === version.id) {
      setPreviewVersion(null)
      return
    }
    setPreviewLoading(true)
    try {
      const detail = await versionsApi.getVersion(docId, version.id)
      setPreviewVersion(detail)
    } catch {
      toast({ title: '加载版本内容失败', variant: 'destructive' })
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="w-80 border-l bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h3 className="text-sm font-semibold text-gray-800">版本历史</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 rounded p-0.5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-8">
            <p>暂无版本记录</p>
            <p className="mt-1 text-gray-300">Ctrl+S 可以手动创建版本快照</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {versions.map((version, idx) => (
              <li key={version.id}>
                <div className="px-3 py-2.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-semibold ${
                            idx === 0 ? 'text-blue-600' : 'text-gray-800'
                          }`}
                        >
                          v{version.version_num}
                        </span>
                        {idx === 0 && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1 py-0.5 rounded font-medium">
                            最新
                          </span>
                        )}
                        <span className="text-xs text-gray-400 bg-gray-100 rounded px-1 py-0.5">
                          {REASON_LABELS[version.snapshot_reason] ?? version.snapshot_reason}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(version.created_at)}
                      </p>
                      {version.snapshot_by_user && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {version.snapshot_by_user.display_name}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() => handlePreview(version)}
                        disabled={previewLoading}
                        title="预览内容"
                        className={`p-1 rounded transition-colors ${
                          previewVersion?.id === version.id
                            ? 'bg-blue-100 text-blue-600'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRestore(version)}
                        disabled={!!restoringId}
                        title="恢复此版本"
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        {restoringId === version.id ? (
                          <Spinner size="sm" className="h-3.5 w-3.5" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline preview panel */}
                {previewVersion?.id === version.id && (
                  <div className="border-t border-blue-100 bg-blue-50/30 px-3 py-2">
                    <p className="text-xs font-medium text-blue-700 mb-1.5">版本预览</p>
                    {previewLoading ? (
                      <div className="flex justify-center py-3">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      <div
                        className="text-xs text-gray-700 prose prose-xs max-w-none max-h-48 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: previewVersion.content_html }}
                      />
                    )}
                    <button
                      onClick={() => handleRestore(version)}
                      disabled={!!restoringId}
                      className="mt-2 w-full text-xs py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      恢复此版本
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-2 shrink-0">
        <p className="text-xs text-gray-400 text-center">共 {versions.length} 个历史版本</p>
      </div>
    </div>
  )
}
