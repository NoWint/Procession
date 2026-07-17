# Procession

> System state visualized as a living 3D city.

Procession is a Tauri 2 desktop application that turns your computer's processes, network connections, and hardware sensors into an isometric Monument Valley–inspired city. Each process is a building; active processes glow with halos; network cables arc between buildings and remote endpoints; particles flow along those cables to show live traffic.

![Procession hero screenshot](./docs/hero.png)

*Demo video: [docs/demo.md](./docs/demo.md)*

## Features

- **Living 3D city** — processes become buildings whose height reflects CPU usage; parent/child relationships cluster into neighborhoods.
- **Real-time HUD** — CPU, memory, network throughput, and process count update live in the corner overlay.
- **Utility mode** — press `Space` to reveal process labels and a sortable process monitor; click a process to fly the camera to its building.
- **Theme system** — switch between Monument Valley Noir (dark), Monument Valley Light, and Midnight Blue; your choice persists across sessions.
- **Network visualization** — cables connect processes to remote endpoints; protocol-aware colors (TCP, UDP, HTTP/HTTPS) and flowing particles show traffic.
- **Performance optimized** — layout is cached until the process topology changes; distant labels and halos are capped; particle density adapts to cable count to keep 60 fps with hundreds of buildings and 30 fps with 1000+.
- **Cross-platform** — native Rust backend with platform adapters for macOS (`sysinfo` + IOKit) and Windows (WMI + DXGI), packaged as `.dmg` (macOS) and `.msi` (Windows).

## Install

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) stable
- Tauri CLI: `cargo install tauri-cli --version "^2.0"`

### Clone and run

```bash
git clone https://github.com/NoWint/Procession.git
cd Procession
npm install
cd src-tauri && cargo build
cd ..
npm run tauri dev
```

The app will open a desktop window pointing to `http://localhost:1420`.

### Build a release package

```bash
npm run tauri build
```

On macOS this produces `src-tauri/target/release/bundle/dmg/*.dmg`.  
On Windows this produces `src-tauri/target/release/bundle/msi/*.msi`.

## Controls

| Key / Action | Description |
| --- | --- |
| `Space` | Toggle Utility Mode (labels + process monitor) |
| `Escape` | Close Utility Mode, deselect process, clear camera target |
| Click building | Show process details |
| Double-click building | Fly camera to building |
| Theme selector | Switch color themes from the top-right dropdown |

## Architecture

```
┌─────────────────────────────────────┐
│  React + React Three Fiber frontend  │
│  - CityScene, BuildingCluster,       │
│    CableSystem, CableFlow, HUD, etc. │
└──────────────┬──────────────────────┘
               │ Tauri IPC
┌──────────────▼──────────────────────┐
│  Rust backend                        │
│  - platform adapters (macOS/Windows) │
│  - system snapshot (CPU/memory/net)  │
└─────────────────────────────────────┘
```

- `src/` — TypeScript/React frontend, theme system, layout algorithms, and 3D components.
- `src-tauri/src/` — Rust backend, platform-specific sensor collection, and Tauri commands.
- `public/themes/` — JSON theme files defining colors, typography, and scene fog.
- `.github/workflows/release.yml` — CI workflow for cross-platform builds.

## Roadmap

See [PLAN.md](./PLAN.md) for the full task ledger. Completed phases include foundation, visual system, network visualization, and product polish. Future ideas are tracked under **Phase 5 — 无限可能**.

## License

[GNU General Public License v3.0](./LICENSE)

Copyright (C) 2026 NoWint
