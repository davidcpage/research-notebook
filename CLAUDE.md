# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Navigating the Large Single-File Application

**IMPORTANT**: `research_notebook.html` is a 5000+ line single-file application that cannot be read in full in one context window.

### How to Navigate

Run `/start` or `python3 generate_index.py --sections` to see section layout with line numbers.

**Finding functions**: Use `generate_index.py --section SECTION_NAME` to list functions in a section, or `--search KEYWORD` to find functions by name/description. Useful for tracing data flows across the codebase.

**IMPORTANT**: Before launching Explore agents, use `generate_index.py` and targeted Grep/Read. This codebase is well-documented - CLAUDE.md covers architecture, and `generate_index.py --search TERM` quickly finds function locations. Explore agents are expensive (~100k tokens) and often redundant here.

Key sections: HTML_HEAD (CSS), HTML_BODY_AND_MODALS, STATE_AND_CONFIG, TEMPLATE_SYSTEM, GENERIC_EDITOR,
DATA_PERSISTENCE, FILESYSTEM_STORAGE, PYODIDE_RUNTIME, INTERNAL_LINKING, RENDER_FUNCTIONS, EVENT_HANDLERS_AND_INIT

Section markers: `// ========== SECTION: NAME ==========` (JS) or `<!-- ========== SECTION: NAME ========== -->` (HTML)

Add a comment above new functions describing their purpose (parsed by generate_index.py).

### Tracing Card/Viewer Rendering

To find CSS or modify rendering for a card type, trace from template to render function:

1. Find template definition in `getDefaultTemplates()` (or `.template.yaml` file)
2. Note the `card.layout` and `viewer.layout` values (e.g., `image`, `document`, `split-pane`)
3. Search for render function: `render{Layout}Preview` for cards, `render{Layout}Viewer` for viewers
4. The render function shows exact HTML structure and CSS class names
5. Search for those classes in HTML_HEAD section for styling

Example: Bookmark uses `layout: 'image'` → `renderImagePreview()` / `renderImageViewer()` → classes like `.viewer-image-container`, `.viewer-thumbnail`, `.viewer-url`, `.viewer-description`

---

## Common Tasks

### Adding a new modal
1. Add HTML in HTML_BODY_AND_MODALS section
2. Add CSS in HTML_HEAD section
3. Add open/close/save functions in new or appropriate section
4. Add Enter key handler in EVENT_HANDLERS_AND_INIT

### Modifying data structure
1. Update `data` structure in STATE_AND_CONFIG
2. Update `loadData()` for backwards compatibility
3. Update `render()` and card render functions
4. Update filesystem read/write functions if format changes

### Adding a new item type (Template System)
The app uses a template system defined in TEMPLATE_SYSTEM and GENERIC_EDITOR sections:
- `extensionRegistry`: Maps file extensions to parsers (e.g., `.md` → yaml-frontmatter parser)
- `templateRegistry`: Defines card types with schema, layout, styling, and editor configuration
- Templates stored as `*.template.yaml` files in notebook root
- Settings and extension mappings in `settings.yaml`

To add a new card type:
1. Add template to `getDefaultTemplates()` in TEMPLATE_SYSTEM (or create `.template.yaml` file)
2. Add extension mapping to `getDefaultExtensionRegistry()` if using new file format
3. Define in template: `schema`, `card.layout`, `viewer.layout`, `editor.fields`, `editor.actions`, `ui`

Card rendering, viewer display, and editing all work automatically via templates.

### System cards (settings, templates, theme)
- `settings.yaml` and `*.template.yaml` are system cards with special templates using `yaml` layout
- **Theme card**: `theme.css` loaded as system card, saving reloads CSS via `loadThemeCss()`
- **Auto-creation**: `ensureTemplateFiles()` creates `settings.yaml`, `theme.css`, and default template files for new notebooks. `ensureTemplatesForExistingCards()` creates template files only for card types that have cards but missing templates
- **Modified indicator**: Template files (note, code, bookmark), README.md, CLAUDE.md, and theme.css show orange "MODIFIED" badge when they differ from defaults. Viewer shows "Show Diff" button (uses jsdiff library), "Merge Defaults" (templates only), and "Reset to Defaults" buttons. Key functions: `isSystemCardModified()`, `getSystemCardDefaultContent()`, `showSystemCardDiff()`, `resetSystemCardDefaults()`

