import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../api/client';

interface SharedDocData {
  title: string;
  content_html: string;
  content_md: string;
  shared_by?: { display_name?: string; username: string };
  share_expiry?: string;
}

const fetchSharedDoc = async (shareCode: string, password?: string): Promise<SharedDocData> => {
  const response = await apiClient.get<{ success: boolean; data: SharedDocData }>(
    `/s/${shareCode}`,
    password ? { params: { password } } : undefined,
  );
  return response.data.data;
};

const SharedDocPage: React.FC = () => {
  const { shareCode } = useParams<{ shareCode: string }>();
  const [doc, setDoc] = useState<SharedDocData | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const loadDoc = async (pwd?: string) => {
    if (!shareCode) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchSharedDoc(shareCode, pwd);
      setDoc(data);
      setNeedPassword(false);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setNeedPassword(true);
      } else if (status === 403) {
        setError('分享链接已失效或已过期');
      } else if (status === 404) {
        setError('分享链接不存在');
      } else {
        setError('加载失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoc();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareCode]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setPasswordError('请输入访问密码');
      return;
    }
    setVerifying(true);
    setPasswordError('');
    try {
      await loadDoc(password);
    } catch {
      setPasswordError('密码错误，请重试');
    } finally {
      setVerifying(false);
    }
  };

  if (loading && !needPassword) {
    return (
      <div className="flex h-screen items-center justify-center">
        <svg className="animate-spin w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-gray-700 font-medium">{error}</p>
        <Link to="/" className="text-indigo-600 hover:underline text-sm">返回首页</Link>
      </div>
    );
  }

  if (needPassword) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-50 rounded-xl mb-4">
              <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">访问受限</h2>
            <p className="text-sm text-gray-500 mt-1">此分享链接需要密码才能访问</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">访问密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                placeholder="请输入访问密码"
                autoFocus
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${passwordError ? 'border-red-400' : 'border-gray-300'}`}
              />
              {passwordError && <p className="text-xs text-red-600 mt-1">{passwordError}</p>}
            </div>
            <button
              type="submit"
              disabled={verifying}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition"
            >
              {verifying ? '验证中...' : '确认访问'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar */}
      <div className="h-12 border-b border-gray-200 flex items-center px-5 gap-2 sticky top-0 bg-white z-10">
        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm text-gray-600 truncate">{doc.title || '共享文档'}</span>
        <div className="flex-1" />
        <Link to="/login" className="text-xs text-indigo-600 hover:underline">登录 KnowFlow</Link>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{doc.title || '无标题'}</h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-6 pb-6 border-b border-gray-200">
          {doc.shared_by && (
            <span>分享者：{doc.shared_by.display_name || doc.shared_by.username}</span>
          )}
          {doc.share_expiry && (
            <span>有效期至：{new Date(doc.share_expiry).toLocaleDateString()}</span>
          )}
        </div>

        <div
          className="prose prose-gray max-w-none"
          dangerouslySetInnerHTML={{ __html: doc.content_html || doc.content_md || '' }}
        />
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-4 text-center">
        <p className="text-xs text-gray-400">
          Powered by{' '}
          <Link to="/" className="text-indigo-500 hover:underline">KnowFlow</Link>
        </p>
      </div>
    </div>
  );
};

export default SharedDocPage;
