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
  - Section record: `name` (string), `visible` (boolean)
  - Remove `id` field - derived from slugified name
  - Remove `path` field - derived from slugified name
  - Remove any order-related fields

- [x] **1.2 Update settings template**
  - Update section record schema
  - Update field descriptions
  - Document auto-discovery behavior

- [x] **1.3 Build table editor for sections**
  - Using existing records editor with updated schema
  - Columns: Name (text input), Visible (toggle)
  - Row reordering via up/down buttons
  - "Add Section" button (creates directory immediately)
  - **No delete button** - too destructive for non-empty sections
  - To delete: user removes directory via filesystem, section disappears on reload

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

- [ ] **3.1 Update file path constants**
  - Settings: `.notebook/settings.yaml`
  - Theme: `.notebook/theme.css`
  - Templates: `.notebook/templates/{name}.yaml`

- [ ] **3.2 Update system card loading**
  - Load from `.notebook/` directory
  - Keep CLAUDE.md and README.md loading from root

- [ ] **3.3 Update new notebook creation**
  - Create `.notebook/` directory structure
  - Place config files in new locations

- [ ] **3.4 Migration**
  - Detect old-style notebooks (settings.yaml at root)
  - Offer migration or auto-migrate with backup
  - Support reading from both locations during transition?

- [ ] **3.5 Update _system section display**
  - Show `.notebook/` files as "Configuration" subsection?
  - Or keep flat but with clear grouping

### Questions/Decisions

- [ ] Should migration be automatic or opt-in?
- [ ] How long to support old locations? (suggest: indefinitely for reading, new writes go to new location)
- [ ] Does `.notebook/` need its own entry in settings, or is it implicit?

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

- **Phase 1** is the foundation - do this first
- **Phase 3** builds on Phase 1 (moves config files)
- **Phase 4** is independent and can be done anytime after Phase 1

### Migration Approach

Since there's currently only one user, we're optimizing for clean design over backwards compatibility:
- Phase 1: Manual migration of existing notebooks (move folders, delete `_section.json`)
- Phase 3: Manual migration (move config files to `.notebook/`)
- No need for legacy fallback code paths

### Testing Checklist

For each phase:
- [ ] New notebook creation works
- [ ] Existing notebook opens correctly
- [ ] Migration (if applicable) works
- [ ] All CRUD operations work
- [ ] Claude Code file references work (@file paths)

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

### After Phase 1 (directories = sections)
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

**Additional changes in later phases:**
- Config consolidated in `.notebook/`
- Assets browsable in UI
