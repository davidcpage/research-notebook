# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Navigating the Application

**Structure**: The app is split into three core files plus modular card types:
- `index.html` - HTML shell (~210 lines)
- `css/app.css` - Core application styles (~2200 lines)
- `js/app.js` - All JavaScript (~6500 lines)
- `card-types/` - Self-contained card type modules (template.yaml + styles.css)

### How to Navigate

Run `/start` or `python3 generate_index.py --sections` to see section layout with line numbers.

**Finding functions**: Use `generate_index.py --section SECTION_NAME` to list functions in a section, or `--search KEYWORD` to find functions by name/description. Useful for tracing data flows across the codebase.

**IMPORTANT**: Before launching Explore agents, use `generate_index.py` and targeted Grep/Read. This codebase is well-documented - CLAUDE.md covers architecture, and `generate_index.py --search TERM` quickly finds function locations. Explore agents are expensive (~100k tokens) and often redundant here.

Key sections in js/app.js: STATE_AND_CONFIG, TEMPLATE_SYSTEM, GENERIC_EDITOR,
DATA_PERSISTENCE, FILESYSTEM_STORAGE, PYODIDE_RUNTIME, INTERNAL_LINKING, RENDER_FUNCTIONS, EVENT_HANDLERS_AND_INIT

Section markers: `// ========== SECTION: NAME ==========`

Add a comment above new functions describing their purpose (parsed by generate_index.py).

### Tracing Card/Viewer Rendering

To find CSS or modify rendering for a card type:

1. Find template in `card-types/{type}/template.yaml`
2. Note the `card.layout` and `viewer.layout` values (e.g., `image`, `document`, `split-pane`)
3. Search for render function: `render{Layout}Preview` for cards, `render{Layout}Viewer` for viewers
4. The render function shows exact HTML structure and CSS class names
5. Find styles in `card-types/{type}/styles.css` (card-specific) or `css/app.css` (generic layouts)

Example: Bookmark uses `layout: 'image'` → `renderImagePreview()` / `renderImageViewer()` → classes like `.viewer-image-container`, `.viewer-thumbnail`, `.viewer-url`, `.viewer-description`

---

## Common Tasks

### Adding a new modal
1. Add HTML in `index.html` (body section)
2. Add CSS in `css/app.css`
3. Add open/close/save functions in appropriate section of `js/app.js`
4. Add Enter key handler in EVENT_HANDLERS_AND_INIT section

### Modifying data structure
1. Update `data` structure in STATE_AND_CONFIG
2. Update `loadData()` for backwards compatibility
3. Update `render()` and card render functions
4. Update filesystem read/write functions if format changes

### Adding a new item type (Card Type Modules)
Card types are self-contained modules in `card-types/{type}/`:
- `template.yaml` - Schema, layout config, editor fields (required)
- `styles.css` - Card and viewer CSS (optional)
- `index.js` - Custom render functions (optional, for complex types)

To add a new card type:
1. Create `card-types/{type}/template.yaml` with schema, card.layout, viewer.layout, editor.fields
2. Add `{type}` to `card-types/index.json` modules array
3. Add CSS in `card-types/{type}/styles.css` if custom styling needed
4. Add extension mapping to `getDefaultExtensionRegistry()` if using new file format

Card rendering, viewer display, and editing all work automatically via templates. CSS is injected into `@layer templates` at runtime.

User overrides: Notebooks can override templates via `.notebook/templates/{type}.yaml`.

### Troubleshooting: "Unknown template" errors
If cards fail to render with `[Render] Unknown template: X` in the console, check for **YAML syntax errors** in the template file.

**Where templates live**:
- Card types: `card-types/{type}/template.yaml`
- System types: `defaults/templates/{type}.yaml` (settings, template, theme only)

**Diagnosis**:
1. Check the browser console for YAML parsing errors or 404s
2. Validate the template file: `python3 -c "import yaml; yaml.safe_load(open('card-types/X/template.yaml'))"`
3. Common culprits: unquoted colons in descriptions (e.g., `description: Array of {foo: bar}` needs quotes)

**Do NOT** create `.notebook/templates/X.yaml` in a user's notebook to "fix" this - that just works around a broken default template. Fix the source file in `card-types/{type}/template.yaml`.

