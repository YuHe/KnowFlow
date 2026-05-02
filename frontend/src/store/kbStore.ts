import { create } from 'zustand'
import type { KnowledgeBase, KnowledgeBaseMember } from '@/types'
import { kbApi } from '@/api/kb'

interface KbState {
  kbs: KnowledgeBase[]
  currentKb: KnowledgeBase | null
  members: KnowledgeBaseMember[]
  isLoadingKbs: boolean
  isLoading: boolean  // alias for isLoadingKbs for page compatibility
  isLoadingMembers: boolean
  error: string | null

  // Actions
  fetchKbs: () => Promise<void>
  fetchKb: (kbId: string) => Promise<void>  // alias for fetchKbById
  setCurrentKb: (kb: KnowledgeBase | null) => void
  fetchKbById: (kbId: string) => Promise<void>
  fetchMembers: (kbId: string) => Promise<void>
  addKb: (kb: KnowledgeBase) => void
  updateKb: (kbId: string, updates: Partial<KnowledgeBase>) => void
  removeKb: (kbId: string) => void
  clearError: () => void
}

export const useKbStore = create<KbState>((set, get) => ({
  kbs: [],
  currentKb: null,
  members: [],
  isLoadingKbs: false,
  isLoading: false,
  isLoadingMembers: false,
  error: null,

  fetchKbs: async () => {
    set({ isLoadingKbs: true, isLoading: true, error: null })
    try {
      const response = await kbApi.getKbList({ page: 1, page_size: 100 })
      const items = Array.isArray(response) ? response : (response as { items?: KnowledgeBase[] }).items ?? []
      set({ kbs: items, isLoadingKbs: false, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch knowledge bases',
        isLoadingKbs: false,
        isLoading: false,
      })
    }
  },

  setCurrentKb: (kb: KnowledgeBase | null) => {
    set({ currentKb: kb })
  },

  fetchKb: async (kbId: string) => {
    return get().fetchKbById(kbId)
  },

  fetchKbById: async (kbId: string) => {
    set({ isLoadingKbs: true, isLoading: true, error: null })
    try {
      const kb = await kbApi.getKbDetail(kbId)
      set({ currentKb: kb, isLoadingKbs: false, isLoading: false })

      // Update in list if present
      const { kbs } = get()
      const idx = kbs.findIndex((k) => k.id === kbId)
      if (idx >= 0) {
        const newKbs = [...kbs]
        newKbs[idx] = kb
        set({ kbs: newKbs })
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch knowledge base',
        isLoadingKbs: false,
        isLoading: false,
      })
    }
  },

  fetchMembers: async (kbId: string) => {
    set({ isLoadingMembers: true })
    try {
      const members = await kbApi.getMembers(kbId)
      set({ members, isLoadingMembers: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch members',
        isLoadingMembers: false,
      })
    }
  },

  addKb: (kb: KnowledgeBase) => {
    set((state) => ({ kbs: [kb, ...state.kbs] }))
  },

  updateKb: (kbId: string, updates: Partial<KnowledgeBase>) => {
    set((state) => ({
      kbs: state.kbs.map((kb) => (kb.id === kbId ? { ...kb, ...updates } : kb)),
      currentKb:
        state.currentKb?.id === kbId ? { ...state.currentKb, ...updates } : state.currentKb,
    }))
  },

  removeKb: (kbId: string) => {
    set((state) => ({
      kbs: state.kbs.filter((kb) => kb.id !== kbId),
      currentKb: state.currentKb?.id === kbId ? null : state.currentKb,
    }))
  },

  clearError: () => set({ error: null }),
}))
