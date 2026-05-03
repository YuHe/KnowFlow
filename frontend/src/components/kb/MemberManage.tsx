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

const ROLE_DESCS: Record<KbRole, string> = {
  owner: '拥有所有权限，可转让所有权',
  admin: '可管理成员、编辑文档',
  editor: '可创建和编辑文档',
  viewer: '只读权限',
}

const ROLE_BADGE_COLORS: Record<KbRole, string> = {
  owner: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100',
  admin: 'bg-purple-50 text-purple-600 ring-1 ring-purple-100',
  editor: 'bg-blue-50 text-blue-600 ring-1 ring-blue-100',
  viewer: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
}

// Roles that can be assigned by admin/owner (not owner itself)
const ASSIGNABLE_ROLES: KbRole[] = [KB_ROLES.ADMIN, KB_ROLES.EDITOR, KB_ROLES.VIEWER]

function extractErrorMsg(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as any).response
    const d = res?.data
    if (d?.error?.message) return d.error.message
    if (d?.detail) return d.detail
  }
  return fallback
}

const MemberManage: React.FC<MemberManageProps> = ({ kbId, currentRole }) => {
  const [members, setMembers] = useState<KnowledgeBaseMember[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Add member form state
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<KbRole>(KB_ROLES.VIEWER)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  // Inline confirm for removal
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const isOwner = currentRole === KB_ROLES.OWNER
  const canManage = ROLE_LEVELS[currentRole] >= ROLE_LEVELS[KB_ROLES.ADMIN]

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
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
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: updated.role } : m))
      showMsg('success', '角色已更新')
    } catch (err) {
      showMsg('error', extractErrorMsg(err, '更新角色失败'))
    }
  }

  const handleRemove = async (userId: string) => {
    setRemoving(userId)
    try {
      await kbApi.removeMember(kbId, userId)
      setMembers(prev => prev.filter(m => m.user_id !== userId))
      setConfirmRemoveId(null)
      showMsg('success', '成员已移除')
    } catch (err) {
      showMsg('error', extractErrorMsg(err, '移除失败'))
    } finally {
      setRemoving(null)
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    const email = addEmail.trim()
    if (!email) {
      setAddError('请输入邮箱地址')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddError('邮箱格式不正确')
      return
    }
    setAdding(true)
    try {
      const newMember = await kbApi.addMember(kbId, { email, role: addRole })
      setMembers(prev => [...prev, newMember])
      setAddEmail('')
      setAddRole(KB_ROLES.VIEWER)
      showMsg('success', `已添加 ${newMember.user?.display_name || newMember.user?.username || email}`)
    } catch (err) {
      setAddError(extractErrorMsg(err, '添加失败，请检查邮箱是否正确'))
    } finally {
      setAdding(false)
    }
  }

  const getAvatarInitial = (member: KnowledgeBaseMember): string => {
    const name = member.user?.display_name || member.user?.username || ''
    return name.charAt(0).toUpperCase() || 'U'
  }

  const getDisplayName = (member: KnowledgeBaseMember): string =>
    member.user?.display_name || member.user?.username || member.user_id

  // Sort: owner first, then by role level desc, then by name
  const sortedMembers = [...members].sort((a, b) => {
    const la = ROLE_LEVELS[a.role as KbRole] ?? 0
    const lb = ROLE_LEVELS[b.role as KbRole] ?? 0
    if (lb !== la) return lb - la
    return getDisplayName(a).localeCompare(getDisplayName(b))
  })

  return (
    <div className="space-y-6">
      {/* Current user role banner */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span>
          你的角色：
          <span className="font-semibold">{ROLE_LABELS[currentRole]}</span>
          <span className="ml-2 text-indigo-400 text-xs">{ROLE_DESCS[currentRole]}</span>
        </span>
      </div>

      {/* Status message */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border ${
          msg.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg.type === 'success' ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {msg.text}
        </div>
      )}

      {/* Add member — only for admin+ */}
      {canManage && (
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/60">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            添加成员
          </h3>
          <form onSubmit={handleAddMember} className="space-y-2.5">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="email"
                  value={addEmail}
                  onChange={e => { setAddEmail(e.target.value); if (addError) setAddError('') }}
                  placeholder="输入成员邮箱地址"
                  autoComplete="off"
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${
                    addError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300'
                  }`}
                />
                <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <select
                value={addRole}
                onChange={e => setAddRole(e.target.value as KbRole)}
                className="text-sm border border-gray-300 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700"
              >
                {ASSIGNABLE_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition flex-shrink-0 flex items-center gap-1.5"
              >
                {adding ? (
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                {adding ? '添加中...' : '添加'}
              </button>
            </div>
            {addError && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {addError}
              </p>
            )}
            <p className="text-xs text-gray-400">通过注册邮箱添加成员并分配角色权限</p>
          </form>
        </div>
      )}

      {/* Members list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            成员列表
          </h3>
          {!loading && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {members.length} 位成员
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400 text-sm">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            加载中...
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">暂无成员</p>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {sortedMembers.map(member => {
              const displayName = getDisplayName(member)
              const initial = getAvatarInitial(member)
              const isOwnerMember = member.role === KB_ROLES.OWNER
              // Admin can manage non-owner members; only owner can manage admin members
              const canEditThisMember = canManage && !isOwnerMember &&
                (isOwner || member.role !== KB_ROLES.ADMIN)
              const isConfirmingRemove = confirmRemoveId === member.user_id

              return (
                <div
                  key={member.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    isConfirmingRemove ? 'bg-red-50' : 'hover:bg-gray-50/70'
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                    isOwnerMember ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {initial}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {member.user?.email || `@${member.user?.username || member.user_id}`}
                    </p>
                  </div>

                  {/* Role + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isConfirmingRemove ? (
                      /* Inline confirm row */
                      <div className="flex items-center gap-2 animate-in">
                        <span className="text-xs text-red-600 font-medium">确认移除？</span>
                        <button
                          type="button"
                          onClick={() => handleRemove(member.user_id)}
                          disabled={removing === member.user_id}
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition"
                        >
                          {removing === member.user_id ? '移除中...' : '确认'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(null)}
                          className="px-2.5 py-1 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-100 transition"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Role badge or selector */}
                        {!canEditThisMember ? (
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_BADGE_COLORS[member.role as KbRole] || 'bg-gray-100 text-gray-500'}`}>
                            {ROLE_LABELS[member.role as KbRole] || member.role}
                          </span>
                        ) : (
                          <select
                            value={member.role}
                            onChange={e => handleRoleChange(member.user_id, e.target.value as KbRole)}
                            title="调整权限"
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                          >
                            {ASSIGNABLE_ROLES.map(r => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        )}

                        {/* Remove button — available to admin+ for non-owner members they can edit */}
                        {canEditThisMember && (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(member.user_id)}
                            title="移除成员"
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
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

      {/* Role legend */}
      <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
        <p className="text-xs font-medium text-gray-500 mb-2.5">角色权限说明</p>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
          {(Object.keys(ROLE_LABELS) as KbRole[]).map(r => (
            <div key={r} className="flex items-start gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 flex-shrink-0 ${ROLE_BADGE_COLORS[r]}`}>
                {ROLE_LABELS[r]}
              </span>
              <span className="text-xs text-gray-400">{ROLE_DESCS[r]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MemberManage
