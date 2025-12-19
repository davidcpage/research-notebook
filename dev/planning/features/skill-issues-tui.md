---
id: skill-issues-tui
title: TUI for skill-issues
author: Claude
created: 2025-12-16T12:00:00Z
modified: 2025-12-16T12:00:00Z
tags: [future, skill-issues]
---

# TUI for skill-issues

A terminal UI for viewing sessions and issues, providing a richer experience than raw CLI output while staying in the terminal context.

> **Note:** This doc is intended for the skill-issues repo. Created during research-notebook development when we decided sessions/issues are process tools (CLI/TUI) not notebook artifacts.

## Motivation

Sessions and issues are **process logs** - useful during work but transient by nature. They belong in the terminal workflow, not in a browser-based notebook:

- Quick to invoke from terminal
- No context switching to browser
- Fits the CLI-first nature of Claude Code
- Can be used in any repo without notebook infrastructure

## Concept

```
┌─ Sessions ────────────────────────────────────────┐
│ s013 (Dec 16) artifacts-vs-process-decision       │
│   → 5 learnings, 1 next action                    │
│ s012 (Dec 15) permission-scope-design-continued   │
│   → 3 learnings, 1 open question                  │
│ s011 (Dec 15) permission-scope-design             │
│   → 3 learnings, 2 open questions                 │
└───────────────────────────────────────────────────┘
┌─ Open Issues ─────────────────────────────────────┐
│ #007 [P2] Code file inference for repo exploration│
│ #006 [P2] Tag search and filtering                │
│ #008 [P3] Media library modal                     │
└───────────────────────────────────────────────────┘
  [s]essions  [i]ssues  [q]uit
```

## Features

### Dashboard View (default)
- Recent sessions (last 3-5)
- Open issues grouped by priority
- Quick stats: open/closed counts, recent activity

### Sessions View
- List sessions with topic, date, counts
- Expand to see learnings, open questions, next actions
- Filter by date range or topic search
- Show linked issues

### Issues View
- List by status: Ready → Blocked → Closed
- Show priority, type, labels as badges
- Expand to see description, notes, blockers
- Filter by status, priority, labels

### Navigation
- Vim-style: `j/k` to move, `Enter` to expand, `q` to back/quit
- Or arrow keys for accessibility
- `/` to search/filter

## Implementation Options

### Option A: Python with Rich/Textual
- **Rich**: Simple formatted output, no interactivity
- **Textual**: Full TUI framework, widgets, mouse support
- Fits existing Python tooling in skill-issues

### Option B: Go with Bubble Tea
- Excellent TUI framework
- Fast binary, no runtime dependencies
- Would require adding Go to the project

### Option C: Simple pager output
- Enhanced `--dashboard` flag on existing scripts
- Pipe to `less -R` for scrolling
- Minimal implementation, no new dependencies

**Recommendation:** Start with Option C (enhanced CLI output) to validate the UX, then consider Textual for full interactivity if warranted.

## Invocation

```bash
# Dashboard (default TUI view)
skill-issues tui

# Or as flags on existing tools
issues.py --dashboard
sessions.py --dashboard

# Combined view
skill-issues dashboard
```

## Integration with Claude Code

The TUI could be invoked via a slash command or hook:

```yaml
# .claude/commands/status.md
Show project status using skill-issues TUI
```

Or automatically at session start via hooks.

## Open Questions

1. Should the TUI be a separate tool or integrated into existing scripts?
2. Interactive editing (close issue, add note) or read-only view?
3. How to handle repos without sessions or issues initialized?
4. Worth adding to default Claude Code workflow via hooks?

## Related

- [Sessions skill](../../../.claude/skills/sessions/SKILL.md)
- [Issues skill](../../../.claude/skills/issues/SKILL.md)
- [[Notebook as Repository Development Companion]] - decision context
