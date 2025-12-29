# Google Forms Bridge

Apps Script bridge for exporting/importing quiz data between Google Forms and the research notebook.

## Overview

```
google-forms-bridge/
├── appsscript.json      # Manifest with OAuth scopes
├── Code.gs              # Main entry points + test wrappers
├── ExportForm.gs        # Export form structure to quiz JSON
├── ExportResponses.gs   # Export form responses to JSON
├── ImportQuiz.gs        # Create/update forms from quiz JSON
├── ImportGrades.gs      # Import grades back to form
└── README.md
```

## Setup (with Claude Code)

This setup is designed to be done with Claude Code assisting. Claude can run most commands and provide direct URLs for browser steps.

### What We're Setting Up

Google Apps Script runs in Google's cloud, not locally. We need to:
1. **Install clasp** - Google's CLI tool to push code to Apps Script
2. **Authenticate** - Link clasp to your Google account (browser required)
3. **Create project** - Create an Apps Script project in your Google account
4. **Push code** - Upload the `.gs` files from this repo to Google
5. **Authorize** - Grant the script permission to access Google Forms (browser required)

### Step 1: Install clasp

**What**: Install Google's command-line tool for Apps Script.

```bash
npm install -g @google/clasp
```

### Step 2: Login to Google

**What**: Authenticate clasp with your Google account. This opens a browser for OAuth.

```bash
clasp login
```

If you see "Apps Script API has not been used" or similar, enable it at:
https://script.google.com/home/usersettings (toggle "Google Apps Script API" ON)

### Step 3: Create Apps Script Project

**What**: Create a new Apps Script project in your Google account. This generates a `.clasp.json` file with a unique script ID.

```bash
# From the google-forms-bridge directory
clasp create --type standalone --title "Research Notebook Forms Bridge"
```

**Note for Claude**: After this step, read `.clasp.json` to get the script ID for providing direct URLs.

### Step 4: Push Code

**What**: Upload all the `.gs` files to your Apps Script project.

```bash
clasp push
```

Then deploy:

```bash
clasp deploy --description "v1"
```

### Step 5: First Run (Authorization)

**What**: The first time you run a function, Google asks you to authorize the script to access Forms. This must be done in the browser.

Open the Apps Script editor:
```
https://script.google.com/d/YOUR_SCRIPT_ID/edit
```

**Claude can provide the exact URL** by reading `.clasp.json` and substituting the script ID.

In the browser:
1. Select **`testCreateForm`** from the function dropdown (top bar)
2. Click **Run**
3. Click "Review permissions" when prompted
4. Choose your Google account
5. Click "Advanced" → "Go to Research Notebook Forms Bridge (unsafe)"
6. Click "Allow"

The test function creates a simple quiz form. Check the **Execution log** (bottom panel) for the result, which includes the new form's URL.

## Usage

### Running Functions

There are two ways to run the bridge functions:

#### Option A: Browser (Recommended)

Run functions directly in the Apps Script editor. This is more reliable than `clasp run`.

1. Open: `https://script.google.com/d/YOUR_SCRIPT_ID/edit`
2. Select function from dropdown
3. Click **Run**
4. View results in **Execution log**

For functions that need parameters (like a form ID), use the test wrapper functions or modify `Code.gs` to add a wrapper with hardcoded values.

#### Option B: clasp run (May Require Additional Setup)

```bash
clasp run functionName -p '["param1", "param2"]'
```

**Note**: `clasp run` requires the Apps Script API to be enabled and sometimes has issues with API executable deployment. If you get "Script function not found", use the browser method instead.

### Test Functions

These wrapper functions are included for easy testing:

| Function | Description |
|----------|-------------|
| `testExportForm()` | Export form (edit Code.gs to set form ID) |
| `testCreateForm()` | Create a sample quiz form |

### Export Form Structure

Export a Google Form as quiz-compatible JSON:

**Browser**: Run `testExportForm()` (after setting form ID in Code.gs)

**CLI**:
```bash
clasp run exportForm -p '["FORM_ID"]'
```

**Getting the Form ID**: From the form's edit URL:
```
https://docs.google.com/forms/d/FORM_ID_HERE/edit
                                 ^^^^^^^^^^^
```

**Output**:
```json
{
  "title": "Photosynthesis Quiz",
  "description": "Test your knowledge...",
  "questions": [
    {
      "type": "multiple_choice",
      "question": "What gas do plants absorb?",
      "options": ["Oxygen", "Carbon Dioxide", "Nitrogen"],
      "correct": 1,
      "points": 1
    },
    {
      "type": "worked",
      "question": "Explain the process of photosynthesis.",
      "points": 5
    }
  ],
  "_import": {
    "source": "google_forms",
    "formId": "1FAIpQLSe...",
    "formUrl": "https://docs.google.com/forms/d/.../edit",
    "isQuiz": true,
    "importedAt": "2025-01-15T10:00:00.000Z",
    "warnings": []
  }
}
```

**Type mapping (Google Forms → Quiz)**:
| Google Forms | Quiz Schema |
|--------------|-------------|
| Multiple Choice (radio) | `multiple_choice` |
| Checkboxes | `checkbox` |
| Dropdown | `dropdown` |
| Short Answer | `short_answer` |
| Paragraph | `worked` |
| Linear Scale | `scale` |
| Multiple Choice Grid | `grid` |
| Checkbox Grid | `grid` (with warning) |
| Date/Time/Duration | `short_answer` (with warning) |

