# Google Drive Export Tool

Export your Google Drive folder structure as JSON for bootstrapping a Research Notebook.

## Why Apps Script?

This approach runs **within your school's Google Workspace**, avoiding:
- OAuth complexity with external apps
- School IT restrictions on third-party access
- Data sovereignty concerns (nothing leaves Google's servers)

## Quick Start

### 1. Copy the Script

Open [script.google.com](https://script.google.com) and create a new project:

1. Click **New project**
2. Delete the placeholder code
3. Copy the entire contents of `export-folder-structure.gs` and paste it in
4. Save the project (give it a name like "Drive Export")

### 2. Get Your Folder ID

Navigate to your class folder in Google Drive. The folder ID is in the URL:

```
https://drive.google.com/drive/folders/1ABC123XYZ789...
                                        ^^^^^^^^^^^^^^^^
                                        This is your folder ID
```

### 3. Configure the Script

At the top of the script, replace `YOUR_FOLDER_ID_HERE`:

```javascript
const ROOT_FOLDER_ID = '1ABC123XYZ789...';  // Your actual folder ID
```

### 4. Run the Export

1. Click **Run** (or select `exportFolderStructure` from the dropdown and click Run)
2. First time: Grant permissions when prompted
   - Click "Review permissions"
   - Choose your account
   - Click "Allow"
3. Wait for completion
4. Check **View > Logs** for the JSON output

### 5. Get the Output

Two options:

**Option A: Copy from Logs**
- View > Logs shows the JSON between `---BEGIN JSON---` and `---END JSON---`
- Copy and save as `drive-export.json`

**Option B: Download the File**
- The script also saves `drive-export.json` in your root folder
- Download it from Drive

## Output Format

```json
{
  "exportedAt": "2025-01-01T10:00:00.000Z",
  "rootFolderId": "1ABC...",
  "rootFolderName": "Class 7K",
  "structure": {
    "name": "Class 7K",
    "path": "Class 7K",
    "type": "folder",
    "children": [
      {
        "name": "Module 1 - La Rentree",
        "path": "Class 7K/Module 1 - La Rentree",
        "type": "folder",
        "children": [...],
        "files": [
          {
            "name": "teacher-slides",
            "mimeType": "application/vnd.google-apps.presentation",
            "url": "https://docs.google.com/presentation/d/...",
            "size": 0,
            "category": "slides"
          }
        ]
      }
    ],
    "files": []
  }
}
```

### File Categories

Files are categorized for easier processing:

| Category | MIME Types |
|----------|-----------|
| `slides` | Google Slides, PowerPoint |
| `doc` | Google Docs, Word |
| `sheet` | Google Sheets, Excel |
| `form` | Google Forms |
| `audio` | MP3, WAV, etc. |
| `pdf` | PDF documents |
| `image` | PNG, JPG, etc. |
| `video` | MP4, etc. |
| `other` | Everything else |

## Alternative: Export to Spreadsheet

If you prefer a spreadsheet view:

1. Select `exportToSheet` from the function dropdown
2. Click Run
3. A new Google Sheet is created with all files listed

The sheet has columns: Path, Name, Type, MimeType, URL, Size

## Importing into Research Notebook

Once you have `drive-export.json`:

1. Copy it to your notebook directory
2. Run `/import-drive-structure` (see skill documentation)
3. The skill creates:
   - Section directories matching your Drive folders
   - Lesson cards with Drive links pre-populated

## Troubleshooting

### "Cannot access folder"
- Check the folder ID is correct
- Make sure you have access to the folder
- Try `testAccess()` function first

### "Authorization required"
- You must grant the script permission to access Drive
- This is safe - the script only reads, never modifies

### Script times out
- Large folders may take a while
- Google Apps Script has a 6-minute limit
- For very large folders, export in parts

### "Exceeded maximum execution time"
- Export subfolder by subfolder
- Or use `exportToSheet` which may be faster

## Privacy Note

This script:
- Only reads folder/file metadata
- Does NOT access file contents
- Does NOT send data anywhere outside Google
- Runs entirely within your Google account
