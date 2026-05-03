import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { favoritesApi } from '../api/favorites';
import { templatesApi } from '../api/templates';
import apiClient from '../api/client';
import type { ApiResponse, User, DocumentFavorite, DocumentTemplate } from '../types';

type TabType = 'profile' | 'password' | 'favorites' | 'templates';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>((location.state?.defaultTab as TabType) || 'profile');
  const [profileForm, setProfileForm] = useState({
    display_name: user?.display_name || '',
    email: user?.email || '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [favorites, setFavorites] = useState<DocumentFavorite[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (activeTab === 'favorites') {
      favoritesApi.getFavorites().then((data) => setFavorites(data.items || [])).catch(() => {});
    }
    if (activeTab === 'templates') {
      templatesApi.getTemplates().then((data) => setTemplates(data || [])).catch(() => {});
    }
  }, [activeTab]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProfileMsg(null);
    try {
      const response = await apiClient.put<ApiResponse<User>>('/auth/me', {
        display_name: profileForm.display_name,
        email: profileForm.email,
      });
      setUser(response.data.data);
      setProfileMsg({ type: 'success', text: '个人信息已更新' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err?.response?.data?.error?.message || '更新失败' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrors({});
    setPasswordMsg(null);

    const errs: Record<string, string> = {};
    if (!passwordForm.currentPassword) errs.currentPassword = '请输入当前密码';
    if (!passwordForm.newPassword) errs.newPassword = '请输入新密码';
    else if (passwordForm.newPassword.length < 6) errs.newPassword = '新密码至少6位';
    if (passwordForm.newPassword !== passwordForm.confirmPassword) errs.confirmPassword = '两次密码不一致';
    if (Object.keys(errs).length > 0) { setPasswordErrors(errs); return; }

    setSaving(true);
    try {
      await apiClient.post('/auth/change-password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      });
      setPasswordMsg({ type: 'success', text: '密码已修改' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err?.response?.data?.error?.message || '修改失败，请检查当前密码' });
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: TabType; label: string }[] = [
    { key: 'profile', label: '基本信息' },
    { key: 'password', label: '修改密码' },
    { key: 'favorites', label: '我的收藏' },
    { key: 'templates', label: '我的模板' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">个人中心</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Avatar + Basic */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-indigo-200 flex items-center justify-center text-2xl font-bold text-indigo-700 flex-shrink-0">
            {user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{user?.display_name || user?.username}</p>
            <p className="text-sm text-gray-500">@{user?.username}</p>
            {user?.email && <p className="text-sm text-gray-400 mt-0.5">{user.email}</p>}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium transition border-b-2 ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                  <input
                    type="text"
                    value={user?.username || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">用户名不可修改</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
                  <input
                    type="text"
                    value={profileForm.display_name}
                    onChange={(e) => setProfileForm((p) => ({ ...p, display_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                {profileMsg && (
                  <div className={`p-3 rounded-lg text-sm ${profileMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {profileMsg.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition"
                >
                  {saving ? '保存中...' : '保存更改'}
                </button>
              </form>
            )}

            {/* Password Tab */}
            {activeTab === 'password' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">当前密码</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${passwordErrors.currentPassword ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  {passwordErrors.currentPassword && <p className="text-xs text-red-600 mt-1">{passwordErrors.currentPassword}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${passwordErrors.newPassword ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  {passwordErrors.newPassword && <p className="text-xs text-red-600 mt-1">{passwordErrors.newPassword}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${passwordErrors.confirmPassword ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  {passwordErrors.confirmPassword && <p className="text-xs text-red-600 mt-1">{passwordErrors.confirmPassword}</p>}
                </div>

                {passwordMsg && (
                  <div className={`p-3 rounded-lg text-sm ${passwordMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {passwordMsg.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition"
                >
                  {saving ? '修改中...' : '修改密码'}
                </button>
              </form>
            )}

            {/* Favorites Tab */}
            {activeTab === 'favorites' && (
              <div>
                {favorites.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">暂无收藏文档</div>
                ) : (
                  <div className="space-y-2">
                    {favorites.map((fav) => (
                      <div
                        key={fav.id}
                        onClick={() => {
                          const kbId = fav.document?.knowledge_base_id
                          const docId = fav.document_id
                          if (kbId) navigate(`/kb/${kbId}/docs/${docId}`)
                        }}
                        className="flex items-center gap-3 px-4 py-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition cursor-pointer"
                      >
                        <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{fav.document?.title || fav.doc_title || '无标题'}</p>
                          {fav.kb_name && <p className="text-xs text-gray-400">{fav.kb_name}</p>}
                        </div>
                        <span className="text-xs text-gray-400">
                          {fav.created_at ? new Date(fav.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <div>
                {templates.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">暂无自定义模板</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {templates.map((tpl) => (
                      <div key={tpl.id} className="border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition">
                        <p className="text-sm font-medium text-gray-800 mb-1">{tpl.name}</p>
                        <p className="text-xs text-gray-400 line-clamp-2">{tpl.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
