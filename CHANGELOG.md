# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-23

### Added
- Automatic updates from GitHub Releases: Vexa checks for a new version on startup and from Settings → Updates, downloads it with progress on your consent and installs on restart (or when you quit). A running task is never interrupted by an update.
- Release workflow: pushing a `vX.Y.Z` tag builds the installer and publishes the release with update metadata.

## [0.1.0] - 2026-09-23

First public preview.

### Added
- Kanban board for tasks: backlog → queue → planning → plan approval → in progress → ready for review → done / failed, with drag and drop, filters and priorities.
- Strictly sequential task queue; every task runs on its own git branch.
- Six built-in agents driven by the installed `claude` CLI (no API keys): planner, developer, tester, code reviewer, security auditor, release manager.
- Plan approval, editing and re-planning; the planner asks clarifying questions with options when needed, or always with “Discuss before planning”.
- Automatic fix loop: failed tests, requested changes or high/critical security findings go back to the developer.
- Review screen with live agent log, Monaco diff, agent reports, cost and time, and a MAJOR/MINOR/PATCH selector.
- Accept & merge: `--no-ff` merge, version bump (package.json, pyproject.toml, Cargo.toml, *.csproj, VERSION), CHANGELOG entry and `vX.Y.Z` tag.
- Custom branch names per task.
- Git screen: status, commit with AI-generated message, create/switch/delete branches, history, pull/push/fetch/stash.
- Agents editor (prompt, model, effort, permission mode, tools) with per-project overrides.
- Project screen with CLAUDE.md editor and `/init` generation, versions and CHANGELOG.
- Subscription usage in the status bar; the queue pauses at the limit and resumes after the reset.
- Guided tour on first launch; Russian and English UI; light and dark themes.
- Windows installer.
