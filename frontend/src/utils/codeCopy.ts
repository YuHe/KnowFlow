import { copyToClipboard } from './index'

/**
 * Attach a one-click copy button to every code block in a rendered document.
 *
 * Read views inject sanitized HTML with dangerouslySetInnerHTML, so the code
 * blocks are plain <pre><code> with no React handles. This walks the container
 * and wraps each <pre> in a relatively-positioned host that carries the button,
 * which keeps the button pinned to the top-right corner even while the <pre>
 * itself scrolls horizontally.
 *
 * Idempotent: a <pre> already decorated is skipped, so it is safe to call again
 * after an async render pass touches the same container.
 */

/** Marks a <pre> as already decorated (dataset key: data-copy-attached). */
const ATTACHED = 'copyAttached'

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'

const DONE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M20 6 9 17l-5-5"></path></svg>'

/** How long the button shows its success state before reverting. */
const DONE_MS = 1500

function buildButton(pre: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'code-copy-btn'
  button.title = '复制代码'
  button.setAttribute('aria-label', '复制代码')
  button.innerHTML = COPY_ICON

  let resetTimer: ReturnType<typeof setTimeout> | undefined

  button.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    // textContent, not innerText: syntax highlighting wraps tokens in spans and
    // innerText would fold the rendered line breaks of a scrolled block.
    const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
    try {
      await copyToClipboard(code)
      button.innerHTML = DONE_ICON
      button.classList.add('is-copied')
      button.title = '已复制'
      button.setAttribute('aria-label', '已复制')
    } catch {
      button.title = '复制失败'
      button.setAttribute('aria-label', '复制失败')
      return
    }
    clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      button.innerHTML = COPY_ICON
      button.classList.remove('is-copied')
      button.title = '复制代码'
      button.setAttribute('aria-label', '复制代码')
    }, DONE_MS)
  })

  return button
}

/** Decorate every not-yet-decorated code block inside `container`. */
export function attachCodeCopyButtons(container: HTMLElement): void {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('pre'))
  for (const pre of blocks) {
    if (pre.dataset[ATTACHED] === 'true') continue
    // Mermaid sources are replaced wholesale by the rendered SVG
    // (see renderMermaidBlocks) — a button here would be attached to a node
    // that is about to be discarded, and the diagram is not code to copy.
    if (pre.querySelector('code.language-mermaid')) continue

    const parent = pre.parentNode
    if (!parent) continue

    pre.dataset[ATTACHED] = 'true'
    const host = document.createElement('div')
    host.className = 'code-block-host'
    parent.insertBefore(host, pre)
    // Button first in DOM order so keyboard users reach it before tabbing past
    // a long block; absolute positioning keeps it visually top-right.
    host.appendChild(buildButton(pre))
    host.appendChild(pre)
  }
}
