/// <reference types="vite/client" />

declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}

// turndown-plugin-gfm ships no TypeScript declarations.
declare module 'turndown-plugin-gfm' {
  const gfm: () => void
  const tables: () => void
  const strikethrough: () => void
  const taskListItems: () => void
  export { gfm, tables, strikethrough, taskListItems }
}
