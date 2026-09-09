import { createLowlight, common } from 'lowlight'
import type { Element, ElementContent, Root } from 'hast'

/**
 * Syntax-highlight the code blocks of already-rendered read-only HTML.
 *
 * The editor highlights via CodeBlockLowlight, which paints ProseMirror
 * *decorations*. Decorations live outside the document model, so
 * `editor.getHTML()` never serializes them: every stored `content_html` holds
 * `<pre><code class="language-ts">…plain text…</code></pre>` — a language hint
 * and nothing else. The read view has therefore never been highlighted at all,
 * and no stylesheet change alone can fix that. This pass adds the token spans
 * client-side, from the language class the HTML already carries.
 *
 * Nothing is persisted: this only touches the DOM the viewer just rendered, so
 * existing documents pick it up with no migration and no re-save.
 */

const lowlight = createLowlight(common)

const HIGHLIGHTED = 'codeHighlighted'

/** Rebuild hast children as DOM nodes, preserving nesting. */
function toDom(nodes: ElementContent[], target: Node, doc: Document): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      target.appendChild(doc.createTextNode(node.value))
    } else if (node.type === 'element') {
      const element = node as Element
      const span = doc.createElement(element.tagName)
      const className = element.properties?.className
      if (Array.isArray(className)) span.className = className.join(' ')
      else if (typeof className === 'string') span.className = className
      toDom(element.children as ElementContent[], span, doc)
      target.appendChild(span)
    }
  }
}

function languageOf(code: HTMLElement): string | null {
  for (const cls of Array.from(code.classList)) {
    if (cls.startsWith('language-')) return cls.slice('language-'.length)
  }
  return null
}

/**
 * Highlight every not-yet-highlighted code block inside `container`.
 *
 * Idempotent, and safe to run alongside attachCodeCopyButtons — that inserts a
 * `div.code-block-host` between the `<pre>` and its original parent, so this
 * queries `pre code` from the container rather than assuming a parent shape, and
 * marks each block it has handled.
 */
export function highlightCodeBlocks(container: HTMLElement): void {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('pre code'))

  for (const code of blocks) {
    if (code.dataset[HIGHLIGHTED] === 'true') continue

    const language = languageOf(code)
    // Mermaid sources are replaced wholesale by the rendered SVG
    // (see renderMermaidBlocks); highlighting them would be wasted work on a
    // node that is about to be discarded, and mermaid is not a grammar here.
    if (language === 'mermaid') continue

    const source = code.textContent ?? ''
    if (!source.trim()) continue

    let tree: Root
    try {
      // A code block saved without a language has no `language-*` class at all
      // (TipTap renders `class: null`), so those have to be auto-detected.
      tree = language && lowlight.registered(language)
        ? lowlight.highlight(language, source)
        : lowlight.highlightAuto(source)
    } catch {
      // An unregistered language or a grammar crash must leave the plain text
      // readable rather than blanking the block.
      code.dataset[HIGHLIGHTED] = 'true'
      continue
    }

    const doc = code.ownerDocument
    const fragment = doc.createDocumentFragment()
    toDom(tree.children as ElementContent[], fragment, doc)

    code.textContent = ''
    code.appendChild(fragment)
    code.dataset[HIGHLIGHTED] = 'true'
  }
}
