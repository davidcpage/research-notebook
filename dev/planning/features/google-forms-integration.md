# Google Forms Integration: Design Document

## Overview

Integration between the research-notebook quiz system and Google Forms to support a teacher workflow where:
1. Quizzes are created in the notebook (with Claude's help)
2. Exported to Google Forms for students to take
3. Responses imported back for AI-assisted grading
4. Teachers review and edit grades/feedback in the notebook
5. Final grades exported to Google Forms for students to see

**Key principle**: The final export to Google Forms is a deterministic script that pushes exactly what the teacher has approved. Teachers must be 100% confident in and responsible for the exported feedback.

---

## Motivation

Google Forms is widely used in schools for tests and homework. This integration enables:
- **AI-assisted quiz creation**: Claude generates educationally-sound quizzes
- **AI-assisted grading**: Claude provides initial grades and feedback for open-ended questions
- **Teacher oversight**: All AI output is reviewed before students see it
- **Progress tracking**: Student performance tracked over time in the notebook
- **Analytics**: Spreadsheet summaries, statistics, class performance views

---

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TEACHER'S NOTEBOOK                             │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   Quiz Cards    │    │ Response Cards  │    │  Grade Cards    │      │
│  │  (.quiz.json)   │    │ (per student)   │    │  (reviewed)     │      │
│  └────────┬────────┘    └────────▲────────┘    └────────┬────────┘      │
│           │                      │                      │               │
└───────────┼──────────────────────┼──────────────────────┼───────────────┘
            │                      │                      │
            │ Export Quiz          │ Import Responses     │ Export Grades
            ▼                      │                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        GOOGLE APPS SCRIPT BRIDGE                       │
│                                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ exportForm  │  │ importQuiz  │  │exportResp.  │  │importGrades │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
            │                      ▲                      │
            ▼                      │                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│                           GOOGLE FORMS                                 │
│                                                                        │
│        Quiz Form ◄──────────────────────────── Graded Responses        │
│             │                                        ▲                 │
│             ▼                                        │                 │
│        Student takes quiz ──────────────────────────►│                 │
└───────────────────────────────────────────────────────────────────────┘
```

### Notebook Data Model

Each quiz creates a section in the notebook:

```
notebook/
├── quizzes/
│   └── photosynthesis-quiz.quiz.json      # The quiz definition
│
├── photosynthesis-quiz-responses/          # Section per quiz
│   ├── alice-smith.response.json           # One card per student
│   ├── bob-jones.response.json
│   └── charlie-brown.response.json
│
└── .notebook/
    └── settings.yaml                       # Google Forms link settings
```

### Response Card Structure

```json
{
  "id": "photosynthesis-alice-smith",
  "type": "quiz-response",
  "quizId": "photosynthesis-quiz",
  "student": {
    "name": "Alice Smith",
    "email": "alice@school.edu",
    "responseId": "2_ABaOnud..."
  },
  "submittedAt": "2025-01-15T10:30:00Z",
  "answers": [
    {
      "questionIndex": 0,
      "answer": 2,
      "autoGrade": { "status": "correct", "score": 1 }
    },
    {
      "questionIndex": 1,
      "answer": "Plants use sunlight to convert CO2 and water into glucose",
      "autoGrade": null,
      "claudeGrade": {
        "score": 4,
        "maxScore": 5,
        "feedback": "Good explanation! You correctly identified...",
        "gradedAt": "2025-01-15T14:00:00Z"
      },
      "teacherGrade": {
        "score": 5,
        "feedback": "Excellent answer - I'm also giving credit for...",
        "reviewedAt": "2025-01-15T16:30:00Z",
        "reviewer": "Ms. Johnson"
      }
    }
  ],
  "totalScore": 18,
  "maxScore": 20,
  "exportedToForms": false,
  "exportedAt": null
}
```

### Grade Hierarchy

```
1. Auto-grade (multiple choice, numeric, matching, ordering)
   └── Computed immediately on import, immutable

2. Claude grade (short answer, worked problems)
   └── AI-generated, stored as suggestion

3. Teacher grade (any question)
   └── Final authority, overwrites Claude grade
   └── Required for export to Google Forms
```

---

## Question Type Compatibility

### Mapping: Our Types ↔ Google Forms

| Our Type | Google Forms | Import | Export | Notes |
|----------|--------------|--------|--------|-------|
| `multiple_choice` | ChoiceQuestion (RADIO) | ✅ | ✅ | Direct mapping |
| `multiple_choice` + `allowMultiple` | ChoiceQuestion (CHECKBOX) | ✅ | ✅ | New field needed |
| `multiple_choice` + `display:'dropdown'` | ChoiceQuestion (DROP_DOWN) | ✅ | ✅ | New field needed |
| `short_answer` | TextQuestion (short) | ✅ | ✅ | |
| `worked` | TextQuestion (paragraph) | ✅ | ✅ | |
| `numeric` | TextQuestion + regex | ⚠️ | ⚠️ | Tolerance lost |
| `scale` (NEW) | ScaleQuestion | ✅ | ✅ | low/high/labels |
| `date` (NEW) | DateQuestion | ✅ | ✅ | |
| `time` (NEW) | TimeQuestion | ✅ | ✅ | |
| `rating` (NEW) | RatingQuestion | ✅ | ✅ | stars/hearts/thumbs |
| `grid` (NEW) | Grid/RowQuestion | ✅ | ✅ | Matrix questions |
| `matching` | Grid | ⚠️ | ⚠️ | Semantic mismatch |
| `ordering` | Not supported | ❌ | ❌ | Warning on export |

### Schema Extensions Needed

```yaml
# Extended multiple_choice
questions[]:
  type: multiple_choice
  options: [...]
  correct: 2                    # Existing: single correct index
  correctMultiple: [0, 2]       # NEW: for checkbox questions
  allowMultiple: false          # NEW: checkbox vs radio
  display: radio                # NEW: radio | dropdown

# New scale type
questions[]:
  type: scale
  low: 1
  high: 10
  lowLabel: "Strongly Disagree"
  highLabel: "Strongly Agree"
  correct: 8                    # Optional: for graded scales

# New grid type (replaces/extends matching)
questions[]:
  type: grid
  rows: ["Python", "JavaScript", "SQL"]
  columns: ["Data Science", "Web Dev", "Databases"]
  correctAnswers:               # Optional: for graded grids
    - [0, 0]                    # Python → Data Science
    - [1, 1]                    # JavaScript → Web Dev
    - [2, 2]                    # SQL → Databases
```

---

## Google Apps Script Bridge

### Project Structure

```
google-forms-bridge/
├── appsscript.json             # Manifest with required scopes
├── Code.gs                     # Main entry points
├── ExportForm.gs               # Form structure → JSON
├── ImportQuiz.gs               # JSON → Form questions
├── ExportResponses.gs          # Student answers → JSON
├── ImportGrades.gs             # Grades/feedback → Form
└── Utils.gs                    # Shared helpers
```

### Key Functions

```javascript
// ExportForm.gs
function exportFormToJSON(formId) {
  // Returns: { title, description, questions[], settings }
}

// ImportQuiz.gs
function createFormFromJSON(quizJSON) {
  // Creates new Form, returns formId and editUrl
}

function updateFormFromJSON(formId, quizJSON) {
  // Updates existing Form
}

// ExportResponses.gs
function exportResponsesToJSON(formId) {
  // Returns: { responses: [{ student, answers[], submittedAt }] }
}

// ImportGrades.gs
function submitGradesToForm(formId, grades) {
  // grades: [{ responseId, scores: [{ questionIndex, score, feedback }] }]
  // Calls Form.submitGrades() to persist
}
```

### Required OAuth Scopes

```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/forms",
    "https://www.googleapis.com/auth/forms.responses.readonly"
  ]
}
```

---

## CLI Workflow (via clasp)

### One-Time Setup

```bash
# 1. Install clasp
npm install -g @google/clasp

