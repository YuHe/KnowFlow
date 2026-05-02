import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, LoginRequest } from '@/types'
import { authApi } from '@/api/auth'
import { tokenStorage } from '@/api/client'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean

  // Actions
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User) => void
  initAuth: () => Promise<void>
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (credentials: LoginRequest) => {
        set({ isLoading: true })
        try {
          const response = await authApi.login(credentials)
          const token = tokenStorage.getAccessToken()
          set({
            user: response.user,
            token,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: async () => {
        set({ isLoading: true })
        try {
          await authApi.logout()
        } finally {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          })
        }
      },

      setUser: (user: User) => {
        set({ user })
      },

      initAuth: async () => {
        const token = tokenStorage.getAccessToken()
        if (!token) {
          set({ isAuthenticated: false, user: null, token: null })
          return
        }

        set({ isLoading: true })
        try {
          const user = await authApi.getCurrentUser()
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch {
          tokenStorage.clearTokens()
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          })
        }
      },

      clearAuth: () => {
        tokenStorage.clearTokens()
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        })
      },
    }),
    {
      name: 'kf-auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

// Selector helpers
export const selectUser = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsSuperAdmin = (state: AuthState) =>
  state.user?.role === 'super_admin'
