---
version: alpha
name: Google Photos Delete Tool
description: Calm, exact, third-party utility for finding duplicates and bulk deleting in Google Photos. Ink on paper, one violet brand accent, and green/red reserved strictly for keep/trash.
colors:
  primary: "#4B32C3"
  on-primary: "#FFFFFF"
  primary-container: "#ECE8FB"
  on-primary-container: "#2A1A7A"
  surface: "#F7F6F3"
  surface-raised: "#FFFFFF"
  surface-sunken: "#EDEBE6"
  on-surface: "#1A1920"
  on-surface-muted: "#5C5A66"
  outline: "#D6D3CC"
  keep: "#16794A"
  on-keep: "#FFFFFF"
  keep-container: "#E3F4EA"
  trash: "#C5281C"
  on-trash: "#FFFFFF"
  trash-container: "#FBE7E4"
  caution: "#8A5300"
  caution-container: "#FDF1DC"
  error: "#B3261E"
  on-error: "#FFFFFF"
  primary-dark: "#B7A9FF"
  on-primary-dark: "#1E1259"
  surface-dark: "#141318"
  surface-raised-dark: "#1F1E25"
  on-surface-dark: "#EDEBF2"
  on-surface-muted-dark: "#A7A4B3"
  outline-dark: "#38363F"
  keep-dark: "#5FD39A"
  trash-dark: "#FF8A7E"
typography:
  display:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: -0.01em
  title:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
  stat:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1
    letterSpacing: -0.01em
    fontFeature: '"tnum" 1'
  mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 40px
  popup-width: 380px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  button-secondary:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  button-destructive:
    backgroundColor: "{colors.trash}"
    textColor: "{colors.on-trash}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 10px
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  nav:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.title}"
    height: 48px
    padding: 12px
  stat-tile:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.on-surface}"
    typography: "{typography.stat}"
    rounded: "{rounded.md}"
    padding: 12px
  verdict-badge-keep:
    backgroundColor: "{colors.keep}"
    textColor: "{colors.on-keep}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 4px
  verdict-badge-trash:
    backgroundColor: "{colors.trash}"
    textColor: "{colors.on-trash}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 4px
  consent-panel:
    backgroundColor: "{colors.caution-container}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 12px
  helper-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body-sm}"
  divider:
    backgroundColor: "{colors.outline}"
    height: 1px
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  card-dark:
    backgroundColor: "{colors.surface-raised-dark}"
    textColor: "{colors.on-surface-dark}"
    rounded: "{rounded.lg}"
    padding: 16px
  helper-text-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-muted-dark}"
    typography: "{typography.body-sm}"
  divider-dark:
    backgroundColor: "{colors.outline-dark}"
    height: 1px
  verdict-badge-keep-dark:
    backgroundColor: "{colors.keep-dark}"
    textColor: "{colors.surface-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 4px
  verdict-badge-trash-dark:
    backgroundColor: "{colors.trash-dark}"
    textColor: "{colors.surface-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 4px
---

## Overview

Google Photos Delete Tool is a browser extension and userscript that finds look-alike duplicates and bulk-moves photos to Trash inside the Google Photos page a person already has open. Its audience is ordinary people whose storage is full or who must remove a known collection: not engineers, often anxious, about to run something destructive on their own memories. The product's only real asset is trust, so the identity is a **precise instrument**: quiet, legible, exact, and never flashy. Every screen answers three questions at a glance: what is in scope, what will happen, and what has been verified.

It is an independent, third-party tool, made by Sylphx. The look must never be mistaken for Google: no Google four-colour palette, no Google Sans or Product Sans, no Material You pinwheel or photo-app pinwheel shapes, no Google logos or icons. The name is set as plain text; the word "Google" never gets its own colour or weight.

**Voice.** Plain, calm, specific. State counts and consequences ("Move 8 photos to Trash. They stay in Trash under Google's current policy."), never hype or fear. Short sentences, verbs first on buttons, numbers in figures. No exclamation marks, no "magic", no "AI-powered". Admit limits openly.

