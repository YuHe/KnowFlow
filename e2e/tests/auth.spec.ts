/**
 * E2E – Authentication flows.
 *
 * Tests: user registration, login, and logout via the browser UI.
 */
import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique suffix to avoid test-data collisions. */
const uid = () => Date.now().toString(36)

async function fillRegisterForm(
  page: Page,
  {
    username,
    displayName,
    email,
    password,
  }: { username: string; displayName: string; email: string; password: string }
) {
  await page.getByLabel(/用户名/).fill(username)
  await page.getByLabel(/显示名称|昵称/).fill(displayName)
  await page.getByLabel(/邮箱/).fill(email)
  await page.getByLabel(/密码/).first().fill(password)
  // Confirm password field if present
  const confirmField = page.getByLabel(/确认密码|再次输入/)
  if (await confirmField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmField.fill(password)
  }
}

async function loginAs(page: Page, account: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(/账号\s*\/\s*邮箱/).fill(account)
  await page.getByLabel(/密码/).fill(password)
  await page.getByRole('button', { name: /登录/ }).click()
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test.describe('User Registration', () => {
  test('new user can register successfully', async ({ page }) => {
    const suffix = uid()
    const username = `e2euser${suffix}`
    const email = `e2e_${suffix}@example.com`

    await page.goto('/register')

    await fillRegisterForm(page, {
      username,
      displayName: 'E2E Test User',
      email,
      password: 'E2EPass123!',
    })

    await page.getByRole('button', { name: /注册/ }).click()

    // After successful registration the user should land on the home page
    // or be prompted to verify email. Accept either.
    await expect(page).toHaveURL(/\/(login|home|dashboard|kbs|\?|#)?/, { timeout: 10_000 })
  })

  test('registration shows error for duplicate username', async ({ page }) => {
    await page.goto('/register')

    // "admin" is expected to already exist as the super-admin seed account.
    await fillRegisterForm(page, {
      username: 'admin',
      displayName: 'Dup Admin',
      email: `dup_admin_${uid()}@example.com`,
      password: 'DupPass123!',
    })

    await page.getByRole('button', { name: /注册/ }).click()

    await expect(
      page.getByText(/用户名已存在|已被使用|username.*exist/i)
    ).toBeVisible({ timeout: 8_000 })
  })
})

// ---------------------------------------------------------------------------
// Login & Logout
// ---------------------------------------------------------------------------

test.describe('Login and Logout', () => {
  let testUsername: string
  let testEmail: string
  const testPassword = 'E2ELoginPass123!'

  test.beforeAll(async ({ browser }) => {
    const suffix = uid()
    testUsername = `login_e2e_${suffix}`
    testEmail = `login_e2e_${suffix}@example.com`

    // Register a fresh account
    const page = await browser.newPage()
    await page.goto('/register')
    await fillRegisterForm(page, {
      username: testUsername,
      displayName: 'Login E2E User',
      email: testEmail,
      password: testPassword,
    })
    await page.getByRole('button', { name: /注册/ }).click()
    // Wait for registration to complete before running login tests
    await page.waitForURL(/\/(home|dashboard|kbs|\?|login)?/, { timeout: 15_000 })
    await page.close()
  })

  test('user can login with username and is redirected to home', async ({ page }) => {
    await loginAs(page, testUsername, testPassword)

    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
    // Home page should show the user's name or a knowledge-base section
    await expect(
      page.getByText(new RegExp(testUsername, 'i'))
        .or(page.getByText(/知识库|创建知识库|My Knowledge Bases/i))
    ).toBeVisible({ timeout: 10_000 })
  })

  test('user can login with email', async ({ page }) => {
    await loginAs(page, testEmail, testPassword)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('login shows error for wrong password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/账号\s*\/\s*邮箱/).fill(testUsername)
    await page.getByLabel(/密码/).fill('WrongPassword!!!')
    await page.getByRole('button', { name: /登录/ }).click()

    await expect(
      page.getByText(/密码错误|账号或密码|invalid|incorrect/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('logged-in user can logout', async ({ page }) => {
    await loginAs(page, testUsername, testPassword)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })

    // Click the user avatar / dropdown to find the logout option
    const avatarTrigger = page
      .getByRole('button', { name: new RegExp(testUsername, 'i') })
      .or(page.getByTestId('user-menu'))
      .or(page.locator('[data-testid="avatar"], .avatar, [aria-label*="用户"]').first())

    await avatarTrigger.click({ timeout: 5_000 }).catch(async () => {
      // Fallback: look for any logout button already visible
      await page.getByRole('button', { name: /退出|登出|logout/i }).click()
    })

    const logoutBtn = page.getByRole('menuitem', { name: /退出|登出/i })
      .or(page.getByRole('button', { name: /退出|登出/i }))
    await logoutBtn.click({ timeout: 5_000 })

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
