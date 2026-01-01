# Teacher Workspace

Design doc for developing a teacher-focused notebook for classroom management.

## Status

**Phase:** Requirements gathering - documenting real teacher workflow

**Teacher context:** French teacher, UK secondary school, 8 classes across multiple year groups

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

## Current Workflow (Google Drive)

### Existing Structure

Teacher's Google Drive organized by class (8 classes this academic year):

```
Teacher Drive/
├── Class 7K/                           # Year 7, French
│   ├── Module 1 - La Rentree/          # Half-term unit
│   │   ├── 1.1 Point de Depart/        # Lesson folder
│   │   │   ├── teacher-slides.gslides  # With answer transitions
│   │   │   ├── student-slides.gslides  # Answers removed
│   │   │   ├── audio-listening.mp3     # Listening activities
│   │   │   └── handout.pdf             # Printable activities
│   │   ├── 1.2 .../
│   │   ├── 1.3 .../
│   │   └── Assessment/
│   │       ├── reading-quiz.pdf        # Or Google Form
│   │       ├── writing-quiz.pdf
│   │       ├── listening-quiz.pdf
│   │       ├── speaking-rubric.pdf
│   │       └── mark-schemes.pdf
│   ├── Module 2 - .../                 # 6 modules per class (one per half-term)
│   └── ...
├── Class 8X/
│   └── ...
└── ... (8 classes total)
```

### Key Characteristics

**Hierarchy:** Class → Module (half-term) → Lesson (numbered 1.1, 1.2, etc.)

**Lesson contents:**
- Teacher slides (from shared school resources, textbook-based)
- Student slides (same content, answer transitions removed)
- Audio files for listening activities
- Printable handouts

**Assessment:** End-of-module folder with 4 skill quizzes (reading, writing, listening, speaking) + mark schemes

**External systems:**
- **Shared school Drive** - Source materials, lesson templates, schemes of work
- **Google Classroom** - Distribution to students, manual scheduling
- **Google Sheets** - Grade tracking (separate from materials)
- **Report cards** - Not currently integrated

**Not yet in place:**
- Year-level organization (e.g., `2025-26/` top folder)
- Scheduling reflected in folder structure
- Student progress tracking alongside materials
- Quiz responses stored with lessons

### Pain Points & Opportunities

1. **Multi-year tracking** - No structure for comparing across years or reusing materials
2. **Scheduling disconnect** - Classroom scheduling manual, not linked to materials
3. **Grade fragmentation** - Grades in Sheets, not with assessment materials
4. **Progress visibility** - No unified view of student progress within class materials
5. **Quiz generation** - Manual creation; could be AI-assisted

## Google Integration Considerations

### Authorization & Privacy

School Google accounts have restrictions:
- Data sovereignty concerns (materials stay in school-controlled storage)
- Can't easily OAuth to external apps
- Sharing outside organization may be blocked

**Student PII protection:** Student names/emails are NEVER stored in the notebook. Instead:
- External "secret roster" file maps student UIDs to names/emails
- Notebook only stores UIDs (e.g., `student-001`, `student-002`)
- Names dynamically attached when displaying to teacher
- Secret roster excluded from git (`.gitignore`) and never sent to AI agents
- Safe to share notebook, commit to git, or use with Claude

### Integration Approaches

**Option A: Link-only (lightest touch)**
- Notebook contains lesson cards with URLs to Google Drive files
- No data sync - Drive remains source of truth
- Pros: No auth issues, no sync conflicts
- Cons: Can't search content, no offline access, manual link maintenance

**Option B: One-way import (read-only)**
- Import/snapshot materials from Drive to notebook
- Drive stays authoritative; notebook is derived view
- Pros: Searchable, works offline, can add metadata
- Cons: Stale data, storage duplication, still needs Drive access

**Option C: Parallel structure (hybrid)**
- Notebook manages planning/metadata (lesson cards, schedules, grades)
- Drive manages actual materials (slides, audio, handouts)
- Links connect the two; each system owns its domain
- Pros: Clear ownership, no sync conflicts, each tool does what it's good at
- Cons: Two places to maintain, links can break

