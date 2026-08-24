/**
 * LoginPage component tests.
 *
 * Tests rendering, form interaction, validation, and error display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
// Mock the auth store.
//
// vi.mock is hoisted, so there can only be one registration per module per
// file — a second vi.mock inside an it() body silently wins for the whole
// file. Tests that need different store state mutate `storeState` instead.
// ---------------------------------------------------------------------------
const mockLogin = vi.fn()
const storeState = {
  login: mockLogin,
  isLoading: false,
}

vi.mock('../store/authStore', () => ({
  useAuthStore: () => storeState,
}))

// Imported statically: the mock above is hoisted, so it is already in place.
import LoginPage from '../pages/LoginPage'

// ---------------------------------------------------------------------------
// Helper to render with router context
// ---------------------------------------------------------------------------
function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  storeState.isLoading = false
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginPage – rendering', () => {
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
  it('calls login with account and password on submit', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    renderLoginPage()

    await userEvent.type(screen.getByLabelText(/账号\s*\/\s*邮箱/), 'testuser')
    await userEvent.type(screen.getByLabelText(/密码/), 'TestPass123!')
    await userEvent.click(screen.getByRole('button', { name: /登录/ }))

    // The API field is `account`, not `username` — see LoginRequest in types
    // and the backend's LoginSchema.
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'testuser',
          password: 'TestPass123!',
        }),
      )
    })
  })

  it('trims whitespace from the account before submitting', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    renderLoginPage()

    await userEvent.type(screen.getByLabelText(/账号\s*\/\s*邮箱/), '  testuser  ')
    await userEvent.type(screen.getByLabelText(/密码/), 'TestPass123!')
    await userEvent.click(screen.getByRole('button', { name: /登录/ }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({ account: 'testuser' }),
      )
    })
  })

  it('navigates to "/" after a successful login', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    renderLoginPage()

    await userEvent.type(screen.getByLabelText(/账号\s*\/\s*邮箱/), 'testuser')
    await userEvent.type(screen.getByLabelText(/密码/), 'TestPass123!')
    await userEvent.click(screen.getByRole('button', { name: /登录/ }))

    // replace: true so the login page doesn't stay in the history stack.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
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
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe('LoginPage – loading state', () => {
  it('disables the submit button while loading', () => {
    storeState.isLoading = true
    renderLoginPage()
    expect(screen.getByRole('button', { name: /登录/ })).toBeDisabled()
  })
})
