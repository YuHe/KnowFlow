/**
 * LoginPage component tests.
 *
 * Tests rendering, form interaction, validation, and error display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// ---------------------------------------------------------------------------
// Mock react-router-dom's useNavigate
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ---------------------------------------------------------------------------
// Mock the auth store
// ---------------------------------------------------------------------------
const mockLogin = vi.fn()
const mockClearError = vi.fn()

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({
    login: mockLogin,
    isLoading: false,
    error: null,
    clearError: mockClearError,
  }),
}))

// ---------------------------------------------------------------------------
// Helper to render with router context
// ---------------------------------------------------------------------------
function renderLoginPage() {
  // Dynamic import to ensure mocks are in place first
  const LoginPage = require('../pages/LoginPage').default as React.ComponentType
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginPage – rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the KnowFlow brand heading', () => {
    renderLoginPage()
    expect(screen.getByText('KnowFlow')).toBeInTheDocument()
  })

  it('renders the username/email input', () => {
    renderLoginPage()
    expect(screen.getByLabelText(/账号\s*\/\s*邮箱/)).toBeInTheDocument()
  })

  it('renders the password input', () => {
    renderLoginPage()
    expect(screen.getByLabelText(/密码/)).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    renderLoginPage()
    expect(screen.getByRole('button', { name: /登录/ })).toBeInTheDocument()
  })

  it('renders the register link', () => {
    renderLoginPage()
    expect(screen.getByRole('link', { name: /立即注册/ })).toBeInTheDocument()
  })
})

describe('LoginPage – form validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an error when submitting with empty username', async () => {
    renderLoginPage()
    await userEvent.click(screen.getByRole('button', { name: /登录/ }))
    await waitFor(() => {
      expect(screen.getByText(/请输入账号或邮箱/)).toBeInTheDocument()
    })
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('shows an error when submitting with empty password', async () => {
    renderLoginPage()
    await userEvent.type(screen.getByLabelText(/账号\s*\/\s*邮箱/), 'testuser')
    await userEvent.click(screen.getByRole('button', { name: /登录/ }))
    await waitFor(() => {
      expect(screen.getByText(/请输入密码/)).toBeInTheDocument()
    })
    expect(mockLogin).not.toHaveBeenCalled()
  })
})

describe('LoginPage – form submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls login with username and password on submit', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    renderLoginPage()

    await userEvent.type(screen.getByLabelText(/账号\s*\/\s*邮箱/), 'testuser')
    await userEvent.type(screen.getByLabelText(/密码/), 'TestPass123!')
    await userEvent.click(screen.getByRole('button', { name: /登录/ }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'testuser',
          password: 'TestPass123!',
        })
      )
    })
  })

  it('navigates to "/" after a successful login', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    renderLoginPage()

    await userEvent.type(screen.getByLabelText(/账号\s*\/\s*邮箱/), 'testuser')
    await userEvent.type(screen.getByLabelText(/密码/), 'TestPass123!')
    await userEvent.click(screen.getByRole('button', { name: /登录/ }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('displays an error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('登录失败，请检查账号和密码'))
    renderLoginPage()

    await userEvent.type(screen.getByLabelText(/账号\s*\/\s*邮箱/), 'baduser')
    await userEvent.type(screen.getByLabelText(/密码/), 'wrongpassword')
    await userEvent.click(screen.getByRole('button', { name: /登录/ }))

    await waitFor(() => {
      expect(screen.getByText(/登录失败/)).toBeInTheDocument()
    })
  })
})

describe('LoginPage – loading state', () => {
  it('disables the submit button while loading', () => {
    vi.mock('../store/authStore', () => ({
      useAuthStore: () => ({
        login: mockLogin,
        isLoading: true,
        error: null,
        clearError: mockClearError,
      }),
    }))

    // Re-require to pick up updated mock
    vi.resetModules()
    const LoginPage = require('../pages/LoginPage').default as React.ComponentType
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const button = screen.getByRole('button', { name: /登录/ })
    expect(button).toBeDisabled()
  })
})

describe('LoginPage – error from store', () => {
  it('displays an error message passed via the auth store', () => {
    vi.mock('../store/authStore', () => ({
      useAuthStore: () => ({
        login: mockLogin,
        isLoading: false,
        error: '账号或密码错误',
        clearError: mockClearError,
      }),
    }))

    vi.resetModules()
    const LoginPage = require('../pages/LoginPage').default as React.ComponentType
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByText('账号或密码错误')).toBeInTheDocument()
  })
})
