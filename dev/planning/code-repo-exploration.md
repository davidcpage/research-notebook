---
id: dev-code-repo-exploration
title: Code Repository Exploration Feature
author: Claude
created: 2024-12-13T10:00:00Z
modified: 2024-12-13T10:00:00Z
tags: [ideas, future, exploration]
---

# Code Repository Exploration Feature

This document captures ideas for using the research notebook as a frontend for navigating code repositories while collaborating with Claude Code.

## Background

We previously considered whether the research notebook could browse arbitrary code repositories but decided against it to avoid becoming an "IDE-lite" and losing focus. After implementing Phase 1-4 of the filesystem simplification (subdirectory support, flexible path mapping), it's worth revisiting.

## The Proposal

User creates an outer directory as the notebook root and clones/copies a repo inside it:

```
notebook-root/           <- Notebook directory
├── .notebook/           <- Config (settings, theme, templates)
├── CLAUDE.md            <- Notebook docs
├── README.md
├── docs/                <- Section: Documentation notes about the repo
│   ├── architecture.md
│   └── api-overview.md
├── cloned-repo/         <- Actual repo, mapped as section(s)
│   ├── src/
│   │   ├── components/
│   │   └── utils/
│   └── tests/
```

Notebook system files and cards explaining the codebase live in separate directories (`.notebook/`, `docs/`) without polluting the repo, while the new system for exploring subdirectories and mapping sections to paths allows limited exploration of the repo codebase within the notebook UI.

## What Already Works

1. **Subdirectory support** - One level of subdirs shown as subsection headers
2. **Path mapping** - Sections can point to any directory path via `path` field
3. **Image cards** - Non-frontmatter files (images) displayed with inferred defaults
4. **Invisible sections** - Can hide sections that aren't currently interesting
5. **System section isolation** - Config stays in `.notebook/`, separate from content

## Gaps to Fill

### 1. Multi-level directory mapping
Currently only one level of subdirectories is loaded. Options:
- Allow section `path` to point deeper: `path: 'cloned-repo/src/components'`
- Allow multiple sections pointing to different parts of the repo
- Increase subsection depth (UI complexity grows)

### 2. File type inference for code files
Currently only images get automatic card generation. Code files would need:
- Title inferred from filename
- Content displayed as syntax-highlighted code
- No frontmatter injection

### 3. Read-only mode for sections
Don't want to accidentally inject frontmatter into repo source files.
- `readonly: true` flag on section config
- Disable edit button for cards in readonly sections

## Design Principles

**Keep the notebook's strengths:**
- **Curated, not comprehensive** - Map specific interesting directories
- **Cards for context** - Create notes/bookmarks explaining what you're looking at
- **Works with Claude Code** - Repo files are regular files Claude can read/edit
- **No pollution** - `.notebook/` and annotation docs stay separate from the repo

**Avoid IDE-creep:**
- The value is curation and annotation, not editing
- Keep navigation shallow - don't recursively load everything
- Don't add file tree views, tabs, or other IDE affordances

## Potential Use Cases

1. **Onboarding to a new codebase** - Create explanatory notes alongside actual code
2. **Code review preparation** - Annotate specific directories/files before review
3. **Architecture documentation** - Link explanations to actual implementation
4. **Claude Code collaboration** - Visual context for what Claude is working on

## Implementation Priority

If we proceed:
1. **Allow deeper section paths** - Low risk, high value
2. **Code file inference** - Medium complexity, enables repo browsing
3. **Readonly sections** - Safety feature for repo files
4. **Consider 2-level subdirs** - Only if single level proves insufficient

## Open Questions

- Should we support `.gitignore` patterns for excluding files?
- How to handle very large directories (pagination? virtual scrolling?)
- Should readonly be the default for sections pointing outside notebook root?
- Is there value in showing git status (modified/staged) on cards?

---

*Status: Exploratory - revisit after other priorities*
