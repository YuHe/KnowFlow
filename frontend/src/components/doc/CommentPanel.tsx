import { useState, useEffect, useRef } from 'react'
import { X, Send, Trash2 } from 'lucide-react'
import { commentsApi } from '@/api/comments'
import type { DocumentComment } from '@/types'
import { UserAvatar } from '@/components/ui/avatar'
import { Spinner } from '@/components/ui/spinner'
import { formatRelativeTime } from '@/utils'
import { toast } from '@/components/ui/use-toast'

interface CommentPanelProps {
  docId: string
  kbId: string
  onClose: () => void
}

export default function CommentPanel({ docId, onClose }: CommentPanelProps) {
  const [comments, setComments] = useState<DocumentComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<DocumentComment | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    commentsApi
      .getComments(docId)
      .then((data) => {
        if (!cancelled) setComments(data)
      })
      .catch(() => {
        if (!cancelled) toast({ title: '加载评论失败', variant: 'destructive' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [docId])

  const handleSubmit = async () => {
    const trimmed = newComment.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const created = await commentsApi.addComment(docId, {
        content: trimmed,
        parent_id: replyTo?.id ?? null,
      })
      if (replyTo) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyTo.id
              ? { ...c, replies: [...(c.replies ?? []), created] }
              : c,
          ),
        )
      } else {
        setComments((prev) => [...prev, created])
      }
      setNewComment('')
      setReplyTo(null)
    } catch {
      toast({ title: '发布评论失败', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (commentId: string, parentId?: string | null) => {
    try {
      await commentsApi.deleteComment(docId, commentId)
      if (parentId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: (c.replies ?? []).filter((r) => r.id !== commentId) }
              : c,
          ),
        )
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId))
      }
    } catch {
      toast({ title: '删除评论失败', variant: 'destructive' })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const renderComment = (comment: DocumentComment, isReply = false) => (
    <div
      key={comment.id}
      className={`group flex gap-2 ${isReply ? 'ml-8 mt-2' : 'mt-3'}`}
    >
      <UserAvatar
        src={comment.user.avatar_url}
        name={comment.user.display_name}
        size="sm"
        className="shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-gray-800">
            {comment.user.display_name}
          </span>
          <span className="text-xs text-gray-400">
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>
        <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isReply && (
            <button
              onClick={() => {
                setReplyTo(comment)
                inputRef.current?.focus()
              }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              回复
            </button>
          )}
          <button
            onClick={() => handleDelete(comment.id, isReply ? comment.parent_id : null)}
            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-0.5"
          >
            <Trash2 className="h-3 w-3" />
            删除
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="w-80 border-l bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h3 className="text-sm font-semibold text-gray-800">评论</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 rounded p-0.5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Comment List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-8">暂无评论，快来发表第一条吧</div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="border-b border-gray-50 pb-2 last:border-0">
              {renderComment(comment)}
              {comment.replies && comment.replies.length > 0 && (
                <div className="mt-1">
                  {comment.replies.map((reply) => renderComment(reply, true))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="border-t px-3 py-2 shrink-0 bg-gray-50">
        {replyTo && (
          <div className="flex items-center gap-1 mb-1.5 text-xs text-gray-500 bg-gray-100 rounded px-2 py-1">
            <span className="flex-1 truncate">回复 {replyTo.user.display_name}</span>
            <button
              onClick={() => setReplyTo(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="添加评论... (Ctrl+Enter 发送)"
            rows={2}
            className="flex-1 text-xs border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          />
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting}
            className="shrink-0 rounded p-1.5 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <Spinner size="sm" className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
