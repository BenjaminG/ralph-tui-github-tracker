# ralph-tui-github-tracker

GitHub Issues tracker plugin for [ralph-tui](https://ralph-tui.com). Uses GitHub's native GraphQL API for dependencies (`blockedBy`/`blocking`) and hierarchy (`parent`/`subIssues`). Authenticates via the `gh` CLI.

## Features

- Native GitHub issue dependencies (blocked-by/blocking)
- Parent/sub-issue hierarchy for epics
- Priority via labels (`priority:0` through `priority:4`)
- In-progress tracking via `ralph:in-progress` label
- Auto-detect repo from git remote
- Works with or without an epic (parent issue)

## Prerequisites

- [gh CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)
- [ralph-tui](https://ralph-tui.com) installed

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/BenjaminG/ralph-tui-github-tracker/main/install.sh | bash
```

To uninstall:

```bash
curl -fsSL https://raw.githubusercontent.com/BenjaminG/ralph-tui-github-tracker/main/install.sh | bash -s -- --uninstall
```

### Install the skill (optional)

```bash
npx skills add https://github.com/BenjaminG/ralph-tui-github-tracker --skill ralph-tui-create-github-issues -g
```

## Configuration

Add to your ralph-tui config (`~/.config/ralph-tui/config.toml` or `.ralph-tui/config.toml`):

### Minimal (auto-detect repo, all open issues)

```toml
tracker = "github"
```

### With epic (parent issue)

```toml
[[trackers]]
name = "my-github"
plugin = "github"
default = true
[trackers.options]
epicId = 42
```

### With label filter

```toml
[[trackers]]
name = "backend-work"
plugin = "github"
[trackers.options]
epicId = 42
labels = ["backend"]
```

### Explicit repo (when not in a git directory)

```toml
[[trackers]]
name = "my-project"
plugin = "github"
[trackers.options]
repo = "owner/repo-name"
epicId = 42
```

## Usage

```bash
# Run with epic
ralph-tui run --tracker github --epic 42

# Run on all open issues in the repo
ralph-tui run --tracker github
```

## Label Conventions

| Label | Purpose |
|-------|---------|
| `priority:0` | Critical priority (highest) |
| `priority:1` | High priority |
| `priority:2` | Medium priority (default) |
| `priority:3` | Low priority |
| `priority:4` | Backlog (lowest) |
| `ralph:in-progress` | Marks issue as in-progress (managed by plugin) |
| `epic` | Marks a parent issue as an epic |

## Status Mapping

GitHub only has OPEN/CLOSED states. The plugin uses the `ralph:in-progress` label to track in-progress status:

| GitHub State | `ralph:in-progress` label | ralph-tui Status |
|---|---|---|
| OPEN | No | `open` |
| OPEN | Yes | `in_progress` |
| CLOSED | — | `completed` |

## Creating Issues from a PRD

Use the included skill to convert PRDs to GitHub Issues:

```
/ralph-tui-create-github-issues
```

This creates:
- A parent issue (epic) from the PRD overview
- Child issues for each user story with priority labels
- Native `blockedBy` dependencies via GraphQL
- Sub-issue relationships via GraphQL
- "Blocked by #N" references in issue bodies

## Development

```bash
bun install
bun run typecheck
bun run build
bun test
```

## License

MIT
