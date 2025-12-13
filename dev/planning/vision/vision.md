---
id: dev-vision
title: Research Notebook - Vision & Direction
author: Claude
created: 2024-12-01T09:00:00Z
modified: 2024-12-05T14:00:00Z
tags: [ongoing]
---

# Research Notebook: Vision & Direction

*Summary of design discussion, December 2024*

## Project Identity

Research Notebook is a **file-based research environment designed for human-AI collaboration**. It combines bookmarks, markdown notes, and executable Python code in a unified interface, with all data stored as plain files that both humans and AI agents (like Claude Code) can read and write.

### What It Is

- A browser-based tool for organizing research materials
- A structured file format that AI agents can understand and manipulate
- An interactive UI that transforms plain files into linked, rendered knowledge artifacts

### What It Is Not

- Just a prettier file browser (VSCode does that)
- A general-purpose note app (Obsidian/Notion do that)
- A computational notebook (Jupyter does that)

The distinctive value is the **integration**: bookmarks with thumbnails + markdown with LaTeX + executable Python + internal links, all as plain files that Claude Code can collaborate on.

## Core Principles

### 1. Files Are Truth

Everything meaningful is stored as a human-readable file:
- Notes → Markdown with YAML frontmatter
- Code → Python with comment-based frontmatter + separate output file
- Bookmarks → JSON with thumbnail as separate image file
- Templates → YAML

This enables:
- Git versioning with meaningful diffs
- Claude Code can read, write, and reason about content
- Portable—edit in any text editor
- No proprietary database lock-in

### 2. Minimal Magic

When something is generated or computed, save the result to a file. Claude should be able to understand what exists by reading the directory, without needing to run the application.

Example: Code cell output is saved as `my-analysis.output.html`. Claude can read both the source (`.code.py`) and the result (`.output.html`).

### 3. Structure Enables Collaboration

The notebook's conventions (directory structure, frontmatter schemas, naming patterns) create a shared language between human and AI. A well-structured notebook directory with a `CLAUDE.md` becomes a workspace where Claude can:
- Summarize and analyze existing content
- Create new notes and code cells
- Find connections between items
- Generate index pages and summaries

## The Value Proposition

Research Notebook provides:

1. **A structured file format** that both humans and AI understand
2. **An interactive UI** that renders files as linked, executable knowledge artifacts
3. **Customizable templates** for different research artifacts (papers, datasets, experiments)
4. **A Python API** (future) for querying, analyzing, and generating content

The UI is the pleasant way to interact. The files are the truth. Claude works with the files. The templates and generators are also files.

This positions the project as: **a programmable, file-based research environment**—combining Obsidian's file philosophy, TiddlyWiki's extensibility, and Jupyter's execution, optimized for human-AI collaboration.

## Future Directions

### Python Notebook API

TiddlyWiki's power comes from tiddlers being able to query and generate other tiddlers. We can achieve similar power using Python (a familiar language) instead of a custom DSL.

```python
import notebook

# Query cards
papers = notebook.query(
    template='paper-summary',
    section='Literature',
    tags=['methodology']
)

# Create new cards
notebook.create(
    template='note',
    title='Methodology Overview',
    section='Synthesis',
    content=generated_markdown
)
```

### Open Questions

1. **Transclusion**: Should we support embedding one card's content in another (`{{[[Note Title]]}}`)?
2. **Search and tagging**: Full-text search and tag-based filtering would complement templates well
3. **Graph visualization**: Visualizing link structure (like Obsidian's graph view)

## Summary

Research Notebook sits at the intersection of:
- **Obsidian** (file-based, markdown, links)
- **TiddlyWiki** (extensible, templates, everything-is-data)
- **Jupyter** (executable code, outputs)
- **Claude Code** (AI collaboration via files)

The unique value: all four together, optimized for human-AI research workflows.
