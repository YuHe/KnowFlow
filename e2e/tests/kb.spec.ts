/**
 * E2E – Knowledge Base flows.
 *
 * Tests: create KB, navigate into KB, create doc, edit doc, save doc.
 */
import { test, expect, type Page, type Browser } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = () => Date.now().toString(36)

async function register(
  browser: Browser,
  username: string,
  email: string,
  password: string
) {
  const page = await browser.newPage()
  await page.goto('/register')
  await page.getByLabel(/用户名/).fill(username)

  const displayField = page.getByLabel(/显示名称|昵称/)
  if (await displayField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await displayField.fill(username)
  }
  await page.getByLabel(/邮箱/).fill(email)
  await page.getByLabel(/密码/).first().fill(password)
  const confirmField = page.getByLabel(/确认密码|再次输入/)
  if (await confirmField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmField.fill(password)
  }
  await page.getByRole('button', { name: /注册/ }).click()
  await page.waitForURL(/\/(home|dashboard|kbs|\?|login)?/, { timeout: 15_000 })
  await page.close()
}

async function loginAs(page: Page, account: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(/账号\s*\/\s*邮箱/).fill(account)
  await page.getByLabel(/密码/).fill(password)
  await page.getByRole('button', { name: /登录/ }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Test fixtures: one user per describe block
// ---------------------------------------------------------------------------

test.describe('Knowledge Base – create and navigate', () => {
  const suffix = uid()
  const username = `kb_e2e_${suffix}`
  const email = `kb_e2e_${suffix}@example.com`
  const password = 'KbE2EPass123!'

  test.beforeAll(async ({ browser }) => {
    await register(browser, username, email, password)
  })

  test('user can create a new knowledge base', async ({ page }) => {
    await loginAs(page, username, password)

    // Find and click "Create KB" / "新建知识库" button
    await page
      .getByRole('button', { name: /新建知识库|创建知识库|Create Knowledge Base/i })
      .click({ timeout: 10_000 })

    const kbName = `E2E KB ${suffix}`
    const nameInput = page.getByLabel(/名称|Knowledge Base Name/i)
      .or(page.getByPlaceholder(/知识库名称|名称/i))
    await nameInput.fill(kbName)

    await page.getByRole('button', { name: /创建|确认|保存|Create|Save/i }).click()

    // Should show the new KB in the list or navigate into it
    await expect(
      page.getByText(kbName)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('user can navigate into a knowledge base', async ({ page }) => {
    await loginAs(page, username, password)

    const kbName = `Nav KB ${suffix}`

    // Create the KB first via API call (faster) or via UI
    const kbCard = page.getByText(new RegExp(kbName, 'i'))
    const exists = await kbCard.isVisible({ timeout: 2000 }).catch(() => false)

    if (!exists) {
      await page
        .getByRole('button', { name: /新建知识库|创建知识库|Create/i })
        .click({ timeout: 5_000 })
      const nameInput = page.getByLabel(/名称/i).or(page.getByPlaceholder(/知识库名称/i))
      await nameInput.fill(kbName)
      await page.getByRole('button', { name: /创建|确认|保存/i }).click()
      await expect(page.getByText(kbName)).toBeVisible({ timeout: 10_000 })
    }

    // Click into the KB
    await page.getByText(new RegExp(kbName, 'i')).click()
    // Should be on the KB detail page
    await expect(page).toHaveURL(/\/kb\/|\/kbs\//, { timeout: 8_000 })
  })
})

test.describe('Knowledge Base – document operations', () => {
  const suffix = uid()
  const username = `kbdoc_e2e_${suffix}`
  const email = `kbdoc_e2e_${suffix}@example.com`
  const password = 'KbDocE2E123!'
  let kbName: string

  test.beforeAll(async ({ browser }) => {
    await register(browser, username, email, password)
    kbName = `Doc KB ${suffix}`
  })

  async function ensureInKb(page: Page) {
    await loginAs(page, username, password)

    // Create or navigate to the KB
    let kbLink = page.getByRole('link', { name: new RegExp(kbName, 'i') })
    const alreadyExists = await kbLink.isVisible({ timeout: 2000 }).catch(() => false)

    if (!alreadyExists) {
      await page
        .getByRole('button', { name: /新建知识库|创建知识库|Create/i })
        .click({ timeout: 5_000 })
      const nameInput = page.getByLabel(/名称/i).or(page.getByPlaceholder(/知识库名称/i))
      await nameInput.fill(kbName)
      await page.getByRole('button', { name: /创建|确认|保存/i }).click()
      await expect(page.getByText(kbName)).toBeVisible({ timeout: 10_000 })
    }

    await page.getByText(new RegExp(kbName, 'i')).click()
    await expect(page).toHaveURL(/\/kb\/|\/kbs\//, { timeout: 8_000 })
  }

  test('user can create a document inside a KB', async ({ page }) => {
    await ensureInKb(page)

    const docTitle = `Test Doc ${suffix}`
    await page
      .getByRole('button', { name: /新建文档|创建文档|New Doc|Create Doc/i })
      .click({ timeout: 8_000 })

    // Fill document title
    const titleInput = page.getByLabel(/文档标题|标题|Title/i)
      .or(page.getByPlaceholder(/文档标题|标题|Untitled/i))
    await titleInput.fill(docTitle)

    await page.getByRole('button', { name: /创建|确认|保存/i }).click()

    await expect(page.getByText(docTitle)).toBeVisible({ timeout: 10_000 })
  })

  test('user can edit document content and save', async ({ page }) => {
    await ensureInKb(page)

    const docTitle = `Edit Doc ${suffix}`

    // Create document
    await page
      .getByRole('button', { name: /新建文档|创建文档|New Doc/i })
      .click({ timeout: 8_000 })

    const titleInput = page.getByLabel(/文档标题|标题|Title/i)
      .or(page.getByPlaceholder(/文档标题|标题|Untitled/i))
    await titleInput.fill(docTitle)
    await page.getByRole('button', { name: /创建|确认|保存/i }).click()

    // Click into the document to open the editor
    await page.getByText(docTitle).click()
    await expect(page).toHaveURL(/\/doc\/|\/docs\//, { timeout: 8_000 })

    // Type in the editor (TipTap)
    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
    await editor.click()
    await editor.type('This is the document content written by E2E test.')

    // Save via keyboard shortcut or save button
    const saveBtn = page.getByRole('button', { name: /保存|Save/i })
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click()
    } else {
      await page.keyboard.press('Control+S')
    }

    // Confirm save feedback (toast / status text)
    await expect(
      page.getByText(/已保存|保存成功|Saved/i)
    ).toBeVisible({ timeout: 8_000 })
  })
})
