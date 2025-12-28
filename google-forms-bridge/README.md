# Google Forms Bridge

Apps Script bridge for exporting/importing quiz data between Google Forms and the research notebook.

## Overview

```
google-forms-bridge/
├── appsscript.json      # Manifest with OAuth scopes
├── Code.gs              # Main entry points
├── ExportResponses.gs   # Export form responses to JSON
├── ImportGrades.gs      # Import grades back to form
└── README.md
```

## Setup

### 1. Install clasp

```bash
npm install -g @google/clasp
```

### 2. Login to Google

```bash
clasp login
```

This opens a browser for OAuth authentication.

### 3. Create Apps Script Project

```bash
cd google-forms-bridge

# Create a new standalone script
clasp create --type standalone --title "Research Notebook Forms Bridge"
```

This creates a `.clasp.json` file with your script ID.

### 4. Push the Code

```bash
clasp push
```

### 5. Deploy as API Executable

```bash
# First deployment
clasp deploy --description "v1"

# View deployments
clasp deployments
```

### 6. Enable Advanced Services (if needed)

Go to https://script.google.com, open your project, and enable any required services.

## Usage

### Export Responses

Export all student responses from a form:

```bash
# Get form ID from the URL: https://docs.google.com/forms/d/FORM_ID/edit
clasp run exportResponses -p '["1FAIpQLSe_YOUR_FORM_ID"]'
```

Output:
```json
{
  "formId": "1FAIpQLSe...",
  "title": "Photosynthesis Quiz",
  "exportedAt": "2025-01-15T10:30:00.000Z",
  "questions": [...],
  "responses": [
    {
      "responseId": "2_ABaOnud...",
      "timestamp": "2025-01-15T09:00:00.000Z",
      "email": "student@school.edu",
      "answers": {
        "0": { "response": "Carbon Dioxide", "score": null },
        "1": { "response": "Plants use sunlight...", "score": null }
      }
    }
  ]
}
```

### Import Grades

Import grades after teacher review:

```bash
clasp run importGrades -p '["FORM_ID", {
  "2_ABaOnud...": {
    "0": { "score": 1, "feedback": "Correct!" },
    "1": { "score": 4, "feedback": "Good explanation, but..." }
  }
}]'
```

Output:
```json
{
  "success": true,
  "processed": 1,
  "successCount": 1,
  "errorCount": 0
}
```

### Test Access

Verify the script can access a form:

```bash
clasp run testAccess -p '["FORM_ID"]'
```

## Functions

| Function | Description |
|----------|-------------|
| `exportResponses(formId)` | Export all responses as JSON |
| `importGrades(formId, grades)` | Import grades to form |
| `getFormMetadata(formId)` | Get questions without responses |
| `testAccess(formId)` | Verify form access |

## Requirements

- Form must be in **Quiz mode** to import grades
- You must have edit access to the form
- Students must have submitted responses to grade

## Privacy Notes

When exporting responses:
- Email addresses are included (if form collects them)
- Use `manage_roster.py` to create ID mappings
- Store roster files outside the notebook (`~/.notebook/rosters/`)

## Workflow Integration

```
1. Teacher creates quiz in notebook        → .quiz.json file
2. (Future) Export quiz to Google Forms    → clasp run createForm
3. Students take quiz                      → Google Forms
4. Export responses                        → clasp run exportResponses > responses.json
5. Create roster (anonymize)               → python manage_roster.py create responses.json
6. Create response cards                   → s001.response.json, s002.response.json, ...
7. AI grades responses                     → python grade_responses.py
8. Teacher reviews in notebook             → Approve/edit grades
9. Import grades to Forms                  → clasp run importGrades
10. Students view grades                   → Google Forms
```

## Troubleshooting

### "Form is not in quiz mode"

Enable quiz mode: Form settings → Quizzes → Make this a quiz

### "Response not found"

Response IDs must match exactly. Export responses again to get current IDs.

### Permission errors

Re-run `clasp login` and ensure you have edit access to the form.

## Development

### View Logs

```bash
clasp logs
```

### Open in Browser

```bash
clasp open
```

### Push Changes

```bash
clasp push
```
