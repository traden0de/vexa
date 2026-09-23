# Vexa — desktop IDE for managing Claude Code agents

## Status (2026-09-23)
Stages 1–8 are implemented and verified:
- 19 unit tests, including the whole pipeline on a temporary git repo with a fake Claude.
- A real end-to-end run on `veltrix-sandbox`, driven through the UI with real Claude: planning → approval → code → tests → review → security → release → Accept. The result was a merge, the `v0.2.0` tag, the bump in package.json and a CHANGELOG entry. It took 81 s.
- The Windows installer builds.

Deviations from the plan:
- **Styling:** plain CSS with design tokens, taken directly from the approved prototype, instead of Tailwind/shadcn. The result is the same look with fewer dependencies.
- **Versioning:** the version and CHANGELOG are applied by Vexa on **Accept**, not by the release agent in the branch. Tasks that are merged one after another therefore never conflict on version files. The release agent only proposes the bump and the changelog lines.
- **Reports:** agent reports use `claude --json-schema` structured output. The CLI supports it, so the text-parsing fallback is rarely needed.

## Context
You want an app where dev work is driven through a GUI instead of typed commands: create tasks as cards, press "Send to work", and a set of built-in agents takes each task through the full cycle (plan → code → tests → code review → security → version bump → git). Tasks run **one at a time** so they can't break each other. The app can open any existing project and respects that project's `CLAUDE.md`, `.claude/agents` and `.claude/settings.json`. It runs the `claude` CLI you already have installed and logged in (Pro subscription), so it needs no API keys. It will be open source.

What you chose: **approve the plan** (the agent writes a plan, you approve it with a button, the rest runs on its own up to the final diff), **one branch per task with a local merge**, **RU + EN UI (i18n)**, **Windows first**.

`D:\Programming\veltrix` is empty. Available: Node 24, git 2.55, Claude Code 2.1.280. Rust isn't installed, so the stack is Node-only.

## Stack
- **Electron + electron-vite + TypeScript**: Node-only, so no Rust. Later builds for macOS/Linux come from the same code.
- **React 19 + Tailwind v4 + shadcn/ui (Radix)**: a clean dark/light UI. **dnd-kit** for the kanban board, **Monaco DiffEditor** for diffs, **Zustand** for state, **i18next** for RU/EN.
- **Storage:** `node:sqlite` (built into Node, no native build) in `userData/vexa.db`, holding tasks, runs, event logs and settings.
- **Git:** `simple-git`, a wrapper around the system git.
- **Versions:** `semver`, plus version-file adapters: package.json, pyproject.toml, Cargo.toml, *.csproj, VERSION.
- **Packaging:** electron-builder (NSIS installer for Windows). GitHub Actions CI for lint, typecheck, tests and the build.
- **Tests for the app itself:** Vitest (main/shared) and Playwright-electron (smoke).

## Why this stack
- **Electron rather than Tauri.** Tauri would give a smaller installer, but it needs Rust (not installed here) and a second language in the codebase. Electron is pure TypeScript from backend to UI, which lowers the bar for open-source contributors. VS Code, Cursor and Claude Desktop run on Electron, so the approach is proven for IDEs.
- **Why speed doesn't suffer.** The heavy work runs in the `claude` process, not the UI. Vite gives instant HMR, and React 19 with Zustand re-renders only what changed.
- **Why React + shadcn/ui + Tailwind.** It's the largest ecosystem: ready components (dialogs, menus, tabs), accessibility through Radix, and simple theming. It's also the stack Claude writes best, which matters because the app will be built by agents too.
- **Monaco.** The same editor as VS Code, with a proper diff view.
- **`node:sqlite`.** A reliable, fast database without native builds, which cause frequent problems on Windows.
- **Spawning `claude` rather than the Agent SDK.** The SDK needs an API key. The CLI uses your existing Pro login, is updated independently of the app, and automatically picks up CLAUDE.md, hooks, MCP and the project's agents.

## Step 0 (before writing code)
1. Save this plan to `D:\Programming\veltrix\docs\PLAN.md`.
2. Build a **clickable design prototype**: one HTML page (static, fake data) with the screens Home, Board, Task (log, plan approval, review with diff, reports), Git panel, Agents, and Settings, plus RU/EN switching and dark/light themes. Save it to `docs/prototype/index.html` and publish it as an Artifact so you can open it in a browser.
3. Change the design based on your feedback, then move on to stage 1.