### System cards (settings, templates, theme)
- `.notebook/settings.yaml` and `.notebook/templates/*.yaml` are system cards with special templates using `yaml` layout
- **Theme card**: `.notebook/theme.css` loaded as system card, saving reloads CSS via `loadThemeCss()`
- **Auto-creation**: `ensureTemplateFiles()` creates `.notebook/` directory structure with settings, theme, and templates for new notebooks. `ensureTemplatesForExistingCards()` creates template files only for card types that have cards but missing templates
- **Modified indicator**: Template files (note, code, bookmark), README.md, CLAUDE.md, and theme.css show orange "MODIFIED" badge when they differ from defaults. Viewer shows "Show Diff" button (uses jsdiff library), "Merge Defaults" (templates only), and "Reset to Defaults" buttons. Key functions: `isSystemCardModified()`, `getSystemCardDefaultContent()`, `showSystemCardDiff()`, `resetSystemCardDefaults()`

### Theming
The app uses a two-layer theme system: base themes + notebook customizations.

**CSS cascade**: `css/app.css` → `/themes/{id}.css` (base) → `.notebook/theme.css` (customizations)

**Base themes** (in `/themes/` directory):
- `manuscript` - Warm, scholarly parchment aesthetic with textured backgrounds
- `minimal` - Clean, sparse design with subtle accents and generous whitespace
- `terminal` - Dark hacker aesthetic with green-on-black terminal feel
- `friendly` - Accessible, warm aesthetic with light blue accents for learning
- `handwritten` - Calligraphic style with handwriting fonts for personal journal feel

**Selection**: Set `theme: manuscript` in `.notebook/settings.yaml` or use the Theme picker in Settings editor.

**Customizations**: `.notebook/theme.css` loads after the base theme, allowing per-notebook overrides.

**CSS layers**: Both base and custom themes inject into `@layer theme` (highest layer, overrides all built-in styles). Print styles are unlayered, so they beat theme backgrounds.

**Key files**:
- `/themes/index.json` - Theme registry (id, name, description)
- `/themes/*.css` - Base theme stylesheets
- `/theme-reference.css` - Documents all customizable selectors
- `examples/demo-notebook/.notebook/theme.css` - Shows elaborate customizations

**Key functions**: `loadThemeCss()`, `fetchThemeRegistry()`, `fetchThemeCSS()`

### Adding new field types
When adding field type handling in `renderEditorField()`, check type-specific conditions BEFORE generic ones like `multiline && monospace`. The yaml type must be checked early or it falls through to code textarea handling.

### Reusable field types for lists
- `type: 'list'` - Simple list of strings with up/down/delete buttons
- `type: 'records'` - Datatable with column headers and draggable rows
  - Boolean fields render as checkbox toggles (✓ when checked)
  - Text fields render as inline editable inputs
  - Drag handles for row reordering
- Helper functions: `normalizeSectionsFormat()`, `getSectionNames()`, `getSystemSectionVisible()`

### Image template
The `image` template supports image files (.png, .jpg, .jpeg, .gif, .webp, .svg):
- Binary images are read as data URLs via `FileReader.readAsDataURL()`
- SVG files are read as text and wrapped in a data URL
- Uses the existing `image` layout (same as bookmark thumbnails)
- Fields: `title` (derived from filename), `src` (data URL), `alt`, `caption`
- Images can't be created in the UI (no create button) - they come from the filesystem
- View Assets section (toggle visibility in settings) to see images in `assets/` directory

---

## Architecture

### Multi-File Structure
```
repo/
├── index.html          # HTML shell with CDN imports (~210 lines)
├── css/app.css         # Core application styles (~2200 lines)
├── js/app.js           # All application JavaScript (~6500 lines)
├── js/framework.js     # ES module: utilities for card type modules
├── cli.js              # Node.js static server (required for themes)
├── themes/             # Base themes (fetched at runtime)
│   ├── index.json      # Theme registry
│   ├── manuscript.css
│   ├── minimal.css
│   ├── terminal.css
│   ├── friendly.css
│   └── handwritten.css
├── card-types/         # Self-contained card type modules
│   ├── index.json      # Module manifest
│   └── {type}/         # Each type has its own directory
│       ├── template.yaml   # Schema + layout config (required)
│       ├── styles.css      # CSS styles (optional)
│       └── index.js        # Custom render functions (optional)
├── defaults/           # Default files for new notebooks
│   ├── theme.css       # Starter customization template
│   └── templates/      # System templates only (settings, template, theme)
└── examples/           # Example notebooks
```
- External CDN dependencies: PDF.js, Marked.js, KaTeX, Pyodide, Highlight.js, CodeMirror 6

