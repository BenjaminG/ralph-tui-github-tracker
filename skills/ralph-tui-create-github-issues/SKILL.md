---
name: ralph-tui-create-github-issues
description: "Convert PRDs to GitHub Issues for ralph-tui execution. Creates a parent issue (epic) with child issues for each user story, using native GitHub dependencies and sub-issues. Use when you have a PRD and want to use ralph-tui with GitHub Issues as the task source. Triggers on: create github issues, convert prd to github issues, github issues for ralph, ralph github issues."
---

# Ralph TUI - Create GitHub Issues

Converts PRDs to GitHub Issues (epic + child issues) for ralph-tui autonomous execution using **GitHub Issues** with native sub-issues and dependency tracking via the `gh` CLI and GraphQL API.

> **Note:** This skill uses GitHub Issues as the task tracker. If you prefer local-only tracking with beads-rust (`br`), use the `ralph-tui-create-beads-rust` skill instead.

---

## The Job

Take a PRD (markdown file or text) and create GitHub Issues using `gh` commands:
1. **Extract Quality Gates** from the PRD's "Quality Gates" section
2. Create an **epic issue** for the feature (labeled `epic`)
3. Create **child issues** for each user story (with quality gates appended)
4. **Link child issues as sub-issues** of the epic via GraphQL `addSubIssue` mutation
5. **Add native dependencies** between issues via GraphQL `addBlockedBy` mutation
6. Output ready for `ralph-tui run --tracker github --epic <epic-issue-number>`

---

## Step 1: Extract Quality Gates

Look for the "Quality Gates" section in the PRD:

```markdown
## Quality Gates

These commands must pass for every user story:
- `bun run typecheck` - Type checking
- `bun run lint` - Linting

For UI stories, also include:
- Verify in browser using dev-browser skill
```

Extract:
- **Universal gates:** Commands that apply to ALL stories (e.g., `bun run typecheck`)
- **UI gates:** Commands that apply only to UI stories (e.g., browser verification)

**If no Quality Gates section exists:** Ask the user what commands should pass, or use a sensible default like `bun run typecheck`.

---

## Output Format

Issues use `gh issue create` with **HEREDOC syntax** to safely handle special characters.

### Creating the epic (parent issue)

```bash
gh issue create --title "[Feature Name]" --body "$(cat <<'EOF'
[PRD overview/description]
EOF
)" --label "epic"
```

- Parse the issue number from the output URL (last path segment)
- Get the node ID for GraphQL operations:

```bash
gh issue view <number> --json id --jq .id
```

### Creating child issues (one per user story)

```bash
gh issue create --title "US-001: [Story Title]" --body "$(cat <<'EOF'
## Description
[Story description]

## Acceptance Criteria
- [ ] Story-specific criterion 1
- [ ] Story-specific criterion 2
- [ ] bun run typecheck passes
- [ ] bun run lint passes

## Blocked by
- Blocked by #<earlier-issue-number> (if any dependency)
- Or "None - can start immediately"

## Parent PRD
#<epic-issue-number>
EOF
)" --label "priority:1"
```

- Get the node ID for each child issue:

```bash
gh issue view <number> --json id --jq .id
```

> **CRITICAL:** Always use `<<'EOF'` (single-quoted) for the HEREDOC delimiter. This prevents shell interpretation of backticks, `$variables`, and `()` in descriptions.

---

### Linking child issues as sub-issues (GraphQL)

After creating both the epic and child issues, link each child as a sub-issue of the epic:

```bash
gh api graphql -f query='mutation($parentId: ID!, $childId: ID!) {
  addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) {
    issue { id }
  }
}' -f parentId="<epic-node-id>" -f childId="<child-node-id>"
```

### Adding native dependencies (GraphQL)

When one issue is blocked by another, add the dependency:

```bash
gh api graphql -f query='mutation($issueId: ID!, $blockerId: ID!) {
  addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockerId }) {
    clientMutationId
  }
}' -f issueId="<blocked-node-id>" -f blockerId="<blocker-node-id>"
```

**Syntax:** The `issueId` is the issue that is blocked; the `blockingIssueId` is the blocker.

---

## Priority Labels

Each issue gets a `priority:N` label where N is 0-4. Priority is assigned by dependency order then document order:

| Priority | Meaning |
|----------|---------|
| `priority:0` | Critical - Drop everything |
| `priority:1` | High - Do soon |
| `priority:2` | Medium - Normal work |
| `priority:3` | Low - When time permits |
| `priority:4` | Backlog - Someday/maybe |

Foundation stories (schema, first in chain) get lower numbers; later dependent stories get higher numbers.

---

## Story Size: The #1 Rule

**Each story must be completable in ONE ralph-tui iteration (~one agent context window).**

ralph-tui spawns a fresh agent instance per iteration with no memory of previous work. If a story is too big, the agent runs out of context before finishing.

### Right-sized stories:
- Add a database column + migration
- Add a UI component to an existing page
- Update a server action with new logic
- Add a filter dropdown to a list

