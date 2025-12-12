# Research Notebook: Vision & Direction

*Summary of design discussion, December 2025*

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
- Templates → YAML (proposed)

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

## Proposed Evolution: Template System

> **Note:** This section outlines the initial vision for templates. See **[TEMPLATE_SYSTEM_DESIGN.md](./TEMPLATE_SYSTEM_DESIGN.md)** for the complete, detailed design including:
> - Extension registry (separating parsing from templates)
> - Full template YAML schema
> - Loading/saving pipelines
> - CSS architecture
> - Implementation plan
>
> Key refinements from the detailed design:
> - Extensions define parsing (bodyField, companion files), templates define schema/presentation
> - Templates are written as files at notebook creation (not virtual defaults)
> - UI buttons are generated from loaded templates

### Motivation

Currently, bookmark/note/code are hardcoded types. A template system would:
- Allow users (and Claude) to create custom card types (e.g., `paper-summary`, `dataset`, `experiment-log`)
- Unify the three built-in types under a common architecture
- Keep customization honest—no fake configurability

### Design Principles

**Built-in field types** provide real behavior:

| Type | Behavior |
|------|----------|
| `text` | Plain text display |
| `markdown` | Rendered with marked.js + KaTeX |
| `url` | Clickable link, can trigger thumbnail generation |
| `thumbnail` | Image with auto-generation + drag-drop upload |
| `code:python` | Syntax highlighted, executable via Pyodide |
| `output:html` | Raw HTML (code results, matplotlib plots) |
| `date` | Formatted date display |

**Built-in layout presets** (not user-defined):

| Layout | Use Case |
|--------|----------|
| `image` | Thumbnail in preview (bookmarks) |
| `document` | Rendered markdown in preview (notes) |
| `code` | Syntax-highlighted code |
| `split-pane` | Left/right split, e.g., output (60%) + code (40%) |

**Templates define**:
1. Frontmatter schema (fields and their types)
2. Layout selection (pick a preset)
3. Styling (CSS variables, colors)
4. Field mapping (which field goes in which slot)

### Example Template

```yaml
# _templates/paper-summary.template.yaml
name: paper-summary
description: "Academic paper summary with structured fields"

schema:
  authors: text
  year: number
  doi: url
  abstract: markdown
  methodology: markdown
  key_claims: markdown
  notes: markdown

card:
  layout: document
  preview_field: abstract
  title_format: "{{title}} ({{year}})"
  subtitle_format: "{{authors}}"

style:
  border_color: "#c9b99a"
  preview_background: "#f5f0e6"
  css_class: paper-card

viewer:
  sections:
    - { label: "Abstract", field: abstract }
    - { label: "Methodology", field: methodology }
    - { label: "Key Claims", field: key_claims }
    - { label: "Notes", field: notes }
```

### Built-in Types as Templates

The existing types would be expressible as templates:

```yaml
# Bookmark (built-in)
schema:
  url: url
  description: markdown
  thumbnail: thumbnail
card:
  layout: image
  preview_field: thumbnail
```

```yaml
# Note (built-in)
schema:
  content: markdown
card:
  layout: document
  preview_field: content
```

```yaml
# Code (built-in)
schema:
  code: code:python
  output: output:html
card:
  layout: split-pane
  slots:
    left: output
    right: code
  placeholder: "🐍"
```

### Complexity Boundary

Custom layouts beyond the built-in presets require JavaScript. This is honest: "You can easily create new card types with custom fields and styling. For novel layouts, you write JavaScript."

## Proposed Evolution: Python Notebook API

### Motivation

TiddlyWiki's power comes from tiddlers being able to query and generate other tiddlers. We can achieve similar power using Python (a familiar language) instead of a custom DSL.

### The `notebook` Module

A Python API available in code cells:

```python
import notebook

# Query cards
papers = notebook.query(
    template='paper-summary',
    section='Literature',
    tags=['methodology']
)

# Access fields
for p in papers:
    print(f"- [[{p.title}]] ({p.year})")
    print(f"  {p.key_claims[:200]}...")

# Create new cards
notebook.create(
    template='note',
    title='Methodology Overview',
    section='Synthesis',
    content=generated_markdown
)

# Get backlinks
links = notebook.backlinks(notebook.current)

# Access current context
print(notebook.current.title)
print(notebook.current_section)
```

### Output Strategy

Generated cards are saved as files:
```
literature-overview.generator.py   # the logic (Claude can read)
literature-overview.note.md        # the output (Claude can read)
```

Frontmatter documents the relationship:

```yaml
---
title: Literature Overview
generated_by: literature-overview.generator.py
last_generated: 2024-12-05T10:30:00Z
---
```

This maintains the "files are truth" principle—Claude sees both source and result.

### Phased Rollout

1. **Phase 1**: Python API for Claude Code (command-line tool or library)
2. **Phase 2**: Same API exposed in notebook code cells
3. **Phase 3**: Auto-regeneration of derived content (optional complexity)

## Summary: The Value Proposition

Research Notebook provides:

1. **A structured file format** that both humans and AI understand
2. **An interactive UI** that renders files as linked, executable knowledge artifacts
3. **Customizable templates** for different research artifacts (papers, datasets, experiments)
4. **A Python API** for querying, analyzing, and generating content

The UI is the pleasant way to interact. The files are the truth. Claude works with the files. The templates and generators are also files.

This positions the project as: **a programmable, file-based research environment**—combining Obsidian's file philosophy, TiddlyWiki's extensibility, and Jupyter's execution, optimized for human-AI collaboration.

## Open Questions

1. **Template file format**: YAML seems reasonable, but should card/viewer HTML be separate files?
2. **Template storage**: `_templates/` directory at notebook root?
3. **Migration path**: How do existing notebooks upgrade to template-based architecture?
4. **Transclusion**: Should we support embedding one card's content in another (`{{[[Note Title]]}}`)?
5. **Search and tagging**: Full-text search and tag-based filtering would complement templates well
6. **Graph visualization**: Visualizing link structure (like Obsidian's graph view)

## Next Steps

1. Review and refine this vision document
2. Design the template schema in detail
3. Prototype the Python `notebook` module (for Claude Code first)
4. Implement template system incrementally (start with frontmatter schema, then layouts, then styling)
5. Migrate built-in types to be template-based internally
