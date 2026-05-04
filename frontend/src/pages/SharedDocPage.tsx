import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
marked.setOptions({ gfm: true, breaks: false })
import apiClient from '../api/client'
import logoUrl from '@/assets/logo.png'
import DocViewer from '@/components/doc/DocViewer'

interface SharedDocData {
  title: string
  content_html: string
  content_md: string
  word_count?: number
  created_by_user?: { display_name?: string; username: string } | null
  updated_by_user?: { display_name?: string; username: string } | null
  updated_at?: string
  share_expiry?: string
}

const fetchSharedDoc = async (shareCode: string, password?: string): Promise<SharedDocData> => {
  const response = await apiClient.get<{ success: boolean; data: SharedDocData }>(
    `/s/${shareCode}`,
    password ? { params: { password } } : undefined,
  )
  return response.data.data
}

const SharedDocPage: React.FC = () => {
  const { shareCode } = useParams<{ shareCode: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<SharedDocData | null>(null)
  const [needPassword, setNeedPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null!)

  const loadDoc = async (pwd?: string) => {
    if (!shareCode) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchSharedDoc(shareCode, pwd)
      setDoc(data)
      setNeedPassword(false)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 401) {
        setNeedPassword(true)
      } else if (status === 410) {
        setError('分享链接已过期')
      } else if (status === 403) {
        setError('无权访问此分享链接')
      } else if (status === 404) {
        setError('分享链接不存在')
      } else {
        setError('加载失败，请稍后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDoc()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareCode])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setPasswordError('请输入访问密码')
      return
    }
    setVerifying(true)
    setPasswordError('')
    try {
      await loadDoc(password)
    } catch {
      setPasswordError('密码错误，请重试')
    } finally {
      setVerifying(false)
    }
  }

  // ── Logo bar (shared across all states) ─────────────────────────────────────
  const LogoBar = () => (
    <header className="h-14 border-b bg-white flex items-center justify-between px-5 sticky top-0 z-20">
      <button
        onClick={() => navigate('/login')}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <img src={logoUrl} alt="KnowFlow" className="h-8 w-8 object-contain" />
        <span className="font-bold text-lg tracking-tight">KnowFlow</span>
      </button>
      <button
        onClick={() => navigate('/login')}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        登录 / 注册
      </button>
    </header>
  )

  if (loading && !needPassword) {
    return (
      <div className="flex h-screen flex-col bg-white">
        <LogoBar />
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-white">
        <LogoBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-primary hover:underline"
          >
            前往登录
          </button>
        </div>
      </div>
    )
  }

  if (needPassword) {
    return (
      <div className="flex h-screen flex-col bg-gray-50">
        <LogoBar />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 rounded-xl mb-4">
                <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">需要访问密码</h2>
              <p className="text-sm text-gray-500 mt-1">此分享链接已设置密码保护</p>
            </div>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">访问密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError('') }}
                  placeholder="请输入访问密码"
                  autoFocus
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${passwordError ? 'border-red-400' : 'border-gray-300'}`}
                />
                {passwordError && <p className="text-xs text-red-500 mt-1">{passwordError}</p>}
              </div>
              <button
                type="submit"
                disabled={verifying}
                className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
              >
                {verifying ? '验证中…' : '确认访问'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (!doc) return null

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <LogoBar />

      {/* Doc content */}
      <div className="flex-1 w-full max-w-3xl mx-auto px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{doc.title || '无标题'}</h1>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-6 pb-6 border-b border-gray-200">
          {doc.created_by_user && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-600 font-medium">
                {(doc.created_by_user.display_name || doc.created_by_user.username)[0].toUpperCase()}
              </div>
              <span>创建者：{doc.created_by_user.display_name || doc.created_by_user.username}</span>
            </div>
          )}
          {doc.updated_by_user && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-xs text-green-600 font-medium">
                {(doc.updated_by_user.display_name || doc.updated_by_user.username)[0].toUpperCase()}
              </div>
              <span>最后编辑：{doc.updated_by_user.display_name || doc.updated_by_user.username}</span>
            </div>
          )}
          {doc.updated_at && (
            <span>{new Date(doc.updated_at).toLocaleString('zh-CN')}</span>
          )}
          {doc.word_count != null && <span>{doc.word_count} 字</span>}
          {doc.share_expiry && (
            <span>有效期至 {new Date(doc.share_expiry).toLocaleDateString('zh-CN')}</span>
          )}
        </div>

        <DocViewer
          content={doc.content_html || (doc.content_md ? (marked.parse(doc.content_md) as string) : '')}
          containerRef={contentRef}
        />
      </div>

      {/* Footer */}
      <footer className="border-t py-4 text-center">
        <p className="text-xs text-gray-400">
          Powered by{' '}
          <button onClick={() => navigate('/login')} className="text-primary hover:underline">
            KnowFlow
          </button>
        </p>
      </footer>
    </div>
  )
}

export default SharedDocPage
