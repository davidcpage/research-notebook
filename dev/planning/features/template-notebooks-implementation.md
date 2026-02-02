# URL-Based Notebooks: Implementation Plan

Detailed implementation plan for [template-notebooks.md](./template-notebooks.md).

## Overview

Enable loading notebooks from GitHub repos or URLs, with multi-notebook support via named handles.

**URL Scheme:**
```
?github=user/repo@branch/path    → GitHub via jsDelivr
?url=https://host.com/notebook   → Self-hosted with manifest
?notebook=my-research            → Local (named handle)
/                                → Landing page (future)
```

---

## Phase 1: Core Infrastructure

### 1.1 New State Variables

**Location:** `js/app.js` STATE_AND_CONFIG section (~line 400)

```javascript
// Add after existing state variables
let viewMode = 'filesystem';  // 'filesystem' | 'remote'
let remoteSource = null;      // { type: 'github'|'url', path?: string, url?: string }
```

### 1.2 Named Handle Registry

**Location:** `js/app.js` FILESYSTEM_STORAGE section (~line 6060)

Replace single handle storage with named registry:

```javascript
// Change from:
const IDB_DIR_HANDLE_KEY = 'notebookDirHandle';

// To:
const IDB_HANDLES_STORE = 'notebook-handles';
const IDB_LEGACY_HANDLE_KEY = 'notebookDirHandle';  // For migration

// Add new functions after existing saveDirHandle/loadDirHandle:

// Save a named handle to IndexedDB
async function saveNamedHandle(name, handle) {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(IDB_HANDLES_STORE);
        await store.put(handle, name);
        await tx.complete;
        console.log(`[Filesystem] Saved handle for "${name}"`);
    } catch (err) {
        console.error('[Filesystem] Failed to save named handle:', err);
    }
}

// Get a named handle from IndexedDB
async function getNamedHandle(name) {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_HANDLES_STORE, 'readonly');
        const store = tx.objectStore(IDB_HANDLES_STORE);
        return await store.get(name);
    } catch (err) {
        console.error('[Filesystem] Failed to get named handle:', err);
        return null;
    }
}

// List all named handles
async function listNamedHandles() {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_HANDLES_STORE, 'readonly');
        const store = tx.objectStore(IDB_HANDLES_STORE);
        return await store.getAllKeys();
    } catch (err) {
        console.error('[Filesystem] Failed to list handles:', err);
        return [];
    }
}

// Delete a named handle
async function deleteNamedHandle(name) {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(IDB_HANDLES_STORE);
        await store.delete(name);
        await tx.complete;
        console.log(`[Filesystem] Deleted handle for "${name}"`);
    } catch (err) {
        console.error('[Filesystem] Failed to delete handle:', err);
    }
}
```

### 1.3 IndexedDB Schema Update

**Location:** `js/app.js` `openDB()` function (~line 5996)

Add the new object store:

```javascript
async function openDB() {
    return new Promise((resolve, reject) => {
        // Increment version to trigger upgrade
        const request = indexedDB.open(DB_NAME, 2);  // was 1

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Existing store
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }

            // New store for named handles
            if (!db.objectStoreNames.contains(IDB_HANDLES_STORE)) {
                db.createObjectStore(IDB_HANDLES_STORE);
            }
        };
    });
}
```

### 1.4 Migration from Legacy Handle

**Location:** `js/app.js` new function in FILESYSTEM_STORAGE section

```javascript
// Migrate legacy single handle to named registry
async function migrateLegacyHandle() {
    try {
        const db = await openDB();

        // Check for legacy handle
        const tx1 = db.transaction(STORE_NAME, 'readonly');
        const store1 = tx1.objectStore(STORE_NAME);
        const legacyHandle = await store1.get(IDB_LEGACY_HANDLE_KEY);

        if (legacyHandle) {
            // Migrate to named registry using folder name
            const name = legacyHandle.name;
            await saveNamedHandle(name, legacyHandle);

            // Remove legacy entry
            const tx2 = db.transaction(STORE_NAME, 'readwrite');
            const store2 = tx2.objectStore(STORE_NAME);
            await store2.delete(IDB_LEGACY_HANDLE_KEY);
            await tx2.complete;

            console.log(`[Filesystem] Migrated legacy handle to "${name}"`);
            return { name, handle: legacyHandle };
        }
    } catch (err) {
        console.error('[Filesystem] Migration failed:', err);
    }
    return null;
}
```

