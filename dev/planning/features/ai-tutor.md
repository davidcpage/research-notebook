---
id: 1766774304090cp52jynvq
template: note
title: "Planning: AI Tutor Features"
author: Claude
_subdir: features
created: "2025-12-26T18:38:57.158Z"
modified: "2025-12-26T19:00:00.000Z"
sectionId: section-planning
tags: [planning, feature]
---

# AI Tutor Features: Implementation Plan

This document plans the implementation of tutoring-focused features for research-notebook, enabling it to function as an AI tutoring platform where Claude Code acts as a tutor and the browser app displays learning materials.

## Overview

**Goal**: Enable research-notebook to serve as an AI tutoring environment with:
1. A new **quiz card type** for interactive assessment
2. A well-structured **CLAUDE.md** template for tutoring notebooks
3. A **README.md** template for tutoring notebooks

**Files to create/modify**:
- `defaults/templates/quiz.yaml` — Quiz template definition
- `js/app.js` — Quiz rendering and grading logic
- `css/app.css` — Quiz styling
- `examples/tutor-notebook/CLAUDE.md` — Enhanced tutoring instructions
- `examples/tutor-notebook/README.md` — Notebook documentation

---

## 1. Quiz Card Type

### 1.1 File Format

Quiz files use `.quiz.json` extension with this structure:

```json
{
  "id": "quiz-quadratics-01",
  "title": "Completing the Square",
  "author": "Claude",
  "created": "2024-12-26T10:00:00Z",
  "modified": "2024-12-26T10:00:00Z",
  "topic": "maths/algebra/quadratics",
  "questions": [...],
  "attempts": [...]
}
```

### 1.2 Question Types

#### Multiple Choice (auto-graded)
```json
{
  "type": "multiple_choice",
  "question": "What is the first step in completing the square for x² + 6x + 5?",
  "options": [
    "Factor out the coefficient of x²",
    "Take half of the coefficient of x",
    "Move the constant to the other side",
    "Square both sides"
  ],
  "correct": 1,
  "hint": "Think about what creates a perfect square trinomial.",
  "explanation": "We take half of 6 to get 3, which we'll square to complete the square."
}
```

#### Numeric Input (auto-graded)
```json
{
  "type": "numeric",
  "question": "Complete the square: x² + 8x + ___ = (x + 4)²",
  "correct": 16,
  "tolerance": 0,
  "hint": "What is half of 8, squared?",
  "explanation": "Half of 8 is 4, and 4² = 16."
}
```

#### Short Answer (Claude-reviewed)
```json
{
  "type": "short_answer",
  "question": "In your own words, explain why completing the square works.",
  "hint": "Think about what a perfect square trinomial looks like.",
  "rubric": "Should mention: adding a constant to create (x + a)² form, the relationship between the linear coefficient and the constant added."
}
```

#### Worked Example (step-by-step, Claude-reviewed)
```json
{
  "type": "worked",
  "question": "Solve by completing the square: x² + 6x + 5 = 0",
  "steps": [
    { "instruction": "Move the constant to the right side", "expected": "x² + 6x = -5" },
    { "instruction": "Take half of 6, square it, add to both sides", "expected": "x² + 6x + 9 = 4" },
    { "instruction": "Factor the left side", "expected": "(x + 3)² = 4" },
    { "instruction": "Take square root of both sides", "expected": "x + 3 = ±2" },
    { "instruction": "Solve for x", "expected": "x = -1 or x = -5" }
  ]
}
```

#### Matching (auto-graded)
```json
{
  "type": "matching",
  "question": "Match each equation to its factored form:",
  "pairs": [
    { "left": "x² + 5x + 6", "right": "(x + 2)(x + 3)" },
    { "left": "x² - 4", "right": "(x + 2)(x - 2)" },
    { "left": "x² + 4x + 4", "right": "(x + 2)²" }
  ],
  "explanation": "Use FOIL to verify each pairing."
}
```

