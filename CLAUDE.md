# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Navigating the Large Single-File Application

**IMPORTANT**: `research_notebook_with_code.html` is a 5000+ line single-file application that cannot be read in full in one context window.

### How to Navigate

Run `/start` or `python3 generate_index.py --sections` to see section layout with line numbers.

Key sections: HTML_HEAD (CSS), HTML_BODY_AND_MODALS, STATE_AND_CONFIG, TEMPLATE_SYSTEM, GENERIC_EDITOR,
DATA_PERSISTENCE, FILESYSTEM_STORAGE, PYODIDE_RUNTIME, INTERNAL_LINKING, RENDER_FUNCTIONS, EVENT_HANDLERS_AND_INIT

Section markers: `// ========== SECTION: NAME ==========` (JS) or `<!-- ========== SECTION: NAME ========== -->` (HTML)

Add a comment above new functions describing their purpose (parsed by generate_index.py).

### Common Tasks

**Adding a new modal:**
1. Add HTML in HTML_BODY_AND_MODALS section
2. Add CSS in HTML_HEAD section
3. Add open/close/save functions in new or appropriate section
4. Add Enter key handler in EVENT_HANDLERS_AND_INIT

**Modifying data structure:**
1. Update `data` structure in STATE_AND_CONFIG
2. Update `loadData()` for backwards compatibility
3. Update `render()` and card render functions
4. Update filesystem read/write functions if format changes

**Adding a new item type (with Template System):**
The app uses a template system defined in TEMPLATE_SYSTEM and GENERIC_EDITOR sections. Key concepts:
- `extensionRegistry`: Maps file extensions to parsers (e.g., `.md` → yaml-frontmatter parser)
- `templateRegistry`: Defines card types with schema, layout, styling, and editor configuration
- `loadCard()`: Generic function to parse any card file using extension registry
- `serializeCard()`: Generic function to serialize any card to its file format
- `saveCardFile()`: Generic function to save any card type
- `renderCard()`: Generic card renderer using template definitions
- `openViewer()`: Generic viewer modal that adapts to any template
- `openEditor()`: Generic editor modal that builds form from template definition
- Templates are stored as `*.template.yaml` files in notebook root
- Settings and extension mappings are in `settings.yaml` (consolidated config)
- Optional `theme.css` for custom styling

To add a new card type (fully automatic with template system):
1. Add template to `getDefaultTemplates()` in TEMPLATE_SYSTEM (or create `.template.yaml` file)
2. Add extension mapping to `getDefaultExtensionRegistry()` if using new file format
3. Define in template:
   - `schema`: Field definitions with types (text, markdown, code, url, thumbnail, yaml, etc.)
   - `card.layout`: Preview layout (document, image, split-pane, fields, yaml)
   - `viewer.layout`: Viewer layout and field mappings
   - `editor.fields`: Field order and widget configuration for the edit form
   - `editor.actions`: Optional action buttons (e.g., Run for code)
   - `ui`: Button label, icon, sort order for toolbar

Note: Card rendering, viewer display, and editing all work automatically via templates.

**System cards (settings, templates):**
- `settings.yaml` and `*.template.yaml` files are loaded as system cards with special templates
- Both use `yaml` layout to display all schema fields as formatted YAML
- Settings has 3 special cases: editor footer (folder info), save handler (updates globals), entry point (⚙ button)
- Templates loaded in `loadFromFilesystem()` with parsed fields for yaml layout rendering
- **Auto-creation of templates**: When loading an existing notebook, `ensureTemplatesForExistingCards()` creates template files only for card types that already have cards but are missing template files. This supports customization of existing cards without auto-creating templates the user may have intentionally removed.

**Adding new field types:**
When adding field type handling in `renderEditorField()`, check type-specific conditions BEFORE generic ones like `multiline && monospace`. The yaml type must be checked early or it falls through to code textarea handling.

