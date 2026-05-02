import { create } from 'zustand'
import type { Document, DocumentListItem, DocUpdate } from '@/types'
import { docsApi } from '@/api/docs'
import { favoritesApi } from '@/api/favorites'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

interface DocState {
  currentDoc: Document | null
  recentDocs: DocumentListItem[]
  isDirty: boolean
  saveStatus: SaveStatus
  lastSavedAt: Date | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchDoc: (kbId: string, docId: string) => Promise<void>
  fetchRecentKbDocs: (kbId: string) => Promise<void>
  setDoc: (doc: Document | null) => void
  markDirty: () => void
  markSaved: () => void
  markSaving: () => void
  markSaveError: () => void
  updateDocField: <K extends keyof Document>(field: K, value: Document[K]) => void
  autoSave: (kbId: string, docId: string, data: DocUpdate) => Promise<void>
  manualSave: (kbId: string, docId: string, data: DocUpdate) => Promise<void>
  toggleFavorite: (docId: string) => Promise<void>
  clearDoc: () => void
}

export const useDocStore = create<DocState>((set, get) => ({
  currentDoc: null,
  recentDocs: [],
  isDirty: false,
  saveStatus: 'saved',
  lastSavedAt: null,
  isLoading: false,
  error: null,

  fetchDoc: async (_kbId: string, docId: string) => {
    set({ isLoading: true, error: null })
    try {
      const doc = await docsApi.getDoc(docId)
      set({ currentDoc: doc, isLoading: false, isDirty: false, saveStatus: 'saved' })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch doc', isLoading: false })
    }
  },

  fetchRecentKbDocs: async (kbId: string) => {
    try {
      const result = await docsApi.getDocs(kbId, { page: 1, page_size: 10 })
      const items = Array.isArray(result) ? result : (result as { items?: DocumentListItem[] }).items ?? []
      set({ recentDocs: items })
    } catch {
      // non-critical, ignore
    }
  },

  setDoc: (doc: Document | null) => {
    set({
      currentDoc: doc,
      isDirty: false,
      saveStatus: 'saved',
      lastSavedAt: null,
      error: null,
    })
  },

  markDirty: () => {
    set({ isDirty: true, saveStatus: 'unsaved' })
  },

  markSaved: () => {
    set({ isDirty: false, saveStatus: 'saved', lastSavedAt: new Date() })
  },

  markSaving: () => {
    set({ saveStatus: 'saving' })
  },

  markSaveError: () => {
    set({ saveStatus: 'error' })
  },

  updateDocField: <K extends keyof Document>(field: K, value: Document[K]) => {
    const { currentDoc } = get()
    if (!currentDoc) return
    set({
      currentDoc: { ...currentDoc, [field]: value },
      isDirty: true,
      saveStatus: 'unsaved',
    })
  },

  autoSave: async (_kbId: string, docId: string, data: DocUpdate) => {
    const { saveStatus } = get()
    if (saveStatus === 'saving') return

    set({ saveStatus: 'saving' })
    try {
      const updated = await docsApi.updateDoc(docId, {
        ...data,
        is_manual_save: false,
      })
      set({
        currentDoc: updated,
        isDirty: false,
        saveStatus: 'saved',
        lastSavedAt: new Date(),
      })
    } catch (error) {
      set({ saveStatus: 'error', error: error instanceof Error ? error.message : 'Save failed' })
    }
  },

  manualSave: async (_kbId: string, docId: string, data: DocUpdate) => {
    set({ saveStatus: 'saving' })
    try {
      const updated = await docsApi.updateDoc(docId, {
        ...data,
        is_manual_save: true,
      })
      set({
        currentDoc: updated,
        isDirty: false,
        saveStatus: 'saved',
        lastSavedAt: new Date(),
      })
    } catch (error) {
      set({ saveStatus: 'error', error: error instanceof Error ? error.message : 'Save failed' })
      throw error
    }
  },

  toggleFavorite: async (docId: string) => {
    try {
      await favoritesApi.addFavorite(docId)
    } catch {
      // If it fails (e.g. already favorited), try removing
      try {
        await favoritesApi.removeFavorite(docId)
      } catch {
        // ignore
      }
    }
  },

  clearDoc: () => {
    set({
      currentDoc: null,
      isDirty: false,
      saveStatus: 'saved',
      lastSavedAt: null,
      error: null,
    })
  },
}))
