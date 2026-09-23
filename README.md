# Vexa

**A desktop IDE for managing Claude Code agents.** Create tasks as cards, press *Send to work*, and a team of built-in agents takes each task through the full development cycle — plan, code, tests, code review, security audit, semantic version bump and git — while you only approve the plan and accept the result.

Vexa runs the `claude` CLI you already have installed and signed in to (Pro/Max subscription). No API keys.

**[⬇ Download for Windows](https://github.com/traden0de/vexa/releases/latest)**

> Русская версия — ниже.

## Features

- **Kanban board.** Backlog → Queue → Planning → Plan approval → In progress → Ready for review → Done / Failed. Drag and drop, filters, priorities.
- **Strictly sequential queue.** One task runs at a time, each on its own `vexa/<id>-<slug>` branch, so tasks can't break each other.
- **Six built-in agents:**
  - **Planner** (read-only) writes the plan. You **approve**, edit it, or re-plan with a comment.
  - **Developer** implements the plan and commits.
  - **Tester** writes tests and runs the whole suite.
  - **Code Reviewer** and **Security Auditor** (both read-only) check the diff.
  - **Release Manager** proposes MAJOR/MINOR/PATCH and a CHANGELOG entry.
- **Discuss before planning.** When a choice is genuinely ambiguous, the planner asks questions with options to pick, like Claude Code does. Tick “Discuss before planning” on a task to always talk it through first.
- **Your own branch names.** Set a branch name per task, or leave it empty for an automatic `vexa/<id>-<slug>`.
- **Automatic fix loop.** Failed tests, requested changes or high/critical security findings send the task back to the developer, resuming the same Claude session. The number of loops is configurable.
- **Review screen:**
  - live agent log;
  - Monaco side-by-side diff;
  - reports from every agent;
  - cost and time;
  - version bump selector.
  
  **Accept** merges with `--no-ff`, bumps the version in `package.json` / `pyproject.toml` / `Cargo.toml` / `*.csproj` / `VERSION`, updates `CHANGELOG.md` and creates the `vX.Y.Z` tag.
- **Git without commands.** Status, commit (with an AI-generated message), create/switch/delete branches, history, pull/push/fetch/stash.
- **Guided tour.** A step-by-step walkthrough on first launch; restart it any time from Settings.
- **Any project.** Open a folder or clone a repository. The project's `CLAUDE.md`, `.claude/settings.json`, hooks, MCP servers and `.claude/agents` are all picked up by Claude Code as usual. You can also generate `CLAUDE.md` with `/init` from the UI.
- **Customizable agents.** Edit the prompt, model, effort, permission mode and allowed tools. Changes are saved for all projects or as a per-project override in `.vexa/agents/*.md`.
- **Subscription-aware.** Shows 5-hour and 7-day usage. When the limit is hit, the queue pauses and resumes automatically after the reset.
- Russian and English UI; light and dark themes.

## Requirements

- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and signed in (run `claude` once in a terminal)
- Git
- Windows 10/11 (macOS and Linux builds are planned; the code is cross-platform)

## Getting started (from source)

```bash
npm install
npm run dev
```

Build a Windows installer:

```bash
npm run build:win   # → dist/Vexa-<version>-setup.exe
```

## How it works

Every agent run is a headless Claude Code call in the project folder:

```
claude -p --output-format stream-json --verbose --permission-mode <plan|acceptEdits>
       --permission-prompts none --allowedTools … --append-system-prompt <agent prompt>
       [--resume <session>] [--json-schema <report schema>]
```

- The prompt is sent through stdin.
- The JSON stream is parsed into the live log.
- Agent verdicts come back as structured output validated with zod.
- Vexa never runs anything the agent's permission mode and tool list don't allow.
- Review agents are read-only.

| Folder | Purpose |
| --- | --- |
| `src/main` | Electron main process: CLI runner, orchestrator, git, versioning, SQLite |
| `src/renderer` | React UI |
| `src/shared` | Types and the IPC contract |
| `resources/agents` | Built-in agent definitions |

## Development

```bash
npm run typecheck
npm test                                                   # unit tests, including the full pipeline with a fake Claude
VEXA_USER_DATA=/tmp/vx node e2e/smoke.mjs <project> <shots-dir>      # screenshots of every screen
VEXA_USER_DATA=/tmp/vx2 node e2e/features.mjs <project> <shots-dir>  # tour, branches, scrolling checks
VEXA_USER_DATA=/tmp/vx3 DISCUSS=1 node e2e/full-cycle.mjs <sandbox> <shots-dir>  # real Claude run
```

Contributions are welcome — see `CLAUDE.md` for the architecture and conventions.

## License

MIT

---

# Vexa (RU)

**IDE для управления ИИ-агентами Claude Code.** Вы заводите задачи карточками и нажимаете «В работу». Встроенные агенты проводят каждую задачу через полный цикл: план, код, тесты, code review, проверка безопасности, поднятие версии и git. От вас нужно только утвердить план и принять результат.

Vexa использует уже установленный и авторизованный `claude` CLI с подпиской Pro/Max. API-ключи не нужны.

**Возможности:**
- **Доска задач** с drag-and-drop.
- **Обсуждение перед планом:** планировщик задаёт вопросы с вариантами, когда без них не обойтись, а с галочкой «Обсудить перед планом» — всегда.
- **Своё имя ветки** для задачи или автоматическое.
- **Экскурсия по интерфейсу** при первом запуске.
- **Строго последовательная очередь:** каждая задача выполняется в своей ветке.
- **Шесть агентов:** планировщик, разработчик, тестировщик, ревьюер, аудитор безопасности и релиз-менеджер.
- **Автоматический цикл исправлений.** Если проверки не прошли, задача возвращается разработчику.
- **Экран проверки:** diff, отчёты агентов, выбор MAJOR/MINOR/PATCH.
- **Кнопка «Принять»:** слияние, CHANGELOG и тег.
- **Git кнопками,** без ввода команд.
- **Любой проект** с учётом его `CLAUDE.md` и настроек `.claude`.
- **Редактор агентов.**
- **Учёт лимитов подписки:** при исчерпании лимита очередь встаёт на паузу и продолжает после сброса.
- **Интерфейс** на русском и английском, светлая и тёмная темы.

**Скачать для Windows:** [последний релиз](https://github.com/traden0de/vexa/releases/latest).

**Запуск из исходников:** `npm install && npm run dev`.

**Установщик для Windows:** `npm run build:win`.
