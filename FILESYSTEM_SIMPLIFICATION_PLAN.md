# Filesystem Simplification Plan

Goal: Reduce filesystem friction and special cases while preserving the flat, curated notebook model.

## Overview

| Phase | Description | Risk | Value |
|-------|-------------|------|-------|
| 1 | Eliminate `_section.json`, directories = sections, flatten structure | Low | High |
| 2 | ~~Flatten default directory structure~~ (merged into Phase 1) | - | - |
| 3 | Move config to `.notebook/` directory | Low | Medium |
| 4 | Assets as first-class citizens | Medium | Medium |

---

## Phase 1: Eliminate _section.json

### Current State

Section metadata is split across multiple locations:
- `settings.yaml` → section name, visibility
- `_section.json` → section name (duplicated!), item order
- Filesystem → actual directory existence

### Target State

**Directories ARE sections.** The filesystem is the source of truth for what sections exist.

```yaml
# settings.yaml - provides metadata for directories, not definitions
sections:
  - name: Research       # directory: research/
    visible: true

  - name: Archived       # directory: archived/
    visible: false
```

**Key behaviors:**
- On load: scan root for directories → each becomes a section
- Directory name = section id (slugified)
- `settings.yaml` provides metadata (display name, visibility)
- Directories not in settings get added with defaults
- Sections in settings without directories get directories auto-created
- **Item ordering:** By modified date (descending), not stored in config

**Reserved directories** (excluded from section discovery):
- `assets/`
- `.notebook/` (future)
- `.git/`
- `node_modules/`
- Any dotfile directory

### Tasks

- [x] **1.1 Update settings schema**
  - Section record: `name` (string), `path` (string, optional), `visible` (boolean)
  - Remove `id` field - derived from slugified name
  - `path` field: optional override for directory name (e.g., `path: '.'` for System section)
  - Remove any order-related fields

- [x] **1.2 Update settings template**
  - Update section record schema
  - Update field descriptions
  - Document auto-discovery behavior

- [x] **1.3 Build table editor for sections**
  - Proper datatable UI with column headers and drag-and-drop reordering
  - Columns: Name (text input), Path (text input, optional), Visible (checkbox toggle)
  - Drag handles (⋮⋮) for row reordering instead of up/down buttons
  - "Add Section" button (creates directory immediately)
  - **No delete button** - too destructive for non-empty sections
  - To delete: user removes directory via filesystem, section disappears on reload
  - **System section**: Auto-added with `path: '.'` to show root files (settings, templates, CLAUDE.md, etc.)

- [x] **1.4 Update filesystem read logic**
  - Scan notebook root for directories (excluding reserved)
  - For each directory found:
    - Look up in settings.yaml by slugified name match
    - If found: use display name and visibility from settings
    - If not found: add to settings with name = directory name, visible = true
  - Load cards from each directory
  - Sort cards by modified date (descending)
  - Stop reading `_section.json` files entirely

- [x] **1.5 Update filesystem write logic**
  - When adding section in UI: create directory immediately
  - Remove `_section.json` creation entirely
  - Directory name = slugify(section name)
  - New sections created at root

- [x] **1.6 Migration for existing notebooks**
  - Move contents from `sections/*/` to root-level directories
  - Delete empty `sections/` directory
  - Delete all `_section.json` files
  - Update settings.yaml section paths
  - **Note:** Backwards compatibility code removed - all notebooks must be migrated

- [x] **1.7 Update CLAUDE.md and README templates**
  - Document new section = directory model
  - Update file creation examples with new paths
  - Document reserved directory names

### Resolved Decisions

- **Auto-create directories:** Yes, when adding section in UI
- **Auto-discover directories:** Yes, all non-reserved directories become sections
- **Delete section UI:** No, too destructive - use filesystem
- **Default path:** `{slugified-name}/` (no `sections/` prefix)

---

## Phase 2: (Merged into Phase 1)

~~The original Phase 2 "Flatten Default Directory Structure" is now part of Phase 1.~~
~~Sections at root level is the default behavior, not a separate phase.~~

**Remaining consideration:** Reserved directory names are defined in Phase 1.
If user tries to create a section named "assets" or ".git", the UI should warn/prevent.

---

## Phase 3: .notebook/ Configuration Directory

**Status: COMPLETE**

### Current State
```
notebook/
├── settings.yaml
├── theme.css
├── note.template.yaml
├── code.template.yaml
├── bookmark.template.yaml
└── CLAUDE.md
```

### Target State
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

### Tasks

- [x] **3.1 Update file path constants**
  - Settings: `.notebook/settings.yaml`
  - Theme: `.notebook/theme.css`
  - Templates: `.notebook/templates/{name}.yaml`
  - Helper functions: `getNotebookConfigDir()`, `getNotebookTemplatesDir()`

- [x] **3.2 Update system card loading**
  - Load from `.notebook/` directory first, fall back to root
  - Keep CLAUDE.md and README.md loading from root
  - System section supports array paths: `path: ['.', '.notebook']`

- [x] **3.3 Update new notebook creation**
  - `ensureTemplateFiles()` creates `.notebook/` directory structure
  - Places config files in new locations

