import { useState, useEffect } from 'react'
import { X, Copy, Check, Trash2, Plus } from 'lucide-react'
import { sharesApi } from '@/api/shares'
import type { DocumentShare, ShareCreate } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { formatDate } from '@/utils'
import { toast } from '@/components/ui/use-toast'

interface SharePanelProps {
  docId: string
  kbId: string
  onClose: () => void
}

const EXPIRY_OPTIONS = [
  { label: '永久有效', days: null },
  { label: '1 天', days: 1 },
  { label: '7 天', days: 7 },
  { label: '30 天', days: 30 },
]

function computeExpiresAt(days: number | null): string | null {
  if (days === null) return null
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export default function SharePanel({ docId, onClose }: SharePanelProps) {
  const [shares, setShares] = useState<DocumentShare[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Form state
  const [accessLevel, setAccessLevel] = useState<'anyone' | 'members_only'>('anyone')
  const [password, setPassword] = useState('')
  const [expiryDays, setExpiryDays] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    sharesApi
      .getShares(docId)
      .then((data) => {
        if (!cancelled) setShares(data)
      })
      .catch(() => {
        if (!cancelled) toast({ title: '加载分享列表失败', variant: 'destructive' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [docId])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const payload: ShareCreate = {
        access_level: accessLevel,
        expires_at: computeExpiresAt(expiryDays),
        password: password.trim() || null,
      }
      const created = await sharesApi.createShare(docId, payload)
      setShares((prev) => [created, ...prev])
      setShowForm(false)
      setPassword('')
      setExpiryDays(null)
      setAccessLevel('anyone')
      toast({ title: '分享链接已创建' })
    } catch {
      toast({ title: '创建分享链接失败', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (share: DocumentShare) => {
    try {
      const updated = await sharesApi.updateShare(docId, share.id, {
        is_active: !share.is_active,
      })
      setShares((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  const handleDelete = async (shareId: string) => {
    try {
      await sharesApi.deleteShare(docId, shareId)
      setShares((prev) => prev.filter((s) => s.id !== shareId))
      toast({ title: '已删除分享链接' })
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  const handleCopy = (share: DocumentShare) => {
    navigator.clipboard
      .writeText(share.share_url)
      .then(() => {
        setCopiedId(share.id)
        setTimeout(() => setCopiedId(null), 2000)
      })
      .catch(() => {
        toast({ title: '复制失败', variant: 'destructive' })
      })
  }

  return (
    <div className="w-80 border-l bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h3 className="text-sm font-semibold text-gray-800">分享设置</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 rounded p-0.5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : (
          <>
            {/* Existing shares */}
            {shares.length === 0 && !showForm && (
              <p className="text-xs text-gray-400 text-center py-6">暂无分享链接</p>
            )}
            {shares.map((share) => (
              <div
                key={share.id}
                className={`rounded-lg border p-3 space-y-2 text-xs ${share.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${share.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                  />
                  <span className="text-gray-600 font-medium">
                    {share.access_level === 'anyone' ? '公开访问' : '仅成员'}
                  </span>
                  {share.has_password && (
                    <span className="text-gray-400 ml-auto">密码保护</span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <input
                    readOnly
                    value={share.share_url}
                    className="flex-1 min-w-0 text-xs bg-gray-50 border rounded px-2 py-1 text-gray-600 truncate"
                  />
                  <button
                    onClick={() => handleCopy(share)}
                    className="shrink-0 p-1.5 rounded border hover:bg-gray-50 transition-colors"
                    title="复制链接"
                  >
                    {copiedId === share.id ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-gray-400" />
                    )}
                  </button>
                </div>

                {share.expires_at && (
                  <p className="text-gray-400">
                    有效至 {formatDate(share.expires_at, 'yyyy-MM-dd')}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={() => handleToggleActive(share)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {share.is_active ? '停用' : '启用'}
                  </button>
                  <button
                    onClick={() => handleDelete(share.id)}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-0.5 ml-auto"
                  >
                    <Trash2 className="h-3 w-3" />
                    删除
                  </button>
                </div>
              </div>
            ))}

            {/* Create form */}
            {showForm && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-3">
                <p className="text-xs font-medium text-gray-700">新建分享链接</p>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">访问权限</label>
                  <select
                    value={accessLevel}
                    onChange={(e) => setAccessLevel(e.target.value as 'anyone' | 'members_only')}
                    className="w-full text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="anyone">任何人可访问</option>
                    <option value="members_only">仅知识库成员</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">访问密码（可选）</label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="留空则无密码"
                    className="w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">有效期</label>
                  <select
                    value={expiryDays === null ? '' : String(expiryDays)}
                    onChange={(e) =>
                      setExpiryDays(e.target.value === '' ? null : Number(e.target.value))
                    }
                    className="w-full text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.days === null ? '' : String(opt.days)}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex-1 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {creating ? '创建中...' : '创建链接'}
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {!showForm && (
        <div className="border-t px-3 py-2 shrink-0">
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-blue-500 hover:text-blue-600 border border-blue-200 hover:border-blue-300 rounded transition-colors"
          >
            <Plus className="h-3 w-3" />
            新建分享链接
          </button>
        </div>
      )}
    </div>
  )
}