---

## Phase 2: Remote Loading

### 2.1 GitHub Loading via jsDelivr

**Location:** `js/app.js` new section after FILESYSTEM_STORAGE (~line 6100)

```javascript
// ========== SECTION: REMOTE_LOADING ==========
// Functions: parseGitHubPath, loadNotebookFromGitHub, loadNotebookFromUrl,
//            isNotebookFile, parseFilesToNotebook

// Parse GitHub path: "user/repo", "user/repo@branch", "user/repo@branch/path"
function parseGitHubPath(githubPath) {
    // Handle: user/repo@branch/path/to/notebook
    const atIndex = githubPath.indexOf('@');
    let userRepo, branchAndPath;

    if (atIndex === -1) {
        userRepo = githubPath;
        branchAndPath = 'main';
    } else {
        userRepo = githubPath.substring(0, atIndex);
        branchAndPath = githubPath.substring(atIndex + 1);
    }

    const [user, repo] = userRepo.split('/');

    // Split branch from path
    const slashIndex = branchAndPath.indexOf('/');
    let branch, path;

    if (slashIndex === -1) {
        branch = branchAndPath;
        path = '';
    } else {
        branch = branchAndPath.substring(0, slashIndex);
        path = branchAndPath.substring(slashIndex + 1);
    }

    // Ensure path ends with / if not empty
    if (path && !path.endsWith('/')) {
        path = path + '/';
    }

    return { user, repo, branch, path };
}

// Check if a file should be included in notebook loading
function isNotebookFile(filePath) {
    // Exclude common non-notebook files
    if (filePath.includes('node_modules/')) return false;
    if (filePath.includes('.git/')) return false;
    if (filePath.endsWith('.output.html')) return false;
    if (filePath.startsWith('.github/')) return false;

    // Include known notebook file types
    const validExtensions = [
        '.md', '.yaml', '.yml', '.json', '.css',
        '.code.py', '.code.js', '.code.r',
        '.bookmark.json', '.quiz.json', '.lesson.yaml',
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'
    ];

    return validExtensions.some(ext => filePath.endsWith(ext));
}

// Load notebook from GitHub via jsDelivr
async function loadNotebookFromGitHub(githubPath) {
    const { user, repo, branch, path } = parseGitHubPath(githubPath);

    console.log(`[Remote] Loading from GitHub: ${user}/${repo}@${branch}/${path}`);

    // Get file listing from jsDelivr API
    const listUrl = `https://data.jsdelivr.com/v1/package/gh/${user}/${repo}@${branch}`;
    const response = await fetch(listUrl);

    if (!response.ok) {
        throw new Error(`Failed to list GitHub repo: ${response.status} ${response.statusText}`);
    }

    const packageData = await response.json();

    // jsDelivr returns nested structure, flatten it
    const allFiles = flattenJsDelivrFiles(packageData.files, '');

    // Filter to notebook path and relevant files
    const notebookFiles = allFiles
        .filter(f => path === '' || f.startsWith(path))
        .filter(f => isNotebookFile(f))
        .map(f => path ? f.substring(path.length) : f);

    console.log(`[Remote] Found ${notebookFiles.length} notebook files`);

    // Fetch content from jsDelivr CDN
    const baseUrl = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${path}`;

    const fileContents = await Promise.all(
        notebookFiles.map(async (filePath) => {
            const url = baseUrl + filePath;
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[Remote] Failed to fetch ${filePath}: ${response.status}`);
                return null;
            }
            const content = await response.text();
            return { path: filePath, content };
        })
    );

    // Filter out failed fetches
    const validFiles = fileContents.filter(f => f !== null);

    return parseFilesToNotebook(validFiles);
}

