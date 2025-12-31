---
id: dev-collaborative-workspaces
title: Collaborative Workspaces - Project Evolution
author: Claude
created: 2025-12-31T10:00:00Z
modified: 2025-12-31T10:00:00Z
tags: [ongoing, architecture]
---

# Collaborative Workspaces: Project Evolution

*Design discussion, December 2025*

## Context

The research-notebook project is evolving beyond its original scope. With the addition of quiz cards, Google Forms integration, bulk grading, and student response tracking, we're building something more general: **filesystem-based project workspaces for human-AI collaboration**.

This document captures the design direction emerging from this evolution.

---

## The Core Insight

### Obsidian++

Obsidian succeeded with a simple formula: **markdown notes + links + filesystem = good for knowledge work**.

We extend this to: **semantic card types + dynamic generation + filesystem = good for domain-specific workflows with AI assistance**.

The key differentiators from Obsidian:

| Obsidian | This Project |
|----------|--------------|
| Markdown notes only | Multiple structured card types (quiz, response, bookmark, code) |
| Static content | Dynamic cards computed from other cards (summary aggregation) |
| Plugins extend UI | Card types are template-driven, user-definable |
| Human-centric editing | Designed for human-AI collaboration from the outset |

### What Makes This Different From an IDE

IDEs evolved to optimize human-solo coding workflows: syntax highlighting, autocomplete, debugging, refactoring, git UI. These features assume the human is doing all the work.

This project assumes **human-AI collaboration**:
- Claude Code handles complex creation, bulk operations, analysis
- Humans handle review, tweaks, approval, small additions
- Both work on the same filesystem artifacts
- The notebook is the shared view into that collaboration

The boundary isn't "don't provide editing" - it's "don't optimize for human-solo workflows."

| IDE Territory (avoid) | Notebook Territory (pursue) |
|----------------------|----------------------------|
| Advanced code editing (refactoring, debugging) | Structured field editing (quiz questions, metadata) |
| Build systems, terminals | Domain-specific views of structured data |
| Git diff/merge UI | Dynamic aggregation (summary from responses) |
| Project-wide search/replace | Workflow orchestration between cards |

---

## The Collaborative Editing Principle

### Just Enough for Flow

Users need to edit within the notebook to stay in flow. Requiring external tools for every minor change breaks the collaborative experience:

- **Quiz editing**: Without an in-app editor, every typo fix requires export → Google Forms → import
- **Markdown notes**: Quick tweaks shouldn't require opening VS Code
- **Code cells**: Minor fixes shouldn't interrupt the research flow

The principle: **provide editing sufficient for minor tweaks and structured data entry, not for creating large documents from scratch**.

### What This Means in Practice

**Appropriate for in-app editing:**
- Markdown with CodeMirror (good enough, not a word processor)
- Structured field editors (quiz questions, response grades)
- YAML/JSON for templates and settings

**Leave to external tools:**
- Large planning documents (use a real text editor)
- Complex code projects (use an IDE)
- Slide deck creation (use presentation software)

### Libraries Enable This

Tools like CodeMirror make "good enough" editing achievable without building an IDE. We add syntax highlighting and basic editing, not autocomplete or debugging. The marginal cost is justified by keeping users in their collaborative flow.

---

## Domain Workspaces

### Teacher Workspace as Proving Ground

The teacher organiser use case stress-tests the architecture:

- Multiple classes within a year group
- Quizzes, tests, homework tracking
- Lesson plans, notes, slides
- Student grades over time
- Report cards, feedback summaries
- Response analytics

This requires:
- Deeper directory nesting than current section/subsection
- Cross-cutting organization (by class, by topic, by student)
- Dynamic aggregation (class averages, student progress)

If the architecture handles teaching workflows well, it likely handles other domains too.

### Other Potential Domains

- **Code repository explorer**: Navigate and annotate large codebases
- **Writing assistant / deep research**: Long-form content with source management
- **Project management**: Tasks, notes, artifacts for a project

Each domain would have domain-specific card types but share the same underlying architecture.

---

## Directory Structure & Navigation

### The Problem

Current structure supports sections (top-level directories) with one level of subsections. Teacher workspaces need more:

```
biology-gcse/
├── class-8a/
│   ├── quizzes/
│   │   ├── photosynthesis.quiz.json
│   │   └── photosynthesis-responses/
│   │       ├── summary.response.json
│   │       └── s001.response.json
│   ├── lesson-plans/
│   └── reports/
├── class-8b/
│   └── ...
└── shared-resources/
    └── question-bank/
```

### Progressive Disclosure (Recommended Approach)

Allow arbitrary directory depth, but collapse by default beyond the first level:

1. **Sections** (top-level directories) are visible
2. **First-level subdirectories** are visible but collapsed
3. **Deeper levels** expand on click, collapsed by default

This:
- Requires minimal new concepts
- Discourages excessive nesting (navigation overhead)
- Scales to deep structures when needed
- Maintains mental model of "sections with nested content"

### Alternative Considered: Focus Mode