# 2. Login (opens browser for OAuth)
clasp login

# 3. Clone the bridge project (or create new)
clasp clone <SCRIPT_ID>
# OR
clasp create --type standalone --title "Research Notebook Forms Bridge"

# 4. Push the scripts
clasp push

# 5. Deploy as API executable
clasp deploy --description "v1"
```

### Runtime Commands

```bash
# Export form structure to JSON
clasp run exportFormToJSON -p '["FORM_ID"]' > form.json

# Create form from notebook quiz
clasp run createFormFromJSON -p '[{...quizJSON}]'

# Get student responses
clasp run exportResponsesToJSON -p '["FORM_ID"]' > responses.json

# Submit grades (after teacher review)
clasp run submitGradesToForm -p '["FORM_ID", [...grades]]'
```

---

## Teacher Workflow (Detailed)

### Phase 1: Create Quiz

```
Teacher: "Create a 10-question quiz on photosynthesis for Year 8"

Claude:
1. Creates photosynthesis-quiz.quiz.json with:
   - Mix of multiple choice (auto-graded)
   - Short answer questions (require review)
   - Worked problems (show your work)
2. Includes hints, explanations, point values
3. Tags with topic for progress tracking
```

### Phase 2: Export to Google Forms

```
Teacher: "Export this quiz to Google Forms"

