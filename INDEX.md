# research_notebook_with_code.html - Section Index

This file provides a navigable index for the large single-file application (3800+ lines).
Use grep to search for section markers: `grep -n "SECTION:" research_notebook_with_code.html`

## Quick Reference

| Section | Line | Purpose |
|---------|------|---------|
| [HTML_HEAD](#html_head) | 1 | DOCTYPE, CDN dependencies, all CSS |
| [HTML_BODY_AND_MODALS](#html_body_and_modals) | 1631 | Header, toolbar, modals |
| [STATE_AND_CONFIG](#state_and_config) | 1907 | Global state, marked config |
| [DATA_PERSISTENCE](#data_persistence) | 1943 | IndexedDB operations |
| [UI_UTILITIES](#ui_utilities) | 2021 | Toast notifications |
| [SECTION_MODAL](#section_modal) | 2032 | Section CRUD |
| [SETTINGS_MODAL](#settings_modal) | 2065 | Title/subtitle settings |
| [THUMBNAIL_DRAG_DROP](#thumbnail_drag_drop) | 2093 | Manual thumbnail upload |
| [BOOKMARK_MODAL](#bookmark_modal) | 2209 | Bookmark CRUD |
| [NOTE_MODAL](#note_modal) | 2327 | Note CRUD |
| [NOTE_VIEWER](#note_viewer) | 2430 | Note viewing |
| [BOOKMARK_VIEWER](#bookmark_viewer) | 2498 | Bookmark viewing |
| [PYODIDE_RUNTIME](#pyodide_runtime) | 2579 | Python execution |
| [CODE_MODAL](#code_modal) | 2805 | Code note CRUD |
| [CODE_VIEWER](#code_viewer) | 2914 | Code viewing |
| [INTERNAL_LINKING](#internal_linking) | 3039 | [[wiki-links]] |
| [THUMBNAIL_GENERATION](#thumbnail_generation) | 3225 | Auto thumbnails |
| [DATA_OPERATIONS](#data_operations) | 3409 | Toggle, delete, edit |
| [EXPORT_IMPORT](#export_import) | 3477 | JSON export/import |
| [RENDER_FUNCTIONS](#render_functions) | 3566 | UI rendering |
| [EVENT_HANDLERS_AND_INIT](#event_handlers_and_init) | 3741 | Keyboard, init |

---

## Section Details

### HTML_HEAD
**Lines:** 1-1630
**Type:** HTML/CSS

Contains:
- DOCTYPE declaration
- External CDN dependencies (PDF.js, Marked.js, KaTeX, Pyodide v0.28.2, Highlight.js)
- All CSS styles (~1600 lines)
  - CSS variables and base styles
  - Header and toolbar styles
  - Card styles (bookmark, note, code)
  - Modal styles
  - Responsive breakpoints

### HTML_BODY_AND_MODALS
**Lines:** 1631-1905
**Type:** HTML

Contains:
- Header with title/subtitle
- Toolbar with New Section, Export, Import, Settings buttons
- Main content area (`#content`)
- Modal templates:
  - `#sectionModal` - Create section
  - `#bookmarkModal` - Add/edit bookmark
  - `#noteModal` - Add/edit note with preview tabs
  - `#noteViewerModal` - View note
  - `#bookmarkViewerModal` - View bookmark
  - `#codeModal` - Add/edit code with output
  - `#codeViewerModal` - View code
  - `#settingsModal` - Edit title/subtitle
- Toast notification element

### STATE_AND_CONFIG
**Lines:** 1907-1942
**Type:** JavaScript

Key variables:
- `data` - Main data structure (title, subtitle, sections[])
- `collapsedSections` - UI state (not persisted)
- `editingBookmark`, `editingNote`, `editingCode` - Edit mode trackers
- `currentViewingNote`, `currentViewingCode` - Viewer state
- `manualThumbnail` - Manual upload tracker
- `pyodide`, `pyodideLoading`, `pyodideReady` - Python runtime state
- `marked.setOptions()` - Markdown parser config

### DATA_PERSISTENCE
**Lines:** 1943-2020
**Type:** JavaScript

Functions:
- `loadData()` - Load from IndexedDB on startup
- `openDB()` - Open/create IndexedDB database
- `saveData()` - Save to IndexedDB (async, must await!)

Constants:
- `IDB_NAME = 'ResearchNotebookDB'`
- `IDB_STORE = 'notebook'`
- `IDB_KEY = 'data'`

### UI_UTILITIES
**Lines:** 2021-2031
**Type:** JavaScript

Functions:
- `showToast(message)` - Display temporary notification

### SECTION_MODAL
**Lines:** 2032-2064
**Type:** JavaScript

Functions:
- `openSectionModal()` - Show section creation modal
- `closeSectionModal()` - Hide modal
- `createSection()` - Create new section and save

### SETTINGS_MODAL
**Lines:** 2065-2092
**Type:** JavaScript

Functions:
- `openSettingsModal()` - Show settings modal
- `closeSettingsModal()` - Hide modal
- `saveSettings()` - Save title/subtitle, update header

### THUMBNAIL_DRAG_DROP
**Lines:** 2093-2208
**Type:** JavaScript

Functions:
- `initThumbnailDragDrop()` - Set up drag-drop handlers (called on init)
- `handleDrop(e)` - Process dropped files
- `handleFiles(files)` - Validate and process image files
- `displayThumbnailPreview(dataUrl)` - Show preview in modal
- `clearThumbnailPreview()` - Reset preview state

Features:
- Drag-and-drop image upload
- Click-to-upload fallback
- 5MB file size limit
- Image type validation

### BOOKMARK_MODAL
**Lines:** 2209-2326
**Type:** JavaScript

Functions:
- `openBookmarkModal(sectionId, bookmark)` - Open for create/edit
- `closeBookmarkModal()` - Close and reset
- `saveBookmark()` - Save bookmark, auto-generate thumbnail if needed

Features:
- Section selector
- URL, title, description fields
- Manual thumbnail preview
- Auto-thumbnail generation on save

### NOTE_MODAL
**Lines:** 2327-2429
**Type:** JavaScript

Functions:
- `openNoteModal(sectionId, note)` - Open for create/edit
- `closeNoteModal()` - Close and reset
- `switchEditorTab(tab)` - Toggle write/preview tabs
- `saveNote()` - Save note with timestamps

Features:
- Write/Preview tabs
- Markdown content with [[wiki-links]]
- LaTeX support

### NOTE_VIEWER
**Lines:** 2430-2497
**Type:** JavaScript

Functions:
- `openNoteViewer(sectionId, noteId)` - Display note
- `closeNoteViewer()` - Close viewer
- `editCurrentNote()` - Switch to edit mode
- `deleteCurrentNote()` - Delete with confirmation

Features:
- Rendered markdown with KaTeX
- Backlinks display
- Edit/Delete actions

### BOOKMARK_VIEWER
**Lines:** 2498-2578
**Type:** JavaScript

Functions:
- `openBookmarkViewer(sectionId, bookmarkId)` - Display bookmark
- `closeBookmarkViewer()` - Close viewer
- `editCurrentBookmark()` - Switch to edit mode
- `deleteCurrentBookmark()` - Delete with confirmation

Features:
- Large thumbnail display
- Description with markdown
- Backlinks display
- Open, Edit, Delete actions

### PYODIDE_RUNTIME
**Lines:** 2579-2804
**Type:** JavaScript

Functions:
- `initPyodide()` - Lazy-load Python runtime (IMPORTANT: not named loadPyodide!)
- `updatePyodideStatus(state, message)` - Update UI status indicator
- `runCode()` - Execute code from modal
- `executePythonCode(py, code)` - Run code, capture stdout/stderr/plots

Features:
- Pyodide v0.28.2 from jsDelivr CDN
- Pre-loads numpy, pandas, matplotlib
- Matplotlib plots as base64 PNG
- DataFrame HTML rendering
- 120s timeout with error handling

### CODE_MODAL
**Lines:** 2805-2913
**Type:** JavaScript

Functions:
- `openCodeModal(sectionId, codeNote)` - Open for create/edit
- `closeCodeModal()` - Close and reset
- `saveCode()` - Auto-execute and save with output

Features:
- Python syntax highlighting
- Run button with Pyodide status
- Output display area
- Auto-executes on save

### CODE_VIEWER
**Lines:** 2914-3038
**Type:** JavaScript

Functions:
- `openCodeViewer(sectionId, codeId)` - Display code note
- `closeCodeViewer()` - Close viewer
- `editCurrentCode()` - Switch to edit mode
- `deleteCurrentCode()` - Delete with confirmation
- `runCurrentCode()` - Re-execute in viewer

Features:
- Split-pane view (output 60%, code 40%)
- Code-only view when no output
- Backlinks display
- Run, Edit, Delete actions

### INTERNAL_LINKING
**Lines:** 3039-3224
**Type:** JavaScript

Functions:
- `renderMarkdownWithLinks(text, containerId)` - Parse markdown with [[links]]
- `renderNotePreview(text, maxLength)` - Truncated preview for cards
- `resolveLink(linkText)` - Find item by title or `[[id:xyz]]`
- `findBacklinks(itemId)` - Find items linking to this one
- `navigateToItem(sectionId, itemId)` - Open item viewer

Features:
- Wiki-style `[[Title]]` links
- ID-based `[[id:xyz]]` links
- Bidirectional backlinks
- Click navigation between items

### THUMBNAIL_GENERATION
**Lines:** 3225-3408
**Type:** JavaScript

Functions:
- `resizeAndCompressThumbnail(source, maxWidth, quality)` - Resize to 1000px, JPEG 90%
- `urlToDataUrl(imageUrl)` - Convert remote URL to data URL
- `generateThumbnail(url)` - Auto-generate via microlink API
- `generatePdfThumbnail(url)` - Render PDF first page via PDF.js
- `extractDomain(url)` - Get domain for display

Features:
- Microlink API for web screenshots
- PDF.js for PDF first-page rendering
- Image compression for storage efficiency
- Fallback handling for CORS issues

### DATA_OPERATIONS
**Lines:** 3409-3476
**Type:** JavaScript

Functions:
- `toggleSection(sectionId)` - Collapse/expand section
- `toggleCodeOutput(sectionId, codeId)` - Switch code/output view
- `editBookmark(sectionId, bookmarkId)` - Open bookmark editor
- `confirmDeleteItem(sectionId, itemId, itemType)` - Delete with confirmation
- `deleteSection(sectionId)` - Delete section with confirmation
- `deleteItem(sectionId, itemId)` - Delete item from section
- `updateSectionName(sectionId, newName)` - Rename section

### EXPORT_IMPORT
**Lines:** 3477-3565
**Type:** JavaScript

Functions:
- `exportData()` - Download JSON file
- `importData(event)` - Load JSON file

Features:
- Full notebook export as JSON
- 50MB import limit
- Validation and error handling
- Progress feedback for large files

### RENDER_FUNCTIONS
**Lines:** 3566-3740
**Type:** JavaScript

Functions:
- `render()` - Main UI render (regenerates from data)
- `renderBookmarkCard(sectionId, bookmark)` - Bookmark card HTML
- `renderNoteCard(sectionId, note)` - Note card HTML
- `renderCodeCard(sectionId, codeNote)` - Code card HTML
- `findNote(sectionId, noteId)` - Find note by ID
- `findCode(sectionId, codeId)` - Find code by ID
- `escapeHtml(text)` - XSS prevention
- `formatDate(dateString)` - Date formatting
- `getPlainTextPreview(markdown, maxLength)` - Strip markdown for preview

### EVENT_HANDLERS_AND_INIT
**Lines:** 3741-end
**Type:** JavaScript

Contains:
- Enter key handlers for modals
- Tab key handling in code editor
- Modal close on overlay click
- Escape key modal close
- Internal link click delegation
- Initialization: `loadData()`, `initThumbnailDragDrop()`

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
4. Update export/import if needed

### Adding a new item type
1. Add modal HTML (HTML_BODY_AND_MODALS)
2. Add viewer modal HTML
3. Add modal functions (new section)
4. Add viewer functions (new section)
5. Update render() switch statement
6. Add renderXxxCard() function

### Debugging Pyodide
1. Check browser console for `[Pyodide]` logs
2. Verify function is named `initPyodide()` not `loadPyodide()`
3. Check network tab for CDN requests
4. Pyodide v0.28.2 URL: `https://cdn.jsdelivr.net/pyodide/v0.28.2/full/`