### Theming
- `theme.css` in notebook root overrides app styles (loads after built-in CSS)
- New notebooks get a minimal starter `theme.css` with documented variables
- Full reference: `/theme.css` in repo root documents all customizable selectors
- Demo theme: `examples/demo-notebook/theme.css` shows elaborate theming with textures
- Key function: `getDefaultThemeContent()` generates the starter theme for new notebooks

### Adding new field types
When adding field type handling in `renderEditorField()`, check type-specific conditions BEFORE generic ones like `multiline && monospace`. The yaml type must be checked early or it falls through to code textarea handling.

### Reusable field types for lists
- `type: 'list'` - Simple list of strings with up/down/delete buttons
- `type: 'records'` - Datatable with column headers and draggable rows
  - Boolean fields render as checkbox toggles (✓ when checked)
  - Text fields render as inline editable inputs
  - Drag handles for row reordering
- Helper functions: `normalizeSectionsFormat()`, `getSectionNames()`, `getSystemSectionVisible()`

---

## Architecture

### Single-File Structure
- All CSS, HTML, and JavaScript in `research_notebook.html`
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
├── settings.yaml
├── theme.css (optional)
├── *.template.yaml
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

**Sections:** Directories at notebook root become sections. Reserved directories (`assets/`, `.git/`, `.notebook/`, `node_modules/`, dotfiles) are excluded.

**System section:** Files at root (settings.yaml, theme.css, templates, CLAUDE.md, README.md) appear in a virtual "System" section configured with `path: '.'` in settings.yaml.

**Why Filesystem?** Claude Code integration, Git versioning, portable files, no size limits.

**IndexedDB** (cache only): Persists directory handle and caches data for faster loads.

---

## CSS Patterns

### Template CSS Variables
Templates define CSS custom properties that both card and viewer inherit, ensuring consistency:

```css
/* Note template - parchment style */
.card[data-template="note"],
.modal.viewer[data-template="note"] {
    --template-border: #d9d0be;
    --template-bg: #f6f0e2;
    --template-preview-bg: #f0ebe0;
    --template-title-text: #4a4138;
    --template-heading-font: Georgia, serif;
}

/* Code template - dark terminal style */
.card[data-template="code"],
.modal.viewer[data-template="code"] {
    --template-border: #3a3f4a;
    --template-bg: #282c34;
    --template-output-bg: #2c323c;
    --template-code-bg: #282c34;
    --template-code-text: #abb2bf;
    --template-title-text: #e0e4eb;
    --template-meta-text: #7a8292;
}
```

**Standard variables**: `--template-border`, `--template-bg`, `--template-preview-bg`, `--template-title-text`, `--template-meta-text`, `--template-heading-font`, `--template-output-bg`, `--template-code-bg`, `--template-code-text`

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
- **Import map**: Defined in HTML_HEAD, maps `@codemirror/*` packages to esm.sh CDN
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
1. Add package to import map in HTML_HEAD (e.g., `"@codemirror/lang-javascript": "https://esm.sh/*@codemirror/lang-javascript@6.x.x"`)
2. Add import in `loadCodeMirror()`
3. Add case in `createCodeMirrorEditor()` switch statement
4. Set `language` property in template's editor field config

### Dual Highlighting System
- **Editing**: CodeMirror (full editor features: syntax highlighting, bracket matching, etc.)
- **Viewing**: Highlight.js (lightweight, for read-only display in cards/viewers)

---

## Development Guidelines

### Testing
- Open `research_notebook.html` directly in browser (no build/server needed)
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

**Author icons are configured in `settings.yaml`:**
```yaml
# In settings.yaml
default_author: Claude
authors:
  - name: Claude
    icon: claude.svg
  - name: David
    icon: david.svg
```

Icon files are stored in `assets/author-icons/` as SVG files. Matching is exact (case-insensitive).
New notebooks include Claude configured by default with `assets/author-icons/claude.svg`.

### Known Gotcha: System Notes Leak
When creating a new notebook folder, always clear `data.systemNotes = []` in addition to `data.sections`. Otherwise, system notes from the previously open notebook get copied to the new folder.