**Option D: Full sync (heaviest)**
- Bidirectional sync between notebook and Drive
- Pros: Single source of truth feel
- Cons: Complex, conflict-prone, auth nightmare with school accounts

### Recommended Approach: Option C (Hybrid)

The notebook excels at:
- Structured metadata (lesson dates, objectives, status)
- AI-assisted quiz generation
- Progress tracking and dashboards
- Cross-year comparison and search

Google Drive excels at:
- Collaborative slide editing
- Media file storage
- Sharing with students via Classroom
- School IT compliance

**Strategy:** Use the notebook as a "planning layer" that links to Drive materials rather than replacing them.

## Notebook Structure

Proposed structure mirrors existing Drive hierarchy with added planning metadata:

```
french-teaching/
├── .notebook/
│   ├── settings.yaml
│   ├── theme.css
│   └── templates/
├── CLAUDE.md                           # Teacher-specific workflows
├── resources/                          # Shared across all classes/years
│   ├── quizzes/                        # Reusable quiz templates
│   └── schemes-of-work/                # Reference materials
│
├── 2024-25/                            # Academic year
│   ├── class-7k/                       # Year 7, French (class code)
│   │   ├── _overview.class.yaml        # Class metadata, student list, schedule
│   │   ├── module-1-la-rentree/        # Half-term unit
│   │   │   ├── 1.1-point-de-depart.lesson.yaml
│   │   │   ├── 1.2-ma-famille.lesson.yaml
│   │   │   ├── 1.3-les-animaux.lesson.yaml
│   │   │   └── assessment/
│   │   │       ├── reading.quiz.yaml
│   │   │       ├── writing.quiz.yaml
│   │   │       ├── listening.quiz.yaml
│   │   │       ├── speaking.quiz.yaml
│   │   │       └── grades.md           # Or link to Sheet
│   │   ├── module-2-.../
│   │   └── ... (6 modules)
│   ├── class-8x/
│   └── ... (8 classes)
│
└── 2025-26/
    └── ... (copy structure, reuse resources)
```

**Key differences from original proposal:**
- Matches teacher's existing Class → Module → Lesson mental model
- Lessons numbered (1.1, 1.2) rather than by week/date
- Assessment folder per module (matching current practice)
- Class overview card for metadata (schedule, student roster)

**Depth:** Year → Class → Module → Lesson = 4 levels. Focus mode (dp-106) essential.

## Card Types

### Lesson Card

```yaml
# card-types/lesson/template.yaml
name: lesson
extensions:
  .lesson.yaml: {}
schema:
  number: { type: string }              # "1.1", "1.2" etc.
  title: { type: string, required: true }
  date: { type: date }                  # When taught (filled in after)
  time: { type: string }                # "14:30-15:30"
  status: { type: string, enum: [planned, taught, cancelled] }

  # Links to Google Drive materials
  teacher_slides: { type: url }         # Full slides with answers
  student_slides: { type: url }         # Student version
  audio: { type: url }                  # Listening activity
  handout: { type: url }                # Printable

  # Planning metadata (notebook's value-add)
  objectives: { type: list }            # Learning objectives
  vocab: { type: list }                 # Key vocabulary
  grammar: { type: string }             # Grammar focus
  notes: { type: string, multiline: true }  # Post-lesson reflections
```

**Card preview:** Number badge (1.1), title, status indicator
**Viewer:** Links to all materials, objectives, post-lesson notes

### Class Card

```yaml
# card-types/class/template.yaml
name: class
extensions:
  .class.yaml: {}
schema:
  code: { type: string, required: true }    # "7K"
  name: { type: string }                    # "Year 7 French Set 1"
  year_group: { type: number }              # 7, 8, 9...
  students: { type: number }                # Class size

  # Schedule (for calendar view)
  schedule:
    type: records
    columns:
      - { name: day, type: string }         # "Wednesday"
      - { name: time, type: string }        # "14:30-15:30"
      - { name: room, type: string }        # "B12"

  # Links
  classroom: { type: url }                  # Google Classroom link
  gradebook: { type: url }                  # Google Sheet link

  # Student roster (UIDs only - names resolved via secret roster)
  students:
    type: list                          # List of student UIDs
    # e.g., ["student-001", "student-002", ...]
```