**Debugging JavaScript errors:**
**IMPORTANT FOR BUG REPORTS**: When reporting bugs, ALWAYS check the browser DevTools Console (F12 or Cmd+Option+I) for the full error message and stack trace. The console shows the exact line number and function call chain - this is ESSENTIAL for debugging. Toast messages alone are not sufficient for diagnosing issues.

**Debugging Pyodide:**
1. Check browser console for `[Pyodide]` logs
2. Verify function is named `initPyodide()` not `loadPyodide()` (name collision!)
3. Check network tab for CDN requests
4. Pyodide v0.28.2 URL: `https://cdn.jsdelivr.net/pyodide/v0.28.2/full/`

---

## Project Overview

This is a single-file HTML application called "Research Notebook" - a browser-based research management tool that combines bookmarks, markdown notes, and executable Python code snippets. The entire application is contained in `research_notebook_with_code.html` and runs completely client-side with no backend server.

## Architecture

### Single-File Structure
- All CSS, HTML, and JavaScript are in one file: `research_notebook_with_code.html`
- External dependencies loaded via CDN:
  - PDF.js for PDF rendering
  - Marked.js for markdown rendering
  - KaTeX for LaTeX math rendering
  - Pyodide for in-browser Python execution

### Data Model
The application uses a hierarchical structure stored in IndexedDB:
```javascript
data = {
  title: string,        // Notebook title (displayed in header and browser tab)
  subtitle: string,     // Notebook subtitle (displayed below title)
  sections: [
    {
      id: string,
      name: string,
      items: [
        // Each item has type: 'bookmark' | 'note' | 'code'
        { type: 'bookmark', url, title, description, ... },
        { type: 'note', title, content, ... },
        { type: 'code', title, code, language, ... }
      ]
    }
  ]
}
```

### Key Components

**State Management** (STATE_AND_CONFIG section):
- Global `data` object holds all sections and items (including `data.systemNotes[]`)
- `collapsedSections` Set tracks UI state (not persisted)
- `showSystemNotes` - Toggle for System section visibility (persisted in localStorage)
- Pyodide runtime state: `pyodide`, `pyodideLoading`, `pyodideReady`
- Filesystem state: `notebookDirHandle`, `filesystemLinked`
- Generic editor state: `editingCard` (in GENERIC_EDITOR section)

**System Notes** (loaded from notebook root):
- Text files at notebook root are loaded as "system notes" in a special System section
- Toggle visibility via ⚙ Settings editor checkbox
- **File types loaded**: `.md`, `.txt`, and specific dotfiles (`.gitignore`, `.env.example`, `.editorconfig`, `.prettierrc`, `.eslintrc`)
- **Excluded**: `.json`, `.html`, `.js`, `.css`, images, and most hidden files
- **Format field**: `format: 'markdown' | 'text'` based on file extension
  - `.md` files → `format: 'markdown'` (rendered with markdown/LaTeX)
  - Other files → `format: 'text'` (rendered as `<pre>` monospace)
- Raw text notes preserve their original filename when saved
- System note data structure:
  ```javascript
  { type: 'note', system: true, id, filename, title, content, format, modified }
  ```

**Data Persistence** (DATA_PERSISTENCE section):
- `loadData()`: Async function that reads from IndexedDB
- `saveData()`: Async function that writes to IndexedDB (no size limits like localStorage)
- **IMPORTANT**: All `saveData()` calls must use `await` since it's async

**Core Rendering** (RENDER_FUNCTIONS + TEMPLATE_SYSTEM sections):
- `render()`: Main function that regenerates entire UI from data model
- `renderCard()`: Generic card renderer using template definitions (in TEMPLATE_SYSTEM)
- `openViewer()`: Generic viewer modal (in TEMPLATE_SYSTEM)
- Called after any data modification
- Cards use `.card[data-template="..."]` CSS selectors for styling

