---
id: dev-multi-file-architecture
title: Multi-File Architecture
author: Claude
created: 2024-12-26T11:00:00Z
modified: 2025-12-26T15:00:00Z
tags: [in-progress, architecture]
---

# Multi-File Architecture

*ADR: Migrating from single HTML file to multi-file ES modules architecture*

## Status

**Proposed** - Under active discussion and planning.

## Context

The Research Notebook app is currently a single `research_notebook.html` file (~370KB, 5000+ lines) containing all CSS, HTML, and JavaScript. While this "just open in browser" simplicity was appealing initially, we've hit several pain points:

1. **Theme switching** - Users must manually copy theme.css files to notebooks
2. **Embedded defaults** - Templates, themes, CLAUDE.md, README.md are all embedded as JS strings
3. **Maintainability** - A 5000+ line single file is hard to navigate, even with section markers
4. **Contributions** - Adding a theme or template requires editing the monolith
5. **Updates** - Updating defaults requires regenerating the entire HTML file

### Key Observation

The **notebooks** themselves are already multi-file (directories with sections, `.notebook/` config, etc.). The single-file constraint only applies to the app itself. Since most users clone the repo for updates anyway, single-file portability may be solving a non-problem.

## Decision

Migrate to a **multi-file architecture using ES modules**, with no build step required.

### Target Structure

```
repo/
├── index.html                  # Minimal HTML shell
├── css/
│   └── app.css                 # All application CSS
├── js/
│   ├── app.js                  # Main entry point (ES module)
│   ├── state.js                # STATE_AND_CONFIG
│   ├── render.js               # RENDER_FUNCTIONS
│   ├── editor.js               # GENERIC_EDITOR
│   ├── filesystem.js           # FILESYSTEM_STORAGE, DATA_PERSISTENCE
│   ├── templates.js            # TEMPLATE_SYSTEM
│   ├── pyodide.js              # PYODIDE_RUNTIME
│   ├── codemirror.js           # CodeMirror integration
│   └── ...
├── defaults/
│   ├── templates/
│   │   ├── note.js             # Default note template (exports YAML string)
│   │   ├── code.js             # Default code template
│   │   └── bookmark.js         # Default bookmark template
│   └── theme.js                # Default theme.css content
│                               # Note: CLAUDE.md/README.md live in examples/, not here
├── themes/
│   ├── index.js                # Theme registry (exports available themes)
│   ├── manuscript.js           # Theme: warm parchment
│   ├── minimal.js              # Theme: clean, sparse
│   ├── terminal.js             # Theme: dark hacker
│   └── handwritten.js          # Theme: calligraphic fonts
├── examples/
│   └── demo-notebook/
└── dev/
    └── planning/
```

### Why ES Modules for Defaults/Themes

**The constraint:** The File System Access API only gives access to user-selected directories. The app cannot read from its own directory using `fetch()` with the `file://` protocol.

**The solution:** ES module `import()` *does* work with `file://` in modern browsers. By wrapping templates and themes as JS modules that export strings, we get:

- Real, editable files in the repo
- Dynamic loading without a build step
- Works with double-click to open (no server required)

**Example: Theme as ES Module**

```js
// themes/manuscript.js
export const name = "Manuscript";
export const description = "Warm, scholarly parchment aesthetic";
export default `
/* Research Notebook Theme: "Manuscript" */
:root {
    --bg-primary: #faf8f3;
    --bg-secondary: #f5f2ea;
    /* ... */
}
`;
```

```js
// In app: loading a theme
const { default: css, name, description } = await import('../themes/manuscript.js');
```

**Example: Template as ES Module**

```js
// defaults/templates/note.js
export default `
type: note
schema:
  title: { type: string, required: true }
  content: { type: string, format: markdown }
  author: { type: string }
  # ...
card:
  layout: document
  # ...
`;
```

### Lazy/Copy-on-Write for Notebook Defaults

**Current behavior:** When creating a notebook, immediately write all template files, theme.css, CLAUDE.md, README.md to the `.notebook/` directory.

**New behavior:**

1. App loads defaults from its own `/defaults/` directory via ES module imports
2. These appear as "system cards" in the app (read-only, from app)
3. Notebooks start minimal - no `.notebook/templates/` needed initially
4. When a user edits a template, the modified version is written to the notebook
5. On subsequent loads, notebook-local files override app defaults

**Benefits:**
- New notebooks have minimal boilerplate
- Clear semantics: if `.notebook/templates/note.yaml` exists, it's been customized
- App defaults update automatically when users pull the repo
- "Reset to defaults" simply deletes the local file

### Theme Switching

With themes as ES modules in `/themes/`:

1. Theme picker lists available themes (from `themes/index.js` registry)
2. User previews/selects a theme
3. Selected theme's CSS is written to notebook's `.notebook/theme.css`
4. Local customizations override the base theme

The theme picker could also support "live preview" before committing.

## Consequences

### Positive

- **Maintainable codebase** - Smaller, focused files instead of one monolith
- **Easy contributions** - Add a theme by adding one `.js` file and updating the registry
- **Standard web dev** - Familiar ES modules, no custom tooling
- **Cleaner notebooks** - Minimal boilerplate, copy-on-write defaults
- **Automatic updates** - Pull repo to get new themes/default improvements
- **Theme switching** - Simple UI to browse and apply themes
- **No build step** - Double-click `index.html` still works

### Negative

