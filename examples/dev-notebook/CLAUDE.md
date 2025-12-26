# CLAUDE.md

This is a Development Notebook for coding projects and technical documentation.

## Purpose

Use this notebook to:
- Document code architecture and decisions
- Track bugs and implementation notes
- Write technical specs and design docs
- Keep code snippets and examples

## Directory Structure

```
dev-notebook/
├── .notebook/              # Configuration
├── code/                   # Code examples and snippets
├── docs/                   # Technical documentation (create as needed)
├── bugs/                   # Bug tracking notes (create as needed)
└── assets/thumbnails/      # Auto-generated
```

## File Formats

| Type | Extension | Example |
|------|-----------|---------|
| Notes | `.md` | `docs/architecture.md` |
| Code | `.code.py` | `code/example.code.py` |
| Bookmarks | `.bookmark.json` | `docs/api-reference.bookmark.json` |

## Creating Content

### Technical Notes
```markdown
---
id: 1735200000000
title: API Design Notes
author: Claude
created: 2024-12-26T10:00:00Z
modified: 2024-12-26T10:00:00Z
tags: [architecture, api]
---

## Overview
...
```

### Code Examples
```python
# ---
# id: 1735200000001
# title: Example Implementation
# author: Claude
# created: 2024-12-26T10:00:00Z
# modified: 2024-12-26T10:00:00Z
# ---

def example_function():
    """Documented example."""
    pass
```

## Working with Claude Code

This notebook is designed for use alongside Claude Code:
- Claude can read and edit files directly
- Use notes to document decisions Claude helps make
- Track implementation progress in markdown
- Run code examples to verify they work