**Item Types**:
1. **Bookmarks** (BOOKMARK_MODAL section): URL, title, description, auto-fetches metadata
   - **Thumbnail Generation**: Automatically generates thumbnails via microlink API or PDF.js
   - **Manual Thumbnail Upload**: Drag-and-drop or click-to-upload screenshot fallback
     - Preview area in bookmark modal (180px height, matches card thumbnails)
     - Supports drag-and-drop of image files with visual feedback
     - Click preview area to open file picker (mobile/accessibility)
     - File validation: Image types only, 5MB max size
     - Manual thumbnails take priority over auto-generation
     - Preserved in edit mode, can replace failed auto-generation
   - State tracking via `manualThumbnail` variable
   - `initThumbnailDragDrop()`: Initializes drag-and-drop handlers on page load
2. **Notes** (NOTE_MODAL section): Markdown content with LaTeX support, preview/edit modes
3. **Code** (CODE_MODAL section): Python code snippets with in-browser execution via Pyodide
   - Each code item has `showOutput` boolean field (defaults to `true` when output exists)
   - Output includes HTML (text, images for plots) stored in `output` field
   - **Auto-execute**: Code automatically runs on save to generate output
   - Split pane view shows output (60% left) and code context (40% right)

**Python Execution** (PYODIDE_RUNTIME section):
- **CRITICAL**: Function is named `initPyodide()` NOT `loadPyodide()` to avoid collision with global `window.loadPyodide()`
- Uses Pyodide v0.28.2 (same stable version as stlite project)
- Lazy-loads on first Python code execution (~10MB initial download)
- Pre-loads numpy, pandas, matplotlib packages during initialization
- `initPyodide()`: Downloads and initializes Python runtime with proper indexURL configuration
- `executePythonCode()`: Runs code in isolated context, captures stdout/stderr
- Matplotlib integration: plots rendered as base64 PNG images in output
- Console logging enabled for debugging: `[Pyodide] ...` messages track initialization progress

**Settings** (GENERIC_EDITOR section):
- **Settings Editor**: Accessible via ⚙ icon in toolbar (far right, grey/muted color)
- Uses the generic editor with the `settings` template
- Edits `settings.yaml` containing notebook_title, notebook_subtitle, sections, extensions
- `openSettingsEditor()`: Opens generic editor for settings card
- Footer includes folder info, Refresh/Change buttons, and system notes toggle

**Onboarding** (ONBOARDING section):
- First-time setup flow shown when no folder is linked
- Prompts user to select a notebook folder
- Browser compatibility check for File System Access API
- `showOnboarding()`, `closeOnboarding()`, `setupNotebookFolder()`

**Internal Linking** (INTERNAL_LINKING section):
- Supports `[[Section Name > Item Title]]` syntax in markdown
- Event delegation for click handling
- `navigateToItem()`: Opens viewer for linked items

## Development Guidelines

### Testing the Application
Since this is a single HTML file:
- Open `research_notebook_with_code.html` directly in a browser
- No build step or local server required
- Use browser DevTools console for debugging
- Data stored in IndexedDB: Database `ResearchNotebookDB`, Store `notebook`
- View data in DevTools → Application → IndexedDB

### Important Patterns
- After any data modification, always call `await saveData()` then `render()` (saveData is async!)
- Modal workflow: open modal → populate fields → save → close modal → render
- Type safety: All items must have valid `type` field ('bookmark', 'note', or 'code')
- Escape HTML in user input using `escapeHtml()` function
- **Storage**: IndexedDB handles large datasets (GBs) without quota issues, unlike localStorage (5-10MB)

### Storage Architecture

The app uses **filesystem-based storage** via the File System Access API (Chrome/Edge required).

**First-Time Setup**:
- On first launch, onboarding modal prompts user to select a notebook folder
- Can select empty folder (creates new notebook) or existing notebook folder (loads it)
- Folder selection persists across browser sessions

