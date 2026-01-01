# Teacher Workspace

Design doc for developing a teacher-focused notebook for classroom management.

## Status

**Phase:** Early design, preparing for collaborative development with a real teacher

## Goals

Build a practical teacher workspace that demonstrates the notebook's value for:
- Term/lesson planning with calendar-style views
- Quiz creation and distribution (via Google Forms)
- Response collection and AI-assisted grading
- Student progress tracking across terms/years
- Integration with existing tools (Google Drive, Classroom)

## Design Principles

1. **Collaborative development** - Build with a real teacher in the loop, not in isolation
2. **Start small** - Get something usable this week, iterate based on friction
3. **Cards as data, views as rendering** - Calendar is a view of lesson cards, not a separate system
4. **External tool integration** - Teachers live in Google's ecosystem; link to slides, don't replace them

## Notebook Structure

Multi-form, multi-year structure to enable shared resources and cross-year tracking:

```
french-teaching/
├── .notebook/
│   ├── settings.yaml
│   ├── theme.css
│   └── templates/
├── CLAUDE.md                    # Teacher-specific workflows
├── resources/                   # Shared across all forms/years
│   ├── quizzes/                 # Reusable quiz templates
│   └── lesson-templates/        # Reusable lesson plans
├── 2024-25/
│   ├── year-8-set-1/
│   │   ├── term-1/
│   │   │   ├── week-01/
│   │   │   │   ├── lesson-wed.md
│   │   │   │   └── lesson-thu.md
│   │   │   └── ...
│   │   ├── term-2/
│   │   ├── term-3/
│   │   └── responses/           # Quiz responses for this form
│   └── year-9-set-2/
│       └── ...
└── 2025-26/
    └── ...
```

**Depth concern:** This structure goes 4-5 levels deep. Requires "focus mode" (dp-106) to be usable.

## Lesson Card Type

New card type for lesson planning:

```yaml
# card-types/lesson/template.yaml
name: lesson
extensions:
  .lesson.yaml: {}
schema:
  date: { type: date, required: true }
  time: { type: string }  # "14:30-15:30"
  title: { type: string, required: true }
  description: { type: string, multiline: true }
  slides: { type: url }  # Link to Google Drive/Slides
  resources: { type: list }  # Additional links
  objectives: { type: list }  # Learning objectives
  notes: { type: string, multiline: true }  # Post-lesson reflections
  status: { type: string, enum: [planned, taught, cancelled] }
```

**Card preview:** Date badge, title, status indicator, truncated description
**Viewer:** Full details with clickable links, editable notes section

## Calendar View

A `term-calendar` card type that renders lesson cards as a calendar grid:

- Scans sibling/child lesson cards in the same section
- Renders month or term view with lesson titles on dates
- Click date → open lesson card viewer
- Visual indicators for status (planned/taught/cancelled)

**Not a calendar editor** - lessons are created as cards, calendar is read-only visualization.

## Term Planning Workflow

Skill: `/plan-term` to bootstrap a term's lesson cards

Input (natural language or structured):
```
Term starts: January 6, 2025
Term ends: March 28, 2025
Half-term: February 17-21
Bank holidays: none

Schedule:
- Wednesday 14:30-15:30
- Thursday 10:00-11:00

Alternating weeks:
- Week A: Wed, Thu
- Week B: Tue 09:00, Fri 10:00
```

Output: Creates lesson card files for each session, teacher fills in titles/content.

## Integration Points

### Google Forms (existing)
- Export quiz to Google Form (dp-064)
- Import responses from Form (dp-065)
- Grade export to CSV for gradebook (dp-069)

### Google Drive/Classroom
- Lesson cards link to external slides (simple URL field)
- No deep integration needed initially
- Future: embed preview? auto-detect slide titles?

## Phased Development

### Phase 1: Foundation
- [ ] Focus mode for deep navigation (dp-106)
- [ ] Lesson card type (basic fields)
- [ ] Example structure with real term data

### Phase 2: Planning Tools
- [ ] `/plan-term` skill for skeleton generation
- [ ] Term calendar view card type
- [ ] Lesson card status tracking

### Phase 3: Integration
- [ ] Quiz workflow for this structure
- [ ] Response organization per-form
- [ ] Summary stats per form/term

## Open Questions

1. **Granularity of lesson cards** - One card per lesson, or per week, or per topic?
2. **Shared vs form-specific quizzes** - How to handle quiz reuse across forms?
3. **Student tracking** - How to track same student across years (different forms)?
4. **Archiving** - End of year, archive whole year directory? Separate notebook?

## Feedback to Gather

From collaborating teacher:
- What's most painful about current planning workflow?
- How do they currently organize lessons/resources?
- What would they want to see at a glance?
- How often do they reuse materials across forms/years?
