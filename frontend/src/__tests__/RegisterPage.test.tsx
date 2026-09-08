/**
 * RegisterPage component tests.
 *
 * Focus: the form's rules must match RegisterRequest in
 * backend/app/schemas/auth.py, and a rejected submit must report the failure on
 * the input that caused it. A 6-character password used to pass here and fail
 * server-side, surfacing as "Request failed with status code 422" under the
 * *username* field.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockRegister = vi.fn()
vi.mock('../api/auth', () => ({
  authApi: {
    register: (...args: unknown[]) => mockRegister(...args),
  },
}))

const mockInitAuth = vi.fn()
vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ initAuth: mockInitAuth }),
}))

// Imported statically: the mocks above are hoisted, so they are already in place.
import RegisterPage from '../pages/RegisterPage'

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <RegisterPage />
    </MemoryRouter>,
  )
}

/** Fill every field, overriding the defaults with `overrides`. */
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Record<'username' | 'displayName' | 'email' | 'password' | 'confirmPassword', string>> = {},
) {
  const values = {
    username: 'newuser',
    displayName: '新用户',
    email: 'newuser@example.com',
    password: 'SecurePass123',
    confirmPassword: 'SecurePass123',
    ...overrides,
  }
  await user.type(screen.getByLabelText('用户名'), values.username)
  await user.type(screen.getByLabelText('显示名称'), values.displayName)
  await user.type(screen.getByLabelText('邮箱'), values.email)
  await user.type(screen.getByLabelText('密码'), values.password)
  await user.type(screen.getByLabelText('确认密码'), values.confirmPassword)
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '立即注册' }))

beforeEach(() => {
  vi.clearAllMocks()
  mockRegister.mockResolvedValue({})
})

describe('RegisterPage – validation matches the backend schema', () => {
  it('rejects a 7-character password without calling the API', async () => {
    const user = userEvent.setup()
    renderRegisterPage()
    await fillForm(user, { password: 'Short12', confirmPassword: 'Short12' })
    await submit(user)

    expect(await screen.findByText('密码至少8位')).toBeInTheDocument()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('accepts an 8-character password', async () => {
    const user = userEvent.setup()
    renderRegisterPage()
    await fillForm(user, { password: 'Short123', confirmPassword: 'Short123' })
    await submit(user)

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1))
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'Short123' }),
    )
  })

  it('accepts a hyphenated username, which the backend allows', async () => {
    const user = userEvent.setup()
    renderRegisterPage()
    await fillForm(user, { username: 'new-user' })
    await submit(user)

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1))
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'new-user' }),
    )
  })

  it('rejects a username containing characters the backend forbids', async () => {
    const user = userEvent.setup()
    renderRegisterPage()
    await fillForm(user, { username: 'new user!' })
    await submit(user)

    expect(
      await screen.findByText('用户名为3-64位字母、数字、下划线或连字符'),
    ).toBeInTheDocument()
    expect(mockRegister).not.toHaveBeenCalled()
  })
})

describe('RegisterPage – server error reporting', () => {
  it('shows a 422 detail under the field it names, not under username', async () => {
    mockRegister.mockRejectedValue({
      response: {
        status: 422,
        data: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: [
              {
                loc: ['body', 'email'],
                msg: 'value is not a valid email address',
                type: 'value_error',
              },
            ],
          },
        },
      },
      message: 'Request failed with status code 422',
    })

    const user = userEvent.setup()
    renderRegisterPage()
    await fillForm(user)
    await submit(user)

    expect(
      await screen.findByText('value is not a valid email address'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Request failed with status code 422'),
    ).not.toBeInTheDocument()
  })

  it('translates a duplicate-user 409 into a form-level message', async () => {
    mockRegister.mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          error: {
            code: 'DUPLICATE_USER',
            message: 'Username or email already exists.',
          },
        },
      },
      message: 'Request failed with status code 409',
    })

    const user = userEvent.setup()
    renderRegisterPage()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByText('用户名或邮箱已被注册')).toBeInTheDocument()
  })

  it('falls back to a generic message when the error carries no envelope', async () => {
    mockRegister.mockRejectedValue(new Error('Network Error'))

    const user = userEvent.setup()
    renderRegisterPage()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByText('注册失败，请重试')).toBeInTheDocument()
  })
})
