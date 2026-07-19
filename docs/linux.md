# Linux Build Guide

This guide walks a Linux user through building Procession from source. Procession is a Tauri 2.x desktop app: Rust backend (`src-tauri/`) + React Three Fiber frontend (`src/`). The Linux backend adapter (`src-tauri/src/engine/linux.rs`) is already implemented, so a clean checkout builds and runs on any modern Linux distribution that can satisfy the Tauri Linux toolchain.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Rust](https://www.rust-lang.org/tools/install) | stable (1.80+) | Install via `rustup`. |
| [Node.js](https://nodejs.org/) | 20+ | Use `nvm`, `fnm`, or your distro's package manager. |
| `npm` | ships with Node | Used for all script entry points. |
| Tauri system packages | see below | WebKit2GTK 4.1 and friends. |

Rust edition is 2021 (`src-tauri/Cargo.toml`). The Tauri CLI is provided transitively via `@tauri-apps/cli` in `devDependencies`, so no global `cargo install tauri-cli` is required.

---

## System Dependencies

Tauri 2.x requires **WebKit2GTK 4.1** (not 4.0). Install the package group that matches your distribution.

### Debian / Ubuntu (apt)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

Notes:
- Ubuntu 22.04 ships `libwebkit2gtk-4.0-dev` in the default archive. Tauri 2.x needs 4.1; install it from a PPA or upgrade to Ubuntu 24.04+.
- `libxdo-dev` is required by `tauri-plugin-opener` (declared in `src-tauri/Cargo.toml`).
- `libayatana-appindicator3-dev` is listed for parity with the standard Tauri prereqs; it is only needed if a tray plugin is added later.

### Fedora (dnf)

```bash
sudo dnf install -y \
  webkit2gtk4.1-devel \
  clang-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  gcc
```

If `webkit2gtk4.1-devel` is unavailable on your Fedora release, use `webkit2gtk4-devel` only as a last resort; Tauri 2.x will fail to link against 4.0.

### Arch Linux (pacman)

```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  openssl \
  curl \
  wget \
  file \
  xdotool \
  libappindicator-gtk3 \
  librsvg
```

`base-devel` covers `gcc`, `make`, and related build tools. `xdotool` provides the runtime that `libxdo` links against.

---

## Clone and Install

```bash
git clone https://github.com/NoWint/Procession.git
cd Procession
npm install
```

`npm install` pulls Vite, React 19, three.js, R3F, the Tauri JS API, and the `@tauri-apps/cli` binary. No extra global installs are needed.

---

## Build 3D Assets (optional, recommended)

The repo ships prebuilt GLB files under `public/models/`. To regenerate them from source geometry (e.g. after editing the procedural mesh definitions):

```bash
npm run build:assets
```

This runs `scripts/build-assets.mjs`, which uses `three`'s `GLTFExporter` to write the building, vehicle, roof-detail, and skyline-silhouette GLBs back into `public/models/`.

---

## Development

```bash
npm run tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and launches the Tauri window pointing at it. Hot Module Replacement is active for frontend changes; Rust changes trigger a backend rebuild and window restart.

The first Rust build will take a few minutes. Subsequent builds are incremental.

---

## Production Build

The default `tauri.conf.json` bundle targets are `["msi", "dmg"]` (Windows and macOS). To produce Linux packages, pass the `--bundles` flag to override the config:

```bash
# Build .deb and .AppImage
npm run tauri build -- --bundles deb,appimage

# Build .rpm
npm run tauri build -- --bundles rpm

# Build everything the host can produce
npm run tauri build
```

You do not need to edit `src-tauri/tauri.conf.json` to build Linux artifacts; `--bundles` is sufficient.

---

## Artifacts Location

Built installers land under the standard Tauri release bundle directory:

```
src-tauri/target/release/bundle/
  deb/      # Procession_0.1.0_amd64.deb
  appimage/ # Procession_0.1.0_amd64.AppImage
  rpm/      # Procession-0.1.0-1.x86_64.rpm
```

The raw executable is at `src-tauri/target/release/procession`.

---

## System Data Sources on Linux

The Linux PlatformAdapter (`src-tauri/src/engine/linux.rs`, B-701) reads system state through the channels below. All collection happens in Rust at 1 Hz and is pushed to the frontend via Tauri events; no shell-outs are performed.

| Domain | Source | Notes |
|--------|--------|-------|
| CPU usage | `sysinfo` (`/proc/stat`) | Per-core and aggregate. |
| Memory | `sysinfo` (`/proc/meminfo`) | RAM + swap. |
| Processes | `sysinfo` (`/proc/[pid]/`) | PID, PPID, name, CPU%, memory, state. |
| Network throughput | `sysinfo` (`Networks` -> `/proc/net/dev` delta) | Bytes/sec up and down. |
| Disk usage | `sysinfo` (`Disks`) | Per-volume usage percent. Disk I/O rate is currently zero (stub). |
| CPU temperature | `/sys/class/thermal/thermal_zone*/temp` | Picks the first zone whose type starts with `x86`, contains `cpu`, or equals `acpitz`. Returns millidegrees / 1000. |
| GPU | not available | `get_gpu()` returns `None` on Linux. Vendor-specific paths (nvml / amdgpu / `/sys/class/drm`) are deferred. |
| TCP/UDP connections | stub | `get_network()` returns an empty connection list; a future revision will parse `/proc/net/tcp`. |

---

## Known Issues

- **WebKit2GTK 4.0 vs 4.1.** Tauri 2.x links against 4.1. Distros that ship only 4.0 (notably Ubuntu 22.04 and older) must obtain 4.1 from a PPA or upgrade the distro.
- **Wayland compositors.** WebKit2GTK may flicker or fail to receive input on some Wayland compositors. If you see rendering glitches, force the X11 backend:
  ```bash
  GDK_BACKEND=x11 npm run tauri dev
  ```
- **AppImage on hardened kernels.** AppImage launches may be blocked by kernel sandbox policies. If the AppImage fails to start with a sandbox error, you can run with `--no-sandbox` to diagnose. This is not recommended as a permanent solution; prefer adjusting kernel policy or using the `.deb`/`.rpm` package instead.
- **Thermal zones unreadable.** Reading `/sys/class/thermal/thermal_zone*/temp` requires the `thermal` kernel module, which is auto-loaded on most modern kernels. On stripped-down kernels, run `sudo modprobe thermal` and ensure the user can read the sysfs files. Some distros restrict certain zones to root; in that case the temperature column in the HUD will simply be hidden.
- **No GPU telemetry.** The HUD will not show GPU metrics on Linux. This is expected (see the table above).

---

## Verifying the Installation

1. Launch the app in dev mode (`npm run tauri dev`) or from a built bundle.
2. On first launch you should briefly see an empty placeholder city with the status line "Waiting for system data...".
3. Within ~1 second the first `SystemSnapshot` arrives and buildings appear, sized by CPU/memory and colored by process type (system = blue, user = orange, active = white/gold).
4. Open the HUD with the spacebar to confirm CPU, memory, disk, network, and (if available) temperature readings are non-zero.
5. Double-click any building to fly the camera to it; single-click to open the process detail popup.

If all of the above works, the Linux build is functional.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `error: failed to run custom build command for openssl-sys` | `libssl-dev` / `openssl-devel` not installed | Install the OpenSSL dev package for your distro (see System Dependencies). |
| `error: linking with cc failed: exit status 1` | Missing WebKit2GTK or `build-essential` | Install the full apt/dnf/pacman group listed above. Tauri 2.x needs `webkit2gtk-4.1`, not 4.0. |
| WebKit2GTK version mismatch at link time | Distro only ships 4.0 | Upgrade to a distro that ships 4.1, or use a PPA (Ubuntu). |
| `error: cannot find libxdo` | `libxdo-dev` / `xdotool` missing | Install it; required by `tauri-plugin-opener`. |
| App window opens but is blank / black | Wayland compositor incompatibility | Run with `GDK_BACKEND=x11 npm run tauri dev`. |
| Permission denied reading `/sys/class/thermal/*` | User lacks read access to thermal sysfs | Check `ls -l /sys/class/thermal/thermal_zone0/temp`. Some distros require the user to be in the `video` or `systemd-journal` group, or root for certain zones. |
| `.deb` / `.AppImage` not produced by `npm run tauri build` | Default bundle targets are `msi` and `dmg` | Pass `-- --bundles deb,appimage` (see Production Build). |
| `npm run tauri dev` starts but no buildings appear | Backend panic or permission issue | Check terminal output for Rust panics. Confirm `cargo` and the WebKit runtime are on `$PATH`. |

---

## Next Steps

- Read [docs/release.md](release.md) for the cross-platform release and signing workflow.
- Read [.docs/ARCHITECTURE.md](../.docs/ARCHITECTURE.md) for the engine, PlatformAdapter, and IPC data contract.
- Read [.docs/SPEC.md](../.docs/SPEC.md) for the full visual system and interaction model.
