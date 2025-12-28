# Quiz Editor: Design Document

## Overview

A proper in-app editor for quiz cards that allows teachers to create and edit quizzes through a structured UI rather than raw JSON/YAML editing.

**Issue:** dp-072

**Related:** Supports the Google Forms integration workflow where quizzes are created in the notebook, exported to Forms, and graded with AI assistance.

---

## Current State

- Quiz template has comprehensive schema (`defaults/templates/quiz.yaml`)
- Quiz viewer and taking UI work well
- Editor falls back to raw YAML (`editor.layout: yaml`)
- No structured UI for question management

---

## Design Decisions

### 1. Implementation Approach

**Decision:** Extend existing editor system with new `questions` field type

Rather than a fully custom layout, add a `questions` type to `renderEditorField()`. This:
- Reuses existing editor infrastructure (save, close, validation)
- Follows patterns established by `list` and `records` field types
- Allows quiz metadata (title, topic, author) to use standard fields

### 2. Advanced Fields Grouping

**Decision:** Group optional fields under collapsible "Advanced" section

The Advanced section contains:
- Hint
- Explanation
- Model answer (for AI grading)
- Rubric (grading criteria)

This keeps the editor clean for simple quizzes while exposing AI grading fields when needed.

### 3. Question Type Changes

**Decision:** Confirm with warning dialog

When changing a question's type (e.g., multiple_choice → numeric), show:
> "Changing type will remove options and correct answer. Continue?"

### 4. Preview

**Decision:** No inline preview

Keep the editor simple. Teachers save and view in the quiz viewer to see how questions appear to students.

---

## UI Design

### Question List Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Q1: multiple_choice                        [⋮⋮] [▼] [🗑️]   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Question: [markdown editor]                             │ │
│ │                                                         │ │
│ │ Options:                          Correct:              │ │
│ │   A. [text input]     [🗑️]        ○ A                  │ │
│ │   B. [text input]     [🗑️]        ● B  ← selected      │ │
│ │   C. [text input]     [🗑️]        ○ C                  │ │
│ │   [+ Add option]                                        │ │
│ │                                                         │ │
│ │ Points: [1]  □ Allow multiple selections                │ │
│ │                                                         │ │
│ │ ▸ Advanced (hint, explanation, model answer, rubric)    │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Q2: short_answer                           [⋮⋮] [▶] [🗑️]   │
│ "Explain the process of photosynthesis..."   (collapsed)   │
├─────────────────────────────────────────────────────────────┤
│ [+ Add Question]                                            │
└─────────────────────────────────────────────────────────────┘
```

### Key UI Elements

| Element | Function |
|---------|----------|
| Drag handle (⋮⋮) | Reorder questions via drag-and-drop |
| Expand/collapse (▼/▶) | Toggle question detail view |
| Delete (🗑️) | Remove question with confirmation |
| Type dropdown | Change question type |
| Correct selector | Radio/checkbox to mark correct answer(s) |
| Advanced toggle | Expand optional fields section |

### Collapsed State

Shows: Q#, type badge, truncated question text (first ~50 chars)

### Expanded State

Full editing UI with type-specific fields

---

## Question Types and Fields

### Common Fields (all types)

| Field | Type | Description |
|-------|------|-------------|
| question | markdown | The question text |
| points | number | Point value (default: 1) |
| hint | markdown | Optional hint for students |
| explanation | markdown | Shown after answering |
| modelAnswer | markdown | For AI grading (short_answer, worked) |
| rubric | markdown | Grading criteria for AI |

### Type-Specific Fields

**multiple_choice:**
- `options[]` - Answer choices
- `correct` - Index of correct answer (single)
- `correctMultiple[]` - Indices of correct answers (checkbox mode)
- `allowMultiple` - Boolean: checkbox vs radio
- `display` - 'radio' or 'dropdown'

**numeric:**
- `answer` - Expected numeric answer
- `tolerance` - Acceptable margin of error
- `toleranceBands[]` - Partial credit ranges

**short_answer / worked:**
- Uses common fields only
- modelAnswer and rubric important for AI grading

**matching:**
- `pairs[]` - Array of [left, right] to match

**ordering:**
- `correctOrder[]` - Items in correct sequence

**scale:**
- `low`, `high` - Bounds (e.g., 1-5)
- `lowLabel`, `highLabel` - Endpoint labels
- `correct` - Expected value (optional, for graded scales)

**grid:**
- `rows[]` - Row labels
- `columns[]` - Column labels
- `correctAnswers` - Object mapping row to correct column

---

## Implementation Phases

### Phase 1: Core Editor (dp-073)

Basic infrastructure and common question types:
- Question list with add/remove/reorder
- `multiple_choice` type fully working (radio, checkbox, correct selection)
- `short_answer` and `worked` types
- Common fields (question, points)
- Advanced section (hint, explanation, modelAnswer, rubric)
- Type change confirmation dialog

### Phase 2: Additional Types (dp-074)

Extend to more question types:
- `numeric` with tolerance input
- `scale` type with bounds/labels
- `dropdown` display mode for multiple_choice

### Phase 3: Complex Types (dp-075)

Advanced editors for complex types:
- `matching` pairs editor (two-column table)
- `ordering` editor (reorderable list showing correct order)
- `grid` editor with correct answers matrix

---

## Files to Modify

### js/app.js (~300-400 lines for Phase 1)

Location: GENERIC_EDITOR section (around line 4500)

New code:
- Add `questions` type handling in `renderEditorField()`
- `createQuizQuestionEditor(question, index)` - Full question editor
- `renderQuestionTypeFields(type, question)` - Type-specific fields
- `createOptionsEditor(options, correctIndex)` - MC options list
- `changeQuestionType(index, newType)` - Handle type changes with warning
- `addQuestion()`, `removeQuestion(index)` - List management
- Extend `getEditorFieldValue()` for questions array extraction

### defaults/templates/quiz.yaml

Change:
```yaml
editor:
  layout: yaml  # Remove this
