# Filesystem-Based Storage Plan

> **Status**: Phase 1 COMPLETE. The app now uses filesystem-only storage.
> Import/Export buttons removed. Onboarding flow added for first-time setup.

This document outlines the plan to migrate the Research Notebook from IndexedDB storage to a filesystem-based approach, enabling Claude Code integration and git versioning.

## Goals

1. **Claude Code Integration**: Store data as files Claude Code can read/write directly
2. **Git Versioning**: Meaningful diffs, history per item, branch workflows
3. **Better Export/Import**: Direct folder access instead of Downloads
4. **Portable Data**: Plain markdown/Python files editable anywhere

---

## Target Directory Structure

```
notebook-folder/
├── notebook.json              # Structure metadata only
├── sections/
│   ├── papers/
│   │   ├── attention-mechanisms.md
│   │   ├── bert-overview.md
│   │   └── arxiv-link.bookmark.json
│   ├── ideas/
│   │   ├── experiment-design.md
│   │   └── data-analysis.code.py
│   └── references/
│       └── ...
└── assets/
    └── thumbnails/
        ├── arxiv-link.png
        └── ...
```

### File Formats

**notebook.json** - Structure only (section order, no content):
```json
{
  "title": "My Research Notebook",
  "subtitle": "ML Papers and Ideas",
  "sections": ["papers", "ideas", "references"]
}
```

**Notes** - Pure markdown with YAML frontmatter:
```markdown
---
id: abc123
title: Attention Mechanisms Summary
created: 2024-01-15T10:30:00Z
modified: 2024-01-20T14:22:00Z
---

# Attention Is All You Need

The transformer architecture...

See also [[papers > BERT Overview]] for applications.
```

**Code** - Python with YAML frontmatter in comment:
```python
# ---
# id: def456
# title: Embedding Analysis
# created: 2024-01-15T10:30:00Z
# modified: 2024-01-20T14:22:00Z
# output: embedding-analysis.output.html
# showOutput: true
# ---

import numpy as np
import matplotlib.pyplot as plt

# Analysis code here...
```

**Code Output** - Stored separately as HTML:
```
sections/ideas/embedding-analysis.output.html
```
Contains the captured stdout/stderr and any matplotlib plots as base64 images.

