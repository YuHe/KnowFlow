import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Find and replace.
 *
 * 飞书 has it (`Ctrl+F` / `Ctrl+Shift+H`), Google Docs has it, and its absence
 * here was conspicuous — Notion is the odd one out with find but no replace.
 * Implemented in-tree rather than pulling a dependency: the whole thing is a text
 * scan plus a decoration set, and we already carry the ProseMirror packages.
 *
 * Matches are highlighted as *decorations*, never by mutating the document, for
 * the reason this codebase has now hit twice: prosemirror-view treats attribute
 * changes on managed nodes as dirty and would redraw on every keystroke of the
 * query.
 */

export const searchPluginKey = new PluginKey<SearchState>('searchAndReplace')

export interface SearchMatch {
  from: number
  to: number
}

interface SearchState {
  query: string
  caseSensitive: boolean
  matches: SearchMatch[]
  /** Index into `matches`, or -1 when there is no active match. */
  current: number
  decorations: DecorationSet
}

const EMPTY: SearchState = {
  query: '',
  caseSensitive: false,
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
}

/**
 * Flatten the document's text with a position map, so a match found in the string
 * can be translated back to document positions.
 *
 * Block boundaries contribute a `\n`, which both keeps words from running
 * together across paragraphs and makes the offsets line up with node sizes.
 */
function flatten(doc: PMNode): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []

  doc.descendants((node, pos) => {
    if (node.isText) {
      const value = node.text ?? ''
      for (let i = 0; i < value.length; i++) {
        text += value[i]
        map.push(pos + i)
      }
      return false
    }
    if (node.isBlock && text.length > 0 && text[text.length - 1] !== '\n') {
      text += '\n'
      map.push(pos)
    }
    return true
  })

  return { text, map }
}

function findMatches(doc: PMNode, query: string, caseSensitive: boolean): SearchMatch[] {
  if (!query) return []
  const { text, map } = flatten(doc)
  const haystack = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()

  const matches: SearchMatch[] = []
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    const from = map[index]
    const lastCharPos = map[index + needle.length - 1]
    // A match spanning a synthetic block break has no single contiguous range;
    // skip it rather than producing a selection that crosses node boundaries.
    if (from !== undefined && lastCharPos !== undefined && lastCharPos - from === needle.length - 1) {
      matches.push({ from, to: lastCharPos + 1 })
    }
    index = haystack.indexOf(needle, index + Math.max(1, needle.length))
  }
  return matches
}

/** Recompute matches for `doc`, keeping the current index in range. */
function recompute(state: SearchState, doc: PMNode, preferredIndex?: number): SearchState {
  const matches = findMatches(doc, state.query, state.caseSensitive)
  let current = -1
  if (matches.length > 0) {
    const wanted = preferredIndex ?? state.current
    current = wanted < 0 ? 0 : Math.min(wanted, matches.length - 1)
  }
  return { ...state, matches, current, decorations: DecorationSet.create(doc, decorationsFor(matches, current)) }
}

function decorationsFor(matches: SearchMatch[], current: number): Decoration[] {
  return matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class: index === current ? 'search-match search-match-current' : 'search-match',
    }),
  )
}

export const SearchAndReplace = Extension.create({
  name: 'searchAndReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchPluginKey,
        state: {
          init: () => EMPTY,
          apply(tr: Transaction, value: SearchState, _old: EditorState, newState: EditorState) {
            const meta = tr.getMeta(searchPluginKey) as
              | Partial<Pick<SearchState, 'query' | 'caseSensitive' | 'current'>>
              | { reset: true }
              | undefined

            if (meta && 'reset' in meta) return EMPTY

            if (meta) {
              const next: SearchState = {
                ...value,
                query: meta.query ?? value.query,
                caseSensitive: meta.caseSensitive ?? value.caseSensitive,
              }
              return recompute(next, newState.doc, meta.current)
            }

            if (!tr.docChanged) return value
            if (!value.query) return value
            // The document moved under us — re-scan rather than mapping, so a
            // replace that changes text length cannot desynchronise the list.
            return recompute(value, newState.doc)
          },
        },
        props: {
          decorations: (state) => searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ]
  },

  addCommands() {
    return {
      setSearchQuery:
        (query: string, caseSensitive?: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { query, caseSensitive, current: query ? 0 : -1 })
          }
          return true
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(searchPluginKey, { reset: true })
          return true
        },

      /** Move to the next match, wrapping at the end. */
      findNext:
        () =>
        ({ state, tr, dispatch }) => {
          const search = searchPluginKey.getState(state)
          if (!search || search.matches.length === 0) return false
          const next = (search.current + 1) % search.matches.length
          if (dispatch) tr.setMeta(searchPluginKey, { current: next })
          return true
        },

      findPrevious:
        () =>
        ({ state, tr, dispatch }) => {
          const search = searchPluginKey.getState(state)
          if (!search || search.matches.length === 0) return false
          const previous = (search.current - 1 + search.matches.length) % search.matches.length
          if (dispatch) tr.setMeta(searchPluginKey, { current: previous })
          return true
        },

      /** Replace the current match and advance. */
      replaceCurrent:
        (replacement: string) =>
        ({ state, tr, dispatch }) => {
          const search = searchPluginKey.getState(state)
          if (!search || search.current < 0) return false
          const match = search.matches[search.current]
          if (!match) return false
          if (dispatch) {
            tr.insertText(replacement, match.from, match.to)
            // Keep the index: after re-scanning, it now points at what was the
            // following match.
            tr.setMeta(searchPluginKey, { current: search.current })
          }
          return true
        },

      replaceAll:
        (replacement: string) =>
        ({ state, tr, dispatch }) => {
          const search = searchPluginKey.getState(state)
          if (!search || search.matches.length === 0) return false
          if (dispatch) {
            // Back to front: replacing forwards would invalidate every later
            // position as soon as the text length changed.
            for (let i = search.matches.length - 1; i >= 0; i--) {
              const match = search.matches[i]
              tr.insertText(replacement, match.from, match.to)
            }
            tr.setMeta(searchPluginKey, { current: 0 })
          }
          return true
        },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchQuery: (query: string, caseSensitive?: boolean) => ReturnType
      clearSearch: () => ReturnType
      findNext: () => ReturnType
      findPrevious: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
    }
  }
}

export default SearchAndReplace