### Too big (split these):
- "Build the entire dashboard" --> Split into: schema, queries, UI components, filters
- "Add authentication" --> Split into: schema, middleware, login UI, session handling
- "Refactor the API" --> Split into one story per endpoint or pattern

**Rule of thumb:** If you can't describe the change in 2-3 sentences, it's too big.

---

## Story Ordering: Dependencies First

Stories execute in dependency order. Earlier stories must not depend on later ones.

**Correct order:**
1. Schema/database changes (migrations)
2. Server actions / backend logic
3. UI components that use the backend
4. Dashboard/summary views that aggregate data

**Wrong order:**
1. UI component (depends on schema that doesn't exist yet)
2. Schema change

---

## Acceptance Criteria: Quality Gates + Story-Specific

Each issue's body should include acceptance criteria with:
1. **Story-specific criteria** from the PRD (what this story accomplishes)
2. **Quality gates** from the PRD's Quality Gates section (appended at the end)

### Good criteria (verifiable):
- "Add `investorType` column to investor table with default 'cold'"
- "Filter dropdown has options: All, Cold, Friend"
- "Clicking toggle shows confirmation dialog"

### Bad criteria (vague):
- "Works correctly"
- "User can do X easily"
- "Good UX"
- "Handles edge cases"

---

## Conversion Rules

1. **Extract Quality Gates** from PRD first
2. **Each user story --> one GitHub issue**
3. **First story**: No dependencies (creates foundation)
4. **Subsequent stories**: Depend on their predecessors (UI depends on backend, etc.)
5. **Priority**: Based on dependency order, then document order (`priority:0`=critical, `priority:2`=medium, `priority:4`=backlog)
6. **All stories**: Created as open issues
7. **Acceptance criteria**: Story criteria + quality gates appended
8. **UI stories**: Also append UI-specific gates (browser verification)
9. **Blocked by section**: Every issue body includes a "Blocked by" section referencing blocker issue numbers (or "None")
10. **Parent PRD section**: Every child issue body references the epic issue number

---

## Splitting Large PRDs

If a PRD has big features, split them:

**Original:**
> "Add friends outreach track with different messaging"

**Split into:**
1. US-001: Add investorType field to database
2. US-002: Add type toggle to investor list UI
3. US-003: Create friend-specific phase progression logic
4. US-004: Create friend message templates
5. US-005: Wire up task generation for friends
6. US-006: Add filter by type
7. US-007: Update new investor form
8. US-008: Update dashboard counts

Each is one focused change that can be completed and verified independently.

---

## Example

**Input PRD:**
```markdown
# PRD: Friends Outreach

Add ability to mark investors as "friends" for warm outreach.

## Quality Gates

These commands must pass for every user story:
- `bun run typecheck` - Type checking
- `bun run lint` - Linting

For UI stories, also include:
- Verify in browser using dev-browser skill

## User Stories

### US-001: Add investorType field to investor table
**Description:** As a developer, I need to categorize investors as 'cold' or 'friend'.

**Acceptance Criteria:**
- [ ] Add investorType column: 'cold' | 'friend' (default 'cold')
- [ ] Generate and run migration successfully

### US-002: Add type toggle to investor list rows
**Description:** As Ryan, I want to toggle investor type directly from the list.

**Acceptance Criteria:**
- [ ] Each row has Cold | Friend toggle
- [ ] Switching shows confirmation dialog
- [ ] On confirm: updates type in database

### US-003: Filter investors by type
**Description:** As Ryan, I want to filter the list to see just friends or cold.

**Acceptance Criteria:**
- [ ] Filter dropdown: All | Cold | Friend
- [ ] Filter persists in URL params
```

**Output GitHub Issues:**

```bash
# --- Create epic ---
gh issue create --title "Friends Outreach Track" --body "$(cat <<'EOF'
Warm outreach for deck feedback.

Source PRD: ./tasks/friends-outreach-prd.md
EOF
)" --label "epic"

# Parse issue number from output URL, e.g., https://github.com/owner/repo/issues/10
# EPIC_NUMBER=10
# Get epic node ID
# EPIC_NODE_ID=$(gh issue view 10 --json id --jq .id)

# --- US-001: No deps (first - creates schema) ---
gh issue create --title "US-001: Add investorType field to investor table" --body "$(cat <<'EOF'
## Description
As a developer, I need to categorize investors as 'cold' or 'friend'.

## Acceptance Criteria
- [ ] Add investorType column: 'cold' | 'friend' (default 'cold')
- [ ] Generate and run migration successfully
- [ ] bun run typecheck passes
- [ ] bun run lint passes

## Blocked by
None - can start immediately

## Parent PRD
#10
EOF
)" --label "priority:1"

# Parse issue number, e.g., #11
# US001_NUMBER=11
# US001_NODE_ID=$(gh issue view 11 --json id --jq .id)

# Link as sub-issue of epic
gh api graphql -f query='mutation($parentId: ID!, $childId: ID!) {
  addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) {
    issue { id }
  }
}' -f parentId="$EPIC_NODE_ID" -f childId="$US001_NODE_ID"

# --- US-002: UI story (gets browser verification too) ---
gh issue create --title "US-002: Add type toggle to investor list rows" --body "$(cat <<'EOF'
## Description
As Ryan, I want to toggle investor type directly from the list.

## Acceptance Criteria
- [ ] Each row has Cold | Friend toggle
- [ ] Switching shows confirmation dialog
- [ ] On confirm: updates type in database
- [ ] bun run typecheck passes
- [ ] bun run lint passes
- [ ] Verify in browser using dev-browser skill

## Blocked by
- Blocked by #11

## Parent PRD
#10
EOF
)" --label "priority:2"

# Parse issue number, e.g., #12
# US002_NUMBER=12
# US002_NODE_ID=$(gh issue view 12 --json id --jq .id)

# Link as sub-issue of epic
gh api graphql -f query='mutation($parentId: ID!, $childId: ID!) {
  addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) {
    issue { id }
  }
}' -f parentId="$EPIC_NODE_ID" -f childId="$US002_NODE_ID"

# Add dependency: US-002 is blocked by US-001
gh api graphql -f query='mutation($issueId: ID!, $blockerId: ID!) {
  addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockerId }) {
    clientMutationId
  }
}' -f issueId="$US002_NODE_ID" -f blockerId="$US001_NODE_ID"

# --- US-003: UI story ---
gh issue create --title "US-003: Filter investors by type" --body "$(cat <<'EOF'
## Description
As Ryan, I want to filter the list to see just friends or cold.

## Acceptance Criteria
- [ ] Filter dropdown: All | Cold | Friend
- [ ] Filter persists in URL params
- [ ] bun run typecheck passes
- [ ] bun run lint passes
- [ ] Verify in browser using dev-browser skill

## Blocked by
- Blocked by #12

## Parent PRD
#10
EOF
)" --label "priority:3"

# Parse issue number, e.g., #13
# US003_NUMBER=13
# US003_NODE_ID=$(gh issue view 13 --json id --jq .id)

# Link as sub-issue of epic
gh api graphql -f query='mutation($parentId: ID!, $childId: ID!) {
  addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) {
    issue { id }
  }
}' -f parentId="$EPIC_NODE_ID" -f childId="$US003_NODE_ID"

# Add dependency: US-003 is blocked by US-002
gh api graphql -f query='mutation($issueId: ID!, $blockerId: ID!) {
  addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockerId }) {
    clientMutationId
  }
}' -f issueId="$US003_NODE_ID" -f blockerId="$US002_NODE_ID"
```

---

## Running ralph-tui

After creation, run ralph-tui:

```bash
# Work on a specific epic
ralph-tui run --tracker github --epic <epic-issue-number>

# Or let it pick the best task automatically
ralph-tui run --tracker github
```

ralph-tui will:
1. Work on issues within the specified epic (or select the best available task)
2. Close each issue when complete
3. Close the epic when all children are done
4. Output `<promise>COMPLETE</promise>` when epic is done

---

## Checklist Before Creating Issues

- [ ] Extracted Quality Gates from PRD (or asked user if missing)
- [ ] Each story is completable in one iteration (small enough)
- [ ] Stories are ordered by dependency (schema --> backend --> UI)
- [ ] Quality gates appended to every issue's acceptance criteria
- [ ] UI stories have browser verification (if specified in Quality Gates)
- [ ] Acceptance criteria are verifiable (not vague)
- [ ] No story depends on a later story (only earlier stories)
- [ ] Dependencies added via `addBlockedBy` GraphQL mutation
- [ ] Sub-issues linked via `addSubIssue` GraphQL mutation
- [ ] "Blocked by #N" text included in issue bodies
- [ ] Priority labels (`priority:N`) applied to all child issues

---

## Gotchas

### `addBlockedBy` mutation return field

The `AddBlockedByPayload` type does **not** have a `blockedByIssue` field. Using `blockedByIssue { id }` as the return selection will fail with:

```
Field 'blockedByIssue' doesn't exist on type 'AddBlockedByPayload'
```

**Use `clientMutationId` instead:**

```graphql
mutation($issueId: ID!, $blockerId: ID!) {
  addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockerId }) {
    clientMutationId
  }
}
```

> **General rule:** When unsure about a GitHub GraphQL mutation's return payload fields, `clientMutationId` is always a safe fallback — it exists on every mutation payload type.

---

## Differences from beads-rust

| Concept | beads-rust (`br`) | GitHub Issues (`gh`) |
|---------|-------------------|----------------------|
| Create epic | `br create --type=epic` | `gh issue create --label "epic"` |
| Create story | `br create --parent=ID` | `gh issue create --label "priority:N"` |
| Link parent-child | `--parent` flag on create | `addSubIssue` GraphQL mutation |
| Add dependency | `br dep add <issue> <blocker>` | `addBlockedBy` GraphQL mutation |
| Get issue ID | Returned by `br create` | Parse URL + `gh issue view --json id` |
| Close | `br close <id>` | `gh issue close <number>` |
| Storage | `.beads/*.db` + JSONL | GitHub (remote) |
| Sync | `br sync --flush-only` | Not needed (issues are remote) |
| Tracker flag | `--tracker beads-rust` | `--tracker github` |
