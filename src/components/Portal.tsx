import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Renders children into document.body.
 *
 * Every table card carries `animate-rise`, whose Tailwind definition ends in
 * `both` — so its `transform` sticks after the animation finishes and the card
 * becomes a containing block for `position: fixed` descendants. A drawer or
 * modal declared inside one is then sized to the card and clipped by its
 * `overflow-hidden` instead of covering the viewport. Portalling out of the
 * card's subtree is what keeps `fixed` meaning "fixed to the viewport".
 */
export default function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
