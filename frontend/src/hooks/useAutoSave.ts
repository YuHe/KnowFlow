import { useState, useRef, useCallback, useEffect } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unsaved';

/**
 * Content to save, or a function producing it.
 *
 * The lazy form exists so the editor does not have to serialize the whole
 * document on every keystroke: `editor.getHTML()` is a full DOM serialization,
 * and with a large document (or an image inlined as a data URL) that ran once
 * per transaction while only the debounced save ever consumed the result.
 */
export type SaveContent = string | (() => string);

const resolveContent = (content: SaveContent): string =>
  typeof content === 'function' ? content() : content;

interface UseAutoSaveOptions {
  onSave: (content: string, createVersion?: boolean) => Promise<void>;
  onManualSave?: (content: string) => Promise<void>;
  editor: any | null;
  /**
   * Reads the current content when there is no TipTap instance to ask.
   *
   * An HTML document is edited as source, so it has no editor; without this
   * Ctrl+S would silently do nothing there. Preferred over `editor` when given.
   */
  getContent?: () => string;
  debounceMs?: number;
}

export function useAutoSave({
  onSave,
  onManualSave,
  editor,
  getContent,
  debounceMs = 2000,
}: UseAutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContentRef = useRef<SaveContent | null>(null);
  const isSavingRef = useRef(false);

  const doSave = useCallback(
    async (content: SaveContent, createVersion = false) => {
      if (isSavingRef.current && !createVersion) return;  // only skip for auto-save, not manual
      isSavingRef.current = true;
      setSaveStatus('saving');
      try {
        const html = resolveContent(content);
        if (createVersion && onManualSave) {
          await onManualSave(html);
        } else {
          await onSave(html, createVersion);
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
    (content: SaveContent) => {
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
    async (content: SaveContent) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      await doSave(content, true);
    },
    [doSave]
  );

  // Force-save without creating version (e.g., before unload)
  const forceSave = useCallback(
    async (content: SaveContent) => {
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
        if (getContent) {
          await triggerManualSave(getContent);
        } else if (editor) {
          await triggerManualSave(editor.getHTML());
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor, getContent, triggerManualSave]);

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