**Bookmarks** - JSON (URLs and metadata don't fit markdown well):
```json
{
  "id": "ghi789",
  "type": "bookmark",
  "title": "BERT Paper on arXiv",
  "url": "https://arxiv.org/abs/1810.04805",
  "description": "Pre-training deep bidirectional transformers...",
  "thumbnail": "../../assets/thumbnails/ghi789.png",
  "created": "2024-01-15T10:30:00Z",
  "modified": "2024-01-20T14:22:00Z"
}
```

### Filename Conventions

- Notes: `{slugified-title}.md`
- Code: `{slugified-title}.code.py`
- Code output: `{slugified-title}.output.html`
- Bookmarks: `{slugified-title}.bookmark.json`
- Thumbnails: `{id}.png` or `{id}.jpg`

Slugification: lowercase, spaces to hyphens, remove special chars, max 50 chars.

---

## Implementation Phases

### Phase 1: File System Access + New Format ✅ IMPLEMENTED

**Goal**: App can read/write the new directory structure directly.

**Settings Modal Changes**:
- Add "Storage" section to settings
- "Link Notebook Folder" button → opens directory picker
- Shows current linked folder path (or "Not linked - using browser storage")
- "Unlink" option to revert to IndexedDB-only

**Core Changes**:
1. Add File System Access API integration
2. Implement directory structure read/write functions:
   - `loadFromFilesystem(dirHandle)` → data object
   - `saveToFilesystem(dirHandle, data)` → writes all files
   - `saveItemToFilesystem(dirHandle, sectionName, item)` → writes single item
3. Store directory handle in IndexedDB for persistence across sessions
4. When linked: filesystem is source of truth, IndexedDB is cache
5. When unlinked: IndexedDB only (current behavior, fallback)

**New Functions Needed**:
```javascript
// Filesystem operations
async function linkNotebookFolder()      // Show picker, store handle
async function unlinkNotebookFolder()    // Clear handle, keep IndexedDB copy
async function loadFromFilesystem()      // Read directory → data object
async function saveToFilesystem()        // Write data object → directory
async function saveItemToFilesystem(section, item)  // Incremental save

// Format conversion
function noteToMarkdown(note)            // Note object → markdown string
function markdownToNote(content, filename) // Markdown string → note object
function codeToFile(code)                // Code object → python string
function fileToCode(content, filename)   // Python string → code object

// Utilities
function slugify(title)                  // Title → filename-safe string
function parseYamlFrontmatter(content)   // Extract frontmatter from file
```

**UI Indicator**:
- Small icon in toolbar showing storage status (cloud for IndexedDB, folder for filesystem)
- Tooltip shows path when linked

### Phase 2: Change Detection ✅ IMPLEMENTED

**Goal**: App detects when Claude Code (or any external editor) modifies files.

**Implementation** (FileSystemObserver API):
- Uses native `FileSystemObserver` API (Chrome 129+) for efficient change detection
- Watches notebook directory recursively for file changes
- Filters to relevant file types (.md, .code.py, .bookmark.json, etc.)
- Automatically reloads and re-renders when external changes detected
- Shows toast notification on sync ("🔄 Synced external changes")
- Manual refresh button in Settings as fallback (always available)

**Key Functions**:
- `isFileSystemObserverSupported()` - Feature detection
- `startWatchingFilesystem(dirHandle)` - Start watching with recursive option
- `stopWatchingFilesystem()` - Clean disconnect
- `handleFilesystemChanges(records)` - Process change records
- `reloadFromFilesystem()` - Reload and render

**Conflict Handling**:
- External changes always win (Option C from original plan)
- Flag prevents observer triggering during app's own saves
- Clean separation: `isSavingToFilesystem` and `isReloadingFromFilesystem` flags

### Phase 3: Git Integration Awareness

**Goal**: Show git status in UI, make versioning visible.

**Features**:
- Show modified indicator on cards that have uncommitted changes
- "Last committed" timestamp on items
- Optional: commit message input in UI

**Implementation Approach**:
- Don't embed git operations in browser (complex, security issues)
- Instead: read `.git` status files or run simple checks
- Or: just document git workflow, let user run git in terminal

**Simpler Alternative**:
- Just ensure file format produces clean diffs
- Document recommended git workflow in README
- Let Claude Code handle git operations when asked

### Phase 4: Claude Code Workflow Documentation

**Goal**: Document how to use Claude Code with the notebook effectively.

**CLAUDE.md Updates**:
```markdown
## Working with Claude Code

This notebook stores data as files that Claude Code can read and edit directly.

### Directory Structure
[document the structure]

### Common Operations

**Read a note:**
> Read sections/papers/attention-mechanisms.md

**Create a new note:**
> Create a note in sections/ideas/ titled "Experiment Design" about...

**Search across notes:**
> Search for "transformer" across all markdown files in sections/

**Add a bookmark:**
> Create a bookmark in sections/references/ for https://arxiv.org/...

### File Format Reference
[document frontmatter format for each type]
```

**Example Prompts File** (optional `PROMPTS.md`):
- Common research workflows
- How to reference items using wiki syntax
- How to ask Claude to synthesize across multiple items

---

## Migration

Migration from IndexedDB to filesystem format has been completed. The app now:
1. Shows onboarding on first launch to select a notebook folder
2. Creates new notebooks in selected folders (or loads existing ones)
3. All data stored as files that Claude Code can read/write directly

To initialize git versioning for an existing notebook:
```bash
cd my-notebook && git init && git add . && git commit -m "Initial import"
```

---

## Browser Compatibility

**File System Access API Support**:
- Chrome/Edge 86+: Full support
- Safari 15.2+: Partial support (no `showDirectoryPicker`)
- Firefox: Not supported

**Fallback Strategy**:
- If File System Access API unavailable: show message, keep using IndexedDB
- Export/Import via file download/upload still works as fallback

---

## Open Questions

1. **Section ordering**: `notebook.json` has section order, but filesystem has no inherent order. Use numeric prefixes? Or just rely on `notebook.json`?

2. **Item ordering within sections**: Same issue. Options:
   - `_section.json` contains item order
   - Numeric prefixes on filenames
   - Sort by modified date

3. **Thumbnail storage**: Keep as data URLs in JSON, or extract to files? Files are cleaner for git but more complex to manage.

4. **Real-time sync frequency**: How often to poll? Too fast = performance, too slow = stale view.

5. **Conflict resolution**: What if browser and external edit happen simultaneously?

---

## Success Criteria

- [ ] Can link to a folder from Settings
- [ ] All item types (notes, code, bookmarks) save to correct file formats
- [ ] Changes in browser immediately write to filesystem
- [ ] External edits (Claude Code) appear in browser within 5 seconds
- [ ] Git workflow produces clean, readable diffs
- [ ] Existing IndexedDB mode still works when not linked
