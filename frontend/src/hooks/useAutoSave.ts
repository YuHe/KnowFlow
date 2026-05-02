import { useState, useRef, useCallback, useEffect } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unsaved';

interface UseAutoSaveOptions {
  onSave: (content: string, createVersion?: boolean) => Promise<void>;
  onManualSave?: (content: string) => Promise<void>;
  editor: any | null;
  debounceMs?: number;
}

export function useAutoSave({
  onSave,
  onManualSave,
  editor,
  debounceMs = 2000,
}: UseAutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContentRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);

  const doSave = useCallback(
    async (content: string, createVersion = false) => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setSaveStatus('saving');
      try {
        if (createVersion && onManualSave) {
          await onManualSave(content);
        } else {
          await onSave(content, createVersion);
        }
        setSaveStatus('saved');
        pendingContentRef.current = null;
      } catch (err) {
        setSaveStatus('error');
        console.error('[AutoSave] Save failed:', err);
      } finally {
        isSavingRef.current = false;
      }
    },
    [onSave, onManualSave]
  );

  // Debounced auto-save (does NOT create version)
  const triggerSave = useCallback(
    (content: string) => {
      setSaveStatus('unsaved');
      pendingContentRef.current = content;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        doSave(content, false);
      }, debounceMs);
    },
    [doSave, debounceMs]
  );

  // Manual save: creates a version snapshot
  const triggerManualSave = useCallback(
    async (content: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      await doSave(content, true);
    },
    [doSave]
  );

  // Force-save without creating version (e.g., before unload)
  const forceSave = useCallback(
    async (content: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      await doSave(content, false);
    },
    [doSave]
  );

  // Ctrl+S / Cmd+S → manual save (creates version)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (editor) {
          await triggerManualSave(editor.getHTML());
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor, triggerManualSave]);

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved' && pendingContentRef.current) {
        forceSave(pendingContentRef.current);
        e.preventDefault();
        e.returnValue = '您有未保存的更改，确定要离开吗？';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus, forceSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return { saveStatus, triggerSave, triggerManualSave, forceSave };
}
