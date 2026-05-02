import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { AdminStats, KnowledgeBase } from '../../types';

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentKbs, setRecentKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.getStats(),
      adminApi.getAdminKbs({ page: 1, page_size: 5 }),
    ])
      .then(([statsData, kbsData]) => {
        setStats(statsData);
        setRecentKbs(kbsData.items || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatStorage = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const cards = stats
    ? [
        {
          label: '用户总数',
          value: stats.total_users,
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
          color: 'bg-blue-50 text-blue-600',
        },
        {
          label: '知识库总数',
          value: stats.total_kbs,
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          ),
          color: 'bg-purple-50 text-purple-600',
        },
        {
          label: '文档总数',
          value: stats.total_docs,
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
          color: 'bg-green-50 text-green-600',
        },
        {
          label: '近7日活跃',
          value: stats.active_users_7d,
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          ),
          color: 'bg-orange-50 text-orange-600',
        },
        {
          label: '近30日新增文档',
          value: stats.new_docs_30d,
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          ),
          color: 'bg-teal-50 text-teal-600',
        },
        {
          label: '存储用量',
          value: formatStorage(stats.storage_bytes),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          ),
          color: 'bg-pink-50 text-pink-600',
        },
      ]
    : [];

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">系统概览</h1>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载中...
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {cards.map((card) => (
              <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">{card.label}</span>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                    {card.icon}
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Recent KBs */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">最近创建的知识库</h2>
              <Link to="/admin/kb" className="text-sm text-indigo-600 hover:underline">查看全部</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">知识库</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">文档数</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">可见性</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentKbs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-gray-400">暂无数据</td>
                    </tr>
                  ) : (
                    recentKbs.map((kb) => (
                      <tr key={kb.id} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span>{kb.icon || '📚'}</span>
                            <span className="font-medium text-gray-800">{kb.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{kb.doc_count || 0}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${kb.visibility === 'public' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {kb.visibility === 'public' ? '公开' : '私有'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {kb.created_at ? new Date(kb.created_at).toLocaleDateString() : ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
