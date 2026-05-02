import React, { useEffect, useState, useCallback } from 'react'
import { kbApi } from '@/api/kb'
import type { KnowledgeBaseMember, KbRole } from '@/types'
import { KB_ROLES, ROLE_LEVELS } from '@/types'

interface MemberManageProps {
  kbId: string
  currentRole: KbRole
}

const ROLE_LABELS: Record<KbRole, string> = {
  owner: '所有者',
  admin: '管理员',
  editor: '编辑者',
  viewer: '查看者',
}

const ROLE_BADGE_COLORS: Record<KbRole, string> = {
  owner: 'bg-indigo-50 text-indigo-600',
  admin: 'bg-purple-50 text-purple-600',
  editor: 'bg-blue-50 text-blue-600',
  viewer: 'bg-gray-100 text-gray-600',
}

const ASSIGNABLE_ROLES: KbRole[] = [KB_ROLES.ADMIN, KB_ROLES.EDITOR, KB_ROLES.VIEWER]

const MemberManage: React.FC<MemberManageProps> = ({ kbId, currentRole }) => {
  const [members, setMembers] = useState<KnowledgeBaseMember[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Add member form state
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<KbRole>(KB_ROLES.VIEWER)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const isOwner = currentRole === KB_ROLES.OWNER
  const canManage = ROLE_LEVELS[currentRole] >= ROLE_LEVELS[KB_ROLES.ADMIN]

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
  }

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await kbApi.getMembers(kbId)
      setMembers(data)
    } catch {
      showMsg('error', '加载成员失败')
    } finally {
      setLoading(false)
    }
  }, [kbId])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  const handleRoleChange = async (userId: string, role: KbRole) => {
    try {
      const updated = await kbApi.updateMemberRole(kbId, userId, role)
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role: updated.role } : m))
      )
      showMsg('success', '角色已更新')
    } catch {
      showMsg('error', '更新角色失败')
    }
  }

  const handleRemove = async (userId: string, displayName: string) => {
    if (!window.confirm(`确定要移除成员 ${displayName} 吗？`)) return
    try {
      await kbApi.removeMember(kbId, userId)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
      showMsg('success', '成员已移除')
    } catch {
      showMsg('error', '移除失败')
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    if (!addUserId.trim()) {
      setAddError('请输入用户 ID')
      return
    }
    setAdding(true)
    try {
      const newMember = await kbApi.addMember(kbId, {
        user_id: addUserId.trim(),
        role: addRole,
      })
      setMembers((prev) => [...prev, newMember])
      setAddUserId('')
      setAddRole(KB_ROLES.VIEWER)
      showMsg('success', '成员已添加')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '添加失败'
      setAddError(message)
    } finally {
      setAdding(false)
    }
  }

  const getAvatarInitial = (member: KnowledgeBaseMember): string => {
    const name = member.user?.display_name || member.user?.username || ''
    return name.charAt(0).toUpperCase() || 'U'
  }

  const getDisplayName = (member: KnowledgeBaseMember): string => {
    return member.user?.display_name || member.user?.username || member.user_id
  }

  return (
    <div className="space-y-6">
      {/* Current user's role banner */}
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-700">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span>
          你在此知识库的角色：
          <span className="font-semibold ml-1">{ROLE_LABELS[currentRole]}</span>
        </span>
      </div>

      {/* Status message */}
      {msg && (
        <div
          className={`px-3 py-2 rounded-lg text-sm border ${
            msg.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Members list */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          成员列表
          {!loading && (
            <span className="ml-2 text-xs font-normal text-gray-400">{members.length} 位成员</span>
          )}
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            加载中...
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">暂无成员</p>
        ) : (
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {members.map((member) => {
              const displayName = getDisplayName(member)
              const initial = getAvatarInitial(member)
              const isOwnerMember = member.role === KB_ROLES.OWNER
              const canEditThisMember = canManage && !isOwnerMember

              return (
                <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700 flex-shrink-0">
                    {initial}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
                    <p className="text-xs text-gray-400 truncate">
                      @{member.user?.username || member.user_id}
                    </p>
                  </div>

                  {/* Role + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isOwnerMember || !canEditThisMember ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE_COLORS[member.role]}`}
                      >
                        {ROLE_LABELS[member.role]}
                      </span>
                    ) : (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.user_id, e.target.value as KbRole)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => handleRemove(member.user_id, displayName)}
                            title="移除成员"
                            className="p-1 text-gray-300 hover:text-red-500 rounded transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add member form — only shown to admins and owners */}
      {canManage && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">添加成员</h3>
          <form onSubmit={handleAddMember} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={addUserId}
                onChange={(e) => {
                  setAddUserId(e.target.value)
                  if (addError) setAddError('')
                }}
                placeholder="输入用户 ID (UUID)"
                className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  addError ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as KbRole)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition flex-shrink-0"
              >
                {adding ? '添加中...' : '添加'}
              </button>
            </div>
            {addError && <p className="text-xs text-red-600">{addError}</p>}
            <p className="text-xs text-gray-400">
              请输入成员的用户 ID（UUID 格式），可在用户管理页面查看。
            </p>
          </form>
        </div>
      )}
    </div>
  )
}

export default MemberManage