**Directory Structure**:
```
notebook-folder/
├── settings.yaml           # Title, subtitle, sections, extensions config
├── sections/
│   ├── section-name/
│   │   ├── _section.json   # Section metadata
│   │   ├── note-title.md   # Note as markdown with YAML frontmatter
│   │   ├── code-title.code.py    # Code as Python with comment frontmatter
│   │   ├── code-title.output.html # Code execution output
│   │   └── bookmark-title.bookmark.json # Bookmark metadata
│   └── ...
└── assets/
    └── thumbnails/         # Bookmark thumbnails as image files
```

**File Formats**:
- **Notes**: Markdown with YAML frontmatter (id, title, created, modified)
- **Code**: Python with comment-based frontmatter, output in separate `.output.html`
- **Bookmarks**: JSON with url, title, description, thumbnail path

**Why Filesystem?**
- **Claude Code integration**: Claude can read/write files directly
- **Git versioning**: Meaningful diffs, history per item
- **Portable**: Markdown/Python files editable in any editor
- **No size limits**: Folder can grow to any size

**IndexedDB** (Cache Only):
- Used to persist directory handle across sessions
- Also caches notebook data for faster loads
- Database: `ResearchNotebookDB`, Store: `notebook`

**Settings**:
- Settings editor (⚙ button) shows current folder and provides Refresh/Change Folder buttons
- Settings stored in `settings.yaml` with notebook_title, notebook_subtitle, sections, extensions
- Refresh reloads from filesystem (picks up external edits)
- Change Folder switches to different notebook

