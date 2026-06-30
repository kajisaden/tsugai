# Home Result Flow

## Goal

Replace the post-clear gap overlay with a temporary clear feedback layer on the normal home screen.

The first implementation is a functional prototype. It should make the flow testable on a phone before detailed visual tuning.

## States

- `home-browse`: Normal home state. The user can browse levels with previous/next buttons and start the displayed level.
- `play`: Puzzle play state.
- `home-clear-feedback`: A transient overlay of behavior on `home-browse`, not a separate screen. Controls stay visible but are locked, and the cleared level receives label/emblem emphasis.
- `home-auto-advance`: The feedback ends by using the same target as the next-level button, then returns to normal `home-browse`.

## Clear Flow

1. User starts the level currently shown on the home screen.
2. User clears the puzzle.
3. The board clear effect runs briefly.
4. The app returns to the normal home screen with clear feedback enabled.
5. The home emblem plays the feedback animation and shows the displayed level status label.
6. After a short delay, the home state advances to the next level when possible.
7. The home screen returns to `home-browse` with the play button available.

## Home Controls

- Previous button: show the previous normal level.
- Next button: show the next normal level.
- Play button: start the level currently shown on the home screen.
- During clear feedback, previous/next/play stay visible but are disabled until auto-advance completes.

## Emblem States

- Uncleared: no dish.
- Cleared: silver dish.
- Best: gold dish.
- Boss: red blocks.

## Non-Goals For This Pass

- Remove the old gap overlay HTML/CSS completely.
- Finalize the uncleared emblem design.
- Finalize detailed animation timing and visual polish.
- Fully redesign the home layout.
- Solve daily or advanced-mode result flows.
