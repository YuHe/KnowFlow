/**
 * ProfilePage change-password form tests.
 *
 * The rule under test is shared: PASSWORD_MIN_LENGTH must hold here exactly as
 * it does on the register form. This endpoint previously accepted 6 characters
 * while registration demanded 8, so a user could pick a strong password at
 * signup and immediately weaken it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

const mockPost = vi.fn()
vi.mock('../api/client', () => ({
  default: { post: (...args: unknown[]) => mockPost(...args), put: vi.fn(), get: vi.fn() },
}))

vi.mock('../api/favorites', () => ({
  favoritesApi: { getFavorites: vi.fn().mockResolvedValue({ items: [] }) },
}))
vi.mock('../api/templates', () => ({
  templatesApi: { getTemplates: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'u1',
      username: 'tester',
      display_name: '测试用户',
      email: 'tester@example.com',
      role: 'user',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    setUser: vi.fn(),
  }),
}))

// Imported statically: the mocks above are hoisted, so they are already in place.
import ProfilePage from '../pages/ProfilePage'

async function openPasswordTab(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: '修改密码' }))
}

async function fillPasswordForm(
  user: ReturnType<typeof userEvent.setup>,
  newPassword: string,
) {
  await user.type(screen.getByLabelText('当前密码'), 'TestPass123!')
  await user.type(screen.getByLabelText('新密码'), newPassword)
  await user.type(screen.getByLabelText('确认新密码'), newPassword)
  // The tab button and the submit button share the label '修改密码'; the submit
  // is the one inside the form.
  const form = screen.getByLabelText('新密码').closest('form')!
  await user.click(form.querySelector('button[type="submit"]')!)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPost.mockResolvedValue({ data: { success: true, data: null, error: null } })
})

describe('ProfilePage – change password', () => {
  it('rejects a 7-character new password without calling the API', async () => {
    const user = userEvent.setup()
    await openPasswordTab(user)
    await fillPasswordForm(user, 'Short12')

    expect(await screen.findByText('新密码至少8位')).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('accepts a new password at the minimum length', async () => {
    const user = userEvent.setup()
    await openPasswordTab(user)
    await fillPasswordForm(user, 'Short123')

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith('/auth/change-password', {
      current_password: 'TestPass123!',
      new_password: 'Short123',
    })
  })

  it('associates every password input with its label', async () => {
    const user = userEvent.setup()
    await openPasswordTab(user)

    // getByLabelText only resolves through htmlFor/id, so these assertions fail
    // if the association is dropped — leaving three indistinguishable password
    // boxes for anyone using a screen reader.
    for (const label of ['当前密码', '新密码', '确认新密码']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
    }
  })
})
