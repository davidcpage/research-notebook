---
id: dev-repo-companion
title: Notebook as Repository Development Companion
author: Claude
created: 2024-12-15T19:00:00Z
modified: 2024-12-15T19:00:00Z
tags: [completed, architecture]
---

# Notebook as Repository Development Companion

> **Status (2024-12-16):** Decision made - see [Resolution](#resolution-artifacts-vs-process) below. Session/issue card integration abandoned in favor of cleaner separation of concerns.

This document explores using the research notebook as a development companion for arbitrary repositories, integrating design docs, sessions, issues, and code exploration in a visual interface.

## Vision

The notebook evolves from a personal research tool to a **visual development companion** that can be dropped into any repository to provide:

1. **Session cards** - View conversation learnings and context from `.memory/sessions.jsonl`
2. **Issue cards** - Track work items from `.issues/` (issues skill)
3. **Design docs** - Architecture and planning documents (potentially via ARD skill)
4. **Code exploration** - Curated views into the codebase (see code-repo-exploration.md)

This creates a unified visual interface for the artifacts that support code design and development, complementing the terminal-based Claude Code workflow.

## The Core Problem: Permission Scope vs Notebook Root

### Current Behavior

When opening a directory:
1. Browser grants File System Access API permission for that directory tree
2. Notebook initializes `.notebook/` config in that same directory
3. These two concerns are tightly coupled

### The Problem Case

For a repo with a dev notebook in a subdirectory:

```
my-repo/                    <- Want permissions here
├── .memory/                <- Sessions skill writes here
│   └── sessions.jsonl
├── .issues/                <- Issues skill writes here
│   └── ...
├── src/                    <- Actual code
└── dev/                    <- Want notebook root here
    ├── .notebook/
    ├── planning/
    └── ...
```

Opening `dev/` as the notebook doesn't grant access to `../.memory/` or `../.issues/`.
Opening `my-repo/` would create `.notebook/` at repo root, polluting it.

### Attempted Solutions

1. **Symlinks** - `dev/.memory -> ../.memory` doesn't work; File System Access API won't follow symlinks outside permission scope
2. **Additional permission request** - Works (tested), but adds UI complexity

## Proposed Solutions

### Option A: Notebook Root Setting

Open directory for permissions, but specify where notebook content lives:

```yaml
# .notebook/settings.yaml at permission root
notebook_root: ./dev
```

**Flow:**
1. Open `my-repo/` - browser has permission for everything
2. Notebook checks for `.notebook/settings.yaml`
3. If `notebook_root` is set, treat that subdirectory as the actual notebook
4. `.notebook/` config lives inside the notebook_root (`dev/.notebook/`)
5. Skills data at repo root (`.memory/`, `.issues/`) is accessible

**Chicken-and-egg:** Where does the root-level setting live? Options:
- A minimal `.notebook-root` file at repo root pointing to actual notebook
- Prompt user when opening a directory with no `.notebook/` but subdirectories containing `.notebook/`

### Option B: Link Additional Directories

Keep current model but allow linking external directories:

```yaml
# dev/.notebook/settings.yaml
external_directories:
  - name: sessions
    path: ../.memory
  - name: issues
    path: ../.issues
```

**Flow:**
1. Open `dev/` as notebook
2. When loading, check for unresolved external directories
3. Prompt user to grant access via `showDirectoryPicker()`
4. Store additional handles in IndexedDB
5. Use those handles for session/issue loading

**Pro:** Explicit, user-controlled
**Con:** Extra permission prompts, handles can expire

### Option C: Standardized Dev Folder Pattern

Convention: repos wanting notebook support create a `dev/` folder with everything needed:

```
my-repo/
├── src/
├── .claude/               <- Claude Code skills (symlinked)
└── dev/                   <- Self-contained notebook
    ├── .notebook/
    ├── .memory/           <- Skills configured to write here
    ├── .issues/
    └── planning/
```

**Pro:** Simple, no permission issues, self-contained
**Con:** Skills need per-repo configuration to write to `dev/` instead of repo root

### Option D: Accept the Limitation

For the rare "dev notebook in subdirectory" case:
- Use CLI to view sessions/issues
- Don't try to show them in the notebook
- Keep notebook focused on design docs and notes

**Pro:** No complexity added
**Con:** Loses the nice unified view

## Recommendation

**Short term:** Option D - accept the limitation, use CLI for sessions/issues review

**Medium term:** Option A with discovery - when opening a directory without `.notebook/`:
1. Check for subdirectories containing `.notebook/`
2. If found, prompt: "Found notebook in `dev/`. Open that instead?"
3. Keep permissions at parent level, but use discovered subdirectory as notebook root

This handles the common case elegantly without requiring manual configuration.

## Integration with Existing Features

### Session Cards (Implemented)

- Template and renderers exist for session cards
- Loads from `.memory/sessions.jsonl`
- Shows learnings, open questions, next actions, issues worked
- Currently blocked by permission scope issue in dev notebook case

### Issue Cards (Future)

- Would need template, renderers similar to sessions
- Load from `.issues/` directory structure
- Show status, dependencies, descriptions
- Consider wiki-link support to link issues from design docs

### Design Docs / ARD Skill

- Markdown cards already work well for design docs
- ARD (Architecture Decision Records) skill could provide structured format
- Planning directories naturally become notebook sections
- Consider "decision" card type with status, context, consequences fields

### Code Exploration

See code-repo-exploration.md for detailed design on:
- Mapping repo directories as sections
- Read-only mode for source files
- Code file type inference

## Open Questions

1. Should session/issue cards support inline editing, or stay read-only views of skill data?
2. How to handle card-to-issue links (wiki-links like `[[#015]]`)?
3. Should the notebook show git status on cards?
4. Is there value in a "project dashboard" view summarizing sessions, issues, recent activity?

## Resolution: Artifacts vs Process

*Decision made 2024-12-16 after extended discussion*

### The Key Insight

There's a fundamental distinction between **artifacts** and **process**:

| | Artifacts | Process |
|---|-----------|---------|
| **Examples** | Design docs, notes, research | Sessions, issues, todos |
| **Lifespan** | Permanent reference | Transient until resolved |
| **Editing** | Collaborative, iterative | Append-only log |
| **Belongs to** | Project/notebook | Repo, branch, user |
| **Value** | The "what and why" | The "how we got here" |

**Notebooks are for artifacts.** They collect and organize lasting knowledge—research findings, design decisions, reference material. You return to them.

**Sessions and issues are process.** They track current state and history. Useful *during* work, but the value gets distilled into artifacts (or code) and the process log becomes archival.

### Decision

1. **Don't integrate sessions/issues as notebook cards.** They're process, not artifacts.

2. **ADR-style design docs belong in the notebook.** They're lasting artifacts, naturally markdown, and fit the existing note card model perfectly. No special "ADR skill" needed—it's just a documentation style guide.

3. **Use CLI/TUI for sessions and issues.** A TUI tool could provide the "nice UI" for process tracking without forcing it into the notebook paradigm.

4. **The permission scope problem dissolves.** If sessions/issues don't need to be in the notebook, we don't need cross-directory access.

### What This Means for Each Project

**research-notebook:**
- Stay focused on artifacts: notes, bookmarks, code, design docs
- `/dev` notebook works great for development design docs
- No changes needed to support skill integration

**skill-issues:**
- Sessions and issues remain CLI tools
- Consider adding a TUI for richer viewing/navigation
- Skills stay self-contained, no notebook dependency

### Closed Issues

The following issues were closed as "abandoned" based on this decision:
- #001, #002, #003, #004: Session parsing, templates, viewer, import
- #005: Session cards - integrate with sessions skill (the main integration issue)
- #015, #016: Issue cards and kanban view
- #017: Wiki links for issues/sessions
- #018: Notebook root auto-discovery (was solving permission scope)

## Related Documents

- [[Code Repository Exploration Feature]] - Browsing code in the notebook (still relevant)
- [[Session Card Type]] - Session card implementation details (abandoned)
- [[Research Notebook - Vision & Direction]] - Overall project direction

---

*Status: Resolved - skill integration abandoned in favor of artifacts/process separation*
