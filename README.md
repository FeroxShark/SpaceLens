# SpaceLens 🔍

**A visual disk usage analyzer for Linux.** See, at a glance, what's eating your
disk — with an interactive treemap, plain-language explanations of system
folders, the largest files on your drive, and one-click cleanup of common junk.

> *Un analizador visual de uso de disco para Linux. Mirá de un vistazo qué se
> está comiendo tu disco.*

Built with [Tauri](https://tauri.app) (Rust) + React. Fast parallel scanning,
tiny binary, native window.

> A one-night project, built out of boredom. *Un proyecto de una sola noche,
> hecho por aburrimiento.* 🌙

---

## Features

- **Interactive treemap** — nested colored blocks sized by how much space each
  folder uses. Click to zoom in, breadcrumb to go back.
- **Beginner-friendly explanations** — hover or right-click any folder and
  SpaceLens tells you *what it is*, the *risk of deleting it*, and a *tip* to
  free space safely. Safety is graded 🟢 safe / 🟡 with care / 🔴 don't touch.
  When it can't identify something it says so honestly (❔) instead of guessing —
  inferring what it can from the location, name, or file type and warning you
  before you delete.
- **Folder Guide tab** — a searchable reference of the whole Linux filesystem
  (`/`, `~`, dev/build folders, caches) grouped and explained for newcomers.
- **Multi-distro** — works on Arch/CachyOS, Debian/Ubuntu, Fedora and more.
  It detects your distribution and package manager and shows the right cleanup
  command (`paccache`, `apt clean`, `dnf clean all`, `flatpak uninstall`…).
- **Largest files** — a flat top-100 list of the biggest individual files.
- **Color by file type** — switch the map to color videos, images, games, code,
  packages, etc. to spot what kind of thing is taking room.
- **Cleanup suggestions** — finds known caches and junk (pacman cache, browser
  caches, trash, AUR build leftovers…) and shows how much you'd reclaim.
- **Safe deletion** — move to Trash (recoverable) by default, or permanent if you
  choose in Settings. System folders require typing the name to confirm.
- **English / Español** — asks on first run, changeable in Settings.

---

## Install

### Download (recommended)

Grab the latest `SpaceLens-*.AppImage` or `.deb` from the
[Releases](../../releases) page.

```bash
chmod +x SpaceLens-*.AppImage
./SpaceLens-*.AppImage
```

### Arch / CachyOS — build from source

```bash
# Dependencies
sudo pacman -S --needed rust nodejs npm webkit2gtk-4.1 base-devel

git clone https://github.com/<you>/SpaceLens.git
cd SpaceLens
npm install
npm run tauri build
# binary: src-tauri/target/release/spacelens
# bundles: src-tauri/target/release/bundle/
```

---

## Wayland note

On some Wayland setups (certain NVIDIA / tiling-compositor configs) WebKitGTK
can fail to start. SpaceLens already disables the DMABUF renderer to avoid the
most common case. If the window still won't open, run it through XWayland:

```bash
GDK_BACKEND=x11 ./SpaceLens-*.AppImage
```

---

## Development

```bash
npm install
npm run tauri dev      # hot-reload dev build
cargo test --manifest-path src-tauri/Cargo.toml   # scanner unit tests
```

### How it works

- **`src-tauri/src/scanner.rs`** — parallel filesystem walk (rayon) that builds
  an in-memory arena tree with recursive sizes, dedupes hardlinks, and can stay
  on one filesystem. Serves pruned/lazy views to the UI.
- **`src-tauri/src/disks.rs`** — disk enumeration (sysinfo), collapsing btrfs
  subvolumes into one card per device.
- **`src-tauri/src/fs_ops.rs`** — trash/permanent delete and cleanup scanning.
- **`src/lib/treemap.ts`** — squarified treemap layout (d3-hierarchy) rendered to
  a canvas.
- **`src/data/linux-dirs.json`** — the folder knowledge base for explanations.

---

## License

MIT