#### Ordering (auto-graded)
```json
{
  "type": "ordering",
  "question": "Put these steps for solving a quadratic equation in order:",
  "items": [
    "Write in standard form ax² + bx + c = 0",
    "Identify a, b, and c",
    "Substitute into quadratic formula",
    "Simplify the discriminant",
    "Calculate both solutions"
  ],
  "correct_order": [0, 1, 2, 3, 4],
  "explanation": "The quadratic formula requires standard form first."
}
```

### 1.3 Attempt Tracking

Each quiz stores attempts for progress tracking and Claude review:

```json
{
  "attempts": [
    {
      "timestamp": "2024-12-26T14:30:00Z",
      "answers": [
        { "questionIndex": 0, "answer": 1, "correct": true },
        { "questionIndex": 1, "answer": 15, "correct": false },
        { "questionIndex": 2, "answer": "Adding 9 makes it a perfect square", "reviewed": false }
      ],
      "score": { "auto": "1/2", "pending_review": 1 },
      "review": null
    }
  ]
}
```

When a student completes a quiz with non-auto-gradable questions, they can ask Claude Code to review:
- Claude reads the quiz file, sees pending answers
- Provides feedback in terminal and/or creates a follow-up note
- Updates the attempt record with review comments

### 1.4 Template Definition

`defaults/templates/quiz.yaml`:

```yaml
name: quiz
description: Interactive quiz with multiple question types
extensions:
  - .quiz.json
parser: json
schema:
  title:
    type: text
    required: true
  author:
    type: text
  topic:
    type: text
  questions:
    type: json
    required: true
  attempts:
    type: json
    default: []
card:
  layout: quiz
  placeholder: "❓"
viewer:
  layout: quiz
editor:
  fields:
    - field: title
      label: Title
    - field: author
      label: Author
    - field: topic
      label: Topic
      placeholder: "e.g., maths/algebra/quadratics"
    - field: questions
      label: Questions (JSON)
      type: yaml
      multiline: true
      rows: 20
      monospace: true
style:
  variables:
    --card-bg: "#f0f7ff"
    --template-border: "#b8d4f0"
ui:
  button_label: Quiz
  icon: "❓"
  sort_order: 4
```

### 1.5 Rendering

#### Card Preview (`renderQuizPreview`)
- Shows quiz title and question count
- Progress indicator if attempts exist (e.g., "2/5 correct, 1 pending review")
- Visual indicator for quiz state: not started, in progress, completed

#### Viewer (`renderQuizViewer`)
- **Take mode**: Interactive quiz-taking interface
  - One question at a time or all visible (user preference via settings?)
  - Input controls per question type
  - Hints revealed on request
  - Submit button
- **Review mode**: After submission
  - Shows answers with correct/incorrect indicators
  - Displays explanations
  - For pending-review questions, shows "Awaiting Claude review" badge
- **History mode**: Past attempts with scores

#### CSS Classes
```css
.quiz-question { }
.quiz-options { }
.quiz-option { }
.quiz-option.selected { }
.quiz-option.correct { }
.quiz-option.incorrect { }
.quiz-numeric-input { }
.quiz-short-answer { }
.quiz-worked-step { }
.quiz-hint { }
.quiz-explanation { }
.quiz-progress { }
.quiz-submit { }
```

### 1.6 Implementation Steps

1. **Template**: Create `defaults/templates/quiz.yaml`
2. **Extension mapping**: Add `.quiz.json` → `json` parser in `getDefaultExtensionRegistry()`
3. **Card layout**: Add `quiz` case in `renderCardPreview()` → `renderQuizPreview()`
4. **Viewer layout**: Add `quiz` case in viewer rendering → `renderQuizViewer()`
5. **Grading logic**: `gradeQuizAttempt(quiz, answers)` — auto-grade where possible
6. **Attempt storage**: `saveQuizAttempt(card, answers)` — update card and save
7. **CSS**: Add quiz-specific styles
8. **Editor**: JSON/YAML editor for questions (advanced users / Claude-generated)

---

## 2. Tutoring CLAUDE.md

The CLAUDE.md for tutoring notebooks instructs Claude Code how to act as an effective tutor.

### 2.1 Structure

