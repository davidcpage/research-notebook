# CLAUDE.md

This folder is a Research Notebook that stores notes, code, and bookmarks as plain files. You can read and edit these files directly.

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
# List all sections
ls sections/

# Read a note
cat sections/papers/attention-mechanisms.md

# Read code
cat sections/ideas/analysis.code.py

# Search across all notes
grep -r "transformer" sections/ --include="*.md"
```

## Creating Items

### New Note
Create `sections/{section-name}/{slug}.md`:

```markdown
---
id: unique-id-here
title: Your Note Title
created: 2024-01-15T10:30:00Z
modified: 2024-01-15T10:30:00Z
---

Your markdown content here...
```

### New Code
Create `sections/{section-name}/{slug}.code.py`:

```python
# ---
# id: unique-id-here
# title: Your Code Title
# created: 2024-01-15T10:30:00Z
# modified: 2024-01-15T10:30:00Z
# ---

# Your Python code here
```

### New Section
1. Create directory: `sections/{section-slug}/`
2. Create `sections/{section-slug}/_section.json`:

```json
{
  "name": "Section Display Name",
  "id": "unique-section-id"
}
```
3. Add section slug to `notebook.json` sections array

## Editing Items

- Edit the file content directly
- Update the `modified` timestamp
- The browser app will auto-detect changes (Chrome 129+) or user can click Refresh

## Important Notes

- **Slugs**: Filenames should be lowercase, hyphenated versions of titles (max 50 chars)
- **IDs**: Each item needs a unique ID (use any string, e.g., timestamp or UUID)
- **Don't edit**: `.output.html` files (auto-generated when code runs)
- **Internal links**: Use `[[Section Name > Item Title]]` syntax in markdown
- **Thumbnails**: Bookmarks can reference `../../assets/thumbnails/{id}.png`

## Common Tasks

**Add a note summarizing a paper:**
> Create a new .md file in sections/papers/ with frontmatter and markdown content

**Search for all mentions of a topic:**
> grep -r "attention" sections/ --include="*.md" --include="*.code.py"

**List all items in a section:**
> ls sections/papers/

**Find items modified recently:**
> find sections/ -name "*.md" -mtime -7
