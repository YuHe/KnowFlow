import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../api/admin';
import type { KnowledgeBase } from '../../types';
import KbIcon from '@/components/kb/KbIcon';

const AdminKb: React.FC = () => {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [transferDialog, setTransferDialog] = useState<{ kbId: string; kbName: string } | null>(null);
  const [newOwnerId, setNewOwnerId] = useState('');

  const loadKbs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAdminKbs({ q: search || undefined, page, page_size: pageSize });
      setKbs(res.items || []);
      setTotal(res.total || 0);
    } catch {
      setMsg({ type: 'error', text: '加载知识库列表失败' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { loadKbs(); }, [loadKbs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleDelete = async (kbId: string, kbName: string) => {
    if (!window.confirm(`确定要删除知识库"${kbName}"吗？此操作不可撤销，将删除所有文档。`)) return;
    setActionLoading(kbId);
    try {
      await adminApi.deleteAdminKb(kbId);
      setKbs((prev) => prev.filter((kb) => kb.id !== kbId));
      setTotal((t) => t - 1);
      setMsg({ type: 'success', text: '知识库已删除' });
    } catch {
      setMsg({ type: 'error', text: '删除失败' });
    } finally {
      setActionLoading('');
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferDialog || !newOwnerId.trim()) return;
    setActionLoading(transferDialog.kbId + '_transfer');
    try {
      await adminApi.transferAdminKb(transferDialog.kbId, newOwnerId.trim());
      await loadKbs();
      setTransferDialog(null);
      setNewOwnerId('');
      setMsg({ type: 'success', text: '所有权已转移' });
    } catch {
      setMsg({ type: 'error', text: '转移失败，请检查用户 ID' });
    } finally {
      setActionLoading('');
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">知识库管理</h1>
        <span className="text-sm text-gray-500">共 {total} 个知识库</span>
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
            placeholder="搜索知识库名称"
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">搜索</button>
        {search && (
          <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }} className="px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition">清除</button>
        )}
      </form>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">知识库</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">文档数</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">成员数</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">可见性</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">创建时间</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                  <svg className="animate-spin w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </td></tr>
              ) : kbs.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">暂无知识库</td></tr>
              ) : (
                kbs.map((kb) => (
                  <tr key={kb.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <KbIcon icon={kb.icon || '📚'} iconUrl={kb.icon_url} className="w-6 h-6 flex-shrink-0" emojiClass="text-base" />
                        <div>
                          <p className="font-medium text-gray-800">{kb.name}</p>
                          {kb.description && <p className="text-xs text-gray-400 truncate max-w-xs">{kb.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{kb.doc_count || 0}</td>
                    <td className="px-5 py-3 text-gray-600">{kb.member_count || 1}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${kb.visibility === 'public' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {kb.visibility === 'public' ? '公开' : '私有'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{kb.created_at ? new Date(kb.created_at).toLocaleDateString() : ''}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <a href={`/kb/${kb.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">查看</a>
                        <button onClick={() => setTransferDialog({ kbId: kb.id, kbName: kb.name })} className="text-xs text-orange-500 hover:underline">转移</button>
                        <button
                          onClick={() => handleDelete(kb.id, kb.name)}
                          disabled={actionLoading === kb.id}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          删除
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
            <span className="text-sm text-gray-500">第 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} 条，共 {total} 条</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 text-sm border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50 transition">上一页</button>
              <span className="px-3 py-1 text-sm text-gray-600">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 text-sm border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50 transition">下一页</button>
            </div>
          </div>
        )}
      </div>

      {/* Transfer Dialog */}
      {transferDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">转移所有权</h3>
            <p className="text-sm text-gray-500 mb-4">将知识库「{transferDialog.kbName}」转移给其他用户</p>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新所有者用户 ID</label>
                <input
                  type="text"
                  value={newOwnerId}
                  onChange={(e) => setNewOwnerId(e.target.value)}
                  placeholder="输入用户 UUID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-3 justify-end">
                <button type="button" onClick={() => { setTransferDialog(null); setNewOwnerId(''); }} className="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition">取消</button>
                <button type="submit" disabled={!newOwnerId.trim() || !!actionLoading} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium rounded-lg transition">确认转移</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminKb;
