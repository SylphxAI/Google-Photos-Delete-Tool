import { setMarkup } from './set-markup'

/**
 * Inline SVG icons from Tabler Icons (MIT licensed — https://tabler.io/icons).
 * Each icon is exported as an HTML string so we can drop it into innerHTML.
 *
 * All icons follow the same 24×24 viewBox with stroke="currentColor" so
 * they inherit the surrounding text color and can be sized via CSS
 * (width/height) and recolored via `color`.
 */

const STROKE_ATTRS =
  'width="24" height="24" viewBox="0 0 24 24" stroke-width="1.75" ' +
  'stroke="currentColor" fill="none" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true" focusable="false"'

const FILL_ATTRS =
  'width="24" height="24" viewBox="0 0 24 24" fill="currentColor" ' +
  'aria-hidden="true" focusable="false"'

export const icons = {
  // Header brand — generic Tabler "photo" mark (a framed image with a
  // sun + mountains). Deliberately NOT the Google Photos pinwheel, to
  // avoid leaning on Google's trademark in our own branding.
  brand: `<svg ${STROKE_ATTRS}>
    <path d="M15 8h.01" />
    <path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" />
    <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" />
    <path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />
  </svg>`,

  trash: `<svg ${STROKE_ATTRS}>
    <path d="M4 7l16 0" />
    <path d="M10 11l0 6" />
    <path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>`,

  // Trash with an X — perfect indicator for "permanent / empty trash"
  trashX: `<svg ${STROKE_ATTRS}>
    <path d="M4 7h16" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    <path d="M10 12l4 4" />
    <path d="M14 12l-4 4" />
  </svg>`,

  // Action buttons (filled variants are more legible at small sizes)
  play: `<svg ${FILL_ATTRS}>
    <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
  </svg>`,

  pause: `<svg ${FILL_ATTRS}>
    <path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" />
    <path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" />
  </svg>`,

  stop: `<svg ${FILL_ATTRS}>
    <path d="M17 4h-10a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z" />
  </svg>`,

  // Status / alerts
  alertTriangle: `<svg ${STROKE_ATTRS}>
    <path d="M12 9v4" />
    <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
    <path d="M12 16h.01" />
  </svg>`,

  check: `<svg ${STROKE_ATTRS}>
    <path d="M5 12l5 5l10 -10" />
  </svg>`,

  // Language picker
  language: `<svg ${STROKE_ATTRS}>
    <path d="M4 5h7" />
    <path d="M9 3v2c0 4.418 -2.239 8 -5 8" />
    <path d="M5 9c0 2.144 2.952 3.908 6.7 4" />
    <path d="M12 20l4 -9l4 9" />
    <path d="M19.1 18h-6.2" />
  </svg>`,

  chevronDown: `<svg ${STROKE_ATTRS}>
    <path d="M6 9l6 6l6 -6" />
  </svg>`,

  // Settings header decoration
  settings: `<svg ${STROKE_ATTRS}>
    <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
    <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
  </svg>`,

  // Misc
  flask: `<svg ${STROKE_ATTRS}>
    <path d="M9 3l6 0" />
    <path d="M10 9l4 0" />
    <path d="M10 3v6l-4 11a.7 .7 0 0 0 .5 1h11a.7 .7 0 0 0 .5 -1l-4 -11v-6" />
  </svg>`,

  hash: `<svg ${STROKE_ATTRS}>
    <path d="M5 9l14 0" />
    <path d="M5 15l14 0" />
    <path d="M11 4l-4 16" />
    <path d="M17 4l-4 16" />
  </svg>`,

  filter: `<svg ${STROKE_ATTRS}>
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </svg>`,

  key: `<svg ${STROKE_ATTRS}>
    <path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239.578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z" />
    <path d="M15 9h.01" />
  </svg>`,

  // AI 4K Restore: two four-point sparkles in line art.
  sparkle: `<svg ${STROKE_ATTRS}>
    <path d="M11 3.5l1.8 5.2l5.2 1.8l-5.2 1.8l-1.8 5.2l-1.8 -5.2l-5.2 -1.8l5.2 -1.8z" />
    <path d="M18.5 15.5l.7 1.8l1.8 .7l-1.8 .7l-.7 1.8l-.7 -1.8l-1.8 -.7l1.8 -.7z" />
  </svg>`,
} as const

export type IconName = keyof typeof icons

/** Insert an icon's SVG markup into an element by id, replacing its children. */
export function mountIcon(elementId: string, name: IconName): void {
  const el = document.getElementById(elementId)
  if (el) setMarkup(el, icons[name])
}
