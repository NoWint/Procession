# Procession Release Notes & Distribution Guide

> Version 0.1.0 — Phase 6 milestone

---

## Release Notes

### What is Procession?

Procession maps your computer's running state into a living 3D city. Every process becomes a building, every network connection becomes a glowing data cable, and every hardware sensor reading shapes the atmosphere. It is a Tauri 2.x desktop application with a Rust backend and a React Three Fiber frontend.

### New in Phase 6 (this release)

#### Performance & Polish

| Feature | Detail |
|---------|--------|
| **Adaptive quality** | FPS monitor dynamically adjusts building count (60–400) to maintain ≥30 FPS |
| **UI/UX sweep** | Process popup centered modal; Utility mode accessibility; HUD theme-aware colors; Vite chunk optimization |
| **Building lifecycle** | Birth animations (scale-up with accent flare), death animations (fade-to-black collapse) |
| **Visual fidelity** | Custom shader materials on buildings (crystalline gradient + Fresnel edge glow), tube-geometry cable arcs, energy rings at building bases, stronger bloom, cinematic camera |

#### Backend Data Pipeline

- Batched sysinfo refresh — processes, CPU, memory collected in a single lock acquisition (3× → 1×)
- TCP/UDP connection table TTL cache — eliminates redundant kernel calls across network/relations/ports collection
- Pusher clone reduction — 2 deep clones per cycle → 1

#### Time Travel (F-603)

- In-memory rolling buffer of the last 600 snapshots (~10 min at 1 Hz)
- Pause, step forward/backward, scrub, and 1×/2×/4× playback
- Press `H` to toggle the Timeline Console ("Time Lens")

#### City State Save/Load (F-606)

- Export city snapshots to JSON via the `save_file` Tauri command
- Import saved snapshots; live stream resumes appending after the imported data
- Save/Load buttons in the Timeline Console

#### Process Lifecycle Animations (F-604)

- Newborn buildings scale up from 0 with a brief accent-color flare over 0.8 s
- Dying buildings collapse to 0 over 1.0 s while fading to black
- Click events ignore transient dying instances

#### Visual Replication (Session #039)

- Extended theme system with energy colors (electric cyan, cold blue, amber, deep red, database purple, service green)
- `BuildingCluster` shader material: gradient color, Fresnel glow, always-visible labels
- `BuildingHalo`: colored energy rings scaled by building height
- `CableSystem`: smooth tube-geometry arcs with protocol-derived vertex colors
- `CityGround`: circular platform with subtle grid
- `Atmosphere`/`CityScene`: stronger bloom, exponential fog, wider camera angle

### What's New Since Phase 5

New data sources: process relations (parent-child + IPC peers), listening ports, filesystem activity hotspots, and a plugin API (third-party executables on a schedule). The frontend renders these as a relationship graph, harbor docks, a heatmap overlay, and a theme editor, plus screensaver/kiosk mode and screenshot/GIF sharing.

### Upcoming

- **F-605** Audio / sonification layer (in development)
- **D-601** This document
- **I-601** Phase 6 full acceptance

---

## Distribution Guide

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) stable (1.80+)
- Tauri CLI: `cargo install tauri-cli --version "^2.0"`
- Platform-specific toolchain:
  - **Windows**: Visual Studio Build Tools (MSVC), WiX Toolset v3 for MSI
  - **macOS**: Xcode 15+, `Developer ID Application` certificate for signing

### Quick Start (development)

```bash
git clone https://github.com/NoWint/Procession.git
cd Procession
npm install
cd src-tauri && cargo build && cd ..
npm run tauri dev
```

### Building a Release

```bash
# Standard release build
npm run tauri build

# Build with mock adapter (no real system data)
cd src-tauri && cargo build --features mock && cd ..
```

Output:
- **Windows**: `src-tauri/target/release/bundle/msi/Procession_*.msi`
- **macOS**: `src-tauri/target/release/bundle/dmg/Procession_*.dmg`

### Code Signing & Notarization

#### Windows

1. Obtain a code signing certificate (e.g., from DigiCert, Sectigo)
2. Export as PFX or PEM
3. Set environment variables (or use a `.env` file):

