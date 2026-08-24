/**
 * Tests for the real auth store (src/store/authStore.ts).
 *
 * Distinct from auth.test.ts, which exercises an inline fixture store rather
 * than the production one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The store is wrapped in zustand's `persist`, which reaches for
// globalThis.localStorage at module-eval time. Stub it before importing.
const memStore: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (k in memStore ? memStore[k] : null),
  setItem: (k: string, v: string) => {
    memStore[k] = v
  },
  removeItem: (k: string) => {
    delete memStore[k]
  },
  clear: () => {
    for (const k of Object.keys(memStore)) delete memStore[k]
  },
  key: (i: number) => Object.keys(memStore)[i] ?? null,
  get length() {
    return Object.keys(memStore).length
  },
})

const mockLogout = vi.fn()
const mockLogin = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockClearTokens = vi.fn()
const mockGetAccessToken = vi.fn()

vi.mock('@/api/auth', () => ({
  authApi: {
    login: (...a: unknown[]) => mockLogin(...a),
    logout: () => mockLogout(),
    getCurrentUser: () => mockGetCurrentUser(),
  },
}))

vi.mock('@/api/client', () => ({
  default: { post: vi.fn(), get: vi.fn() },
  tokenStorage: {
    getAccessToken: () => mockGetAccessToken(),
    setAccessToken: vi.fn(),
    clearTokens: () => mockClearTokens(),
  },
}))

const { useAuthStore } = await import('@/store/authStore')

const A_USER = { id: 'u1', username: 'alice', email: 'a@x.com', role: 'user' }

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({
    user: null,
    token: null,
    isLoading: false,
    isAuthenticated: false,
  })
})

describe('authStore.logout', () => {
  it('clears state and tokens on success', async () => {
    mockLogout.mockResolvedValueOnce(undefined)
    useAuthStore.setState({ user: A_USER as never, token: 't', isAuthenticated: true })

    await useAuthStore.getState().logout()

    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.token).toBeNull()
    expect(s.isAuthenticated).toBe(false)
    expect(s.isLoading).toBe(false)
    expect(mockClearTokens).toHaveBeenCalled()
  })

  it('resolves and still clears state when the API call fails', async () => {
    // Regression: logout used to re-throw, so Header.handleLogout skipped its
    // navigate('/login') and left an unhandled rejection. Logging out is
    // best-effort server-side — the local session is gone regardless.
    mockLogout.mockRejectedValueOnce(new Error('Network error'))
    useAuthStore.setState({ user: A_USER as never, token: 't', isAuthenticated: true })

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined()

    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.token).toBeNull()
    expect(s.isAuthenticated).toBe(false)
    expect(s.isLoading).toBe(false)
    // Tokens must be dropped locally even though the server never confirmed.
    expect(mockClearTokens).toHaveBeenCalled()
  })
})

describe('authStore.login', () => {
  it('sets the user and clears isLoading on success', async () => {
    mockLogin.mockResolvedValueOnce({ user: A_USER })
    mockGetAccessToken.mockReturnValue('fresh-token')

    await useAuthStore.getState().login({ account: 'alice', password: 'pw' })

    const s = useAuthStore.getState()
    expect(s.user).toEqual(A_USER)
    expect(s.token).toBe('fresh-token')
    expect(s.isAuthenticated).toBe(true)
    expect(s.isLoading).toBe(false)
  })

  it('rethrows and clears isLoading on failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('bad credentials'))

    await expect(
      useAuthStore.getState().login({ account: 'alice', password: 'wrong' }),
    ).rejects.toThrow('bad credentials')

    const s = useAuthStore.getState()
    expect(s.isLoading).toBe(false)
    expect(s.isAuthenticated).toBe(false)
    expect(s.user).toBeNull()
  })
})

describe('authStore.initAuth', () => {
  it('marks the session unauthenticated when no token is stored', async () => {
    mockGetAccessToken.mockReturnValue(null)

    await useAuthStore.getState().initAuth()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(mockGetCurrentUser).not.toHaveBeenCalled()
  })

  it('restores the user when the stored token is valid', async () => {
    mockGetAccessToken.mockReturnValue('stored-token')
    mockGetCurrentUser.mockResolvedValueOnce(A_USER)

    await useAuthStore.getState().initAuth()

    const s = useAuthStore.getState()
    expect(s.user).toEqual(A_USER)
    expect(s.isAuthenticated).toBe(true)
    expect(s.isLoading).toBe(false)
  })

  it('clears tokens when the stored token is rejected', async () => {
    mockGetAccessToken.mockReturnValue('expired-token')
    mockGetCurrentUser.mockRejectedValueOnce(new Error('401'))

    await useAuthStore.getState().initAuth()

    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.isAuthenticated).toBe(false)
    expect(s.isLoading).toBe(false)
    expect(mockClearTokens).toHaveBeenCalled()
  })
})
