# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

**State Management** (lines ~1586-1605):
- Global `data` object holds all sections and items
- `collapsedSections` Set tracks UI state (not persisted)
- Modal editing states: `editingBookmark`, `editingNote`, `editingCode`
- Current viewing states: `currentViewingNote`, `currentViewingCode`
- `manualThumbnail`: Tracks manually uploaded thumbnail (data URL) during bookmark creation/editing
- Pyodide runtime state: `pyodide`, `pyodideLoading`, `pyodideReady`

**Data Persistence** (lines ~1730-1800):
- `loadData()`: Async function that reads from IndexedDB
- `saveData()`: Async function that writes to IndexedDB (no size limits like localStorage)
- **IMPORTANT**: All `saveData()` calls must use `await` since it's async

**Core Rendering** (line ~2784):
- `render()`: Main function that regenerates entire UI from data model
- Called after any data modification
- Uses template literals to generate HTML dynamically

**Item Types**:
1. **Bookmarks** (lines ~1716-1815): URL, title, description, auto-fetches metadata
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
2. **Notes** (lines ~1817-1960): Markdown content with LaTeX support, preview/edit modes
3. **Code** (lines ~2219-2465): Python code snippets with in-browser execution via Pyodide
   - Each code item has `showOutput` boolean field (defaults to `true` when output exists)
   - Output includes HTML (text, images for plots) stored in `output` field
   - **Auto-execute**: Code automatically runs on save to generate output
   - Split pane view shows output (60% left) and code context (40% right)

**Python Execution** (lines ~2046-2218):
- **CRITICAL**: Function is named `initPyodide()` NOT `loadPyodide()` to avoid collision with global `window.loadPyodide()`
- Uses Pyodide v0.28.2 (same stable version as stlite project)
- Lazy-loads on first Python code execution (~10MB initial download)
- Pre-loads numpy, pandas, matplotlib packages during initialization
- `initPyodide()`: Downloads and initializes Python runtime with proper indexURL configuration
- `executePythonCode()`: Runs code in isolated context, captures stdout/stderr
- Matplotlib integration: plots rendered as base64 PNG images in output
- Console logging enabled for debugging: `[Pyodide] ...` messages track initialization progress

**Settings** (lines ~1868-1891):
- **Settings Modal**: Accessible via ⚙ icon in toolbar (far right, grey/muted color)
- Allows customization of notebook title and subtitle
- `openSettingsModal()`: Opens modal with current title/subtitle values
- `saveSettings()`: Saves changes to data model, updates header and browser tab title
- Backwards compatible: loads default values if title/subtitle missing from saved data

**Export/Import** (lines ~2910-2972):
- **Export**: Downloads entire notebook as JSON file (data structure only, no IndexedDB metadata)
- **Import**: Reads JSON file, validates format, handles large files
  - File size validation: 50MB maximum for safety
  - Progress feedback for files > 1MB
  - Expects current format with `title`, `subtitle`, and `sections` fields
  - Console logging of import statistics (sections count, items count)

**Internal Linking** (lines ~2992-3002):
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

### Making Changes

**Editing Flow**:
1. Read the entire HTML file to understand context
2. Locate the specific function or section to modify
3. Use Edit tool to make precise changes
4. Test by opening in browser

**Common Modification Areas**:
- Styling: CSS rules in `<style>` tag (lines ~15-1300)
- Data model: Structure around line 1586
- Modal forms: HTML templates (lines ~1384-1580)
- Business logic: JavaScript functions (lines ~1614-3005)

**Important Patterns**:
- After any data modification, always call `await saveData()` then `render()` (saveData is async!)
- Modal workflow: open modal → populate fields → save → close modal → render
- Type safety: All items must have valid `type` field ('bookmark', 'note', or 'code')
- Escape HTML in user input using `escapeHtml()` function
- **Storage**: IndexedDB handles large datasets (GBs) without quota issues, unlike localStorage (5-10MB)

### Storage Architecture

**IndexedDB Storage**:
- Database name: `ResearchNotebookDB`
- Object store: `notebook`
- Key: `data`
- Stores entire data structure as JSON string
- **No size limits**: Can handle gigabytes of data (vs localStorage's 5-10MB quota)
- **Asynchronous**: Non-blocking operations for better performance
- **Persistent**: Survives browser restarts and crashes

**Why IndexedDB?**
- Research notebooks can grow very large with many bookmarks, notes, and code outputs
- Python code execution outputs (especially matplotlib plots) can be data-heavy
- IndexedDB is purpose-built for web applications storing structured data
- No compression needed - browser handles storage optimization

**Data Format**:
- Sections contain `items` arrays where each item has a `type` field ('bookmark', 'note', or 'code')
- All data must be in current format - legacy format support has been removed for simplicity
- Export and import use the same clean JSON structure

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
