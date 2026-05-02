/**
 * Auth store tests.
 *
 * Tests the Zustand auth store's login, logout, and token-refresh flows
 * by mocking the axios API client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock axios / api client before importing anything that depends on it
// ---------------------------------------------------------------------------
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  }
  return { default: mockAxios }
})

// Mock the api client module (adjust path if different)
const mockApiPost = vi.fn()
const mockApiGet = vi.fn()

vi.mock('@/api/client', () => ({
  default: {
    post: mockApiPost,
    get: mockApiGet,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  tokenStorage: {
    getAccessToken: vi.fn(),
    setAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    setRefreshToken: vi.fn(),
    clearTokens: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Minimal auth store implementation for testing purposes.
// Replace with the real store import once it exists:
//   import { useAuthStore } from '@/store/authStore'
// ---------------------------------------------------------------------------

import { create } from 'zustand'

interface AuthUser {
  id: string
  username: string
  email: string
  role: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean
  error: string | null
  login: (credentials: { username: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  clearError: () => void
}

const createAuthStore = () =>
  create<AuthState>((set) => ({
    user: null,
    accessToken: null,
    isLoading: false,
    error: null,

    login: async ({ username, password }) => {
      set({ isLoading: true, error: null })
      try {
        const response = await mockApiPost('/auth/login', { account: username, password })
        const { access_token, user } = response.data
        set({ user, accessToken: access_token, isLoading: false })
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Login failed'
        set({ isLoading: false, error: message })
        throw new Error(message)
      }
    },

    logout: async () => {
      set({ isLoading: true })
      try {
        await mockApiPost('/auth/logout')
      } finally {
        set({ user: null, accessToken: null, isLoading: false, error: null })
      }
    },

    refreshToken: async () => {
      try {
        const response = await mockApiPost('/auth/refresh', { refresh_token: 'stored-refresh' })
        const { access_token } = response.data
        set({ accessToken: access_token })
      } catch {
        set({ user: null, accessToken: null })
      }
    },

    clearError: () => set({ error: null }),
  }))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth store – login', () => {
  let useAuthStore: ReturnType<typeof createAuthStore>

  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore = createAuthStore()
  })

  it('sets user and accessToken on successful login', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        access_token: 'test-token-abc',
        user: { id: '1', username: 'alice', email: 'alice@example.com', role: 'user' },
      },
    })

    const store = useAuthStore.getState()
    await store.login({ username: 'alice', password: 'Password123' })

    const state = useAuthStore.getState()
    expect(state.user?.username).toBe('alice')
    expect(state.accessToken).toBe('test-token-abc')
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('sets error state on failed login', async () => {
    mockApiPost.mockRejectedValueOnce({
      response: { data: { detail: 'Invalid credentials' } },
    })

    const store = useAuthStore.getState()
    await expect(store.login({ username: 'alice', password: 'wrong' })).rejects.toThrow()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.error).toBe('Invalid credentials')
    expect(state.isLoading).toBe(false)
  })

  it('clearError resets the error field', async () => {
    mockApiPost.mockRejectedValueOnce({
      response: { data: { detail: 'Error' } },
    })

    const store = useAuthStore.getState()
    try {
      await store.login({ username: 'x', password: 'y' })
    } catch {
      // expected
    }

    useAuthStore.getState().clearError()
    expect(useAuthStore.getState().error).toBeNull()
  })
})

describe('Auth store – logout', () => {
  let useAuthStore: ReturnType<typeof createAuthStore>

  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore = createAuthStore()

    // Pre-populate an authenticated state
    useAuthStore.setState({
      user: { id: '1', username: 'alice', email: 'alice@example.com', role: 'user' },
      accessToken: 'existing-token',
    })
  })

  it('clears user and token after logout', async () => {
    mockApiPost.mockResolvedValueOnce({ data: {} })

    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
  })

  it('clears state even if logout API call fails', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Network error'))

    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
  })
})

describe('Auth store – token refresh', () => {
  let useAuthStore: ReturnType<typeof createAuthStore>

  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore = createAuthStore()
  })

  it('updates accessToken on successful refresh', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: { access_token: 'refreshed-token' },
    })

    await useAuthStore.getState().refreshToken()

    expect(useAuthStore.getState().accessToken).toBe('refreshed-token')
  })

  it('clears user and token on refresh failure', async () => {
    useAuthStore.setState({
      user: { id: '1', username: 'alice', email: 'alice@example.com', role: 'user' },
      accessToken: 'old-token',
    })

    mockApiPost.mockRejectedValueOnce(new Error('Refresh failed'))

    await useAuthStore.getState().refreshToken()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
  })
})
