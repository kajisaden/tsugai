# A Blue Ring Handoff

Last updated: 2026-06-28

## Goal

Use `web/a-blue-ring-cut.html` as the visual target for the light-mode play screen.

The current direction is not to rebuild the game from the mock. Keep the existing game logic in `web/app.js` and continue moving the real play screen toward the target mock, one part at a time.

## Current Verification Marker

- Current visible version marker: see `var V` in `web/index.html` (auto-incremented by `tools/stamp-cache.mjs` every deploy, so check the source rather than trusting a hardcoded number here).
- `web/index.html` automatically rewrites the URL to `?v=<V>` and updates `#build-mark` to match.
- Local test URL: `http://127.0.0.1:4173/index.html` (the inline script appends the current `?v=`).

## Reference Files

- Target single-screen mock: `web/a-blue-ring-cut.html`
- Original multi-variant mock: `web/pastel-theme-mock.html`
- Gameplay implementation: `web/index.html`, `web/app.js`, `web/style.css`
- Earlier audit note: `docs/blue-ring-audit.md`

## Adopted Design State

### Board

- Board cells are now square.
- `web/app.js` sets both:
  - `cells.style.gridTemplateColumns = repeat(w, 1fr)`
  - `cells.style.gridTemplateRows = repeat(h, 1fr)`
- Light board background no longer uses the diagonal `linear-gradient`.
- Light board background is flat: `#e7d8c3`
- Board frame/shadow is still kept:
  - `inset 0 1px 5px rgba(255, 255, 255, 0.75)`
  - `inset 0 -10px 20px rgba(62, 55, 45, 0.06)`

### Wall Blocks

- Wall block is drawn with `.cell.wall::before`, not by shrinking `.cell.wall`.
- This keeps the grid lines around wall cells visible.
- Adopted values:
  - `inset: 10%`
  - `border-radius: 12px`
  - `border: 2.5px solid rgba(63, 80, 94, 0.34)`
  - outer shadow uses "C Current":
    - `0 3px 5px rgba(76, 54, 39, 0.13)`
- Inner wall block shadows:
  - `inset 2px 2px 0 rgba(255, 255, 255, 0.34)`
  - `inset -2px -3px 0 rgba(74, 58, 43, 0.12)`

### Ball Block

- Ball block has been aligned to wall block size and corner radius.
- Adopted values:
  - `inset: 10%`
  - `border-radius: 12px`
- Ball visual was restored close to `A Blue Ring`:
  - background: `linear-gradient(145deg, #fafdff 0%, #9ecde3 52%, #669fbe 100%)` (normal in-play ball; lightened after the "blue depth" tuning)
  - border: `2px solid rgba(36, 107, 143, 0.5)` (applied via `.ball::before`)
  - shadow:
    - `inset 2px 2px 0 rgba(255, 255, 255, 0.46)`
    - `inset -3px -3px 0 rgba(74, 48, 35, 0.14)`
    - `0 3px 5px rgba(76, 54, 39, 0.13)` (cast shadow softened from the earlier `0 6px 10px rgba(92, 62, 45, 0.22)`)
  - Note: the earlier `#f7fbff/#8fc1d9/#3f7fad` gradient + `0 6px 10px rgba(92,62,45,0.22)` shadow now live only on the **clear-state** ball (`#boards.clear-best/.clear-win .ball`), not the normal ball.

### Ball Highlight

- Adopted highlight variant: `B Left Up S`
- Values:
  - `left: 27%`
  - `top: 24%`
  - `width: 18%`
  - `height: 18%`
  - `border-radius: 50%`
  - `background: rgba(255, 255, 255, 0.55)`

## Suggested Next Steps

Continue in this order:

1. Compare ball block against `web/a-blue-ring-cut.html` visually after the latest highlight change.
2. Tune ball body if needed:
   - blue depth
   - outer border strength
   - bottom thickness
   - cast shadow strength
3. Then move to goal block and active marker alignment.
4. After play-screen parts settle, check mobile viewport spacing.

## Git/Worktree Notes

The worktree currently has uncommitted changes and untracked design/mock files. Do not reset or discard them.

Known modified implementation files:

- `web/app.js`
- `web/index.html`
- `web/style.css`

Known untracked reference/mock files:

- `web/a-blue-ring-cut.html`
- `docs/blue-ring-audit.md`
- `docs/blue-ring-handoff.md`