Claude:
1. Reads the .quiz.json file
2. Checks for incompatible question types (warns about `ordering`)
3. Calls: clasp run createFormFromJSON
4. Returns: Form URL for sharing with students
5. Stores formId in quiz metadata for later sync
```

### Phase 3: Import Responses

```
Teacher: "Import the responses from the photosynthesis quiz"

Claude:
1. Reads formId from quiz metadata
2. Calls: clasp run exportResponsesToJSON
3. Creates section: photosynthesis-quiz-responses/
4. Creates one .response.json card per student
5. Auto-grades objective questions immediately
6. Marks short_answer/worked as "pending review"
```

### Phase 4: AI-Assisted Grading

```
Teacher: "Grade the photosynthesis quiz responses"

Claude:
1. Opens each response card
2. For pending questions:
   - Reads student answer
   - Compares against model answer/rubric
   - Generates score and feedback
   - Stores as claudeGrade (not final)
3. Marks as "ready for review"
```

### Phase 5: Teacher Review

```
Teacher reviews in notebook UI:
- See Claude's suggested grades side-by-side with student answers
- Edit scores and feedback as needed
- Approve or modify each grade
- Approved grades stored as teacherGrade (final)
```

### Phase 6: Export Grades to Google Forms

```
Teacher: "Export the grades to Google Forms"

Claude:
1. Checks all responses have teacherGrade (or approved claudeGrade)
2. Warns about any unreviewed responses
3. Builds grades array from FINAL grades only
4. Calls: clasp run submitGradesToForm
5. Marks each response as exportedToForms: true
6. Students can now view their grades in Google Forms
```

---

## Analytics & Progress Tracking

### Class Summary View

```
Photosynthesis Quiz - Class 8B
══════════════════════════════════════════════════════════

Total Students: 28    Submitted: 26    Graded: 26

Score Distribution:
  90-100%  ████████████ 12 (46%)
  80-89%   ██████ 6 (23%)
  70-79%   ████ 4 (15%)
  60-69%   ██ 2 (8%)
  < 60%    ██ 2 (8%)

Question Analysis:
  Q1 (multiple choice): 92% correct
  Q2 (multiple choice): 85% correct
  Q3 (short answer):    Avg 3.8/5 - Common error: confused respiration
  Q4 (worked problem):  Avg 7.2/10 - Many missed unit conversion

