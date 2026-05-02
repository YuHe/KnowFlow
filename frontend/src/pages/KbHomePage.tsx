import React, { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useKbStore } from '@/store/kbStore';
import { useDocStore } from '@/store/docStore';
import { useTreeStore } from '@/store/treeStore';
import DocTree from '@/components/tree/DocTree';

const KbHomePage: React.FC = () => {
  const { kbId } = useParams<{ kbId: string }>();
  const navigate = useNavigate();
  const { currentKb, fetchKbById, isLoadingKbs: kbLoading } = useKbStore();
  const { recentDocs, fetchRecentKbDocs } = useDocStore();
  const { selectedNodeId, selectNode, fetchTree } = useTreeStore();

  useEffect(() => {
    if (kbId) {
      fetchKbById(kbId);
      fetchTree(kbId);
      fetchRecentKbDocs(kbId);
    }
  }, [kbId]);

  useEffect(() => {
    if (selectedNodeId && selectedNodeId.startsWith('doc-') && kbId) {
      const docId = selectedNodeId.replace('doc-', '');
      navigate(`/kb/${kbId}/docs/${docId}`);
      selectNode(null);
    }
  }, [selectedNodeId, kbId]);

  if (kbLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Left Sidebar - Doc Tree */}
      <aside className="w-64 border-r flex flex-col flex-shrink-0 bg-muted/20">
        <div className="px-4 py-3 border-b bg-background">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-lg">{currentKb?.icon || '📚'}</span>
              <span className="text-sm font-semibold truncate">{currentKb?.name}</span>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {kbId && <DocTree kbId={kbId} />}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
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
              onClick={() => navigate(`/kb/${kbId}/docs/new`)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition"
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
                    className="flex items-center gap-3 px-4 py-3 bg-background border rounded-xl hover:border-primary/30 transition"
                  >
                    <svg className="w-4 h-4 text-primary/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{doc.title || '无标题'}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {doc.updated_by_user && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                            {doc.updated_by_user.display_name?.[0] || doc.updated_by_user.username?.[0] || 'U'}
                          </div>
                          <span>{doc.updated_by_user.display_name || doc.updated_by_user.username}</span>
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default KbHomePage;