// Flatten jsDelivr's nested file structure
function flattenJsDelivrFiles(files, prefix) {
    const result = [];

    for (const file of files) {
        const fullPath = prefix + file.name;

        if (file.type === 'file') {
            result.push(fullPath);
        } else if (file.type === 'directory' && file.files) {
            result.push(...flattenJsDelivrFiles(file.files, fullPath + '/'));
        }
    }

    return result;
}
```

### 2.2 URL Loading (Self-Hosted)

**Location:** `js/app.js` REMOTE_LOADING section

```javascript
// Load notebook from URL with manifest.json
async function loadNotebookFromUrl(baseUrl) {
    // Normalize URL
    const url = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

    console.log(`[Remote] Loading from URL: ${url}`);

    // Fetch manifest
    const manifestUrl = `${url}.notebook/manifest.json`;
    const manifestResponse = await fetch(manifestUrl);

    if (!manifestResponse.ok) {
        throw new Error(`Failed to fetch manifest: ${manifestResponse.status}. ` +
            `Make sure ${manifestUrl} exists and CORS is enabled.`);
    }

    const manifest = await manifestResponse.json();

    if (!manifest.files || !Array.isArray(manifest.files)) {
        throw new Error('Invalid manifest: expected { files: [...] }');
    }

    console.log(`[Remote] Manifest lists ${manifest.files.length} files`);

    // Fetch all files
    const fileContents = await Promise.all(
        manifest.files.map(async (filePath) => {
            const fileUrl = url + filePath;
            const response = await fetch(fileUrl);
            if (!response.ok) {
                console.warn(`[Remote] Failed to fetch ${filePath}: ${response.status}`);
                return null;
            }
            const content = await response.text();
            return { path: filePath, content };
        })
    );

    const validFiles = fileContents.filter(f => f !== null);

    return parseFilesToNotebook(validFiles);
}
```

### 2.3 Parse Files to Notebook

**Location:** `js/app.js` REMOTE_LOADING section

This reuses existing parsing logic but from fetched content instead of filesystem:

```javascript
// Parse array of {path, content} into notebook data structure
function parseFilesToNotebook(files) {
    const notebook = {
        title: 'Untitled Notebook',
        subtitle: '',
        sections: []
    };

    // Group files by section (first directory component)
    const sectionMap = new Map();

    for (const file of files) {
        const { path, content } = file;

        // Determine section from path
        const parts = path.split('/');
        let sectionSlug, relativePath;

        if (parts[0] === '.notebook') {
            sectionSlug = '.notebook';
            relativePath = parts.slice(1).join('/');
        } else if (parts.length === 1) {
            // Root file
            sectionSlug = '.';
            relativePath = parts[0];
        } else {
            sectionSlug = parts[0];
            relativePath = parts.slice(1).join('/');
        }

        if (!sectionMap.has(sectionSlug)) {
            sectionMap.set(sectionSlug, []);
        }
        sectionMap.get(sectionSlug).push({ path, relativePath, content });
    }

    // Parse settings first if present
    const notebookFiles = sectionMap.get('.notebook') || [];
    const settingsFile = notebookFiles.find(f => f.relativePath === 'settings.yaml');

    let settings = {};
    if (settingsFile) {
        try {
            settings = jsyaml.load(settingsFile.content) || {};
            notebook.title = settings.notebook_title || notebook.title;
            notebook.subtitle = settings.notebook_subtitle || '';
        } catch (err) {
            console.warn('[Remote] Failed to parse settings.yaml:', err);
        }
    }

    // Build sections
    for (const [sectionSlug, sectionFiles] of sectionMap) {
        const sectionId = `section-${sectionSlug}`;

        // Get section name from settings or derive from slug
        let sectionName = sectionSlug;
        if (settings.sections) {
            const sectionConfig = settings.sections.find(s =>
                s.dir === sectionSlug || s.name === sectionSlug
            );
            if (sectionConfig) {
                sectionName = sectionConfig.name || sectionSlug;
            }
        }

        const section = {
            id: sectionId,
            name: sectionName,
            visible: !sectionSlug.startsWith('.'),
            items: []
        };

        // Parse each file into a card
        for (const file of sectionFiles) {
            const card = parseFileToCard(file.path, file.relativePath, file.content);
            if (card) {
                section.items.push(card);
            }
        }

        // Sort items
        sortSectionItems(section.items);

        notebook.sections.push(section);
    }

    return notebook;
}

