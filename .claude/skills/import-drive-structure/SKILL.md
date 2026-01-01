---
name: import-drive-structure
description: Bootstrap a notebook from Google Drive export. Creates sections and lesson cards with Drive links. Use after running the Drive export Apps Script. (project)
---

# Import Drive Structure

Bootstrap a Research Notebook from a Google Drive folder export. Creates section directories and lesson cards with Drive links pre-populated.

## Prerequisites

1. Run the Google Apps Script export (see `tools/drive-export/README.md`)
2. Save the output as `drive-export.json` in your notebook directory

## Usage

```
/import-drive-structure [options]
```

**Options:**
- `--file PATH` - Path to export JSON (default: `drive-export.json` in notebook root)
- `--dry-run` - Preview what would be created without writing files
- `--year YYYY` - Academic year prefix for directories (e.g., `2024-25`)

## What It Does

Given a Drive export with this structure:

```
Class 7K/
├── Module 1 - La Rentree/
│   ├── 1.1 Point de Depart/
│   │   ├── teacher-slides.gslides
│   │   ├── student-slides.gslides
│   │   └── audio.mp3
│   └── 1.2 Ma Famille/
│       └── ...
└── Module 2 - .../
```

The skill creates:

```
notebook/
├── 2024-25/                          # Optional year wrapper
│   └── class-7k/                     # Section from root folder
│       └── module-1-la-rentree/      # Subdirectory
│           ├── 1.1-point-de-depart.lesson.yaml
│           └── 1.2-ma-famille.lesson.yaml
```

Each lesson card includes:
- `number`: Extracted from folder name (e.g., "1.1")
- `title`: Folder name without number
- `teacher_slides`: URL to slides file
- `student_slides`: URL to student version (if separate)
- `audio`: URL to audio files
- `handout`: URL to PDF files

## Mapping Rules

### Folder → Section/Subdirectory

| Drive Folder | Notebook Path |
|-------------|---------------|
| `Class 7K/` | `class-7k/` (section) |
| `Module 1 - La Rentree/` | `module-1-la-rentree/` (subdirectory) |
| `1.1 Point de Depart/` | `1.1-point-de-depart.lesson.yaml` (card) |

**Conversion:**
- Lowercase
- Spaces → hyphens
- Strip special characters except hyphens and dots

### File → Lesson Field

Files are matched to lesson fields by name/category:

| Pattern | Field |
|---------|-------|
| `*teacher*` + slides | `teacher_slides` |
| `*student*` + slides | `student_slides` |
| Audio files | `audio` |
| PDF files | `handout` |

### Lesson Number Detection

Folder names starting with numbers are treated as lessons:
- `1.1 Point de Depart` → number: "1.1", title: "Point de Depart"
- `01 - Introduction` → number: "01", title: "Introduction"
- `Lesson 3 - Grammar` → number: "3", title: "Grammar"

Folders without numbers become subdirectories (not lesson cards).

## Workflow

### Step 1: Export from Drive

Follow `tools/drive-export/README.md` to run the Apps Script and save `drive-export.json`.

### Step 2: Preview Import

```bash
# Dry run to see what would be created
/import-drive-structure --dry-run
```

Output shows:
- Directories to create
- Lesson cards to generate
- Files that couldn't be matched
- Naming inconsistencies

### Step 3: Run Import

```bash
# Create the structure
/import-drive-structure
```

### Step 4: Review and Adjust

After import:
1. Open notebook in browser to verify cards render
2. Edit lesson cards to add objectives, vocab, grammar
3. Fix any naming issues flagged during import

## Handling Edge Cases

### Assessment Folders

Folders named `Assessment/` or `Test/` are treated specially:
- Don't become lessons
- Files logged for manual review
- Future: May become quiz cards

### Multiple Classes

If exporting multiple class folders:

```bash
# Export each class separately
/import-drive-structure --file class-7k-export.json
/import-drive-structure --file class-8x-export.json
```

### Duplicate Detection

If a lesson card already exists:
- Skip creation (don't overwrite)
- Log a warning

Use `--force` to overwrite existing files.

## Example Output

Given `drive-export.json`:

```json
{
  "rootFolderName": "Class 7K",
  "structure": {
    "name": "Class 7K",
    "children": [
      {
        "name": "Module 1 - La Rentree",
        "children": [
          {
            "name": "1.1 Point de Depart",
            "files": [
              {"name": "teacher-slides", "category": "slides", "url": "https://..."},
              {"name": "student-slides", "category": "slides", "url": "https://..."},
              {"name": "listening.mp3", "category": "audio", "url": "https://..."}
            ]
          }
        ]
      }
    ]
  }
}
```

Creates `class-7k/module-1-la-rentree/1.1-point-de-depart.lesson.yaml`:

```yaml
id: lesson-1735689600000
number: "1.1"
title: Point de Depart
status: planned

teacher_slides: https://docs.google.com/presentation/d/...
student_slides: https://docs.google.com/presentation/d/...
audio: https://drive.google.com/file/d/...

objectives: []
vocab: []
grammar: ""
notes: ""

created: 2025-01-01T10:00:00Z
modified: 2025-01-01T10:00:00Z
```

## Troubleshooting

### "No drive-export.json found"
- Run the Apps Script first
- Check the file is in the notebook root

### "Invalid JSON"
- Verify the export completed successfully
- Check for truncation if copied from logs

### Files not matching to fields
- Check file naming conventions
- Run with `--dry-run` to see matching logic
- Manually edit lesson cards after import

## Implementation Notes

This skill is implemented by Claude reading the JSON and using Write/Bash tools to create files. No external dependencies required.

Key functions:
1. Parse drive-export.json
2. Walk folder tree, identify lesson folders vs subdirectories
3. Match files to lesson fields
4. Generate .lesson.yaml content
5. Create directories and files