### Data Model
```javascript
data = {
  title: string,
  subtitle: string,
  sections: [
    {
      id: string,  // Stable ID: 'section-{dirName}'
      name: string,
      visible: boolean,  // Whether section is shown in main UI
      items: [
        { type: 'bookmark', url, title, description, ... },
        { type: 'note', title, content, ... },
        { type: 'code', title, code, language, ... }
      ]
    }
  ],
  systemNotes: [...]  // Files from notebook root (_system section)
}
```

### Key State (STATE_AND_CONFIG section)
- Global `data` object holds all sections and items
- `collapsedSections` Set tracks UI state (persisted to localStorage per-notebook)
- Pyodide runtime: `pyodide`, `pyodideLoading`, `pyodideReady`
- Filesystem: `notebookDirHandle`, `filesystemLinked`
- Generic editor: `editingCard` (in GENERIC_EDITOR section)
- CodeMirror: `codeMirrorInstances`, `codeMirrorModules` (in GENERIC_EDITOR section)

### System Notes
- Files at notebook root loaded as "system notes" in `_system` section
- **Loaded**: `.md`, `.txt`, `.yaml`, `.css` (non-hidden)
- **Excluded**: `.json`, `.html`, `.js`, images, dotfiles
- Format field: `.md` → `format: 'markdown'`, others → `format: 'text'`

### Storage Architecture
**Filesystem-based** via File System Access API (Chrome/Edge required):
```
notebook-folder/
├── .notebook/
│   ├── settings.yaml           # Notebook settings
│   ├── theme.css               # Custom styling
│   └── templates/
│       ├── note.yaml
│       ├── code.yaml
│       └── bookmark.yaml
├── CLAUDE.md
├── README.md
├── research/                    # Section directories at root
│   ├── note-title.md
│   ├── code-title.code.py
│   ├── code-title.output.html
│   └── bookmark-title.bookmark.json
├── references/                  # Another section
│   └── paper.bookmark.json
└── assets/
    ├── thumbnails/
    └── author-icons/
```

**Sections:** Directories at notebook root become sections. Reserved directories (`.git/`, `.notebook/`, `node_modules/`, dotfiles) are excluded. The `assets/` directory is a regular section (default invisible).

**Subdirectories (Progressive Disclosure):** Sections support arbitrary directory depth. Subdirectories render as collapsible nodes (collapsed by default). Click to expand and reveal items + nested subdirs. Items have `_path` field tracking their full path from notebook root (e.g., `research/responses/batch1`). Use `getSubdirFromPath(_path)` to extract subdir within section. Expansion state persists in localStorage per-notebook via `expandedSubdirs` Set. Key functions: `buildSubdirTree()`, `renderSubdirNode()`, `toggleSubdir()`, `isSubdirExpanded()`, `getSubdirFromPath()`, `getSectionFromPath()`.

**System section:** Config files (`.notebook/*`) and root files (CLAUDE.md, README.md) appear in a virtual "System" section. The section's path is normalized to `['.', '.notebook', '.notebook/templates']` on load. Name and path are frozen in the UI; only visibility is editable. System notes are grouped by filename path (root / .notebook / .notebook/templates). New notes can be created in the System section via the "+ Note" button, with a location selector to choose root, .notebook, or .notebook/templates.

**Why Filesystem?** Claude Code integration, Git versioning, portable files, no size limits.

**IndexedDB** (cache only): Persists directory handle and caches data for faster loads.

---

## CSS Patterns

### Template CSS Variables
Each card type module (`card-types/{type}/styles.css`) defines CSS custom properties that both card and viewer inherit:

```css
/* From card-types/note/styles.css */
.card[data-template="note"],
.modal.viewer[data-template="note"] {
    --template-border: var(--note-border);
    --template-bg: #f0ebe0;
    --template-preview-bg: #e8e3d8;
    --template-title-text: var(--text-primary);
    --template-heading-font: 'Playfair Display', serif;
}
```

**Standard variables**: `--template-border`, `--template-bg`, `--template-preview-bg`, `--template-title-text`, `--template-meta-text`, `--template-heading-font`, `--template-output-bg`, `--template-code-bg`, `--template-code-text`

Card type CSS is injected into `@layer templates` at runtime, giving it higher precedence than base styles.

### Card/Viewer Consistency Pattern
- **Cards**: 180px preview frame at top, title/metadata below
- **Viewers**: Same layout as cards, just larger (900px width, 60-90vh height)
- **Principle**: Viewers are "zoomed in" versions of cards, not different views
- Cards use `.card[data-template="..."]` selectors
- Viewers use `.modal.viewer[data-template="..."]` selectors