- [x] **3.4 Migration**
  - Read from both locations: `.notebook/` first, then root as fallback
  - New writes always go to `.notebook/`
  - No automatic migration - manual migration supported
  - Old notebooks continue to work (reads from root)

- [x] **3.5 Update _system section display**
  - Kept flat display - files from both root and `.notebook/` shown together
  - Filename shows path (e.g., `.notebook/settings.yaml`)
  - Configuration subsection deferred to later if needed

### Resolved Decisions

- **Migration**: Manual only - no backwards compatibility, reads only from `.notebook/`
- **`.notebook/` in settings**: Implicit - always loaded as config directory
- **System section in UI**: Name and path are frozen (read-only, non-interactive), visibility and position still editable
- **System section path**: Always normalized to `['.', '.notebook', '.notebook/templates']` on load (upgrades old `path: '.'`)

---

## Phase 4: Assets as First-Class Citizens

### Current State
- `assets/thumbnails/` exists but is hidden
- No way to browse or manage assets in UI
- No easy way to insert images into markdown

### Target State
- Assets section showing image/SVG previews
- Media library modal for browsing and uploading
- "Insert image" button in markdown editor

### Tasks

- [ ] **4.1 Asset template type**
  - New template for image files (.png, .jpg, .svg, .gif, .webp)
  - Card layout: image preview
  - Viewer layout: full-size image with metadata

- [ ] **4.2 Assets section configuration**
  - Default section in settings:
    ```yaml
    sections:
      - id: _assets
        name: Assets
        path: assets/
        visible: false    # hidden by default
        template: asset   # force asset template for all files
    ```
  - Toggle visibility to browse assets

- [ ] **4.3 Media library modal**
  - Grid view of all images in assets/
  - Drag-drop upload zone
  - Click to select/copy path
  - Delete action
  - Filter/search

- [ ] **4.4 Markdown editor integration**
  - "Insert image" button in editor toolbar
  - Opens media library modal
  - Clicking image inserts `![filename](assets/filename.png)`
  - Bonus: paste image from clipboard, auto-save to assets

- [ ] **4.5 Subdirectory support for assets**
  - `assets/thumbnails/` - auto-generated card thumbnails
  - `assets/images/` - user images
  - `assets/author-icons/` - already exists
  - Media library shows folder structure or flattens?

### Questions/Decisions

- [ ] Should assets section be a "real" section or a special virtual one?
- [ ] Thumbnail generation: keep separate from user assets?
- [ ] Image optimization on upload? (resize large images)

---

## Implementation Notes

### Order of Operations

- **Phase 1** is the foundation - do this first (COMPLETE)
- **Phase 3** builds on Phase 1 (moves config files) (COMPLETE)
- **Phase 4** is independent and can be done anytime after Phase 1

### Migration Approach

Since there's currently only one user, we're optimizing for clean design over backwards compatibility:
- Phase 1: Manual migration of existing notebooks (move folders, delete `_section.json`) - COMPLETE
- Phase 3: Manual migration (move config files to `.notebook/`) - COMPLETE, reads from both locations
- No need for legacy fallback code paths (but Phase 3 supports reading from root as fallback)

### Testing Checklist

Phase 1 (COMPLETE):
- [x] New notebook creation works
- [x] Existing notebook opens correctly
- [x] All CRUD operations work
- [x] Claude Code file references work (@file paths)

Phase 3 (COMPLETE):
- [x] New notebook creation creates `.notebook/` structure
- [x] Existing notebooks with root config files continue to work
- [x] Config edits save to `.notebook/` location
- [x] System section shows files from both locations

---

## Appendix: Current vs Target Comparison

### Current Notebook Structure
```
notebook/
├── settings.yaml
├── theme.css
├── note.template.yaml
├── code.template.yaml
├── bookmark.template.yaml
├── CLAUDE.md
├── README.md
├── sections/
│   ├── research/
│   │   ├── _section.json
│   │   └── my-note.md
│   └── references/
│       ├── _section.json
│       └── some-bookmark.bookmark.json
└── assets/
    └── thumbnails/
```

### After Phase 1 (directories = sections) - COMPLETE
```
notebook/
├── settings.yaml
├── theme.css
├── note.template.yaml
├── code.template.yaml
├── bookmark.template.yaml
├── CLAUDE.md
├── README.md
├── research/                              # was: sections/research/
│   └── my-note.md                         # @research/my-note.md
├── references/                            # was: sections/references/
│   └── some-bookmark.bookmark.json
└── assets/
    └── thumbnails/
```

**Phase 1 changes:**
- No `sections/` wrapper directory
- No `_section.json` files
- Shorter file paths for Claude Code

### After Phase 1 + 3 (current state) - COMPLETE
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
    └── thumbnails/
```

**Phase 3 changes:**
- Config consolidated in `.notebook/`
- Templates renamed from `{name}.template.yaml` to `.notebook/templates/{name}.yaml`
- No backwards compatibility - reads only from `.notebook/`

### After All Phases (Phase 1 + 3 + 4)
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

**Additional changes in Phase 4:**
- Assets browsable in UI
