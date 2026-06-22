# ADR-0001: Tech Stack

- **Date:** 2026-06-22
- **Status:** Accepted
- **Source:** `technical-guidelines.md` §1 (Authoritative)

---

## Context

The app must run on Linux desktop and Android with close to feature parity between
the two platforms. The editor is the most complex component and requires fine-grained
control over the document model (custom wiki-link nodes, Typora-style cursor reveal).
The user has no runtime restrictions on Rust, Node.js, Python, JVM-based languages,
or similar modern ecosystems; Go and PHP are explicitly excluded.

---

## Decision

### Desktop (Linux)
- **Runtime:** Node.js via **Electron**
- **UI Framework:** React 18 + TypeScript
- **IPC:** Electron `contextBridge` + typed `ipcRenderer`/`ipcMain` channels
- **Build tool:** Vite (renderer) + `tsc` (main process) + `electron-builder` (packaging)

### Mobile (Android)
- **Runtime:** **Capacitor** wrapping the same React application
- **Native layer:** Capacitor plugins written in **Kotlin** (Filesystem, SyncForegroundService)
- **Minimum API level:** 26 (Android 8.0)

### Shared
- **Language:** TypeScript throughout — app code, editor extensions, sync logic, server
- **State management:** **Zustand** (slices: vault, notes, ui, sync, search, theme)
- **Styling:** **Tailwind CSS** + CSS custom-property design-token layer for accent colors and themes

---

## Rationale

**Electron over Tauri:**
The editor engine (ProseMirror) is JavaScript-native. A Tauri Rust core would add a
serialization boundary between the editor and the file system layer with no compensating
benefit at this scale (<1,000 notes). Electron's Chromium renderer gives a unified DOM
environment with the Capacitor mobile build.

**Capacitor over React Native:**
Capacitor shares 100% of the React component tree and editor code with the desktop build.
React Native's bridge and separate component model (no DOM, no ProseMirror decorations)
would require maintaining two UI trees and porting the entire editor.

**Zustand over Redux/Jotai:**
Minimal boilerplate, works with React 18 concurrent mode, slice pattern maps cleanly to the
domain (vault, notes, sync are naturally separate slices).

**Tailwind + design tokens:**
Tailwind handles utility-first layout; CSS custom properties (`--accent-500`, `--surface-base`,
etc.) handle the theming layer that Tailwind's class model cannot cover dynamically.

**TypeScript throughout:**
Shared types (`NoteRecord`, `Outlink`, `SyncStatus`) flow from `packages/common` across the
desktop, Android, and server packages without manual type duplication.

---

## Consequences

- The Electron binary is large (~150 MB). Acceptable for a desktop app; not relevant for Android.
- Capacitor's Filesystem plugin restricts vault storage to app-scoped external storage on Android.
  The user must be aware that the vault path on Android is inside the Capacitor sandbox, not at
  an arbitrary path like on desktop.
- Minimum Android API 26 excludes devices older than Android 8.0 (released 2017). Acceptable
  for a personal-use app.
- The sync server is also TypeScript + Node.js — no additional runtime to manage for self-hosting.
