# CLAUDE.md

This folder is a Research Notebook that stores notes, code, and bookmarks as plain files. You can read and edit these files directly.

## Directory Structure

Sections are directories at the root level. Each section directory contains cards (notes, code, bookmarks).

```
notebook/
├── settings.yaml           # Notebook settings
├── research/               # Section directory
│   ├── my-note.md
│   └── analysis.code.py
├── references/             # Another section
│   └── paper.bookmark.json
└── assets/
    └── thumbnails/         # Auto-generated thumbnails
```

## Quick Reference

| Type | Extension | Format |
|------|-----------|--------|
| Notes | `.md` | Markdown with YAML frontmatter |
| Code | `.code.py` | Python with comment frontmatter |
| Code Output | `.output.html` | HTML (auto-generated, don't edit) |
| Bookmarks | `.bookmark.json` | JSON |
| Thumbnails | `assets/thumbnails/*.png` | Images (auto-generated) |

## Reading Items

```bash
# List all sections (directories at root, excluding assets)
ls -d */

# Read a note
cat research/attention-mechanisms.md

# Read code
cat ideas/analysis.code.py

# Search across all notes
grep -r "transformer" --include="*.md"
```

## Creating Items

### New Note
Create `{section}/{slug}.md`:

```markdown
---
id: 1733329200000
title: Your Note Title
created: 2024-01-15T10:30:00Z
modified: 2024-01-15T10:30:00Z
---

Your markdown content here...
```

### New Code
Create `{section}/{slug}.code.py`:

```python
# ---
# id: 1733329200001
# title: Your Code Title
# created: 2024-01-15T10:30:00Z
# modified: 2024-01-15T10:30:00Z
# ---

# Your Python code here
```

### New Section
1. Create directory at root: `mkdir {section-slug}`
2. Add to `settings.yaml` sections array with name and visible fields

Example in settings.yaml:
```yaml
sections:
  - name: Research
    visible: true
  - name: References
    visible: true
```

## Editing Items

- Edit the file content directly
- Update the `modified` timestamp
- The browser app will auto-detect changes (Chrome 129+) or user can click Refresh

## Important Notes

- **Slugs**: Filenames should be lowercase, hyphenated versions of titles (max 50 chars)
- **IDs**: Each item needs a unique ID (numeric timestamp like `1733329200000` works well)
- **Timestamps**: ISO format, milliseconds optional (e.g., `2024-01-15T10:30:00Z` or `2024-01-15T10:30:00.000Z`)
- **Don't edit**: `.output.html` files (auto-generated when code runs)
- **Internal links**: Use `[[Section Name > Item Title]]` syntax in markdown
- **Thumbnails**: Bookmarks can reference `../assets/thumbnails/{id}.png`

## Common Tasks

**Add a note summarizing a paper:**
> Create a new .md file in papers/ with frontmatter and markdown content

**Search for all mentions of a topic:**
> grep -r "attention" --include="*.md" --include="*.code.py"

**List all items in a section:**
> ls research/

**Find items modified recently:**
> find . -name "*.md" -mtime -7
