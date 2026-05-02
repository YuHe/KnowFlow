import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  sidebarOpen: boolean
  outlineOpen: boolean
  commentPanelOpen: boolean
  versionPanelOpen: boolean
  sharePanelOpen: boolean
  rightPanelTab: 'outline' | 'comments' | 'versions'
  theme: 'light' | 'dark' | 'system'

  // Actions
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleOutline: () => void
  setOutlineOpen: (open: boolean) => void
  toggleCommentPanel: () => void
  setCommentPanelOpen: (open: boolean) => void
  toggleVersionPanel: () => void
  setVersionPanelOpen: (open: boolean) => void
  toggleSharePanel: () => void
  setSharePanelOpen: (open: boolean) => void
  setRightPanelTab: (tab: UiState['rightPanelTab']) => void
  openRightPanel: (tab: UiState['rightPanelTab']) => void
  closeAllPanels: () => void
  setTheme: (theme: UiState['theme']) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      outlineOpen: false,
      commentPanelOpen: false,
      versionPanelOpen: false,
      sharePanelOpen: false,
      rightPanelTab: 'outline',
      theme: 'system',

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

      toggleOutline: () =>
        set((state) => ({
          outlineOpen: !state.outlineOpen,
          commentPanelOpen: false,
          versionPanelOpen: false,
          rightPanelTab: 'outline',
        })),
      setOutlineOpen: (open: boolean) =>
        set({
          outlineOpen: open,
          commentPanelOpen: false,
          versionPanelOpen: false,
          rightPanelTab: 'outline',
        }),

      toggleCommentPanel: () =>
        set((state) => ({
          commentPanelOpen: !state.commentPanelOpen,
          outlineOpen: false,
          versionPanelOpen: false,
          rightPanelTab: 'comments',
        })),
      setCommentPanelOpen: (open: boolean) =>
        set({
          commentPanelOpen: open,
          outlineOpen: false,
          versionPanelOpen: false,
          rightPanelTab: 'comments',
        }),

      toggleVersionPanel: () =>
        set((state) => ({
          versionPanelOpen: !state.versionPanelOpen,
          outlineOpen: false,
          commentPanelOpen: false,
          rightPanelTab: 'versions',
        })),
      setVersionPanelOpen: (open: boolean) =>
        set({
          versionPanelOpen: open,
          outlineOpen: false,
          commentPanelOpen: false,
          rightPanelTab: 'versions',
        }),

      toggleSharePanel: () => set((state) => ({ sharePanelOpen: !state.sharePanelOpen })),
      setSharePanelOpen: (open: boolean) => set({ sharePanelOpen: open }),

      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

      openRightPanel: (tab) => {
        set({
          rightPanelTab: tab,
          outlineOpen: tab === 'outline',
          commentPanelOpen: tab === 'comments',
          versionPanelOpen: tab === 'versions',
        })
      },

      closeAllPanels: () =>
        set({
          outlineOpen: false,
          commentPanelOpen: false,
          versionPanelOpen: false,
          sharePanelOpen: false,
        }),

      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'kf-ui-storage',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
      }),
    },
  ),
)
