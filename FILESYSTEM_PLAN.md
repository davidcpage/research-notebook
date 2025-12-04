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

### Phase 2: Change Detection

**Goal**: App detects when Claude Code (or any external editor) modifies files.

**Options** (in order of preference):
1. **FileSystemObserver API** (Chrome 129+) - native, efficient
2. **Polling with hash** - check every 3-5 seconds, compare mtimes
3. **Manual refresh** - F5 or refresh button (always available as fallback)

**Implementation**:
```javascript
// Try native observer first, fall back to polling
async function startWatchingFilesystem(dirHandle) {
  if ('FileSystemObserver' in window) {
    const observer = new FileSystemObserver(handleFilesystemChange);
    await observer.observe(dirHandle, { recursive: true });
  } else {
    // Polling fallback
    setInterval(() => checkForChanges(dirHandle), 3000);
  }
}

async function handleFilesystemChange(records) {
  // Reload affected sections/items
  // Merge with any unsaved local changes (conflict resolution)
  // Re-render
}
```

**Conflict Handling**:
- If local unsaved changes exist when external change detected:
  - Option A: Auto-save local first, then reload (local wins)
  - Option B: Prompt user to choose
  - Option C: External always wins (simpler, Claude Code is intentional)
- Start with Option C, add UI later if needed

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

### Conversion Script (Python)

Run once to convert existing IndexedDB export to new format:

```python
#!/usr/bin/env python3
"""
Convert Research Notebook JSON export to filesystem format.

Usage:
    python convert_notebook.py input.json output_folder/
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

def slugify(title, max_length=50):
    """Convert title to filename-safe slug."""
    slug = title.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = slug.strip('-')
    return slug[:max_length]

def convert_note(item):
    """Convert note item to markdown with frontmatter."""
    frontmatter = f"""---
id: {item.get('id', '')}
title: {item['title']}
created: {item.get('created', datetime.now().isoformat())}
modified: {item.get('modified', datetime.now().isoformat())}
---

"""
    return frontmatter + item.get('content', '')

def convert_code(item):
    """Convert code item to Python with frontmatter comment."""
    output_file = None
    if item.get('output'):
        output_file = f"{slugify(item['title'])}.output.html"

    frontmatter_lines = [
        '# ---',
        f"# id: {item.get('id', '')}",
        f"# title: {item['title']}",
        f"# created: {item.get('created', datetime.now().isoformat())}",
        f"# modified: {item.get('modified', datetime.now().isoformat())}",
    ]
    if output_file:
        frontmatter_lines.append(f"# output: {output_file}")
        frontmatter_lines.append(f"# showOutput: {str(item.get('showOutput', True)).lower()}")
    frontmatter_lines.append('# ---')
    frontmatter_lines.append('')

    return '\n'.join(frontmatter_lines) + item.get('code', '')

def convert_bookmark(item):
    """Convert bookmark item to JSON."""
    return {
        'id': item.get('id', ''),
        'type': 'bookmark',
        'title': item['title'],
        'url': item.get('url', ''),
        'description': item.get('description', ''),
        'thumbnail': item.get('thumbnail'),  # Will need path adjustment
        'created': item.get('created', datetime.now().isoformat()),
        'modified': item.get('modified', datetime.now().isoformat()),
    }

def convert_notebook(input_path, output_path):
    """Convert full notebook to directory structure."""
    with open(input_path, 'r') as f:
        data = json.load(f)

    output_dir = Path(output_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Create notebook.json (structure only)
    notebook_meta = {
        'title': data.get('title', 'Research Notebook'),
        'subtitle': data.get('subtitle', ''),
        'sections': [slugify(s['name']) for s in data.get('sections', [])]
    }
    with open(output_dir / 'notebook.json', 'w') as f:
        json.dump(notebook_meta, f, indent=2)

    # Create sections directory
    sections_dir = output_dir / 'sections'
    sections_dir.mkdir(exist_ok=True)

    # Create assets directory
    assets_dir = output_dir / 'assets' / 'thumbnails'
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Process each section
    for section in data.get('sections', []):
        section_slug = slugify(section['name'])
        section_dir = sections_dir / section_slug
        section_dir.mkdir(exist_ok=True)

        # Create section metadata (preserves original name)
        section_meta = {
            'name': section['name'],
            'id': section.get('id', '')
        }
        with open(section_dir / '_section.json', 'w') as f:
            json.dump(section_meta, f, indent=2)

        # Process items
        for item in section.get('items', []):
            item_type = item.get('type')
            title_slug = slugify(item.get('title', 'untitled'))

            if item_type == 'note':
                filename = f"{title_slug}.md"
                content = convert_note(item)
                with open(section_dir / filename, 'w') as f:
                    f.write(content)

            elif item_type == 'code':
                filename = f"{title_slug}.code.py"
                content = convert_code(item)
                with open(section_dir / filename, 'w') as f:
                    f.write(content)
                # Save output separately if exists
                if item.get('output'):
                    output_filename = f"{title_slug}.output.html"
                    with open(section_dir / output_filename, 'w') as f:
                        f.write(item['output'])

            elif item_type == 'bookmark':
                filename = f"{title_slug}.bookmark.json"
                bookmark_data = convert_bookmark(item)
                # Handle thumbnail
                if bookmark_data.get('thumbnail') and bookmark_data['thumbnail'].startswith('data:'):
                    # Save data URL as file
                    thumb_filename = f"{item.get('id', title_slug)}.png"
                    bookmark_data['thumbnail'] = f"../../assets/thumbnails/{thumb_filename}"
                    # TODO: decode and save base64 image
                with open(section_dir / filename, 'w') as f:
                    json.dump(bookmark_data, f, indent=2)

    print(f"Converted notebook to {output_dir}")
    print(f"  Sections: {len(data.get('sections', []))}")
    total_items = sum(len(s.get('items', [])) for s in data.get('sections', []))
    print(f"  Total items: {total_items}")

if __name__ == '__main__':
    import sys
    if len(sys.argv) != 3:
        print("Usage: python convert_notebook.py input.json output_folder/")
        sys.exit(1)
    convert_notebook(sys.argv[1], sys.argv[2])
```

### Migration Steps

1. Export current notebook to JSON (existing export feature)
2. Run conversion script: `python convert_notebook.py export.json ./my-notebook/`
3. Open notebook app, go to Settings → Link Notebook Folder
4. Select the converted `my-notebook/` folder
5. Verify all content loaded correctly
6. Initialize git: `cd my-notebook && git init && git add . && git commit -m "Initial import"`

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
