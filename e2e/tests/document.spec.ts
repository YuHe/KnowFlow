/**
 * E2E – Document lifecycle and search.
 *
 * Tests: create → edit → save → export, and full-text search.
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

async function createKb(page: Page, kbName: string) {
  await page
    .getByRole('button', { name: /新建知识库|创建知识库|Create/i })
    .click({ timeout: 8_000 })
  const nameInput = page.getByLabel(/名称/i).or(page.getByPlaceholder(/知识库名称/i))
  await nameInput.fill(kbName)
  await page.getByRole('button', { name: /创建|确认|保存/i }).click()
  await expect(page.getByText(kbName)).toBeVisible({ timeout: 10_000 })
}

async function navigateIntoKb(page: Page, kbName: string) {
  await page.getByText(new RegExp(kbName, 'i')).click()
  await expect(page).toHaveURL(/\/kb\/|\/kbs\//, { timeout: 8_000 })
}

async function createDoc(page: Page, docTitle: string) {
  await page
    .getByRole('button', { name: /新建文档|创建文档|New Doc/i })
    .click({ timeout: 8_000 })
  const titleInput = page.getByLabel(/文档标题|标题|Title/i)
    .or(page.getByPlaceholder(/文档标题|标题|Untitled/i))
  await titleInput.fill(docTitle)
  await page.getByRole('button', { name: /创建|确认|保存/i }).click()
  await expect(page.getByText(docTitle)).toBeVisible({ timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Full document lifecycle
// ---------------------------------------------------------------------------

test.describe('Document lifecycle', () => {
  const suffix = uid()
  const username = `doc_life_${suffix}`
  const email = `doc_life_${suffix}@example.com`
  const password = 'DocLifeE2E123!'
  const kbName = `Lifecycle KB ${suffix}`
  const docTitle = `Lifecycle Doc ${suffix}`
  const uniqueContent = `UniqueE2EContent_${suffix}`

  test.beforeAll(async ({ browser }) => {
    await register(browser, username, email, password)
  })

  test('create a document', async ({ page }) => {
    await loginAs(page, username, password)
    await createKb(page, kbName)
    await navigateIntoKb(page, kbName)
    await createDoc(page, docTitle)
  })

  test('edit document content', async ({ page }) => {
    await loginAs(page, username, password)
    await page.getByText(new RegExp(kbName, 'i')).click()
    await expect(page).toHaveURL(/\/kb\/|\/kbs\//, { timeout: 8_000 })

    await page.getByText(docTitle).click()
    await expect(page).toHaveURL(/\/doc\/|\/docs\//, { timeout: 8_000 })

    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
    await editor.click()
    await editor.type(uniqueContent)

    // Verify content appears in the editor
    await expect(editor).toContainText(uniqueContent)
  })

  test('save document (manual save creates a version)', async ({ page }) => {
    await loginAs(page, username, password)
    await page.getByText(new RegExp(kbName, 'i')).click()
    await page.getByText(docTitle).click()
    await expect(page).toHaveURL(/\/doc\/|\/docs\//, { timeout: 8_000 })

    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
    await editor.click()
    await editor.type(' extra text')

    // Save
    const saveBtn = page.getByRole('button', { name: /保存|Save/i })
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click()
    } else {
      await page.keyboard.press('Control+S')
    }

    await expect(
      page.getByText(/已保存|保存成功|Saved/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('export document as Markdown', async ({ page }) => {
    await loginAs(page, username, password)
    await page.getByText(new RegExp(kbName, 'i')).click()
    await page.getByText(docTitle).click()
    await expect(page).toHaveURL(/\/doc\/|\/docs\//, { timeout: 8_000 })

    // Trigger download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      // Click the export / more-options menu
      (async () => {
        const moreBtn = page
          .getByRole('button', { name: /更多|导出|Export|More/i })
          .or(page.locator('[data-testid="doc-actions"], .doc-actions').first())
        await moreBtn.click({ timeout: 5_000 })
        const exportMd = page.getByRole('menuitem', { name: /导出.*Markdown|Export.*MD/i })
          .or(page.getByRole('button', { name: /导出.*Markdown|Export.*MD/i }))
        await exportMd.click({ timeout: 5_000 })
      })(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.md$/)
  })
})

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

test.describe('Search documents', () => {
  const suffix = uid()
  const username = `search_e2e_${suffix}`
  const email = `search_e2e_${suffix}@example.com`
  const password = 'SearchE2E123!'
  const kbName = `Search KB ${suffix}`
  const uniqueSearchTerm = `SEARCHTERM_${suffix.toUpperCase()}`
  const docTitle = `Searchable Doc ${suffix}`

  test.beforeAll(async ({ browser }) => {
    await register(browser, username, email, password)

    // Set up a KB with a doc containing the unique search term
    const page = await browser.newPage()
    await loginAs(page, username, password)
    await createKb(page, kbName)
    await navigateIntoKb(page, kbName)
    await createDoc(page, docTitle)

    // Open the doc and type the unique content
    await page.getByText(docTitle).click()
    await expect(page).toHaveURL(/\/doc\/|\/docs\//, { timeout: 8_000 })
    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first()
    await editor.click()
    await editor.type(uniqueSearchTerm)

    const saveBtn = page.getByRole('button', { name: /保存|Save/i })
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click()
    } else {
      await page.keyboard.press('Control+S')
    }
    await page.waitForTimeout(1000) // Give the save a moment
    await page.close()
  })

  test('can find a document by title using the search bar', async ({ page }) => {
    await loginAs(page, username, password)

    // Open global search
    const searchInput = page.getByRole('searchbox')
      .or(page.getByPlaceholder(/搜索|Search/i))
      .or(page.locator('[data-testid="search-input"]'))
    await searchInput.click({ timeout: 5_000 })
    await searchInput.fill(docTitle)

    // Wait for results
    await expect(
      page.getByText(new RegExp(docTitle, 'i'))
    ).toBeVisible({ timeout: 10_000 })
  })

  test('search results include the document matching the content keyword', async ({ page }) => {
    await loginAs(page, username, password)

    const searchInput = page.getByRole('searchbox')
      .or(page.getByPlaceholder(/搜索|Search/i))
      .or(page.locator('[data-testid="search-input"]'))
    await searchInput.click({ timeout: 5_000 })
    await searchInput.fill(uniqueSearchTerm)

    await expect(
      page.getByText(new RegExp(docTitle, 'i'))
    ).toBeVisible({ timeout: 10_000 })
  })
})