```markdown
# AI Tutor Notebook

## Role
You are a patient, encouraging tutor helping a student learn. Your goal is understanding, not just correct answers.

## Tutoring Approach
[Pedagogical principles - concise but effective]

## Content Creation
[How to create notes, code examples, quizzes]

## Quiz Workflow
[How to generate quizzes, review student answers]

## File Structure
[Quick reference for file types and organization]

## Commands
[Common student requests and how to handle them]
```

### 2.2 Key Sections

**Tutoring Approach** (concise principles):
- Check understanding before explaining
- Use Socratic questioning — guide discovery with questions
- Multiple representations — verbal, visual, examples
- When stuck: clarify → simpler example → hints → work together
- When wrong: acknowledge attempt → ask their reasoning → guide to discovery

**Content Creation**:
- Notes: Start with intuition/motivation, use concrete examples, include "check understanding" questions
- Code: Focus on one concept, include comments, use visualizations
- Quizzes: Mix question types, start easy, include hints and explanations

**Quiz Workflow**:
- Generate with: "Quiz me on [topic]" or "Create a quiz about [concept]"
- Review with: "Check my quiz" or "Review my answers"
- Claude reads `.quiz.json`, finds pending answers, provides feedback
- Can create follow-up materials based on areas of difficulty

**Commands** (student requests):
| Request | Action |
|---------|--------|
| "Explain [topic]" | Create/update explanation note |
| "Show me an example" | Create worked example (note or code) |
| "Quiz me on [topic]" | Generate quiz file |
| "Check my quiz" | Review pending answers, provide feedback |
| "I don't understand [X]" | Targeted explanation with simpler examples |
| "What should I study next?" | Review progress, suggest topics |

### 2.3 Full Content

See Appendix A for the complete CLAUDE.md content.

---

## 3. Tutoring README.md

Brief documentation for users setting up a tutoring notebook.

### 3.1 Content

```markdown
# [Subject] Tutor Notebook

An AI-assisted learning environment powered by Claude Code.

## How It Works

1. **Ask Claude** questions in the terminal (Claude Code)
2. **View materials** in the browser (this app)
3. **Take quizzes** interactively, with AI feedback

## Getting Started

1. Open this folder in Claude Code
2. Open `index.html` in Chrome/Edge and select this folder
3. Ask Claude to explain a topic or create a quiz

## Subjects

- [Add your subjects/topics here]

## Tips

- Ask "why" when you don't understand
- Request quizzes to test your understanding
- Use code cells to experiment with examples
- Link related concepts with `[[Section > Title]]`
```

---

## 4. Implementation Order

### Phase 1: Quiz Infrastructure
1. Create `defaults/templates/quiz.yaml`
2. Add extension mapping for `.quiz.json`
3. Implement `renderQuizPreview()` — basic card display
4. Implement `renderQuizViewer()` — question display (read-only first)

### Phase 2: Interactive Quizzes
5. Add quiz-taking UI (inputs, selection, submission)
6. Implement auto-grading for: multiple_choice, numeric, matching, ordering
7. Implement attempt storage and progress display
8. Add CSS styling for quiz components

### Phase 3: Claude Integration
9. Mark non-auto-gradable answers as "pending review"
10. Document review workflow in CLAUDE.md
11. Test end-to-end: Claude creates quiz → student takes → Claude reviews

### Phase 4: Polish
12. Quiz editor improvements (if needed)
13. Progress tracking enhancements
14. Theme integration (quiz colors)

---

## Appendix A: Complete CLAUDE.md for Tutor Notebooks

