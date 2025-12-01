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
The application uses a hierarchical structure stored in localStorage:
```javascript
data = {
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
- Pyodide runtime state: `pyodide`, `pyodideLoading`, `pyodideReady`

**Data Persistence** (lines ~1614-1675):
- `loadData()`: Reads from localStorage, handles migration from old formats
- `saveData()`: Writes to localStorage after any modification
- Migration logic handles old "Bookmark Curator" format and ensures type fields

**Core Rendering** (line ~2784):
- `render()`: Main function that regenerates entire UI from data model
- Called after any data modification
- Uses template literals to generate HTML dynamically

**Item Types**:
1. **Bookmarks** (lines ~1716-1815): URL, title, description, auto-fetches metadata
2. **Notes** (lines ~1817-1960): Markdown content with LaTeX support, preview/edit modes
3. **Code** (lines ~2219-2465): Python code snippets with in-browser execution via Pyodide

**Python Execution** (lines ~2046-2218):
- Lazy-loads Pyodide (32MB) only when first Python code is run
- `loadPyodide()`: Downloads and initializes Python runtime
- `executePythonCode()`: Runs code in isolated context, captures stdout/stderr
- Matplotlib integration for data visualization

**Export/Import** (lines ~2714-2755):
- Export: Downloads data as JSON file
- Import: Reads JSON file, handles both old and new formats

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
- localStorage key: `researchNotebook`

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
- After any data modification, always call `saveData()` then `render()`
- Modal workflow: open modal → populate fields → save → close modal → render
- Type safety: All items must have valid `type` field ('bookmark', 'note', or 'code')
- Escape HTML in user input using `escapeHtml()` function

### Data Migration
The app includes migration logic for backwards compatibility:
- Old format used `bookmarks` array instead of `items` array
- Migration auto-detects item types based on fields (url → bookmark, content → note, code → code)
- Can import from legacy "Bookmark Curator" localStorage key

### Pyodide Notes
- 32MB download, only loaded on first Python execution
- Status updates via `updatePyodideStatus()` during load
- Code runs in web worker for better performance
- Matplotlib charts rendered as base64 PNG images
