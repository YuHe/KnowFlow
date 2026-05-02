import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Editor } from '@tiptap/react';
import EditorCore from '@/components/editor/EditorCore';
import EditorToolbar from '@/components/editor/EditorToolbar';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useDocStore } from '@/store/docStore';
import { docsApi } from '@/api/docs';

const saveStatusLabels: Record<string, string> = {
  idle: '',
  saved: '已保存',
  saving: '保存中...',
  unsaved: '未保存',
  error: '保存失败',
};
const saveStatusColors: Record<string, string> = {
  idle: 'text-muted-foreground',
  saved: 'text-green-600',
  saving: 'text-blue-500',
  unsaved: 'text-orange-500',
  error: 'text-red-500',
};

const DocEditPage: React.FC = () => {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>();
  const navigate = useNavigate();
  const { setDoc, markDirty } = useDocStore();
  const [title, setTitle] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  // Load document on mount
  useEffect(() => {
    if (docId && docId !== 'new') {
      docsApi.getDoc(docId).then((doc) => {
        setDoc(doc);
        setTitle(doc.title || '');
        setInitialContent(doc.content_html || doc.content_md || '');
      });
    }
  }, [docId, setDoc]);

  // Auto-save callbacks
  const handleAutoSave = useCallback(
    async (html: string) => {
      if (!docId || docId === 'new' || !kbId) return;
      const md = editorInstance?.getText() || '';
      await docsApi.updateDoc(docId, {
        title: titleRef.current,
        content_html: html,
        content_md: md,
        word_count: md.length,
        is_manual_save: false,
      });
    },
    [docId, kbId, editorInstance]
  );

  const handleManualSave = useCallback(
    async (html: string) => {
      if (!docId || docId === 'new' || !kbId) return;
      const md = editorInstance?.getText() || '';
      await docsApi.updateDoc(docId, {
        title: titleRef.current,
        content_html: html,
        content_md: md,
        word_count: md.length,
        is_manual_save: true,
      });
    },
    [docId, kbId, editorInstance]
  );

  const { saveStatus, triggerSave, triggerManualSave } = useAutoSave({
    onSave: handleAutoSave,
    onManualSave: handleManualSave,
    editor: editorInstance,
  });

  const handleEditorUpdate = useCallback(
    (html: string, wc: number) => {
      setWordCount(wc);
      markDirty();
      triggerSave(html);
    },
    [markDirty, triggerSave]
  );

  const handleExit = () => {
    if (kbId && docId && docId !== 'new') {
      navigate(`/kb/${kbId}/docs/${docId}`);
    } else {
      navigate(`/kb/${kbId}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="h-12 border-b flex items-center px-4 gap-3 flex-shrink-0 z-10 bg-background">
        <button
          onClick={handleExit}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          退出编辑
        </button>
        <div className="flex-1" />
        <span className={`text-xs ${saveStatusColors[saveStatus]}`}>
          {saveStatusLabels[saveStatus]}
        </span>
        <button
          onClick={() => editorInstance && triggerManualSave(editorInstance.getHTML())}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition"
        >
          保存版本 (Ctrl+S)
        </button>
      </div>

      {/* Toolbar */}
      {editorInstance && <EditorToolbar editor={editorInstance} />}

      {/* Editor Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editorInstance?.commands.focus(); } }}
            placeholder="无标题文档"
            className="w-full text-3xl font-bold border-none outline-none mb-4 placeholder:text-muted-foreground/40 bg-transparent"
          />
          <hr className="mb-6" />
          {kbId && (
            <EditorCore
              content={initialContent}
              kbId={kbId}
              onEditorReady={(ed) => setEditorInstance(ed)}
              onUpdate={handleEditorUpdate}
              editable={true}
            />
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-8 border-t flex items-center px-4 gap-4 flex-shrink-0 bg-muted/30">
        <span className="text-xs text-muted-foreground">{wordCount} 字</span>
        <span className="text-xs text-muted-foreground">|</span>
        <span className="text-xs text-muted-foreground">Ctrl+S 保存版本</span>
        <span className="text-xs text-muted-foreground">|</span>
        <span className="text-xs text-muted-foreground">自动保存已开启（2秒）</span>
      </div>
    </div>
  );
};

export default DocEditPage;