A "focus mode" where clicking a directory scopes the view to that subtree, with breadcrumbs for navigation back up. This has merit but adds mental overhead (where am I? how do I get back?). Progressive disclosure achieves most benefits with less cognitive load.

Focus mode could be added later as an enhancement for power users with very deep structures.

### Implementation Notes

- Remember expansion state per-notebook (localStorage)
- Consider "expand all" / "collapse all" controls
- Breadcrumbs showing current path when deeply nested
- Visual indentation for nested items

---

## Tags for Cross-Cutting Organization

### The Need

Directory structure handles hierarchical organization but not cross-cutting concerns:
- All quizzes across all classes
- All items for a specific student
- All incomplete/draft items

Tags address this.

### Current State

Cards already have a `tags` field with basic rendering (badges below title). No filtering or navigation yet.

### Future Direction

- Click a tag to filter current view to items with that tag
- Tag sidebar/panel showing all tags with counts
- Virtual collections based on tag queries
- Status tags with semantic meaning (`draft`, `reviewed`, `exported`)

### UI Questions (Unresolved)

- Modal filtering (click tag → filtered view) vs. additive (build up filters)
- Where does the tag list live? Sidebar? Top bar? Per-section?
- How do tags interact with directory navigation?

---

## Template-Driven Extensibility

### Current Architecture

Card types are defined by templates (YAML files) that specify:
- Schema (fields and types)
- Card preview layout
- Viewer layout
- Editor fields and layout
- Styling (CSS variables)

Most card types work with templates alone. Some (quiz-response-summary) require JavaScript for dynamic behavior.

### The Ideal: User-Definable Card Types

Power users could create new card types by:
1. Writing a template YAML file
2. Optionally, a JavaScript file for custom rendering/behavior

This keeps the system "built from primitives" - even the built-in types use the same extension points users would use.

### Reality Check

Few users will create custom card types. But the architecture remains valuable:
- Forces clean separation of concerns
- Makes the system inspectable (templates are just files)
- Enables domain-specific variants (teacher templates, research templates)

### Future: JavaScript Template Extensions

A template could reference a JS file for custom viewer/editor rendering:

```yaml
# report-card.template.yaml
viewer:
  layout: custom
  script: report-card-viewer.js
```

This is a later feature - current template system handles most needs.

### Future: Self-Contained Card Type Modules

As the project evolves into multiple domain-specific workspaces, the architecture should support fully modular card types. Each card type would live in a self-contained folder:

```
card-types/
├── note/
│   ├── template.yaml    # Schema, editor config, metadata
│   ├── styles.css       # All note-specific CSS
│   └── index.js         # Optional: custom render/behavior
├── quiz/
│   ├── template.yaml
│   ├── styles.css
│   └── index.js         # Dynamic summary aggregation
```

**Benefits:**
- "How does this card type work?" → look in one folder
- Clear framework/extension boundary
- Ship different card bundles for different domains (teaching vs research)
- Users can inspect, modify, and create new types
- A rich set of extensions is less forbidding than a sprawling core

**Implementation notes:**
- Parsers can remain in core initially (simple, stable, needed before templates load)
- CSS scoping handled by existing cascade layers
- Module loading performance is not a concern for local node server
- Core provides render primitives that modules compose

This positions card types as first-class extensibility points rather than hardcoded features.

---

## Architecture: Framework + Applications

### Two-Layer Model

The project has two distinct layers:

1. **The Framework**: Core notebook infrastructure
   - Card rendering, viewing, editing
   - Filesystem sync, directory navigation
   - Template system, extension registry
   - Generic UI components (modals, editors, search)

2. **Workflow Applications**: Domain-specific configurations built on the framework
   - Custom card types (quiz, response, lesson-plan, report-card)
   - Default styling/theme
   - Cookie-cutter directory layout
   - Template CLAUDE.md customized for the workflow
   - Custom Claude skills (e.g., `/grade-quiz`, `/create-lesson-plan`)
   - Default permissions, API keys, MCP access

### Example: Teacher Classbook

A "Teacher Classbook" application would include:

```
teacher-classbook/
├── .notebook/
│   ├── settings.yaml          # Theme, visible sections, etc.
│   ├── theme.css              # Classroom-friendly styling
│   └── templates/
│       ├── quiz.yaml
│       ├── quiz-response.yaml
│       ├── lesson-plan.yaml
│       └── report-card.yaml
├── CLAUDE.md                  # Teaching-specific instructions
│                              # - Quiz creation workflow
│                              # - Grading approach
│                              # - Report card generation
│                              # - Differentiation guidance
├── .claude/
│   ├── settings.json          # Default permissions
│   └── skills/                # Teaching-specific skills
│       ├── grade-quiz/
│       └── generate-report/
├── class-8a/
├── class-8b/
└── shared-resources/
```

### Benefits of This Model

- **Framework stays generic**: No teaching-specific code in core
- **Applications are portable**: Share a "classbook template" with other teachers
- **CLAUDE.md is the key customization**: Same framework, different AI behavior
- **Skills extend capability**: Domain workflows without changing core code

### Space Initialization

Rather than copying a static template directory, new spaces should be initialized through a guided process - like `npm init` or `create-react-app` but for collaborative workspaces.

