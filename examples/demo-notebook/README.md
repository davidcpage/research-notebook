# Research Notebook

This folder contains a Research Notebook - a collection of notes, code snippets, and bookmarks stored as plain files.

## Directory Structure

```
notebook-folder/
├── settings.yaml           # Notebook settings (title, subtitle, sections)
├── theme.css               # Custom CSS theme (optional)
├── *.template.yaml         # Card type templates (note, code, bookmark)
├── README.md               # This file
├── CLAUDE.md               # Instructions for Claude Code
├── research/               # Section directory (example)
│   ├── note-title.md       # Markdown note with YAML frontmatter
│   ├── code-title.code.py  # Python code with comment frontmatter
│   └── code-title.output.html  # Code execution output (auto-generated)
├── references/             # Another section (example)
│   └── bookmark.bookmark.json  # Bookmark metadata
└── assets/
    ├── thumbnails/         # Bookmark thumbnail images
    └── author-icons/       # Author icon SVGs
```

**Note:** Sections are directories at the root level. The directory name becomes the section slug.

## File Formats

### Notes (`.md`)
Markdown files with YAML frontmatter:

```markdown
---
id: abc123
title: My Note Title
created: 2024-01-15T10:30:00Z
modified: 2024-01-20T14:22:00Z
---

Note content in markdown...
```

### Code (`.code.py`)
Python files with comment-based frontmatter:

```python
# ---
# id: def456
# title: Analysis Script
# created: 2024-01-15T10:30:00Z
# modified: 2024-01-20T14:22:00Z
# output: analysis-script.output.html
# showOutput: true
# ---

import numpy as np
# Your code here...
```

### Bookmarks (`.bookmark.json`)
JSON files with URL and metadata:

```json
{
  "id": "ghi789",
  "type": "bookmark",
  "title": "Example Site",
  "url": "https://example.com",
  "description": "Description here",
  "thumbnail": "../assets/thumbnails/ghi789.png",
  "created": "2024-01-15T10:30:00Z",
  "modified": "2024-01-20T14:22:00Z"
}
```

## Git Workflow

This folder is designed for git version control:

```bash
# Initialize git (first time only)
git init
git add .
git commit -m "Initial notebook"

# After making changes in the browser
git add .
git commit -m "Add notes on transformers"

# View history of a specific note
git log --oneline research/attention-mechanisms.md
```

## Custom Themes

Create a `theme.css` file in your notebook root to customize the appearance. The CSS is loaded automatically when you open the notebook.

This demo includes a "Manuscript" theme with:
- Warm sepia color palette
- Textured parchment backgrounds for note cards
- Serif typography for a scholarly feel
- Dark terminal style for code cards

See `theme.css` for documented examples of:
- Global CSS variable overrides
- Card-specific styles using `[data-template="note"]` selectors
- Viewer modal customization


## Internal Links

Notes support wiki-style internal links:
- `[[Section Name > Item Title]]` - Links to another item
- Links work across notes, code, and bookmarks

## Opening the Notebook

Open `research_notebook.html` in Chrome/Edge and select this folder when prompted.