**Card preview:** Class code, name, student count
**Viewer:** Full schedule, links to Classroom/gradebook, student list (names resolved dynamically)

### Secret Roster (External)

Lives outside notebook (e.g., `~/.teaching-secrets/roster.yaml` or encrypted):

```yaml
# NOT in notebook - excluded from git/AI
students:
  student-001:
    name: "Alice Smith"
    email: "alice.smith@school.edu"
  student-002:
    name: "Bob Jones"
    email: "bob.jones@school.edu"
```

The notebook app loads this at runtime to display names. If missing, shows UIDs only.

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

### Importing Existing Drive Structure

Use Google Apps Script (runs within school's Google Workspace, no external auth):

```javascript
// Apps Script: Export folder structure with links
function exportFolderStructure() {
  const rootId = 'FOLDER_ID_HERE';  // Teacher's class folder
  const root = DriveApp.getFolderById(rootId);
  const data = scanFolder(root, '');

  // Create a Sheet with the output, or log JSON
  const sheet = SpreadsheetApp.create('Drive Export').getActiveSheet();
  // ... flatten and write to sheet
}

function scanFolder(folder, path) {
  const result = { name: folder.getName(), path, children: [], files: [] };

  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    result.files.push({
      name: file.getName(),
      mimeType: file.getMimeType(),
      url: file.getUrl()
    });
  }

  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    const sub = subfolders.next();
    result.children.push(scanFolder(sub, path + '/' + folder.getName()));
  }
  return result;
}
```

**Output:** JSON tree with folder hierarchy, file names, MIME types, and direct URLs.

**Import workflow:**
1. Teacher runs Apps Script on their Drive folder → exports JSON/Sheet
2. `/import-drive-structure` skill reads export, creates notebook directories
3. Generates lesson cards with Drive links pre-populated
4. Flags naming inconsistencies for cleanup (e.g., "Lesson 1" vs "1.1 Point de Depart")

This bootstraps the notebook from existing materials without requiring API OAuth.

## Phased Development

### Phase 1: Foundation (Current)
- [x] Focus mode for deep navigation (dp-106)
- [x] Lesson card type (basic fields + Drive links) (dp-107)
- [ ] Class card type (schedule, Classroom/Sheet links)
- [x] Apps Script for Drive export (teacher runs in their account) (dp-108)
- [x] `/import-drive-structure` skill to bootstrap notebook from export (dp-108)
- [ ] Example structure with one real class (e.g., 7K Module 1)

### Phase 2: Planning Tools
- [ ] `/plan-module` skill - generate lesson card skeletons from module outline
- [ ] Term calendar view (read-only visualization)
- [ ] Lesson status tracking (planned → taught → reviewed)

### Phase 3: Assessment
- [ ] Quiz card type with questions
- [ ] Export to Google Forms
- [ ] Import responses, AI-assisted grading
- [ ] Grades summary per module

### Phase 4: Progress Tracking
- [ ] Student roster in class cards
- [ ] Per-student progress view
- [ ] Cross-year student tracking

## Open Questions

### Resolved
1. ~~**Granularity of lesson cards**~~ → One card per lesson (matches existing 1.1, 1.2 numbering)
2. ~~**How do they currently organize?**~~ → Class → Module → Lesson in Drive

### Still Open
1. **Link maintenance** - How to handle Drive URLs changing? Detect broken links?
2. **Shared vs class-specific quizzes** - Same quiz taught to Y7 and Y8; how to track separately?
3. **Student tracking across years** - Same student in Y7 this year, Y8 next year
4. **Archiving** - End of year: archive to separate folder? Keep in same notebook?
5. **Privacy for roster data** - Student names/emails sensitive; exclude from git?
6. **Classroom integration depth** - Just links, or actual API integration for scheduling?

### Questions for Teacher

- How often do you reuse materials across classes/years?
- What's the most tedious part of weekly/termly planning?
- Would you want to see a calendar view? What time scale (week/term)?
- Do you track individual student progress, or just grades?
- What would you want at a glance when you open the workspace?
