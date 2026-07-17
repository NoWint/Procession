# Procession Demo

A short walkthrough of Procession's core visual features.

## Demo Video

> **Placeholder** — the final screen recording will be attached to the next release.
> To record locally, run `npm run tauri dev` and capture a 30–60s clip showing the items below.

## Feature Timestamps

| Time | Feature | What to show |
| --- | --- | --- |
| 00:00 | Launch | App opens to the living 3D city; buildings pulse gently |
| 00:05 | HUD | CPU, memory, network, and process count visible in the top-left overlay |
| 00:10 | Theme toggle | Switch between Noir, Light, and Midnight Blue via the top-right dropdown |
| 00:20 | Network cables | Cables arc from process buildings to remote endpoints; particles flow along them |
| 00:30 | Utility mode | Press `Space` to show process labels and the sortable process monitor |
| 00:40 | Camera fly-to | Click a process row to fly the camera to its building |
| 00:50 | Process details | Click a building to open the process popup |

## Screenshots

- `hero.png` — main city view with HUD and cables.
- `utility-mode.png` — labels + process monitor overlay.
- `theme-light.png` — Monument Valley Light theme.

## Recording Checklist

- [ ] App launches without console errors
- [ ] Theme switch is visible and smooth
- [ ] Cables and particles are clearly visible
- [ ] Utility mode opens/closes with `Space`
- [ ] Camera fly-to completes without stutter
- [ ] FPS counter stays ≥ 30 with 500+ buildings