**Images for posts, store listing and marketing.** Real product UI on a calm Paper (#F7F6F3) or Night (#141318) field, cropped tight, with one short headline in Inter. Photo grids in screenshots use generated, abstract or clearly licensed sample images, never real people's photos. Keep/trash states are shown with the exact green and red tokens. Illustration, when needed, is flat geometric line work in Ink (#1A1920) with one Violet (#4B32C3) accent: a stack of frames, a checkmark, a counter. No 3D renders, no gradients, no glassmorphism, no stock smiling people, no trash-can-on-fire drama.

The existing mark (a landscape photo frame with a red cross badge) stays as the product icon.

## Colors

Colour carries meaning, so each hue has one job.

- **Violet (#4B32C3)** `primary`: brand accent and the single non-destructive primary action (Scan this view, Dry run, Buy Pro). Focus rings and links. Chosen from a hue band Google's identity does not use. Tint: `primary-container` (#ECE8FB) with `on-primary-container` (#2A1A7A).
- **Paper (#F7F6F3)** `surface`, **White (#FFFFFF)** `surface-raised` for cards, **Stone (#EDEBE6)** `surface-sunken` for tiles and secondary buttons, **Hairline (#D6D3CC)** `outline`.
- **Ink (#1A1920)** `on-surface` for text; **Slate (#5C5A66)** `on-surface-muted` for captions and helper text.
- **Keep green (#16794A)** `keep` and **Trash red (#C5281C)** `trash` exist only for keep/trash verdicts and the Move-to-Trash action. Their tints `keep-container` (#E3F4EA) and `trash-container` (#FBE7E4) back group rows.
- **Amber (#8A5300)** `caution` on `caution-container` (#FDF1DC) marks permanent actions: consent and Empty Trash warnings.
- **Error (#B3261E)** `error` is for failures (unknown UI, stopped run), distinct from the trash verdict.

Dark mode follows the system and Google Photos' own theme: Night (#141318) `surface-dark`, Night Raised (#1F1E25) `surface-raised-dark`, Mist (#EDEBF2) `on-surface-dark`, muted text (#A7A4B3) `on-surface-muted-dark`, outline (#38363F) `outline-dark`, Lilac (#B7A9FF) `primary-dark` with `on-primary-dark` (#1E1259), keep (#5FD39A) `keep-dark`, trash (#FF8A7E) `trash-dark`. In dark mode the keep/trash badge text uses `surface-dark`.

## Typography

**Inter** (SIL OFL) for all Latin text in UI and images; tabular figures (`tnum`) for every count, rate and ETA so numbers never jitter during a run. **JetBrains Mono** (OFL) only for selector-pack versions and diagnostic text.

The UI ships in English, German, Spanish, French, Italian, Dutch, Brazilian Portuguese, Japanese, Simplified and Traditional Chinese. Fallback stack: `Inter, "Noto Sans JP", "Noto Sans SC", "Noto Sans TC", system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "PingFang SC", "PingFang TC", "Microsoft YaHei", sans-serif`, with the Noto CJK face ordered first for the active locale. The extension does not bundle fonts (size budget); it relies on the stack. Marketing images render with Inter plus Noto Sans CJK (OFL) for CJK locales.

Scale: `display` 40px only for store images and the product page; `headline` 20px for popup and panel titles; `title` 15px for section heads; `body` 14px; `body-sm` 12px for helper text; `label` 13px semibold for buttons, badges and stat captions; `stat` 24px for counters. Two weights per screen at most (400 and 600/650). CJK text keeps `letterSpacing` 0 and lineHeight at least 1.5.

## Layout

The popup is a fixed 380px column (`popup-width`) with 16px (`lg`) outer padding and a 4px base grid (`xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 40). Order is fixed: header (nav), scope line (which view will be acted on), stat tiles in a row of three, options, consent panel, then the action bar pinned at the bottom with secondary left and primary/destructive right. The duplicate-review panel docks on the right of the Google Photos page at 420–560px with the same order. Groups are cards in a single column; thumbnails sit in a wrapping row with 8px gaps.

Store screenshots are 1280×800: product UI on the left two thirds, one headline (max 6 words) and one supporting line on the right, 64px margins.

## Elevation & Depth

Flat by default. Depth comes from surface steps (sunken, surface, raised) and 1px `outline` borders, not shadows. Only two shadows exist: the docked review panel and floating userscript panel (`0 8px 24px rgba(26,25,32,0.16)`) and menus (`0 2px 8px rgba(26,25,32,0.12)`). Dark mode uses surface steps only. No blur, glass, glow or gradients.

## Shapes

Gentle, consistent corners: `sm` 4px for badges, `md` 8px for buttons, inputs, tiles and thumbnails, `lg` 12px for cards and panels, `full` for the progress track, toggles and slider thumbs. Never mix sharp and rounded corners in one view. Keep/trash state on a thumbnail is a 2px inset border in the verdict colour plus a badge in the top-left corner; never colour alone (badges always carry the word).

## Components

- **button-primary**: Violet, white label, 40px tall. One per view, for the safe forward step.
- **button-destructive**: Trash red, used only for Move to Trash and Empty Trash, always labelled with the exact count ("Move 8 to Trash"). Disabled until consent is checked.
- **button-secondary**: Stone fill, Ink label: Preview (dry run), Pause, Close.
- **input**: White, 1px `outline`, 8px corners; focus is a 2px Violet ring. Date fields, licence key, similarity value.
- **card**: White on Paper with 1px `outline`, 12px corners, 16px padding. Duplicate groups add a title row ("2 photos · 98% similar").
- **nav**: Popup header, 48px: mark at 20px, product name in `title`, Pro status chip and menu on the right.
- **stat-tile**: Stone tile, `stat` number over a `label` caption (Groups, Keep, To Trash, Deleted, Rate, ETA). Numbers are indeterminate ("–") until known, never estimated.
- **verdict-badge-keep / verdict-badge-trash**: Word badges "Keep" / "Trash" on thumbnails; "Keep · best" for the chosen copy.
- **consent-panel**: Amber-tint box with a checkbox and a one-sentence consequence. Appears before every first real run and with Empty Trash.
- **helper-text / divider**: Slate helper copy under a control; 1px Hairline rules between sections.
- **Dark variants** (`button-primary-dark`, `card-dark`, `helper-text-dark`, `divider-dark`, `verdict-badge-keep-dark`, `verdict-badge-trash-dark`) are the same components on dark tokens; the destructive button keeps Trash red in both themes.
- **progress**: 6px full-round track in Stone with a Violet fill; indeterminate stripe while the total is unknown.

## Do's and Don'ts

- Do show scope, consequence and verified result on every screen that can delete.
- Do use green and red only for keep/trash verdicts and the destructive button; use Violet for everything else interactive.
- Do label every count with tabular figures and the real unit ("8 photos", "142/min").
- Do keep WCAG AA contrast on every text/background pair, in both themes.
- Do present the product as an independent tool "made by Sylphx".
- Don't imitate Google: no blue/red/yellow/green quartet, no Google Sans or Product Sans, no Google logos, pinwheels or Material You shapes.
- Don't use gradients, glass, glows, confetti or celebratory animation after deleting.
- Don't use more than one primary or destructive button per view.
- Don't show real people's photos in screenshots, posts or ads.
- Don't use fear or urgency copy ("Your storage is about to explode!").