### Pyodide Configuration
**Version**: v0.28.2 (following stlite's proven approach)
- Script loaded in HTML `<head>` from jsDelivr CDN
- Runtime initialization with `indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.2/full/'`
- **Avoid function name collision**: Never name wrapper functions `loadPyodide` - use `initPyodide` instead

**Loading Behavior**:
- First execution: ~10-20 seconds (downloads runtime + numpy/pandas/matplotlib)
- Subsequent loads: 1-2 seconds (cached by browser)
- Status updates via `updatePyodideStatus()` show progress in UI
- Console logs all initialization steps for debugging
- **Note**: If loading hangs, check for function name collisions or incorrect CDN URLs

**Pre-loaded Packages**:
- numpy, pandas, matplotlib loaded during initialization
- Additional packages auto-download when imported via `import` statements
- Matplotlib configured for inline display with base64 PNG output

**Card Styling**:
All card types (bookmarks, notes, code) follow a unified design pattern:
- Large preview frame at top (180px height) displaying primary content
- Title and metadata below the preview frame
- Consistent hover effects and action buttons

**Note Cards**:
- Preview frame: Rendered markdown with richer parchment background (#f0ebe0)
- Subtle styling via warm cream tones to distinguish from bookmarks
- Empty notes show 📝 placeholder icon

**Code Cards**:
- Preview frame: Code text with light green-gray background (#f8faf8)
- Split pane output view: Output (60%, left, #eef4ee background) + code context (40%, right)
- Code font in split pane: 0.4rem to minimize wrapping (context only, full view available)
- Action buttons (toggle ▶/{ }, edit ✎, delete ×) appear on hover
- Toggle button switches between code-only and split pane view (only shown if output exists)
- `showOutput` field defaults to `true` when output is available
- Empty code cells show 🐍 placeholder icon

**Auto-Execute Behavior**:
- `saveCode()` function automatically runs code via `runCode()` before saving
- Button shows "⏳ Running & Saving..." during execution
- Ensures output is always available for split pane view
- Errors are captured and displayed in output

### Viewer Modals

**Design Philosophy**:
All three item types (notes, bookmarks, code) follow a consistent card-to-viewer pattern:
- **Cards**: Compact previews showing main content in 180px frame
- **Viewers**: Large modals (900px width, 60vh-90vh height) showing same content layout, just bigger
- **Principle**: Viewers are "zoomed in" versions of cards, not different views

**Card Interaction**:
- Entire card is clickable → opens viewer modal
- No action buttons on cards (edit/delete moved to viewer)
- Only interaction: click to open + hover shadow effect
- Internal links in note/bookmark card previews are non-interactive (visual only)

**Viewer Modal Structure**:
All viewers share consistent styling:
- **Width**: 900px max-width (note, code) or 700px (bookmark, though can be 900px)
- **Height**: 60vh minimum, 90vh maximum
- **Header**: White background, no icons, just title + close button (×)
- **Footer**: White background, metadata + action buttons (Edit, Delete, etc.)
- **No borders**: Between header/content/footer for seamless appearance

**Note Viewer**:
- Large markdown preview with full LaTeX rendering
- Internal links are clickable (navigate between items)
- Backlinks section shows items that link to this note
- Actions: Edit, Delete

**Bookmark Viewer**:
- Large thumbnail fills main area (80% size to show gradient background)
- Same gradient background as card: `linear-gradient(135deg, var(--bg-primary) 0%, var(--border) 100%)`
- Description shown below thumbnail (URL hidden - available via Open button)
- Backlinks section shows items that link to this bookmark
- Actions: Open ↗, Edit, Delete

**Code Viewer**:
- Uses same layout as code card: split-pane (60/40) if output exists, code-only otherwise
- **Split-pane**: Output on left (60%), code context on right (40%)
- **Code-only**: Full code display when no output
- Light backgrounds (#f8faf8) with dark green text (#2d5016) - no dark syntax highlighting
- Backlinks section shows items that link to this code
- Actions: Run (re-execute), Edit, Delete

**CSS Specificity**:
- Viewer styles use `.modal.viewer[data-template="..."]` selectors
- Base `.modal.viewer` class provides common viewer styles
- Template-specific overrides via data attribute selectors

**Internal Link Behavior**:
- Event delegation checks if link is inside viewer modal: `link.closest('#viewerModal')`
- Links only work in viewer modals, not in card previews
- Clicking internal link closes current viewer and opens target item's viewer

---

## Creating Notebook Content via Files (for Claude Code)

When creating notebook items by writing files directly (rather than through the app UI), be aware of these gotchas:

### Notes (.md files)
Notes work straightforwardly. Use YAML frontmatter:
```markdown
---
id: unique-id
title: Note Title
created: 2024-12-08T09:00:00Z
modified: 2024-12-08T09:00:00Z
---

Your markdown content here...
```

### Bookmarks (.bookmark.json files)
**Thumbnail limitation**: Bookmarks created via files won't have auto-generated thumbnails.

Options:
1. **Leave thumbnail empty** - User can edit in app to auto-fetch
2. **Manually add thumbnail** - Save image to `assets/thumbnails/{id}.png` and reference as `"thumbnail": "../../assets/thumbnails/{id}.png"`

Example bookmark JSON:
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
**Matplotlib gotcha**: The app auto-detects matplotlib figures. Key rules:

1. **DON'T use `plt.show()`** - Causes "FigureCanvasAgg is non-interactive" warning
2. **DON'T use `plt.close()`** - Prevents auto-detection of figures
3. **DON'T print HTML manually** - stdout is HTML-escaped by the app

Correct pattern:
```python
# ---
# id: code-example
# title: Plot Example
# created: 2024-12-08T09:00:00Z
# modified: 2024-12-08T09:00:00Z
# ---

import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
plt.title('Sine Wave')
# Don't call plt.show() or plt.close()
# App auto-captures the figure
```

The app's `executePythonCode()` function:
- Escapes stdout with `escapeHtml()` (so printed HTML won't render)
- Checks `plt.get_fignums() > 0` to detect figures
- Uses `_get_plot_as_base64()` to capture figures properly

### Bug Fixed: System Notes Leak
When creating a new notebook folder, always clear `data.systemNotes = []` in addition to `data.sections`. Otherwise, system notes from the previously open notebook get copied to the new folder.
