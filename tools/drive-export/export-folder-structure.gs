/**
 * Google Apps Script: Export Drive Folder Structure
 *
 * Exports a Google Drive folder hierarchy as JSON, including file URLs.
 * Designed for bootstrapping a Research Notebook from existing Drive materials.
 *
 * Usage:
 * 1. Open script.google.com
 * 2. Create a new project and paste this code
 * 3. Set ROOT_FOLDER_ID to your folder's ID
 * 4. Run exportFolderStructure()
 * 5. Check the Logs (View > Logs) for the JSON output
 *
 * The folder ID is in the URL when viewing a folder:
 * https://drive.google.com/drive/folders/FOLDER_ID_HERE
 */

// ============================================================
// CONFIGURATION - Set this to your folder ID
// ============================================================
const ROOT_FOLDER_ID = 'YOUR_FOLDER_ID_HERE';

// ============================================================
// MAIN FUNCTION
// ============================================================

/**
 * Main entry point - exports folder structure and logs JSON
 */
function exportFolderStructure() {
  try {
    const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const result = scanFolder(folder, '');

    // Add metadata
    const output = {
      exportedAt: new Date().toISOString(),
      rootFolderId: ROOT_FOLDER_ID,
      rootFolderName: folder.getName(),
      structure: result
    };

    const json = JSON.stringify(output, null, 2);

    // Log for viewing (View > Logs)
    console.log('Export complete! Copy the JSON below:');
    console.log('---BEGIN JSON---');
    console.log(json);
    console.log('---END JSON---');

    // Also create a file in the root folder for easy download
    const blob = Utilities.newBlob(json, 'application/json', 'drive-export.json');
    folder.createFile(blob);
    console.log('\nAlso saved as drive-export.json in the root folder.');

    return output;
  } catch (e) {
    console.error('Error: ' + e.message);
    console.error('Make sure ROOT_FOLDER_ID is set correctly.');
    throw e;
  }
}

/**
 * Alternative: Export to a Google Sheet for easier viewing
 */
function exportToSheet() {
  const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const result = scanFolder(folder, '');

  // Create a new spreadsheet
  const ss = SpreadsheetApp.create('Drive Export - ' + folder.getName());
  const sheet = ss.getActiveSheet();

  // Headers
  sheet.appendRow(['Path', 'Name', 'Type', 'MimeType', 'URL', 'Size']);

  // Flatten and write
  flattenToRows(result, '').forEach(row => sheet.appendRow(row));

  console.log('Spreadsheet created: ' + ss.getUrl());
  return ss.getUrl();
}

// ============================================================
// SCANNING FUNCTIONS
// ============================================================

/**
 * Recursively scan a folder and return its structure
 */
function scanFolder(folder, path) {
  const result = {
    name: folder.getName(),
    path: path || folder.getName(),
    type: 'folder',
    children: [],
    files: []
  };

  // Scan files
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    result.files.push(scanFile(file));
  }

  // Scan subfolders
  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    const subPath = path ? path + '/' + subfolder.getName() : subfolder.getName();
    result.children.push(scanFolder(subfolder, subPath));
  }

  // Sort for consistency
  result.files.sort((a, b) => a.name.localeCompare(b.name));
  result.children.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}

/**
 * Extract file metadata
 */
function scanFile(file) {
  const mimeType = file.getMimeType();

  return {
    name: file.getName(),
    mimeType: mimeType,
    url: file.getUrl(),
    size: file.getSize(),
    category: categorizeFile(mimeType, file.getName())
  };
}

/**
 * Categorize files for easier processing
 */
function categorizeFile(mimeType, name) {
  // Google Workspace files
  if (mimeType === 'application/vnd.google-apps.presentation') return 'slides';
  if (mimeType === 'application/vnd.google-apps.document') return 'doc';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'sheet';
  if (mimeType === 'application/vnd.google-apps.form') return 'form';

  // Audio
  if (mimeType.startsWith('audio/')) return 'audio';

  // PDF/documents
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('word')) return 'doc';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'slides';

  // Images
  if (mimeType.startsWith('image/')) return 'image';

  // Video
  if (mimeType.startsWith('video/')) return 'video';

  return 'other';
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Flatten folder structure to rows for spreadsheet export
 */
function flattenToRows(node, parentPath) {
  const rows = [];
  const currentPath = parentPath ? parentPath + '/' + node.name : node.name;

  // Add folder row
  rows.push([currentPath, node.name, 'folder', '', '', '']);

  // Add file rows
  node.files.forEach(file => {
    rows.push([
      currentPath + '/' + file.name,
      file.name,
      file.category,
      file.mimeType,
      file.url,
      file.size
    ]);
  });

  // Recurse into children
  node.children.forEach(child => {
    rows.push(...flattenToRows(child, currentPath));
  });

  return rows;
}

/**
 * Quick test - just logs folder name to verify access
 */
function testAccess() {
  try {
    const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    console.log('Success! Folder name: ' + folder.getName());
  } catch (e) {
    console.error('Cannot access folder. Check the ID and permissions.');
    console.error('Error: ' + e.message);
  }
}