### Create Form from Quiz

Create a new Google Form from quiz JSON:

**Browser**: Run `testCreateForm()` or create a wrapper with your quiz data

**CLI**:
```bash
clasp run createForm -p '[{
  "title": "Photosynthesis Quiz",
  "description": "Test your knowledge of plant biology",
  "questions": [
    {
      "type": "multiple_choice",
      "question": "What gas do plants absorb during photosynthesis?",
      "options": ["Oxygen", "Carbon Dioxide", "Nitrogen", "Hydrogen"],
      "correct": 1,
      "points": 1
    }
  ]
}]'
```

**Output**:
```json
{
  "formId": "1FAIpQLSe...",
  "editUrl": "https://docs.google.com/forms/d/.../edit",
  "publishedUrl": "https://docs.google.com/forms/d/.../viewform",
  "questionCount": 1,
  "warnings": []
}
```

**Type mapping (Quiz → Google Forms)**:
| Quiz Schema | Google Forms |
|-------------|--------------|
| `multiple_choice` | Multiple Choice (radio) |
| `checkbox` | Checkboxes |
| `dropdown` | Dropdown |
| `short_answer` | Short Answer |
| `worked` | Paragraph |
| `numeric` | Short Answer (with warning) |
| `scale` | Linear Scale |
| `grid` | Multiple Choice Grid |

### Update Existing Form

Update an existing form (replaces all questions):

```bash
clasp run updateForm -p '["FORM_ID", {...quizJSON}]'
```

**Warning**: This deletes all existing questions and recreates them from the JSON.

### Export Responses

Export all student responses from a form:

```bash
clasp run exportResponses -p '["FORM_ID"]'
```

**Output**:
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

## Functions Reference

| Function | Description |
|----------|-------------|
| `exportForm(formId)` | Export form structure as quiz JSON |
| `createForm(quizJSON)` | Create new form from quiz JSON |
| `updateForm(formId, quizJSON)` | Update form from quiz JSON (replaces questions) |
| `exportResponses(formId)` | Export all responses as JSON |
| `importGrades(formId, grades)` | Import grades to form |
| `getFormMetadata(formId)` | Get questions without responses |
| `testAccess(formId)` | Verify form access |
| `testExportForm()` | Test wrapper for exportForm |
| `testCreateForm()` | Test wrapper for createForm |

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
Import existing form:
1. Export Google Form structure            → run exportForm in browser
2. Create quiz card from JSON              → .quiz.json file
3. Teacher adds rubrics/model answers      → Edit in notebook

Create new quiz:
1. Teacher creates quiz in notebook        → .quiz.json file
2. Create Google Form from quiz            → run createForm in browser

Collect and grade:
3. Students take quiz                      → Google Forms
4. Export responses                        → run exportResponses
5. Create roster (anonymize)               → python manage_roster.py create responses.json
6. Create response cards                   → s001.response.json, s002.response.json, ...
7. AI grades responses                     → python grade_responses.py
8. Teacher reviews in notebook             → Approve/edit grades
9. Import grades to Forms                  → run importGrades
10. Students view grades                   → Google Forms
```

## Troubleshooting

### "Script function not found"

The `clasp run` command requires API executable deployment, which can be finicky. Use the browser method instead:
1. Open the script editor URL
2. Select the function from the dropdown
3. Click Run
4. View results in Execution log

### "Form is not in quiz mode"

Enable quiz mode: Form settings → Quizzes → Make this a quiz

### "Response not found"

Response IDs must match exactly. Export responses again to get current IDs.

### Permission errors

Re-run `clasp login` and ensure you have edit access to the form.

### Authorization errors

If you see "This app isn't verified", click "Advanced" → "Go to ... (unsafe)" → "Allow". This is expected for personal Apps Script projects.

## Development

### Push Changes

```bash
clasp push
```

### View in Browser

Get the script URL:
```bash
cat .clasp.json
# Then open: https://script.google.com/d/SCRIPT_ID/edit
```

### View Logs

In browser: View → Logs, or check Execution log after running a function

---

## Notes for Claude Code

When assisting users with Google Forms bridge setup:

1. **Run what you can**: `clasp push`, `clasp deploy`, reading `.clasp.json`
2. **Provide full URLs**: After reading `.clasp.json`, give the user the complete script editor URL
3. **Explain each step**: Users benefit from understanding what's happening (creating project in Google, pushing code, etc.)
4. **Use browser method**: Recommend running functions in the browser rather than `clasp run` - it's more reliable
5. **Add test wrappers**: If the user needs to test with specific form IDs, add `testXxx()` functions to Code.gs with hardcoded values, then push
6. **Handle authorization**: The first run requires browser authorization - guide users through the "unsafe app" flow

### Quick Reference for Claude

```bash
# Get script ID for URLs
cat google-forms-bridge/.clasp.json

# Push code changes
cd google-forms-bridge && clasp push

# Deploy
clasp deploy --description "v1"

# Script editor URL template
https://script.google.com/d/{scriptId}/edit
```