// Parse a single file into a card object
function parseFileToCard(fullPath, relativePath, content) {
    const filename = relativePath.split('/').pop();

    // Determine type from extension
    if (filename.endsWith('.md') && !filename.endsWith('.code.md')) {
        return parseMarkdownToCard(fullPath, content);
    } else if (filename.endsWith('.code.py') || filename.endsWith('.code.js')) {
        return parseCodeToCard(fullPath, content);
    } else if (filename.endsWith('.bookmark.json')) {
        return parseJsonToCard(fullPath, content, 'bookmark');
    } else if (filename.endsWith('.quiz.json')) {
        return parseJsonToCard(fullPath, content, 'quiz');
    } else if (filename.endsWith('.lesson.yaml')) {
        return parseYamlToCard(fullPath, content, 'lesson');
    } else if (filename === 'settings.yaml') {
        return parseYamlToCard(fullPath, content, 'settings');
    } else if (filename === 'theme.css') {
        return { type: 'theme', _path: fullPath, content, system: true };
    }

    // Skip unknown file types
    return null;
}

// Helper functions to parse different file formats
// These should reuse existing parsing logic from FILESYSTEM_STORAGE section

function parseMarkdownToCard(path, content) {
    // Reuse markdownToNote() logic
    const card = markdownToNote(content);
    card._path = path;
    return card;
}

function parseCodeToCard(path, content) {
    // Reuse fileToCode() logic
    const card = fileToCode(content, path);
    card._path = path;
    return card;
}

function parseJsonToCard(path, content, type) {
    try {
        const card = JSON.parse(content);
        card.type = type;
        card._path = path;
        return card;
    } catch (err) {
        console.warn(`[Remote] Failed to parse ${path}:`, err);
        return null;
    }
}

function parseYamlToCard(path, content, type) {
    try {
        const card = jsyaml.load(content) || {};
        card.type = type;
        card._path = path;
        return card;
    } catch (err) {
        console.warn(`[Remote] Failed to parse ${path}:`, err);
        return null;
    }
}
```

---

## Phase 3: URL Routing

### 3.1 Update init() Function

**Location:** `js/app.js` `init()` in EVENT_HANDLERS_AND_INIT section (~line 7500)

Replace the initialization logic:

```javascript
async function init() {
    console.log('[Init] Starting...');

    // Check for file:// protocol
    if (window.location.protocol === 'file:') {
        showFileProtocolError();
        return;
    }

    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const githubPath = params.get('github');
    const remoteUrl = params.get('url');
    const notebookName = params.get('notebook');

    // Load base assets (themes, card types)
    await loadBaseAssets();

    try {
        if (githubPath) {
            // Load from GitHub via jsDelivr
            console.log(`[Init] Loading GitHub notebook: ${githubPath}`);
            showLoadingIndicator('Loading from GitHub...');

            data = await loadNotebookFromGitHub(githubPath);
            viewMode = 'remote';
            remoteSource = { type: 'github', path: githubPath };

            hideLoadingIndicator();
            render();

        } else if (remoteUrl) {
            // Load from URL with manifest
            console.log(`[Init] Loading remote notebook: ${remoteUrl}`);
            showLoadingIndicator('Loading notebook...');

            data = await loadNotebookFromUrl(remoteUrl);
            viewMode = 'remote';
            remoteSource = { type: 'url', url: remoteUrl };

            hideLoadingIndicator();
            render();

        } else if (notebookName) {
            // Load local notebook by name
            console.log(`[Init] Loading local notebook: ${notebookName}`);

            const handle = await getNamedHandle(notebookName);
            if (!handle) {
                showNotebookNotFoundError(notebookName);
                return;
            }

            const hasPermission = await verifyDirPermission(handle);
            if (!hasPermission) {
                showPermissionRequiredModal(notebookName, handle);
                return;
            }

            notebookDirHandle = handle;
            filesystemLinked = true;
            viewMode = 'filesystem';

            data = await loadFromFilesystem(handle);
            render();

        } else {
            // No URL params - try to restore or show onboarding
            await initDefaultFlow();
        }

    } catch (err) {
        console.error('[Init] Failed to load notebook:', err);
        hideLoadingIndicator();
        showLoadError(err.message);
    }
}