### Code Card Layout
- Split pane: Output (60%, left) + code context (40%, right)
- Code-only view when no output exists
- `showOutput` field toggles between views

### Markdown Content Pattern
The `.md-content` class provides shared typography for all rendered markdown:
- **Base styles**: headings, paragraphs, lists, code, blockquotes, links, images, tables
- **Used by**: `.preview-content` (card previews), `.viewer-markdown` (viewers), `.viewer-description` (bookmark descriptions)
- **Usage**: Elements get both classes, e.g. `class="md-content preview-content"`
- **Overrides**: Context-specific classes add only their unique rules (smaller spacing for previews, different backgrounds for descriptions)

### CSS Cascade Layers
The app uses CSS cascade layers for predictable style precedence:

```css
@layer reset, vendors, base, components, templates, theme;
```

| Layer | Purpose | When to use |
|-------|---------|-------------|
| `reset` | Universal selector, box-sizing | Rarely - only for normalizations |
| `vendors` | Third-party CSS (highlight.js) | When inlining vendor styles |
| `base` | CSS variables, typography, body | Foundation styles |
| `components` | Cards, modals, buttons, forms | UI element styles |
| `templates` | Card type styling | Template-specific rules |
| `theme` | Base theme + .notebook/theme.css | Loaded dynamically (base first, then customizations) |
| *(unlayered)* | Print styles | Print media queries |

**Key insight**: Unlayered styles beat all layers regardless of specificity. This means:
- theme.css (in `@layer theme`) overrides all built-in styles without `!important`
- Print styles (unlayered) override theme backgrounds for clean white printing

---

## Pyodide (Python Execution)

**CRITICAL**: Function is named `initPyodide()` NOT `loadPyodide()` to avoid collision with `window.loadPyodide()`.

- Version: v0.28.2, CDN: `https://cdn.jsdelivr.net/pyodide/v0.28.2/full/`
- Pre-loads: numpy, pandas, matplotlib
- First load: ~10-20 seconds; cached: 1-2 seconds
- Debug: Check console for `[Pyodide]` logs, network tab for CDN requests

---

## CodeMirror (Editor Syntax Highlighting)

CodeMirror 6 provides syntax highlighting in editor fields for code, YAML, CSS, and Markdown.

### Architecture
- **Loaded via ES modules** using import maps (no build step required)
- **Lazy loading**: CodeMirror modules load on first editor open, then cached
- **Import map**: Defined in `index.html`, maps `@codemirror/*` packages to esm.sh CDN
- **Theming**: One Dark theme for code/YAML/CSS, custom light theme for Markdown

### Key Functions (GENERIC_EDITOR section)
- `loadCodeMirror()`: Lazy-loads CodeMirror modules, returns cached modules
- `createCodeMirrorEditor(container, options)`: Creates editor instance with language support
- `getCodeMirrorValue(fieldName)`: Gets content from a CodeMirror instance
- `destroyCodeMirrorInstances()`: Cleanup when editor closes

### Supported Languages
- Python (`@codemirror/lang-python`) - for code cards, dark theme with line numbers
- YAML (`@codemirror/lang-yaml`) - for settings, templates, dark theme with line numbers
- CSS (`@codemirror/lang-css`) - for theme.css, dark theme with line numbers
- Markdown (`@codemirror/lang-markdown`) - for notes and bookmark descriptions, light theme without line numbers