```

To:
```yaml
editor:
  layout: default
  fields:
    - field: title
      label: Title
    - field: author
      label: Author
      width: half
    - field: topic
      label: Topic
      width: half
    - field: description
      label: Description
      multiline: true
      rows: 2
    - field: questions
      label: Questions
      # No explicit type - handled specially by field name
```

Add to schema:
- `modelAnswer` field definition for questions
- `rubric` field definition for questions

### css/app.css (~150 lines)

New styles for:
- `.quiz-editor-questions` - Container
- `.quiz-question-editor` - Single question
- `.quiz-question-collapsed` / `.quiz-question-expanded`
- `.quiz-question-header` - Type badge, controls
- `.quiz-options-editor` - Options list with inputs
- `.quiz-correct-selector` - Correct answer radio/checkboxes
- `.quiz-advanced-section` - Collapsible advanced fields
- Drag-and-drop visual feedback

---

## Testing Plan

### Manual Testing

1. **Create new quiz** - Add questions of each type, verify save
2. **Edit existing quiz** - Open tutor-notebook quizzes, verify data loads
3. **Reorder questions** - Drag to reorder, verify save order
4. **Delete questions** - Remove and verify
5. **Type change** - Change types, verify warning and data handling
6. **Multiple choice variations** - Radio, checkbox, dropdown modes
7. **Correct answer selection** - Verify correct index/indices saved

### Test with Existing Quizzes

Use `examples/tutor-notebook/quizzes/` for testing:
- `graded-question-types.quiz.json` - Multiple question types
- `demo-quiz.quiz.json` - Simple quiz

---

## Future Enhancements

- **Duplicate question** - Copy existing question as starting point
- **Import from bank** - Reuse questions across quizzes
- **Bulk edit** - Change points for all questions at once
- **Keyboard shortcuts** - Arrow keys to navigate, Enter to add
