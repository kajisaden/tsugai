# A Blue Ring Audit

Target reference: `web/pastel-theme-mock.html` A Blue Ring / Blue Fill / Minimal Blue family.

Current runtime inspected: `http://127.0.0.1:4173/index.html` on level `#12` / `0/4手詰`.

## Observed state

- The current light mode is already much closer to the mock than the old dark presentation.
- The biggest remaining gaps are in object treatment: the board frame, wall relief, goal ring thickness, and the piece silhouette/indicator details.
- The mock is calmer and more "paper tile" like. The runtime still reads slightly more like a UI skin than a designed surface.

## Implemented in this pass

- Board frame and wall tiles were tightened toward the mock's paper-tile look.
- The goal ring was made thicker and cleaner in blue.
- The active board now shows the small blue move marker and short guide line seen in the mock.
- The light-mode action buttons were aligned to the mock's softer cream cards.

## TODO

- [ ] Header status
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css) and [`web/index.html`](C:/Users/gc38x/Projects/tsugai/web/index.html)
  - Gap: `#12`, `0/4手詰`, and the answer pill are close, but the mock is more compact and the answer pill feels more like a soft outlined capsule.
  - Test: compare spacing and typography on the `#12` / `0/4手詰` state after each CSS tweak.

- [ ] Back / settings buttons
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css)
  - Gap: shape and fill are close, but the mock buttons are slightly softer and more inset, with a more obvious cream tile feel.
  - Test: verify corner radius, fill gradient, and shadow depth against the mock.

- [ ] Board frame
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css)
  - Gap: the frame needs a more deliberate carved inset look. The mock reads like a paper board with a subtle raised edge.
  - Test: compare board border thickness, inner shadow, and overall board tone.

- [ ] Wall tiles
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css)
  - Gap: walls are the most visible mismatch. The mock walls feel like raised square tiles with clearer vertical separation and stronger relief.
  - Test: compare a single wall tile and a cluster of adjacent walls side by side with the mock.

- [ ] Goal ring
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css)
  - Gap: the target in the mock is a thicker, cleaner blue rounded square ring with a more graphic presence.
  - Test: compare the empty goal ring, the active ring, and the filled state.

- [ ] Piece silhouette
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css)
  - Gap: the mock piece is a more intentional blue tile. The runtime piece is close, but still reads slightly softer and less graphic.
  - Test: compare highlight placement, corner radius, and tile-like depth.

- [ ] Active-piece marker
  - Current code: [`web/app.js`](C:/Users/gc38x/Projects/tsugai/web/app.js)
  - Gap: the mock shows a small top marker / badge-like cue that the runtime does not currently surface in the same way.
  - Test: check whether this cue should be an idle indicator, an active selection marker, or a move preview.

- [ ] Contact glow
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css)
  - Gap: the mock uses blue for the wall-hit / contact emphasis. Runtime is already blue, but the shape and opacity still need tightening.
  - Test: compare hit flash, ripple, and wall hint glow on a bounce frame.

- [ ] Lower controls
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css)
  - Gap: reset / hint buttons are close, but the mock keeps them a bit lighter and more card-like.
  - Test: compare the button surface with the header buttons to make sure they belong to the same family.

- [ ] Layout balance
  - Current code: [`web/style.css`](C:/Users/gc38x/Projects/tsugai/web/style.css)
  - Gap: the runtime is slightly more compressed vertically than the mock. The mock gives the board more breathing room and a more centered feel.
  - Test: verify the vertical rhythm on the same level number / move count state.

## Test notes

- Confirmed the app renders on local HTTP at `http://127.0.0.1:4173/index.html`.
- Confirmed the login bonus overlay blocks the first visible state and must be dismissed before gameplay comparison.
- Confirmed level `#12` loads and the runtime reports `0/4手詰`.
- Captured a screenshot of the actual play screen and compared it with the mock reference.

## Next step

Work through the TODOs in this order:

1. Board frame and wall tiles
2. Goal ring
3. Piece silhouette
4. Active-piece marker / contact glow
5. Header and lower controls

The remaining work is now mostly fine-tuning rather than a major shape rewrite.