### Markdown Editor Features
- **Light parchment theme**: Warm background (#faf8f5) matching note card style
- **Custom syntax highlighting**: Headings (brown, sized), bold, italic, links (blue), inline code (red), blockquotes, lists
- **No line numbers**: Cleaner prose editing experience (uses `minimalSetup` instead of `basicSetup`)
- **Monospace font**: Preserved for ASCII diagram compatibility
- **Two modes**: Full editor with Write/Preview tabs (notes), compact editor without tabs (bookmark descriptions)

### Adding a New Language
1. Add package to import map in `index.html` (e.g., `"@codemirror/lang-javascript": "https://esm.sh/*@codemirror/lang-javascript@6.x.x"`)
2. Add import in `loadCodeMirror()` in `js/app.js`
3. Add case in `createCodeMirrorEditor()` switch statement
4. Set `language` property in template's editor field config

### Dual Highlighting System
- **Editing**: CodeMirror (full editor features: syntax highlighting, bracket matching, etc.)
- **Viewing**: Highlight.js (lightweight, for read-only display in cards/viewers)

---

## Development Guidelines

### Running the App
**Server required**: The app fetches theme files and defaults from the repo, so it must run via HTTP server (not `file://`).

```bash
# Recommended: Install globally (works from any directory)
npm link
notebook

# Or run directly from repo
node cli.js

# Alternative: Any static server (from repo root)
python3 -m http.server 8080
```

### Testing
- Data in IndexedDB: Database `ResearchNotebookDB`, Store `notebook`
- View in DevTools → Application → IndexedDB

### Important Patterns
- After data modification: `await saveData()` then `render()` (saveData is async!)
- Modal workflow: open → populate → save → close → render
- Always escape HTML with `escapeHtml()`
- All items must have valid `type` field

### Debugging
**IMPORTANT**: Always check browser DevTools Console (F12 / Cmd+Option+I) for full error message and stack trace. Toast messages alone are insufficient.

**For Claude**: When the user reports something "isn't working" or "has no effect", ask them for the browser console output before diving into code inspection. Console errors often reveal the issue immediately (e.g., calling a non-existent function).

---

## Creating Notebook Content via Files (for Claude Code)

### Notes (.md files)
```markdown
---
id: unique-id
title: Note Title
author: Claude
created: 2024-12-08T09:00:00Z
modified: 2024-12-08T09:00:00Z
---

Your markdown content here...
```

### Bookmarks (.bookmark.json files)
**Note**: Bookmarks created via files won't have auto-generated thumbnails. Leave empty (user can edit in app to auto-fetch) or manually save image to `assets/thumbnails/{id}.png`.

```json
{
  "id": "bookmark-example",
  "title": "Example Site",
  "url": "https://example.com",
  "description": "Description here",
  "created": "2024-12-08T09:00:00Z",
  "modified": "2024-12-08T09:00:00Z"
}
```

### Code Cells (.code.py files)
**Matplotlib gotchas**:
1. **DON'T use `plt.show()`** - Causes "FigureCanvasAgg is non-interactive" warning
2. **DON'T use `plt.close()`** - Prevents auto-detection of figures
3. **DON'T print HTML manually** - stdout is HTML-escaped

```python
# ---
# id: code-example
# title: Plot Example
# author: Claude
# created: 2024-12-08T09:00:00Z
# modified: 2024-12-08T09:00:00Z
# ---

import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
plt.title('Sine Wave')
# Don't call plt.show() or plt.close() - app auto-captures
```

### Author Field and Author Icons
Note and code cards support an `author` field to track who created them:
- Badge appears in top-right corner of the content area (on the markdown/code preview)
- Set `default_author` in Settings to auto-populate author for new cards created in the UI
- When creating cards via files, include `author` in frontmatter (see examples above)

**Author icons are configured in `.notebook/settings.yaml`:**
```yaml
# In .notebook/settings.yaml
default_author: Claude
authors:
  - name: Claude
    icon: claude.svg
  - name: David
    icon: david.svg
```

Icon files are stored in `assets/author-icons/` as SVG files. Matching is exact (case-insensitive).
New notebooks include Claude configured by default with `assets/author-icons/claude.svg`.

### Tags
Cards support an optional `tags` field for classification:
- Display as small badges below card title and in viewer title bar
- Status tags get semantic colors: `completed` (sage), `ongoing` (terracotta), `future` (blue)
- Other tags display in neutral grey
- Editor shows comma-separated input field

```yaml
# In frontmatter
tags: [completed, architecture]
```

**CSS variables** (customizable in theme.css):
```css
--tag-completed-bg: #8a9a7a;
--tag-ongoing-bg: #c4956a;
--tag-future-bg: #6a9db8;
--tag-default-bg: #6b7280;
```

**Key functions**: `normalizeTags()` (handles array/string/YAML formats), `renderTagBadges()`

### Card Ordering
Cards support an optional `number` field for explicit sorting within sections/subdirectories:
- Supports version-style numbers: `1`, `1.1`, `1.10`, `2.0` (semantic comparison)
- Cards with `number` sort before cards without
- Fallback: modified date (newest first)

```yaml
# In frontmatter
number: 1.2
```

**Lesson cards**: Already have `number` for lesson numbering (e.g., "1.1"), which doubles as sort order. To interleave other cards with lessons, give them a `number` value between lesson numbers.

**Key functions**: `compareVersionNumbers()`, `sortSectionItems()`

### Known Gotcha: System Notes Leak
When creating a new notebook folder, always clear `data.systemNotes = []` in addition to `data.sections`. Otherwise, system notes from the previously open notebook get copied to the new folder.
