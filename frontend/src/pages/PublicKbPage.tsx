import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../api/client';

interface PublicKbData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
}

interface PublicDocItem {
  id: string;
  title: string;
  sort_order: number;
  updated_at: string;
}

const PublicKbPage: React.FC = () => {
  const { kbSlug } = useParams<{ kbSlug: string }>();
  const [kb, setKb] = useState<PublicKbData | null>(null);
  const [docs, setDocs] = useState<PublicDocItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<{ title: string; content_html: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!kbSlug) return;
    setLoading(true);
    apiClient.get<{ success: boolean; data: PublicKbData & { tree: unknown[]; orphan_docs: PublicDocItem[] } }>(`/public/kb/${kbSlug}`)
      .then((res) => {
        const kbData = res.data.data;
        setKb(kbData);
        // Flatten all docs from tree + orphan_docs
        const allDocs: PublicDocItem[] = [...(kbData.orphan_docs || [])];
        const extractDocs = (nodes: unknown[]): void => {
          for (const node of nodes as Array<{ documents?: PublicDocItem[]; children?: unknown[] }>) {
            if (node.documents) allDocs.push(...node.documents);
            if (node.children) extractDocs(node.children);
          }
        };
        extractDocs(kbData.tree || []);
        setDocs(allDocs);
      })
      .catch(() => { setError('知识库不存在或未公开'); })
      .finally(() => setLoading(false));
  }, [kbSlug]);

  const loadDoc = async (docId: string) => {
    if (!kbSlug) return;
    try {
      const res = await apiClient.get<{ success: boolean; data: { title: string; content_html: string; content_md: string } }>(
        `/public/kb/${kbSlug}/docs/${docId}`
      );
      const doc = res.data.data;
      setSelectedDoc({ title: doc.title, content_html: doc.content_html || doc.content_md || '' });
    } catch {
      setSelectedDoc(null);
    }
  };

  if (loading) {
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
      <div className="flex h-screen items-center justify-center flex-col gap-3">
        <p className="text-gray-500">{error}</p>
        <a href="/" className="text-indigo-600 hover:underline text-sm">返回首页</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Bar */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center px-5 gap-3 flex-shrink-0">
        <span className="text-xl">{kb?.icon || '📚'}</span>
        <span className="font-semibold text-gray-900">{kb?.name}</span>
        {kb?.description && (
          <span className="text-sm text-gray-400 hidden md:block">— {kb.description}</span>
        )}
        <div className="flex-1" />
        <Link to="/login" className="text-sm text-indigo-600 hover:underline">登录 KnowFlow</Link>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 border-r border-gray-200 overflow-y-auto flex-shrink-0 bg-gray-50 p-2">
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">暂无文档</p>
          ) : (
            <ul className="space-y-0.5">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <button
                    onClick={() => loadDoc(doc.id)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                      selectedDoc?.title === doc.title
                        ? 'bg-indigo-100 text-indigo-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="truncate">{doc.title || '无标题'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {selectedDoc ? (
            <div className="max-w-3xl mx-auto px-8 py-10">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{selectedDoc.title || '无标题'}</h1>
              <hr className="border-gray-200 mb-6" />
              <div
                className="prose prose-gray max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedDoc.content_html }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <span className="text-5xl mb-4">{kb?.icon || '📚'}</span>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{kb?.name}</h2>
              {kb?.description && <p className="text-gray-500 max-w-md">{kb.description}</p>}
              <p className="text-sm text-gray-400 mt-4">从左侧目录选择文档开始阅读</p>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <div className="h-8 border-t border-gray-100 flex items-center justify-center flex-shrink-0">
        <p className="text-xs text-gray-400">
          Powered by{' '}
          <Link to="/" className="text-indigo-500 hover:underline">KnowFlow</Link>
        </p>
      </div>
    </div>
  );
};

export default PublicKbPage;
