# Grading Tools

Bulk grading tools for student quiz responses. Works with any quiz source (Google Forms, manual entry, CSV import, etc.).

## Overview

```
tools/grading/
├── grade_responses.py    # AI-powered bulk grading
├── manage_roster.py      # Student ID ↔ name/email mapping
├── examples/
│   ├── sample_context.json    # Quiz + rubric + calibration
│   ├── sample_responses.json  # Student answers to grade
│   └── sample_roster.yaml     # Student identity mapping
└── README.md
```

## Privacy Design

Student response files contain **IDs only** (e.g., `s001`), not names or emails. Personal information is stored in a separate roster file outside the notebook:

```
notebook/                          # Safe to share, commit to git
├── quiz-responses/
│   ├── s001.response.json        # ID only, no PII
│   └── s002.response.json

~/.notebook/rosters/               # Private, teacher's machine only
└── quiz-roster.yaml              # Maps s001 → "Alice Smith"
```

## Quick Start

### 1. Test with Dry Run (No API Key Needed)

```bash
cd tools/grading

# See what prompts would be sent to the AI
python3 grade_responses.py examples/sample_context.json examples/sample_responses.json --dry-run
```

### 2. Grade for Real

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Install anthropic SDK
pip install anthropic

# Grade responses
python3 grade_responses.py examples/sample_context.json examples/sample_responses.json -o grades.json
```

## Scripts

### grade_responses.py

Bulk grade student responses using AI.

```bash
# Dry run - show prompts without calling API
python3 grade_responses.py context.json responses.json --dry-run

# Grade and save results
python3 grade_responses.py context.json responses.json -o grades.json

# Use a different model (cheaper for simple questions)
python3 grade_responses.py context.json responses.json --model claude-3-haiku-20240307
```

**Input: context.json**
```json
{
  "quiz": {
    "title": "Quiz Title",
    "questions": [
      {"index": 0, "type": "short_answer", "text": "...", "points": 5}
    ]
  },
  "rubric": {
    "question_0": {
      "max_score": 5,
      "criteria": "5 points: ...\n3-4 points: ...",
      "model_answer": "..."
    }
  },
  "calibration_examples": [
    {"answer": "...", "score": 3, "feedback": "..."}
  ]
}
```

**Input: responses.json**
```json
{
  "s001": {"0": "Student's answer here..."},
  "s002": {"0": "Another student's answer..."}
}
```

**Output: grades.json**
```json
{
  "s001": {
    "0": {"score": 4, "feedback": "Good explanation...", "gradedAt": "..."}
  }
}
```

### manage_roster.py

Manage student identity mappings.

```bash
# Create roster from Google Forms export
python3 manage_roster.py create responses.json -o roster.yaml

# Look up student by ID
python3 manage_roster.py lookup roster.yaml --id s001

# Look up by email
python3 manage_roster.py lookup roster.yaml --email alice@school.edu

# List all students
python3 manage_roster.py list roster.yaml
```

## Grading Architecture

### Prompt Caching

The grading script uses Anthropic's prompt caching to reduce costs. The system prompt (rubric, calibration examples) is cached and reused for all students, so you only pay for the variable part (student answers).

### Order Independence

Each student is graded independently with the same context. This avoids position bias where early answers might anchor expectations for later ones.

### Grade Hierarchy

Grades flow through three levels:
1. **Auto-grade** - Multiple choice, numeric answers (computed immediately)
2. **Claude grade** - AI suggestion for open-ended questions
3. **Teacher grade** - Final reviewed grade (required before export)

The grading script produces Claude grades. Teacher review happens in the notebook UI.

## Workflow Integration

These tools are designed to work with Claude Code and the research notebook:

```
1. Import responses    →  Creates response cards with student IDs
2. Run grade_responses →  Generates Claude grades
3. Teacher review      →  Approve/edit in notebook UI
4. Export grades       →  Push final grades to Google Forms
```

## Dependencies

- Python 3.9+
- `anthropic` (for actual grading, not needed for dry-run)
- `pyyaml` (optional, for YAML roster files)

```bash
pip install anthropic pyyaml
```
