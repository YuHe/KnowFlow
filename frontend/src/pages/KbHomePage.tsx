import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useKbStore } from '@/store/kbStore';
import { useDocStore } from '@/store/docStore';
import { useTreeStore } from '@/store/treeStore';
import { docsApi } from '@/api/docs';

const KbHomePage: React.FC = () => {
  const { kbId } = useParams<{ kbId: string }>();
  const navigate = useNavigate();
  const { currentKb, fetchKbById, isLoadingKbs: kbLoading } = useKbStore();
  const { recentDocs, fetchRecentKbDocs } = useDocStore();
  const { fetchTree } = useTreeStore();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateDoc = async () => {
    if (!kbId || isCreating) return;
    setIsCreating(true);
    try {
      const doc = await docsApi.createDoc(kbId, { title: '无标题文档', content_md: '' });
      await fetchTree(kbId);
      await fetchRecentKbDocs(kbId);
      navigate(`/kb/${kbId}/docs/${doc.id}`, { state: { startEditing: true } });
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (kbId) {
      fetchKbById(kbId);
      fetchTree(kbId);
      fetchRecentKbDocs(kbId);
    }
  }, [kbId]);


  if (kbLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-12">
          <div className="text-center mb-12">
            <div className="text-6xl mb-4">{currentKb?.icon || '📚'}</div>
            <h1 className="text-3xl font-bold mb-3">{currentKb?.name}</h1>
            {currentKb?.description && (
              <p className="text-muted-foreground text-base leading-relaxed max-w-lg mx-auto">
                {currentKb.description}
              </p>
            )}
            <div className="flex items-center justify-center gap-4 mt-4 text-sm text-muted-foreground">
              <span>{currentKb?.doc_count || 0} 篇文档</span>
              <span>·</span>
              <span>{currentKb?.member_count || 1} 位成员</span>
              <span>·</span>
              <span>{currentKb?.visibility === 'public' ? '公开' : '私有'}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mb-12">
            <button
              onClick={handleCreateDoc}
              disabled={isCreating}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建文档
            </button>
          </div>

          {recentDocs.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-4">最近更新的文档</h2>
              <div className="space-y-2">
                {recentDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/kb/${kbId}/docs/${doc.id}`}
                    className="flex items-start gap-3 px-4 py-3 bg-background border rounded-xl hover:border-primary/30 transition"
                  >
                    <svg className="w-4 h-4 text-primary/60 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title || '无标题'}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {doc.created_by_user && (
                          <span className="flex items-center gap-1">
                            <span className="inline-flex w-4 h-4 rounded-full bg-primary/10 items-center justify-center text-primary font-medium text-[10px]">
                              {(doc.created_by_user.display_name || doc.created_by_user.username)?.[0]?.toUpperCase()}
                            </span>
                            创建：{doc.created_by_user.display_name || doc.created_by_user.username}
                          </span>
                        )}
                        {doc.created_at && (
                          <span>{new Date(doc.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {doc.updated_by_user && (
                          <span className="flex items-center gap-1">
                            <span className="inline-flex w-4 h-4 rounded-full bg-green-100 items-center justify-center text-green-600 font-medium text-[10px]">
                              {(doc.updated_by_user.display_name || doc.updated_by_user.username)?.[0]?.toUpperCase()}
                            </span>
                            修改：{doc.updated_by_user.display_name || doc.updated_by_user.username}
                          </span>
                        )}
                        {doc.updated_at && (
                          <span>{new Date(doc.updated_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
    </div>
  );
};

export default KbHomePage;