// Default flow when no URL params
async function initDefaultFlow() {
    // First, migrate any legacy handle
    const migrated = await migrateLegacyHandle();

    // Try to restore last used notebook
    const handles = await listNamedHandles();

    if (handles.length > 0) {
        // Try the first (or most recent) handle
        const name = migrated?.name || handles[0];
        const handle = await getNamedHandle(name);

        if (handle) {
            const hasPermission = await verifyDirPermission(handle);
            if (hasPermission) {
                notebookDirHandle = handle;
                filesystemLinked = true;
                viewMode = 'filesystem';

                // Update URL to include notebook name
                history.replaceState(null, '', `?notebook=${encodeURIComponent(name)}`);

                data = await loadFromFilesystem(handle);
                render();
                return;
            }
        }
    }

    // No restorable notebook - show onboarding
    showOnboardingModal();
}
```

### 3.2 Error/Status UI Functions

**Location:** `js/app.js` EVENT_HANDLERS_AND_INIT section

```javascript
function showLoadingIndicator(message) {
    // Show a loading spinner overlay
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-message"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.querySelector('.loading-message').textContent = message;
    overlay.classList.add('visible');
}

function hideLoadingIndicator() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
    }
}

function showNotebookNotFoundError(name) {
    showModal({
        title: 'Notebook Not Found',
        message: `No notebook named "${name}" found. It may have been removed or renamed.`,
        buttons: [
            { label: 'Open Folder...', action: () => linkNotebookFolder() },
            { label: 'Close', action: () => {} }
        ]
    });
}

function showPermissionRequiredModal(name, handle) {
    showModal({
        title: 'Permission Required',
        message: `Please grant permission to access "${name}".`,
        buttons: [
            {
                label: 'Grant Access',
                action: async () => {
                    const permission = await handle.requestPermission({ mode: 'readwrite' });
                    if (permission === 'granted') {
                        location.reload();
                    }
                }
            },
            { label: 'Cancel', action: () => {} }
        ]
    });
}