```bash
# Windows signing
TAURI_SIGNING_PRIVATE_KEY=<base64-pfx-or-pem>
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<pfx-password>
```

4. The bundle step will sign the MSI with `digestAlgorithm: sha256` and timestamp via `https://timestamp.comodoca.com/authenticode`.

#### macOS

1. Obtain a Developer ID Application certificate from your Apple Developer account
2. Copy `.env.example` to `.env` and fill in:

```bash
# macOS notarization
APPLE_ID=developer@example.com
APPLE_APP_SPECIFIC_PASSWORD=<app-specific-password>
APPLE_TEAM_ID=<your-team-id>
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
```

3. The build applies the hardened runtime entitlements from `src-tauri/entitlements.plist`:
   - `com.apple.security.cs.allow-jit` (Tauri WebView JIT)
   - `com.apple.security.cs.allow-unsigned-executable-memory` (Rust codegen)
   - `com.apple.security.cs.disable-library-validation` (bundled dylibs)
   - `com.apple.security.network.client` / `network.server` (system monitoring)
   - `com.apple.security.files.user-selected.read-write` (screenshots)

### CI/CD: Automated Release Pipeline

The GitHub Actions workflow (`.github/workflows/release.yml`) automates building, signing, and publishing.

#### Trigger

Push a tag matching `v*`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

#### Pipeline Stages

1. **build-windows** (windows-latest)
   - Checkout, setup Node/Rust
   - `npm run tauri build` with signing env vars
   - Generate update signature (`npx @tauri-apps/cli sign sign`)
   - Upload MSI + signature as artifact

2. **build-macos** (macos-latest, matrix: `aarch64-apple-darwin` + `x86_64-apple-darwin`)
   - Same flow as Windows, produces DMG per architecture
   - Each DMG is individually signed by the CI runner

3. **create-release** (ubuntu-latest)
   - Downloads all artifacts
   - Generates `update.json` (auto-updater manifest) with per-platform URLs + signatures
   - Creates a GitHub Release via `softprops/action-gh-release`
   - Attaches `.msi`, `.dmg`, and `update.json`

#### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Base64-encoded PFX or PEM private key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key file password |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (appleid.apple.com) |
| `APPLE_TEAM_ID` | Team ID from Apple Developer portal |
| `APPLE_SIGNING_IDENTITY` | Developer ID Application certificate name |

### Auto-Updater

Procession uses Tauri's built-in updater plugin. On each release:

1. CI generates `update.json` containing version, release date, platform download URLs, and cryptographic signatures
2. The updater endpoint points to: `https://github.com/NoWint/Procession/releases/latest/download/update.json`
3. On app launch, Tauri checks the endpoint for a newer version
4. Users see a dialog: "A new version is available. Update now?"
5. Update packages are signed with the updater key pair (generate with `npx @tauri-apps/cli signer generate -w ~/.tauri/procession.key`)

### Manual Release Process

```bash
# 1. Bump version in src-tauri/tauri.conf.json
# 2. Generate updater key pair (first time only)
npx @tauri-apps/cli signer generate -w ~/.tauri/procession.key
# 3. Paste the public key into tauri.conf.json > plugins.updater.pubkey
# 4. Commit and push
git add . && git commit -m "chore: bump version to 0.1.0"
git push
# 5. Tag and push
git tag v0.1.0
git push origin v0.1.0
# 6. CI runs automatically — monitor at https://github.com/NoWint/Procession/actions
```

### Verifying a Release

```bash
# After CI completes, check:
# - GitHub Releases page has .msi, .dmg, update.json
# - update.json contains valid platform entries
# - MSI/DMG can be installed and launched
# - Auto-updater detects the new version (app settings)
```

### Troubleshooting

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| `tauri build` fails with "no signing identity" | macOS certificate not in keychain | Run `security find-identity -v -p basic` to list identities; set `APPLE_SIGNING_IDENTITY` |
| Windows signing fails | Certificate thumbprint mismatch | Export PFX with correct thumbprint; verify with `certutil -dump procession.pfx` |
| Updater dialog shows "update failed" | Signature mismatch | Regenerate key pair, update both `pubkey` in config and the UpdaterKey secret |
| CI create-release stage fails | Missing artifacts | Check that upload-artifact paths match actual build output filenames |