- **Not truly single-file** - Must clone/download entire repo, not just one file
- **JS-wrapped content** - Themes are `.js` files with CSS strings, not pure `.css`
- **Browser restrictions** - Only works in Chrome/Edge (File System Access API), though this was already the case
- **Directory structure matters** - App must be opened from repo root

### Neutral

- **`generate_index.py`** - May become unnecessary or transform into a different utility
- **CLAUDE.md for notebooks** - Handled via example notebook templates (see Open Question #1 - DECIDED)

## Open Questions

### 1. How to handle CLAUDE.md and README.md? ✓ DECIDED

**Decision:** Use **example notebooks as templates** for different use cases.

**Rationale:** A single default CLAUDE.md doesn't fit all use cases. An AI tutor notebook needs different Claude instructions than a research notebook or dev notebook. Rather than a generic initializer, provide curated examples that users fork.

**Implementation:**

```
examples/
├── research-notebook/       # Standard research use
│   ├── .notebook/
│   │   └── theme.css        # Manuscript theme (warm, scholarly)
│   ├── CLAUDE.md            # Research-focused Claude instructions
│   └── README.md            # What this template is for
├── tutor-notebook/          # AI tutoring collaboration
│   ├── .notebook/
│   │   └── theme.css        # Friendly, accessible theme
│   ├── CLAUDE.md            # Student collaboration guidelines
│   └── README.md
└── dev-notebook/            # Development/coding focus
    ├── .notebook/
    │   └── theme.css        # Terminal/dark theme
    ├── CLAUDE.md            # Code-focused instructions
    └── README.md
```

**Workflow:** `cp -r examples/tutor-notebook my-project` or simple CLI wrapper `scripts/new-notebook.py`.

**Card templates principle:** Only include `.notebook/templates/*.yaml` if genuinely customized for that use case (e.g., tutor notebook might add an `exercise` card type). Standard types (note, code, bookmark) inherit from app's `defaults/templates/*.js` via lazy/copy-on-write.

**Benefits:**
- Each use case gets tailored CLAUDE.md, theming, and README
- Clear what you're getting before you start
- Easy to add new templates (community contributions)
- Consistent with lazy/copy-on-write - "if it exists, it's customized"
- No magic - just directories you can inspect and modify

### 2. Module organization

How granular should the JS modules be? Options:

a. **By section** (as proposed): `state.js`, `render.js`, `editor.js`, etc.
b. **Finer-grained**: `render-cards.js`, `render-viewers.js`, `render-modals.js`
c. **By feature**: `notes.js`, `code.js`, `bookmarks.js`, `themes.js`

Leaning toward (a) - matches current section markers, natural migration path.

### 3. Theme registry format

How should themes be discovered/listed?

a. **Explicit registry**: `themes/index.js` exports list of available themes
b. **Convention-based**: Any `.js` file in `/themes/` is a theme
c. **Manifest file**: `themes/manifest.json` lists themes with metadata

Leaning toward (a) - explicit is clearer, allows ordering and metadata.

### 4. Settings.yaml theme field?

Should notebooks have a `theme: manuscript` field in settings.yaml that references app themes?

- **Pro**: Theme updates automatically when app updates
- **Con**: Adds complexity; theme might not exist if app version differs

Leaning toward no - keep it simple with copy-to-notebook approach.

### 5. Future single-file option?

If someone wants the single-file distribution:

a. **Build script**: `node scripts/bundle.js` creates `dist/research_notebook.html`
b. **GitHub release**: Publish bundled HTML as release artifact
c. **Don't support**: Multi-file is the only distribution

Leaning toward (a) - add later if there's demand.

## Migration Path

### Phase 1: Structure

1. Create branch `refactor/multi-file-architecture`
2. Create directory structure (`js/`, `css/`, `defaults/`, etc.)
3. Move themes to `themes/` as ES modules
4. Keep `research_notebook.html` working during migration

### Phase 2: Extract CSS

1. Extract all CSS to `css/app.css`
2. Update `index.html` to link stylesheet
3. Verify styling works

### Phase 3: Extract JavaScript

1. Create `js/app.js` entry point
2. Extract sections to modules one at a time
3. Convert to ES module exports/imports
4. Keep state management clean (single source of truth)

### Phase 4: Defaults as Modules

1. Convert templates to `defaults/templates/*.js`
2. Convert theme to `defaults/theme.js`
3. Update app to import defaults
4. Implement lazy/copy-on-write behavior

Note: CLAUDE.md/README.md are NOT in defaults/ - they live in example notebooks (see Phase 5b).

### Phase 5a: Theme System

1. Create `themes/index.js` registry
2. Convert existing themes to ES modules
3. Add theme picker UI to settings
4. Implement copy-to-notebook on selection

### Phase 5b: Example Notebooks

1. Create `examples/research-notebook/` with research-focused CLAUDE.md, manuscript theme
2. Create `examples/tutor-notebook/` with student collaboration CLAUDE.md, friendly theme
3. Create `examples/dev-notebook/` with code-focused CLAUDE.md, terminal theme
4. Optional: `scripts/new-notebook.py` CLI helper
5. Decide fate of existing `examples/demo-notebook/`

Note: Can run in parallel with Phase 5a after Phase 4 completes.

### Phase 6: Cleanup

1. Remove old `research_notebook.html`
2. Update root CLAUDE.md for new structure
3. Update root README.md with new usage instructions
4. Update `generate_index.py` or remove if obsolete

## References

- [ES Modules in Browsers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- Current architecture: `CLAUDE.md` in repo root
- Template system: `dev/planning/architecture/template-system-design.md`
- Filesystem plan: `dev/planning/architecture/filesystem-plan.md`