function showLoadError(message) {
    showModal({
        title: 'Failed to Load Notebook',
        message: message,
        buttons: [
            { label: 'Try Again', action: () => location.reload() },
            { label: 'Open Folder...', action: () => linkNotebookFolder() }
        ]
    });
}
```

---

## Phase 4: Prompt-on-Edit Flow

### 4.1 Intercept Edit Actions

**Location:** `js/app.js` `openGenericEditor()` function in GENERIC_EDITOR section

Add check at the start of the function:

```javascript
async function openGenericEditor(card, sectionId) {
    // Check if we're in remote/read-only mode
    if (viewMode === 'remote') {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
        // After saving, continue to edit
    }

    // ... existing editor logic
}
```

### 4.2 Intercept Create Actions

**Location:** `js/app.js` `createNewCard()` or equivalent function

```javascript
async function createNewCard(type, sectionId) {
    if (viewMode === 'remote') {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
    }

    // ... existing create logic
}
```

### 4.3 Intercept Delete Actions

**Location:** `js/app.js` delete card handler

```javascript
async function deleteCard(card, sectionId) {
    if (viewMode === 'remote') {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
    }

    // ... existing delete logic
}
```

### 4.4 Prompt Save to Folder

**Location:** `js/app.js` new function in REMOTE_LOADING section

```javascript
// Prompt user to save remote notebook to local folder
async function promptSaveToFolder() {
    return new Promise((resolve) => {
        showModal({
            title: 'Save to Folder',
            message: 'This notebook is read-only. Save a copy to your computer to make changes.',
            buttons: [
                {
                    label: 'Choose Folder...',
                    primary: true,
                    action: async () => {
                        const saved = await saveRemoteToFolder();
                        resolve(saved);
                    }
                },
                {
                    label: 'Cancel',
                    action: () => resolve(false)
                }
            ]
        });
    });
}
```

---

## Phase 5: Save Remote to Folder

### 5.1 Deep Copy Function

**Location:** `js/app.js` REMOTE_LOADING section

```javascript
// Save current (remote) notebook to local folder
async function saveRemoteToFolder() {
    try {
        // Prompt for folder
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents'
        });

        showLoadingIndicator('Saving to folder...');

        // Create .notebook directory
        const notebookDir = await dirHandle.getDirectoryHandle('.notebook', { create: true });

        // Save settings
        if (data.settings) {
            await writeFileToHandle(notebookDir, 'settings.yaml',
                jsyaml.dump(data.settings));
        }

        // Save theme if present
        const themeSection = data.sections.find(s => s.id === 'section-.notebook');
        const themeCard = themeSection?.items.find(i => i.type === 'theme');
        if (themeCard?.content) {
            await writeFileToHandle(notebookDir, 'theme.css', themeCard.content);
        }

        // Save all content cards
        for (const section of data.sections) {
            // Skip system sections for directory creation
            if (section.id === 'section-.' || section.id === 'section-.notebook') {
                continue;
            }

            // Create section directory
            const sectionSlug = section.id.replace('section-', '');
            const sectionDir = await dirHandle.getDirectoryHandle(sectionSlug, { create: true });

            // Save each card
            for (const card of section.items) {
                await saveCardToHandle(sectionDir, card);
            }
        }

        // Save root files (README, CLAUDE.md)
        const rootSection = data.sections.find(s => s.id === 'section-.');
        if (rootSection) {
            for (const card of rootSection.items) {
                await saveCardToHandle(dirHandle, card);
            }
        }

        // Register named handle
        const name = dirHandle.name;
        await saveNamedHandle(name, dirHandle);

        // Switch to filesystem mode
        notebookDirHandle = dirHandle;
        filesystemLinked = true;
        viewMode = 'filesystem';
        remoteSource = null;

        // Update URL
        history.replaceState(null, '', `?notebook=${encodeURIComponent(name)}`);

        hideLoadingIndicator();
        showToast(`Saved to ${name}`);
        render();

        return true;

    } catch (err) {
        hideLoadingIndicator();

        if (err.name === 'AbortError') {
            // User cancelled picker
            return false;
        }

        console.error('[Remote] Failed to save to folder:', err);
        showToast('Failed to save: ' + err.message, 'error');
        return false;
    }
}

// Helper: write file to a directory handle
async function writeFileToHandle(dirHandle, filename, content) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}

// Helper: save a card to a directory handle
async function saveCardToHandle(dirHandle, card) {
    let filename, content;

    switch (card.type) {
        case 'note':
            filename = slugify(card.title) + '.md';
            content = noteToMarkdown(card);
            break;

        case 'code':
            const ext = card.language === 'python' ? 'py' : card.language || 'py';
            filename = slugify(card.title) + `.code.${ext}`;
            content = codeToFile(card);
            break;

        case 'bookmark':
            filename = slugify(card.title) + '.bookmark.json';
            content = JSON.stringify(card, null, 2);
            break;

        case 'quiz':
            filename = slugify(card.title) + '.quiz.json';
            content = JSON.stringify(card, null, 2);
            break;

        case 'lesson':
            filename = slugify(card.title) + '.lesson.yaml';
            content = jsyaml.dump(card);
            break;

        default:
            console.warn(`[Remote] Unknown card type: ${card.type}`);
            return;
    }

    await writeFileToHandle(dirHandle, filename, content);
}
```

---

## Phase 6: UI Updates

### 6.1 Remote Mode Indicator

**Location:** `js/app.js` `render()` function

Add visual indicator when viewing remote notebook:

```javascript
function render() {
    // ... existing render logic

    // Add remote mode banner if applicable
    renderRemoteBanner();
}

