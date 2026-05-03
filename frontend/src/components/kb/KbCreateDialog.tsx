import React, { useState } from 'react'
import { kbApi } from '@/api/kb'
import type { KnowledgeBase, KbCreate } from '@/types'

const EMOJIS = [
  '📚', '📖', '📝', '📄', '🗂', '🗃', '📊', '📈', '🔬', '🧪',
  '💡', '🚀', '🌟', '⚡', '🎯', '🛠', '🔧', '💻', '🌐', '📡',
  '🎨', '🎭', '🎵', '🏆', '🌈', '🌿', '🔐', '🧩', '📦', '🎁',
]

interface KbCreateDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (kb: KnowledgeBase) => void
}

const KbCreateDialog: React.FC<KbCreateDialogProps> = ({ open, onClose, onCreate }) => {
  const [form, setForm] = useState<Required<KbCreate>>({
    name: '',
    description: '',
    icon: '📚',
    icon_url: null,
    visibility: 'private',
  })
  const [nameError, setNameError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameError('')
    setSubmitError('')

    if (!form.name.trim()) {
      setNameError('请输入知识库名称')
      return
    }

    setSubmitting(true)
    try {
      const payload: KbCreate = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        icon: form.icon,
        visibility: form.visibility,
      }
      const result = await kbApi.createKb(payload)
      onCreate(result)
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '创建失败，请重试'
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleOverlayClick = () => {
    if (!submitting) onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">新建知识库</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Icon + Name row */}
          <div className="flex items-start gap-3">
            {/* Emoji Picker */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                title="选择图标"
                className="w-12 h-12 text-2xl border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition flex items-center justify-center"
              >
                {form.icon}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-50 w-64">
                  <div className="grid grid-cols-8 gap-1.5">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({ ...p, icon: emoji }))
                          setShowEmojiPicker(false)
                        }}
                        className={`w-7 h-7 text-lg flex items-center justify-center rounded hover:bg-gray-100 transition ${
                          form.icon === emoji ? 'bg-indigo-50 ring-1 ring-indigo-400' : ''
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Name */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                知识库名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  setForm((p) => ({ ...p, name: e.target.value }))
                  if (nameError) setNameError('')
                }}
                placeholder="给知识库起个名字"
                autoFocus
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  nameError ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="简单描述一下这个知识库的用途（可选）"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">可见性</label>
            <div className="space-y-2">
              {([
                { value: 'private' as const, label: '私有', desc: '仅受邀成员可访问', icon: '🔒' },
                { value: 'public' as const, label: '公开', desc: '任何人都可以查看', icon: '🌐' },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition ${
                    form.visibility === opt.value
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={opt.value}
                    checked={form.visibility === opt.value}
                    onChange={() => setForm((p) => ({ ...p, visibility: opt.value }))}
                    className="text-indigo-600"
                  />
                  <span className="text-lg">{opt.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition"
            >
              {submitting ? '创建中...' : '创建知识库'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default KbCreateDialog
