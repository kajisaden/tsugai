---
version: alpha
name: Tsugai
description: "Luxury puzzle game — two rooms, one move. Light-only washi interface with warm gold accents."
colors:
  bg: "#f3efe6"
  panel: "#fbf8f1"
  line: "rgba(43, 38, 32, 0.12)"
  text: "#2b2620"
  text-dim: "#8a8276"
  gold: "#a8801f"
  glow: "rgba(168, 128, 31, 0.40)"
  bump-hot: "#e7c25a"
  wall-hi: "#ddd5c4"
  wall-lo: "#cfc6b2"
  overlay: "rgba(243, 239, 230, 0.6)"
  accent-amber: "#a8801f"
  ball-core: "#3e3830"
  ball-highlight: "#5a5248"
  ball-shadow: "#2b2620"
  clear-silver: "#b9c0cc"
  clear-silver-shadow: "#8e9daf"
typography:
  display:
    fontFamily: "Hiragino Mincho ProN, Yu Mincho, serif"
    fontSize: 22px
    fontWeight: 400
    letterSpacing: 0.5em
  body:
    fontFamily: "Hiragino Kaku Gothic ProN, Yu Gothic UI, Noto Sans JP, sans-serif"
    fontSize: 14px
    fontWeight: 400
  label-sm:
    fontFamily: "Hiragino Kaku Gothic ProN, Yu Gothic UI, Noto Sans JP, sans-serif"
    fontSize: 11px
    letterSpacing: 0.1em
  label-caps:
    fontFamily: "Hiragino Kaku Gothic ProN, Yu Gothic UI, Noto Sans JP, sans-serif"
    fontSize: 13px
    fontWeight: 600
    letterSpacing: 0.1em
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 10px
rounded:
  sm: 10px
  md: 12px
  lg: 14px
  pill: 20px
  circle: 50%
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 44px
components:
  button-default:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "10px 22px"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-dim}"
    rounded: "{rounded.sm}"
  button-primary:
    backgroundColor: "{colors.accent-amber}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    padding: "10px 32px"
  button-back:
    backgroundColor: "{colors.floor-hi}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.circle}"
    size: 32px
  card-tile:
    backgroundColor: "{colors.floor-hi}"
    rounded: "{rounded.lg}"
    padding: 0
  card-gap:
    backgroundColor: "{colors.wall-hi}"
    rounded: "{rounded.lg}"
    padding: "28px 24px"
  daily-card:
    backgroundColor: "rgba(232, 176, 80, 0.10)"
    rounded: "{rounded.lg}"
    padding: "14px 18px"
  stat-box:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    rounded: "{rounded.md}"
    padding: "14px 8px"
  drawer-panel:
    backgroundColor: "#1a1a22"
    rounded: 0
    padding: "16px"
---

## Overview

Tsugai is a luxury puzzle game where two balls in separate rooms move with a single input. The visual identity is a Japanese *washi* (和紙) paper aesthetic: earthy, warm, tactile, and quiet.

Every visual element serves **information, not decoration**. Animation exists only to communicate state changes (movement, bump, clear). Surfaces mimic physical materials: paper, stone, lacquer dishes, and ink.

## Colors

The current product is **light-only**. Any dark-theme references elsewhere in the repo are legacy notes or archived mocks.