function renderRemoteBanner() {
    let banner = document.getElementById('remote-banner');

    if (viewMode === 'remote') {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'remote-banner';
            banner.className = 'remote-banner';
            document.querySelector('.notebook-container').prepend(banner);
        }

        const sourceLabel = remoteSource.type === 'github'
            ? `GitHub: ${remoteSource.path}`
            : remoteSource.url;

        banner.innerHTML = `
            <span class="remote-icon">📡</span>
            <span class="remote-label">Viewing: ${escapeHtml(sourceLabel)}</span>
            <span class="remote-hint">Read-only • Click edit to save a copy</span>
        `;
    } else if (banner) {
        banner.remove();
    }
}
```

### 6.2 CSS for Remote Mode

**Location:** `css/app.css`

```css
/* Remote notebook banner */
.remote-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--info-bg, #e7f3ff);
    border-bottom: 1px solid var(--info-border, #b3d7ff);
    font-size: 0.875rem;
}

.remote-icon {
    font-size: 1.1rem;
}

.remote-label {
    font-weight: 500;
    color: var(--text-primary);
}

.remote-hint {
    color: var(--text-secondary);
    margin-left: auto;
}

/* Loading overlay */
.loading-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s, visibility 0.2s;
    z-index: 9999;
}

.loading-overlay.visible {
    opacity: 1;
    visibility: visible;
}

.loading-content {
    background: var(--card-bg, white);
    padding: 2rem;
    border-radius: 8px;
    text-align: center;
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-color);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.loading-message {
    color: var(--text-primary);
}
```

---

## Phase 7: Update linkNotebookFolder

### 7.1 Update to Use Named Handles

**Location:** `js/app.js` `linkNotebookFolder()` function

```javascript
async function linkNotebookFolder() {
    try {
        const handle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents'
        });

        // Save as named handle using folder name
        const name = handle.name;
        await saveNamedHandle(name, handle);

        notebookDirHandle = handle;
        filesystemLinked = true;
        viewMode = 'filesystem';
        remoteSource = null;

        // Update URL
        history.replaceState(null, '', `?notebook=${encodeURIComponent(name)}`);

        // Load and render
        data = await loadFromFilesystem(handle);
        render();

        showToast(`Opened ${name}`);

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('[Filesystem] Failed to link folder:', err);
            showToast('Failed to open folder', 'error');
        }
    }
}
```

---

## Testing Checklist

### Unit Tests

- [ ] `parseGitHubPath()` correctly parses all formats
- [ ] `isNotebookFile()` filters correctly
- [ ] `flattenJsDelivrFiles()` handles nested structures
- [ ] `parseFilesToNotebook()` produces valid data structure
- [ ] Named handle CRUD operations work

### Integration Tests

- [ ] `?github=user/repo` loads and renders
- [ ] `?github=user/repo@branch/path` loads subfolder
- [ ] `?url=https://...` loads with manifest
- [ ] `?notebook=name` loads local notebook
- [ ] Edit in remote mode triggers save prompt
- [ ] Save to folder creates all files correctly
- [ ] URL updates after save
- [ ] Multiple tabs with different notebooks work
- [ ] Handle migration from legacy format works

### Error Cases

- [ ] Invalid GitHub path shows helpful error
- [ ] Network failure shows retry option
- [ ] Missing manifest.json shows clear message
- [ ] CORS error explains the issue
- [ ] Permission denied handles gracefully

---

## Rollout Plan

1. **Phase 1**: Core infrastructure (state, named handles, IndexedDB schema)
2. **Phase 2**: Remote loading functions (GitHub, URL)
3. **Phase 3**: URL routing in init()
4. **Phase 4**: Prompt-on-edit flow
5. **Phase 5**: Save remote to folder
6. **Phase 6**: UI updates (banner, loading)
7. **Phase 7**: Update existing link flow

Each phase can be tested independently before moving to the next.

---

*Created: 2026-02-01*
*For: URL-based notebook sharing feature*
