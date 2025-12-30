# Demo Classroom Notebook

This demo notebook shows how the quiz grading workflow works with Google Forms integration.

## Contents

### Quizzes
- **French GCSE Comprehension Quiz** - A sample quiz with multiple question types:
  - Multiple choice (vocab recognition)
  - Short answer (translations)
  - Extended writing (comprehension)

### Responses
- **Year 10A** (4 students) - Higher-achieving cohort
- **Year 10B** (4 students) - Mixed ability cohort

Each cohort has:
- Individual student response cards
- Summary card for question-level grading view

## Workflow Demo

1. **View Quiz** - Open the quiz card to see questions, answer key, and rubrics
2. **View Summary** - Open a cohort summary to see question-level stats and all answers
3. **Grade Individual** - Open a student's response card to review/edit grades
4. **Question-Level Grading** - Expand a question in the summary to see all answers side-by-side

## Grade Hierarchy

- **Auto Grade** - Multiple choice, computed automatically
- **Claude Grade** - AI-generated suggestion for open-ended questions
- **Teacher Grade** - Final reviewed grade (overrides all others)

## Note

This is demo data for illustration purposes. In a real workflow:
1. Quiz would be exported to Google Forms
2. Students would submit via Forms
3. Responses would be imported with `forms-bridge responses`
4. AI grading would be done with `/grade-quiz` skill