```markdown
# AI Tutor Notebook

This notebook is a learning environment where Claude Code acts as your tutor.

## Your Role

You are a patient, encouraging tutor. Your goal is to build genuine understanding, not just get correct answers. Adapt your explanations to the student's level and learning style.

## Tutoring Principles

**Before explaining**: Ask what the student already knows. Build on their foundation.

**When teaching**:
- Start with intuition and motivation ("Why does this matter?")
- Use concrete examples before abstract definitions
- Offer multiple representations: verbal, visual, code examples
- Check understanding with questions, not just "Does that make sense?"

**When the student is stuck**:
1. Ask clarifying questions to find the confusion point
2. Provide a simpler example or analogy
3. Offer hints before solutions
4. Work through one example together, then let them try

**When the student gets it wrong**:
1. Acknowledge the attempt ("Good thinking, but...")
2. Ask them to explain their reasoning
3. Guide them to discover the error themselves
4. Reinforce with a follow-up question

## Creating Content

### Notes (.md files)
- Clear structure: motivation → concept → examples → practice questions
- Use LaTeX for math: `$x^2$` inline, `$$\int f(x)dx$$` block
- Link related topics: `[[Section > Related Topic]]`
- End with "Check Your Understanding" questions

### Code Examples (.code.py files)
- One concept per cell
- Liberal comments explaining each step
- Visualizations where helpful (matplotlib)
- Invite experimentation: "Try changing X and see what happens"

### Quizzes (.quiz.json files)
- Mix question types for engagement
- Progress from easier to harder
- Include hints (revealed on request)
- Write encouraging feedback for wrong answers
- Detailed explanations for all answers

## Quiz Workflow

**Creating quizzes**: Generate `.quiz.json` files with questions array. Use the schema in this notebook's template.

**Reviewing answers**: When the student asks you to check their quiz:
1. Read the quiz file
2. Find attempts with `reviewed: false` answers
3. Provide constructive feedback in the terminal
4. Optionally create a follow-up note addressing weak areas
5. Update the attempt record if appropriate

## File Organization

```
notebook/
├── topics/           # Learning content by subject
│   ├── algebra/
│   │   ├── quadratics.md
│   │   ├── examples.code.py
│   │   └── quiz-01.quiz.json
│   └── geometry/
├── exercises/        # Practice problems
├── progress/         # Session logs (optional)
└── .notebook/        # Configuration
```

## Common Requests

| Student says | You should |
|-------------|------------|
| "Explain [topic]" | Create or update a note with clear explanation |
| "Show me an example" | Create worked example (note or code) |
| "Quiz me on [topic]" | Generate a quiz file with varied question types |
| "Check my quiz" | Review their answers, provide feedback |
| "I don't get [concept]" | Ask what specifically confuses them, then clarify |
| "What's next?" | Review progress, suggest topics based on dependencies |
| "Make it harder/easier" | Adjust difficulty of explanations or questions |

## Session Flow

1. **Greet**: Ask what they want to work on today
2. **Assess**: Brief check of current understanding
3. **Teach**: Explain, demonstrate, practice
4. **Check**: Quiz or practice problems
5. **Review**: Discuss results, address gaps
6. **Suggest**: What to study next
```

---

## Appendix B: Quiz Rendering Details

### Question Type UI Components

| Type | Input Component | Grading |
|------|----------------|---------|
| multiple_choice | Radio buttons | Auto: compare to `correct` index |
| numeric | Number input | Auto: check within `tolerance` |
| short_answer | Textarea | Claude review |
| worked | Step-by-step textareas | Claude review |
| matching | Drag-drop or dropdowns | Auto: compare pairs |
| ordering | Drag-drop list | Auto: compare order |

### State Machine

```
Quiz States:
  NOT_STARTED → (student opens) → IN_PROGRESS → (submit) → SUBMITTED
  SUBMITTED → (has pending review) → PENDING_REVIEW
  SUBMITTED → (all auto-graded) → COMPLETED
  PENDING_REVIEW → (Claude reviews) → COMPLETED
```

### Viewer Modes

- **Take**: Fresh quiz, student answering
- **Review**: Just submitted, showing results
- **History**: Viewing past attempt
- **Edit**: Modifying quiz questions (advanced)

---

## Open Questions

1. **One question at a time vs all visible?** Could be a quiz-level or settings-level option.

2. **Timer support?** The schema could support `timeLimit` but implementation adds complexity. Defer unless requested.

3. **Shuffle questions/options?** Easy to add later if desired.

4. **Export to QTI?** Not needed for v1, but the schema is designed to be convertible.

---

*Status: Ready for implementation*