## How the app calls Claude
The app spawns the user's own `claude` binary (found on PATH as `claude.exe` or `claude.cmd`) with cwd set to the project root, so CLAUDE.md and the project settings load automatically:
```
claude -p --output-format stream-json --verbose --include-partial-messages
       --permission-mode <plan|acceptEdits> --allowedTools ... 
       --append-system-prompt <agent role> [--resume <sessionId>] [--model ...]
```
- The prompt goes through **stdin**, which avoids Windows quoting problems and command-line length limits.
- The JSONL stream is parsed into events (text, tool_use, tool_result, result + cost/usage) and shown live in the task card.
- The `session_id` from the result is saved. Fix loops reuse the developer's session through `--resume`, which saves both context and your limits.
- Agent verdicts (review, security, tests) come back as structured JSON: `--json-schema` if this CLI version supports it, otherwise the final ```json block is parsed and validated with zod.
- Subscription limits: the app spots "usage limit reached" in the stream, pauses the queue with the status "Limit, resumes at HH:MM", and continues automatically.
- The **Stop** button kills the process tree (`taskkill /T /F` on Windows).

## Task pipeline (one queue per project, strictly sequential)
Board columns: **Backlog → Queue → Planning → Plan approval → In progress → Ready for review → Done / Failed**.

1. **Pre-flight:** check that `claude`/git exist and that the working tree is clean. If it isn't, the app offers the buttons "Commit", "Stash" and "Cancel". It then creates the branch `vexa/<id>-<slug>` from the base branch.
2. **Planner** (`--permission-mode plan`, read-only) writes the plan. The card moves to "Plan approval", where you can **Approve**, **Edit the plan** or **Re-plan with a comment**.
3. **Developer** (`acceptEdits`, Bash/Edit/Write) implements the approved plan and commits.
4. **Tester** writes or updates tests and runs them. It finds the test command from CLAUDE.md, package.json, pytest and similar files, and the result is JSON `{passed, failures[]}`.
5. **Code Reviewer** (read-only) returns JSON `{verdict, issues[{severity,file,line,msg}]}`.
6. **Security Auditor** (read-only: secrets, injections, dependencies via `npm audit`/`pip-audit` when available) returns JSON with severity levels.
   - If steps 4–6 fail (tests fail, changes are requested, or security finds high/critical issues), the task goes back to the **Developer** with the list of problems. The loop is limited to N iterations (default 3). Past that limit the task is marked "Failed" and all logs are kept.
7. **Release** proposes a MAJOR/MINOR/PATCH bump based on the task type and the diff (breaking → major, feature → minor, fix → patch), updates the version files and CHANGELOG.md, and commits `chore(release): vX.Y.Z`.
8. **Ready for review:** the screen shows the diff (Monaco), the reports from every agent, the cost and time, and a bump selector you can override. The buttons are:
   - **Accept**, which runs `merge --no-ff` into the base branch and creates the tag `vX.Y.Z`.
   - **Rework**, which takes a comment and sends the task back to the Developer.
   - **Reject**, which deletes the branch.
   - **Push** is a separate button in the Git panel.

## Built-in agents
Every agent is a markdown file with frontmatter (name, role, model, permissionMode, allowedTools, output schema) and a prompt. The defaults live in `resources/agents/`. You can edit them in the UI ("Agents" screen), and per-project overrides go in `<project>/.vexa/agents/*.md`. The project's own `.claude/agents` stay available to Claude as they are.
Agents: planner, developer, tester, reviewer, security, release.

## UI screens
- **Home:** recent projects, "Open folder", "Clone repository", and an environment check (claude/git/login).
- **Board:** kanban with drag and drop, a "+ Task" button (title, description, type feature/fix/refactor/breaking, priority, attachments), and "Start queue" / "Pause" buttons.
- **Task (side panel):** a pipeline stepper, the agent's live log (messages and tool calls collapsed into readable blocks), the plan, reports, diff, and action buttons.
- **Git panel:** status, changed files with diffs, commit (message can be generated by an agent), branches, log, pull/push, tags. Everything is buttons.
- **Project:** view/edit CLAUDE.md, a "Create CLAUDE.md" button (runs `/init` through claude), versions and CHANGELOG.
- **Settings:** language, theme, model per agent, fix-iteration limit, base branch, path to claude.

## Project structure
```
src/main/        Electron main process
  claude/        runner.ts (spawn + stream-json parser), locate.ts, limits.ts
  pipeline/      orchestrator.ts (state machine), queue.ts, stages/*.ts
  git/           gitService.ts (simple-git), branchFlow.ts
  version/       bump.ts, adapters/*.ts, changelog.ts
  agents/        loader.ts (frontmatter + overrides)
  db/            sqlite.ts, migrations, repositories
  ipc/           typed handlers
src/preload/     contextBridge, typed API (contextIsolation, no nodeIntegration)
src/renderer/    React: pages/, components/board, task, git, diff; stores/; i18n/{ru,en}.json
src/shared/      types, zod schemas for agent verdicts, IPC contract
resources/agents/*.md
```

## Implementation stages
1. Scaffold: electron-vite, Tailwind/shadcn, i18n, SQLite, typed IPC, CI.
2. `claude` runner plus the live log (a single "run a prompt" button to verify the integration).
3. Projects and the kanban board (CRUD, dnd, persistence).
4. Git service and Git panel.
5. Orchestrator: queue, stages, plan approval, fix loops, stop/resume, limits.
6. Agent files and the "Agents" editor.
7. Versioning, CHANGELOG, the review screen with diff, merge/tag.
8. Polish: README (EN/RU), LICENSE (MIT), electron-builder installer.

## Verification
- `npm run typecheck && npm run lint && npm test`: unit tests for the stream-json parser (on recorded fixtures), the orchestrator state machine (with a mocked runner), bump/adapters and branchFlow (on a temporary git repo).
- `npm run dev`: open a test project (`D:\Programming\veltrix-sandbox`, a small Node repo with CLAUDE.md), create the task "add a sum function with tests", and walk through planning → approval → all stages → Accept. Then check `git log`, the tag, CHANGELOG and package.json.
- Check the fix loop by deliberately asking for a "change without tests", check Stop in the middle of a stage, and check the dirty-tree case.
- `npm run build:win`: install the NSIS installer and run the smoke test with Playwright-electron.
