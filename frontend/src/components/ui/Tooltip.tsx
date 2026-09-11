import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hover label for an icon button.
 *
 * The editor toolbar is almost entirely icons, and the only explanation of what
 * any of them did was the `title` attribute — which browsers show after roughly a
 * second, in a style we do not control, and never at all on touch. For a toolbar
 * whose icons a first-time user cannot read, that is the same as no label.
 *
 * Three details are what make this usable rather than annoying:
 *
 * - **A short delay** (`DELAY_MS`). Zero would flash a bubble every time the
 *   pointer crosses the toolbar on its way somewhere else; a second is long
 *   enough that people give up first.
 * - **A portal.** The toolbar is `sticky` and its dropdowns sit at `z-50`; a
 *   bubble rendered in place would be clipped by the toolbar's own bounds and
 *   would stack under the menus.
 * - **Dismissal on mousedown.** Otherwise clicking a button leaves the label
 *   hanging over whatever the click revealed.
 */

const DELAY_MS = 120
const GAP = 6

interface TooltipProps {
  /** A few words: what the control does. */
  label: string
  /** Shown dimmer after the label, e.g. `Ctrl+B`. */
  shortcut?: string
  /** Preferred side; flipped when there is no room. */
  placement?: 'top' | 'bottom'
  children: React.ReactNode
}

interface Bubble {
  left: number
  top: number
  above: boolean
}

export default function Tooltip({ label, shortcut, placement = 'bottom', children }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number>()
  const [open, setOpen] = useState(false)
  const [bubble, setBubble] = useState<Bubble | null>(null)

  const cancel = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  const hide = useCallback(() => {
    cancel()
    setOpen(false)
    setBubble(null)
  }, [cancel])

  const show = useCallback(() => {
    cancel()
    timer.current = window.setTimeout(() => setOpen(true), DELAY_MS)
  }, [cancel])

  useEffect(() => cancel, [cancel])

  // Any click anywhere ends the label: the control has done its job and the
  // pointer may now be over something the click moved.
  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', hide)
    return () => document.removeEventListener('mousedown', hide)
  }, [open, hide])

  // Measured after the bubble exists, so its real width can be used to keep it
  // inside the viewport rather than assuming a size.
  useEffect(() => {
    if (!open) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const box = bubbleRef.current?.getBoundingClientRect()
    if (!anchor || !box) return
    const fitsBelow = anchor.bottom + GAP + box.height <= window.innerHeight
    const above = placement === 'top' ? anchor.top - GAP - box.height >= 0 : !fitsBelow
    setBubble({
      left: Math.min(
        Math.max(GAP, anchor.left + anchor.width / 2 - box.width / 2),
        Math.max(GAP, window.innerWidth - box.width - GAP),
      ),
      top: above ? anchor.top - GAP - box.height : anchor.bottom + GAP,
      above,
    })
  }, [open, placement, label, shortcut])

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            role="tooltip"
            // pointer-events-none: the bubble sits near the control it describes
            // and must never intercept the click aimed at it.
            className="pointer-events-none fixed z-[200] whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
            style={{
              left: bubble?.left ?? -9999,
              top: bubble?.top ?? -9999,
              // Invisible until measured, so it never appears in the wrong place
              // for one frame.
              opacity: bubble ? 1 : 0,
            }}
          >
            {label}
            {shortcut && <span className="ml-1.5 text-gray-400">{shortcut}</span>}
          </div>,
          document.body,
        )}
    </>
  )
}
