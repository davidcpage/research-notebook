---
name: notebook
description: Work with Research Notebook cards - create, edit, and manage notes, code, bookmarks and other card types. Use when creating or editing notebook content. (project)
---

# Research Notebook

A file-based notebook system for notes, code, bookmarks, and custom card types. Cards are stored as plain text files (Markdown, Python, JSON, YAML) that can be version controlled and edited directly.

## Quick Reference: nb CLI

The `nb` command provides schema queries and card creation:

```bash
nb types                        # List available card types
nb schema <type>                # Show schema and example frontmatter
nb schema <type> --json         # Schema as JSON (for parsing)
nb schema <type> --raw          # Full template.yaml content
nb create <type> <title> [path] # Create card with correct frontmatter
```

**Always use `nb schema <type>` before creating cards** to get the correct frontmatter format.

## File Structure

```
notebook/
├── .notebook/
│   ├── settings.yaml           # Notebook configuration
│   ├── theme.css               # Custom styling (optional)
│   └── card-types/             # Custom card type overrides (optional)
├── section-name/               # Sections are directories
│   ├── subdirectory/           # Nested subdirectories supported
│   │   └── my-note.md
│   ├── another-note.md
│   └── analysis.code.py
└── another-section/
    └── bookmark.bookmark.json
```

**Key points:**
- Directories at root become sections
- Subdirectories create collapsible groups in the UI
- File extensions determine card type (see `nb types`)
- Reserved directories: `.notebook/`, `.git/`, `node_modules/`, dotfiles

## Creating Cards

### Using the CLI (Recommended)

```bash
# Create a note in the research section
nb create note "My Research Note" research/

# Create a code cell in a subdirectory
nb create code "Data Analysis" research/experiments/

# Create a bookmark
nb create bookmark "Useful Link" references/
```

The CLI generates correct frontmatter with unique IDs and timestamps.

### Manual Creation

If creating files manually, use `nb schema <type>` to get the exact format.

#### Notes (.md files)

```markdown
---
id: note-unique-id
title: Note Title
author: Claude
created: 2024-12-08T09:00:00Z
modified: 2024-12-08T09:00:00Z
tags: [research, draft]
---

Your markdown content here...
```

#### Code Cells (.code.py files)

```python
# ---
# id: code-unique-id
# title: Analysis Script
# author: Claude
# created: 2024-12-08T09:00:00Z
# modified: 2024-12-08T09:00:00Z
# showOutput: true
# ---

import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
plt.title('Sine Wave')
# Don't call plt.show() or plt.close() - app auto-captures
```

**Matplotlib note:** Don't use `plt.show()` or `plt.close()` - the app automatically captures figures.

#### Bookmarks (.bookmark.json files)

```json
{
  "id": "bookmark-unique-id",
  "title": "Example Site",
  "url": "https://example.com",
  "description": "Description in markdown",
  "created": "2024-12-08T09:00:00Z",
  "modified": "2024-12-08T09:00:00Z"
}
```

**Note:** Bookmarks created via files won't have auto-generated thumbnails. Leave `thumbnail` empty and the user can fetch it in the app, or save an image to `assets/thumbnails/{id}.png`.

## Settings

Settings are in `.notebook/settings.yaml`:

```yaml
# Notebook title/subtitle
title: My Research Notebook
subtitle: Notes and experiments

# Default author for new cards
default_author: Claude

# Author icons (stored in assets/author-icons/)
authors:
  - name: Claude
    icon: claude.svg
  - name: David
    icon: david.svg

# Section visibility (show/hide in UI)
sections:
  - name: research
    visible: true
  - name: assets
    visible: false  # Hidden by default

# Theme selection
theme: manuscript  # Options: manuscript, minimal, terminal, friendly, handwritten
```

### System Sections

Two special sections exist for system files:
- `.` (root): README.md, CLAUDE.md at notebook root
- `.notebook`: settings.yaml, theme.css, card-types/

Both are hidden by default. Toggle visibility in settings.

## Tags

Cards support optional tags for classification:

```yaml
tags: [completed, architecture]
```

Status tags get semantic colors:
- `completed` - sage green
- `ongoing` - terracotta
- `future` - blue
- Other tags display in neutral grey

## Card Ordering

Cards support an optional `number` field for explicit sorting:

```yaml
number: 1.2  # Supports version-style: 1, 1.1, 1.10, 2.0
```

- Cards with `number` sort before cards without
- Fallback: modified date (newest first)
- Lesson cards use `number` for lesson numbering which doubles as sort order

## Theme Customization

The app uses a two-layer theme system:

1. **Base theme**: Set in settings.yaml (`theme: manuscript`)
2. **Customizations**: `.notebook/theme.css` for per-notebook overrides

Available base themes:
- `manuscript` - Warm, scholarly parchment aesthetic
- `minimal` - Clean, sparse design
- `terminal` - Modern dark theme with slate tones
- `friendly` - Accessible, warm aesthetic
- `handwritten` - Calligraphic style

Edit `.notebook/theme.css` to override CSS variables or add custom styles.

## Common Operations

### List all card types
```bash
nb types
```

### Get schema for a specific type
```bash
nb schema note
nb schema code
nb schema lesson
```

### Create cards
```bash
nb create note "Title" section/
nb create code "Title" section/subdir/
```

### Edit existing cards
Read the file, modify content or frontmatter, save. The notebook app will pick up changes on next load.

### Move cards between sections
Move the file to a different directory. The card's section is determined by its path.

### Delete cards
Delete the file. For code cards, also delete companion files (`.output.html`).

## Custom Card Types

Custom card types can be added in `.notebook/card-types/{type}/`:
- `template.yaml` - Schema, layout config, editor fields (required)
- `styles.css` - Card and viewer CSS (optional)

Run `nb schema <type>` to see your custom type's schema.

## Symlink for Other Projects

To use this skill in another project:

```bash
cd other-project
mkdir -p .claude/skills
ln -s /path/to/research-notebook/.claude/skills/notebook .claude/skills/notebook
```

Also ensure the `nb` CLI is available (via `npm link` in the notebook repo).
