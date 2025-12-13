---
id: dev-filesystem-simplification
title: Filesystem Simplification Plan
author: Claude
created: 2024-12-08T10:00:00Z
modified: 2024-12-13T12:00:00Z
tags: [implementation, completed, filesystem, architecture]
---

# Filesystem Simplification Plan

Goal: Reduce filesystem friction and special cases while preserving the flat, curated notebook model.

## Overview

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Directories = sections, eliminate `_section.json` | ✅ Complete |
| 2 | *(Merged into Phase 1)* | - |
| 3 | Move config to `.notebook/` directory | ✅ Complete |
| 4 | Assets as first-class citizens | ✅ Complete |

---

## Phase 1: Directories = Sections

### Key Changes

**Before:** Section metadata split across `settings.yaml`, `_section.json`, and filesystem.

**After:** **Directories ARE sections.** The filesystem is the source of truth.

```yaml
# settings.yaml - provides metadata for directories
sections:
  - name: Research       # directory: research/
    visible: true
  - name: Archived
    visible: false
```

**Behaviors:**
- On load: scan root for directories → each becomes a section
- Directory name = section id (slugified)
- `settings.yaml` provides metadata (display name, visibility)
- Directories not in settings get added with defaults
- **Item ordering:** By modified date (descending), not stored in config

**Reserved directories** (excluded):
- `assets/`, `.notebook/`, `.git/`, `node_modules/`, dotfiles

---

## Phase 3: .notebook/ Configuration Directory

### Target Structure

```
notebook/
├── .notebook/
│   ├── settings.yaml
│   ├── theme.css
│   └── templates/
│       ├── note.yaml
│       ├── code.yaml
│       └── bookmark.yaml
├── CLAUDE.md                  # stays at root (convention)
└── README.md                  # stays at root (convention)
```

### Benefits
- Cleaner root directory
- Clear separation: content vs configuration
- `.notebook/` is clearly "notebook system files"
- CLAUDE.md stays discoverable for Claude Code

---

## Phase 4: Assets as First-Class Citizens

### Features Implemented

- **Image template type** - `.png`, `.jpg`, `.gif`, `.webp`, `.svg` displayed as cards
- **Assets section** - Regular section (default invisible), toggle in settings
- **Subdirectory support** - One level of subdirs shown as subsection headers
- **System section grouping** - Files grouped by root / .notebook / .notebook/templates

### Deferred
- Media library modal (grid view, drag-drop upload)
- Markdown editor "Insert image" button

---

## Final Directory Structure

```
notebook/
├── .notebook/
│   ├── settings.yaml
│   ├── theme.css
│   └── templates/
│       ├── note.yaml
│       ├── code.yaml
│       └── bookmark.yaml
├── CLAUDE.md
├── README.md
├── research/
│   └── my-note.md
├── references/
│   └── some-bookmark.bookmark.json
└── assets/
    ├── thumbnails/
    └── images/
```

**Key changes from original:**
- No `sections/` wrapper directory
- No `_section.json` files
- Config consolidated in `.notebook/`
- Templates renamed from `{name}.template.yaml` to `.notebook/templates/{name}.yaml`
- Shorter file paths for Claude Code

---

## Migration Notes

Since there's currently only one user, optimized for clean design over backwards compatibility:
- Phase 1: Manual migration (move folders, delete `_section.json`)
- Phase 3: Manual migration (move config files to `.notebook/`)
- No legacy fallback code paths needed