- **bg (#f3efe6):** Warm limestone, never pure white.
- **panel (#fbf8f1):** Paper white for boards and cards.
- **text (#2b2620):** Ink black for primary labels.
- **text-dim (#8a8276):** Muted secondary information.
- **gold (#a8801f):** Deep amber for progress, emphasis, and earned states.
- **wall (#ddd5c4 → #cfc6b2):** Washi wall gradient for cards and raised surfaces.
- **Glow is replaced by subtle shadows.** Surfaces do not emit light; they catch and diffuse it.

## Typography

Two font stacks serve distinct roles:

- **Mincho (serif):** Logo, puzzle labels, daily title, gap-screen headings. The "voice" of the game — calligraphic authority.
- **Gothic (sans-serif):** Body text, buttons, stats, settings. The "hand" of the interface — functional clarity.

### Spacing convention

`letter-spacing` is liberal throughout: `0.5em` for the logo, `0.15–0.2em` for labels, `0.1em` for buttons. This breathing room reinforces the luxury/gallery feel. `text-indent` on centered elements compensates for trailing letter-spacing.

## Layout & Spacing

The app is a single-page vertical stack, max `560px` wide, centered with `margin: 0 auto`.

### Board sizing

Boards fill the viewport height minus chrome (header + controls ≈ `276px`) and gap between boards (`44px`). Formula:

```
board-side = min(100%, (100dvh - play-chrome - board-gap - safe-areas) / board-count)
```

Currently `board-count = 2`. A future 3-room mode will adjust `play-chrome` and the divisor.

### Safe areas

PWA standalone mode uses `black-translucent` status bar. Header adds `env(safe-area-inset-top)` to padding; main adds `env(safe-area-inset-bottom)`.

## Elevation & Depth

Depth uses shadow and border. Surfaces are flat `washi` colors with `inset box-shadow` to suggest recessed panels.

| Layer | Color | Role |
|:------|:------|:-----|
| Background | `#f3efe6` | Canvas (limestone) |
| Paper | `#fbf8f1` | Board surface |
| Washi wall | `#ddd5c4 → #cfc6b2` | Walls, tiles, cards |
| Ink | `#2b2620` | Text |
| Amber | `#a8801f` | Gold equivalent |

## Shapes

- **Board cells:** `0.5px solid var(--line)` grid. Walls have gradient fill. No rounded corners within the grid.
- **Board frame:** `border-radius: 12px`, `overflow: hidden`. Inset shadow creates the "tray" feel.
- **Balls:** Perfect circles (`border-radius: 50%`). Ink-black stone with restrained highlight.
- **Goals:** `border-radius: 50%` dashed ring, transitions to solid on approach.

### Corner radii

| Token | Value | Usage |
|:------|:------|:------|
| `sm` | `10px` | Buttons, default cards |
| `md` | `12px` | Board frame, stat boxes |
| `lg` | `14px` | Level tiles, gap card, daily card |
| `pill` | `20px` | Mode tabs, login bonus button |

## Components

### Level tile

Square (`aspect-ratio: 1`), 4-column grid. Washi wall background. Gold border when cleared, boss tiles have amber border. Contains number + move count.

### Gap card (clear screen)

Full-screen overlay with centered card. Card uses the same washi wall gradient as level tiles. Contains: move count, tsugai emblem (two balls), progress text, and action buttons (next / retry / share).

### Tsugai emblem

Two overlapping circles at 45° — the game's visual signature. Ink stones sit on a gold (best) or silver (clear) medallion dish. The emblem scales via `transform: scale()` for tile variants.

### Daily card

Horizontal bar above level grid. Gold-tinted gradient background with amber border. Left: title (Mincho) + par. Right: streak badge + status pill.

### Settings drawer

Right-side sheet, slides in with scrim backdrop. Sections: Sound, Data, Info, Purchases. Toggle switches use custom `.sw` / `.k` elements.

### Info overlays (stats, version, privacy)

Full-screen with `.info-overlay` class. Fixed header with title (Mincho, gold) + close button. Scrollable `.info-body` below.

## Do's and Don'ts

### Do

- **Icon-first, text-minimal.** Communicate with icons and visual cues. Text labels are a last resort — if an icon can say it, the text is redundant. Buttons, status indicators, and navigation should be understood at a glance without reading.
- Use gold (`--gold`) sparingly and only for meaningful states: cleared, best, active, earned.
- Maintain the paper → wall → gold layering hierarchy.
- Use `linear-gradient(160deg, …)` for all wall surfaces.
- Add `inset 0 1px 0 rgba(255,255,255,0.5)` highlight to raised paper cards.
- Keep animation minimal: slides, bumps, bounces only. Duration: 200–320ms.

### Don't

- **Don't explain with words what an icon can show.** Avoid text-heavy UI. If a screen needs a paragraph to explain itself, redesign the visuals.
- Never use pure white (`#fff`) as a background — use `--panel (#fbf8f1)`.
- Never add glow/emission effects to production UI elements.
- Never use `border-radius` > 14px on rectangular cards (keep the gallery/game-board feel).
- Never animate for decoration — every animation must communicate a state change.
- Never use color alone to indicate state — combine with border, icon, or text change.
- Don't introduce new accent colors. The palette is intentionally monochromatic gold. If something needs distinction (e.g., error), use subtle red (`rgba(200, 60, 50, …)`) only for momentary feedback (foul flash).
