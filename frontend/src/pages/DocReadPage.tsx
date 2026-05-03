import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDocStore } from '@/store/docStore';
import { useKbStore } from '@/store/kbStore';
import { favoritesApi } from '@/api/favorites';
import DocViewer from '@/components/doc/DocViewer';
import OutlinePanel from '@/components/doc/OutlinePanel';
import CommentPanel from '@/components/doc/CommentPanel';
import SharePanel from '@/components/doc/SharePanel';
import VersionList from '@/components/doc/VersionList';
import ExportMenu from '@/components/doc/ExportMenu';
import { ROLE_LEVELS } from '@/types';
import { toast } from '@/components/ui/use-toast';

type PanelType = 'comments' | 'share' | 'versions' | null;

const DocReadPage: React.FC = () => {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>();
  const navigate = useNavigate();
  const { currentDoc, fetchDoc, isLoading } = useDocStore();
  const { currentKb } = useKbStore();
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [showOutline, setShowOutline] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (kbId && docId) {
      fetchDoc(kbId, docId);
    }
  }, [kbId, docId]);

  const handleToggleFavorite = async () => {
    if (!currentDoc) return;
    try {
      if (isFavorited) {
        await favoritesApi.removeFavorite(currentDoc.id);
        setIsFavorited(false);
        toast({ title: '已取消收藏' });
      } else {
        await favoritesApi.addFavorite(currentDoc.id);
        setIsFavorited(true);
        toast({ title: '已添加到收藏' });
      }
    } catch {
      toast({ title: '操作失败', variant: 'destructive' });
    }
  };

  const togglePanel = (panel: PanelType) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!currentDoc) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <p className="text-gray-500">文档不存在或已被删除</p>
        <Link to={`/kb/${kbId}`} className="text-indigo-600 hover:underline text-sm">返回知识库</Link>
      </div>
    );
  }

  const content = currentDoc.content_html || currentDoc.content_md || '';
  const wordCount = currentDoc.word_count || 0;

  return (
    <div className="flex h-full bg-white overflow-hidden">
      {/* Main Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Action Bar */}
        <div className="h-12 border-b border-gray-200 flex items-center px-4 gap-2 flex-shrink-0 bg-white">
          <Link
            to={`/kb/${kbId}`}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition mr-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </Link>

          <div className="flex-1" />

          {/* Can edit if role is editor or above */}
          {(ROLE_LEVELS[currentKb?.my_role ?? ''] ?? 0) >= ROLE_LEVELS['editor'] && (
            <button
              onClick={() => navigate(`/kb/${kbId}/docs/${docId}/edit`)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              编辑
            </button>
          )}

          <button
            onClick={handleToggleFavorite}
            className={`p-1.5 rounded-lg transition hover:bg-gray-100 ${isFavorited ? 'text-yellow-500' : 'text-gray-400'}`}
            title="收藏"
          >
            <svg className="w-4 h-4" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>

          <button
            onClick={() => togglePanel('comments')}
            className={`p-1.5 rounded-lg transition hover:bg-gray-100 ${activePanel === 'comments' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400'}`}
            title="评论"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>

          <button
            onClick={() => togglePanel('share')}
            className={`p-1.5 rounded-lg transition hover:bg-gray-100 ${activePanel === 'share' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400'}`}
            title="分享"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>

          <button
            onClick={() => togglePanel('versions')}
            className={`p-1.5 rounded-lg transition hover:bg-gray-100 ${activePanel === 'versions' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400'}`}
            title="历史版本"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <ExportMenu docId={currentDoc.id} kbId={kbId!} docTitle={currentDoc.title} />

          <button
            onClick={() => setShowOutline((v) => !v)}
            className={`p-1.5 rounded-lg transition hover:bg-gray-100 ${showOutline ? 'bg-gray-100 text-gray-700' : 'text-gray-400'}`}
            title="大纲"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h8M4 18h8" />
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {/* Doc Content */}
          <div className="flex-1 overflow-y-auto" ref={contentRef}>
            <div className="max-w-3xl mx-auto px-8 py-10">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{currentDoc.title || '无标题'}</h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-6 pb-6 border-b border-gray-200">
                {currentDoc.created_by_user && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-600 font-medium">
                      {currentDoc.created_by_user.display_name?.[0] || 'U'}
                    </div>
                    <span>创建者：{currentDoc.created_by_user.display_name || currentDoc.created_by_user.username}</span>
                  </div>
                )}
                {currentDoc.updated_by_user && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-xs text-green-600 font-medium">
                      {currentDoc.updated_by_user.display_name?.[0] || 'U'}
                    </div>
                    <span>最后编辑：{currentDoc.updated_by_user.display_name || currentDoc.updated_by_user.username}</span>
                  </div>
                )}
                {currentDoc.updated_at && (
                  <span>{new Date(currentDoc.updated_at).toLocaleString()}</span>
                )}
                <span>{wordCount} 字</span>
              </div>

              <DocViewer content={content} containerRef={contentRef} />
            </div>
          </div>

          {/* Outline Panel */}
          {showOutline && (
            <div className="w-52 flex-shrink-0 border-l border-gray-200 overflow-y-auto bg-gray-50/50">
              <OutlinePanel content={content} containerRef={contentRef} />
            </div>
          )}
        </div>
      </div>

      {/* Right Panels */}
      {activePanel === 'comments' && (
        <CommentPanel docId={currentDoc.id} kbId={kbId!} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'share' && (
        <SharePanel docId={currentDoc.id} kbId={kbId!} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'versions' && (
        <VersionList docId={currentDoc.id} kbId={kbId!} onClose={() => setActivePanel(null)} />
      )}
    </div>
  );
};

export default DocReadPage;