Top Performers: Alice S. (98%), Bob J. (95%), Carol W. (94%)
Needs Support: Dave L. (52%), Eve M. (58%)
```

### Student Progress Over Time

```
Alice Smith - Biology Progress
══════════════════════════════════════════════════════════

Quiz Performance (2025):
  Jan 15  Photosynthesis      98%  ██████████
  Jan 22  Cell Structure      95%  █████████▌
  Feb 01  Respiration         88%  ████████▊
  Feb 10  Ecosystems          92%  █████████▏

Topics Mastered: Photosynthesis, Cell Structure
Topics to Review: Energy transfer in ecosystems

Average: 93.3%  Trend: ↗ Improving
```

---

## Implementation Phases

### Phase 1: Apps Script Bridge (Foundation)
- [ ] Create google-forms-bridge project structure
- [ ] Implement exportFormToJSON
- [ ] Implement createFormFromJSON
- [ ] Implement exportResponsesToJSON
- [ ] Implement submitGradesToForm
- [ ] Test all functions via clasp run
- [ ] Document setup process in README

### Phase 2: Quiz Type Extensions
- [ ] Add `allowMultiple` and `display` to multiple_choice
- [ ] Add `scale` question type
- [ ] Add `grid` question type (consider replacing `matching`)
- [ ] Add import/export warnings for incompatible types
- [ ] Update quiz template schema

### Phase 3: Response Card Type
- [ ] Define quiz-response template
- [ ] Implement response card rendering
- [ ] Show student answer, auto-grade, Claude grade, teacher grade
- [ ] Add review UI for teacher grade editing
- [ ] Track reviewed/unreviewed status

### Phase 4: Claude Code Integration
- [ ] Detect clasp installation and login status
- [ ] Implement quiz export workflow
- [ ] Implement response import workflow
- [ ] Implement AI grading workflow
- [ ] Implement grade export workflow
- [ ] Add appropriate confirmations and warnings

### Phase 5: Analytics
- [ ] Class summary generation (markdown/code card)
- [ ] Student progress tracking
- [ ] Question difficulty analysis
- [ ] Export to spreadsheet format

---

## Decisions

1. **Repo structure**: Keep google-forms-bridge within research-notebook repo.
   - The Apps Script bridge is thin (~200-300 lines) - not a standalone project
   - The real value is the integrated workflow: notebook UI for teacher review, Claude Code orchestration, analytics
   - Without the notebook, the bridge is just a less polished version of existing tools
   - Design iteration is easier when quiz schema, response cards, and bridge evolve together
   - Can always extract later if there's genuine external demand
   - Structure: `/google-forms-bridge/` directory with its own README

---

## Open Questions

1. **Response card vs attempts array**: Currently quizzes store attempts in the quiz card. Should student responses be:
   - Separate cards in a section (proposed above) - better for many students
   - Attempts array in quiz card - current pattern, simpler for self-study

2. **Matching → Grid migration**: Should we deprecate `matching` in favor of `grid`, or keep both?

3. **Numeric questions**: Accept loss of tolerance on Google Forms export, or find workaround?

4. **Ordering questions**: Accept they can't export, or remove from quiz types entirely?

---

## Security Considerations

- OAuth tokens stored locally in `.clasprc.json` (user's home directory)
- Form IDs stored in quiz metadata - not sensitive
- Student data (names, emails, responses) stored locally in notebook
- Teacher must explicitly trigger each export
- No automatic sync - all operations are manual

---

## References

- [Google Forms API](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms)
- [Apps Script FormResponse](https://developers.google.com/apps-script/reference/forms/form-response)
- [Apps Script ItemResponse](https://developers.google.com/apps-script/reference/forms/item-response)
- [clasp CLI](https://github.com/google/clasp)
- [GradeAssistant PoC](https://github.com/JacobNoahGlik/GradeAssistant_PoC)
