import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../api/admin';
import type { User } from '../../types';

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string>('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getUsers({ q: search || undefined, page, page_size: pageSize });
      setUsers(res.items || []);
      setTotal(res.total || 0);
    } catch {
      setMsg({ type: 'error', text: '加载用户列表失败' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleRoleChange = async (userId: string, role: 'user' | 'super_admin') => {
    setActionLoading(userId + '_role');
    try {
      const updated = await adminApi.updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => u.id === userId ? updated : u));
      setMsg({ type: 'success', text: '角色已更新' });
    } catch {
      setMsg({ type: 'error', text: '操作失败' });
    } finally {
      setActionLoading('');
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    if (!window.confirm(`确定要重置用户 ${username} 的密码吗？`)) return;
    setActionLoading(userId + '_pwd');
    try {
      const result = await adminApi.resetPassword(userId);
      setMsg({ type: 'success', text: `密码已重置：${result.temp_password}` });
    } catch {
      setMsg({ type: 'error', text: '重置密码失败' });
    } finally {
      setActionLoading('');
      setTimeout(() => setMsg(null), 10000);
    }
  };

  const handleToggleStatus = async (userId: string, isActive: boolean) => {
    const action = isActive ? '禁用' : '启用';
    if (!window.confirm(`确定要${action}此用户吗？`)) return;
    setActionLoading(userId + '_status');
    try {
      const updated = await adminApi.updateUserStatus(userId, !isActive);
      setUsers((prev) => prev.map((u) => u.id === userId ? updated : u));
      setMsg({ type: 'success', text: `用户已${action}` });
    } catch {
      setMsg({ type: 'error', text: '操作失败' });
    } finally {
      setActionLoading('');
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">用户管理</h1>
        <span className="text-sm text-gray-500">共 {total} 位用户</span>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 mb-5">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索用户名或邮箱"
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
          搜索
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
            className="px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition"
          >
            清除
          </button>
        )}
      </form>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">用户</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">邮箱</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">角色</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">状态</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">注册时间</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                    <svg className="animate-spin w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">暂无用户</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 flex-shrink-0">
                          {user.display_name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{user.display_name || user.username}</p>
                          <p className="text-xs text-gray-400">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{user.email}</td>
                    <td className="px-5 py-3">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as 'user' | 'super_admin')}
                        disabled={actionLoading === user.id + '_role'}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="user">普通用户</option>
                        <option value="super_admin">超级管理员</option>
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {user.is_active ? '正常' : '已禁用'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : ''}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResetPassword(user.id, user.username)}
                          disabled={!!actionLoading}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                        >
                          重置密码
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id, user.is_active)}
                          disabled={!!actionLoading}
                          className={`text-xs hover:underline disabled:opacity-50 ${user.is_active ? 'text-red-500' : 'text-green-600'}`}
                        >
                          {user.is_active ? '禁用' : '启用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              第 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} 条，共 {total} 条
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2 py-1 text-sm border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50 transition"
              >
                上一页
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 text-sm border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50 transition"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminUsers;
