# Veltrix

Desktop IDE (Electron + React + TypeScript) that drives the user's installed `claude` CLI through a task pipeline:
plan → approval → code → tests → review → security → release → merge.

## Commands
- `npm run dev` — run the app with hot reload
- `npm run typecheck` — TypeScript for main/preload and renderer
- `npm test` — Vitest unit tests (`src/**/*.test.ts`; the orchestrator test uses a temporary git repo and a fake runner)
- `npm run build` — production bundles into `out/`
- `npm run build:win` — Windows installer into `dist/`
- `node e2e/smoke.mjs <projectPath> <shotsDir>` — launches the built app and screenshots every screen (set `VELTRIX_USER_DATA` to a temp dir)
- `node e2e/features.mjs <projectPath> <shotsDir>` — checks the onboarding tour, branch create/delete and view scrolling (fresh `VELTRIX_USER_DATA`)
- `node e2e/full-cycle.mjs <sandbox> <shotsDir>` — one task through the whole pipeline on real Claude (`DISCUSS=1` for the questions flow); never point it at a real project

## Layout
- `src/main` — Electron main process
  - `claude/` — locating the CLI, spawning `claude -p --output-format stream-json`, parsing the stream
  - `pipeline/orchestrator.ts` — queue + task state machine (the heart of the app); `prompts.ts`, `schemas.ts` (zod → `--json-schema`)
  - `git.ts` (simple-git), `version.ts` (semver + version files + CHANGELOG), `agents.ts` (markdown agent files), `db.ts` (`node:sqlite`)
  - `ipc.ts` — all IPC handlers; the contract lives in `src/shared/ipc.ts`
- `src/preload` — `window.veltrix` bridge (`invoke` / `on`), contextIsolation on, sandbox on
- `src/renderer` — React UI, onboarding tour in `tour.ts` (driver.js; targets are `data-tour` attributes), Zustand store (`store.ts`), i18n in `locales/{ru,en}.json`, plain CSS with design tokens in `styles.css`
- `resources/agents/*.md` — built-in agent definitions (YAML frontmatter + system prompt)

## Conventions
- Every IPC channel is declared in `IpcContract` first, then handled in `ipc.ts` and called with `call()` in the renderer.
- Every UI string goes through `t()` and must exist in both `ru.json` and `en.json`.
- Colors only through CSS variables; both light and dark themes must work.
- Main process never blocks on user input: the CLI runs with `--permission-prompts none`.
- The version and CHANGELOG are written by Veltrix on Accept (not by agents) so parallel branches never conflict on them.