**Example: Initializing a Teaching Space**

```
$ space init teaching

Creating a new Teaching Space...

? Teacher name: Ms. Johnson
? Subject: Biology
? School year: 2025-26

? Classes to set up:
  ✓ Add class: Year 8A (25 students)
  ✓ Add class: Year 8B (27 students)
  ✓ Add class: Year 9A (24 students)
  + Add another class...

? Import student rosters?
  > Upload CSV (name, email, student_id)
  > Enter manually later
  > Skip (use anonymous IDs)

? Google Forms integration?
  > Set up now (opens OAuth flow)
  > Set up later

? Anthropic API key for AI grading?
  > Enter key: sk-ant-...
  > Use environment variable
  > Skip (manual grading only)

Creating Teaching Space at ./biology-2025-26/
  ✓ Created .notebook/settings.yaml
  ✓ Created .notebook/theme.css (friendly theme)
  ✓ Created CLAUDE.md (teaching workflow)
  ✓ Created year-8a/, year-8b/, year-9a/
  ✓ Stored roster in ~/.spaces/rosters/biology-2025-26/
  ✓ Stored credentials in ~/.spaces/secrets/

Ready! Open with: space serve ./biology-2025-26
```

**What Gets Generated**

| Prompt | Generates |
|--------|-----------|
| Teacher name, subject | CLAUDE.md personalization, settings |
| Class names | Directory structure, section config |
| Student rosters | External roster files (privacy-safe) |
| Google Forms auth | OAuth tokens in ~/.spaces/secrets/ |
| API keys | Credentials in ~/.spaces/secrets/ |

**Key Principles**

1. **Secrets stay external**: Rosters and API keys never go in the space directory (git-safe)
2. **Progressive setup**: User can skip steps and configure later
3. **Sensible defaults**: Theme, permissions, directory layout based on template
4. **CLAUDE.md is personalized**: Includes class names, teacher preferences, workflow instructions

**Implementation Options**

- **CLI wizard**: `space init teaching` with interactive prompts
- **Browser wizard**: First-run modal when opening empty space
- **Hybrid**: CLI creates structure, browser wizard for final config

The CLI approach aligns with Claude Code workflows - Claude could even run `space init` for the user and answer prompts based on conversation context.

**Post-Init Changes: Just Use Claude Code**

Initial setup is a special case - you need *something* to exist before Claude Code can work on it, and secrets/credentials need careful handling.

But once the space exists, avoid adding special commands for everything. Adding a class, reorganizing sections, updating rosters - these are just filesystem edits that Claude Code handles naturally:

```
User: "I have a new class starting next term - Year 10A, 22 students"

Claude: Creates year-10a/ directory, updates .notebook/settings.yaml,
        asks if user wants to import a roster CSV, updates CLAUDE.md
        with the new class name.
```

Skills and CLAUDE.md provide the domain knowledge ("when adding a class, create these subdirectories, update these files"). The filesystem is the interface. Resist the temptation to build `space add-class` when the conversational workflow is more flexible and requires no new code.

---

## Renaming / Rebranding

### The Problem

"Research Notebook" no longer captures the scope. The project supports:
- Research workflows (original use case)
- Teaching workflows (quiz/grading/tracking)
- Potentially: project management, writing, code exploration

### Naming Direction: "Space"

"Space" evokes coworking spaces - collaborative environments where different people (or human + AI) work together. Better than "workspace" which is overused and VS Code-associated.

| Name | Pros | Cons |
|------|------|------|
| **Cowork** | Explicit collaboration | Maybe too literal |
| **Space** | Simple, evocative | Very generic |
| **[Domain] Space** | e.g., "Research Space", "Teaching Space" | Clear, extensible |
| **Collab** | Collaboration-focused | Sounds like a feature, not a product |
| **Studio** | Creative, professional | Maybe too creative/media-focused |
| **Project Notebook** | Generic, accurate | Bland, unclear value prop |

The "[Domain] Space" pattern is interesting: the framework could be "Space" and applications are "Research Space", "Teaching Space", "Writing Space", etc.

### Decision

Defer final naming until the teacher workspace is proven. But "[Domain] Space" is a promising direction that captures both the framework/application split and the collaborative nature.

---

## Summary

The project is evolving from "research notebook" to "collaborative workspace platform":

1. **Core identity**: Filesystem-based workspaces for human-AI collaboration
2. **Editing philosophy**: Just enough for flow, not a full IDE
3. **Structure**: Progressive disclosure for deep directories, tags for cross-cutting
4. **Extensibility**: Template-driven card types, JS extensions for power users
5. **Validation**: Teacher workspace as proving ground

The distinctive value: **semantic card types + dynamic generation + filesystem + human-AI collaboration** - what Obsidian would be if designed for the AI-assisted era.

---

## Next Steps

1. **Implement progressive disclosure** for nested directories
2. **Complete teacher workspace** example with realistic structure
3. **Add tag filtering** as first cross-cutting navigation feature
4. **Document template system** for potential user extension
5. **Revisit naming** once 2-3 domain examples exist
