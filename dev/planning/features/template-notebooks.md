# URL-Based Notebooks: Share & Fork

## Overview

Any notebook can be shared via URL. Remote notebooks load read-only; users take a local copy to edit.

**Key insight**: Instead of a special "template" concept, support loading any notebook from a URL. Templates become just example notebooks at known URLs.

**Workflows:**
1. **Sharing (GitHub)**: Push notebook to any public GitHub repo → share URL (zero setup)
2. **Sharing (self-hosted)**: Generate manifest → deploy to static host → share URL
3. **Forking**: Visit shared URL → browse read-only → save to local folder to edit
4. **Local editing**: Open local notebooks via named handles

## URL Scheme

```
?github=user/repo                    → GitHub repo via jsDelivr (zero setup)
?github=user/repo@branch             → Specific branch
?github=user/repo@branch/subfolder   → Subfolder of repo
?url=https://custom-host.com/nb      → Self-hosted with manifest.json
?notebook=my-research                → Local notebook (handle lookup)
/                                    → Landing page
```

**Named handle registry** in IndexedDB:
```javascript
// Store: 'notebook-handles'
// Key: user-chosen name (e.g., "my-research")
// Value: FileSystemDirectoryHandle
```

**Benefits:**
- Share any public GitHub repo instantly (no setup)
- Multiple tabs with different notebooks
- Bookmarkable URLs for both remote and local
- Self-hosted option for non-GitHub scenarios

---

## GitHub Loading via jsDelivr

jsDelivr provides CORS-enabled access to GitHub repos with directory listing:

**List files:**
```
GET https://data.jsdelivr.com/v1/package/gh/user/repo@branch
```

Returns:
```json
{
  "files": [
    { "name": ".notebook/settings.yaml", "size": 234 },
    { "name": "research/intro.md", "size": 1234 }
  ]
}
```

**Fetch content:**
```
GET https://cdn.jsdelivr.net/gh/user/repo@branch/path/to/file.md
```

**Advantages:**
- No manifest.json needed
- Works with any public GitHub repo instantly
- CDN is fast and reliable
- Directory listing via API

**Limitations:**
- Public repos only (fine for sharing)
- CDN caching may delay updates (use commit SHA for freshness)
- Third-party dependency

---

## Self-Hosted Loading via Manifest

For non-GitHub hosting (Netlify, nginx, S3, etc.), a manifest is required since HTTP can't enumerate directories.

**`.notebook/manifest.json`:**
```json
{
  "files": [
    ".notebook/settings.yaml",
    ".notebook/theme.css",
    "research/intro.md",
    "research/analysis.code.py"
  ]
}
```

**Generate with script:**
```bash
python3 scripts/generate_manifest.py path/to/notebook
```

This is an explicit publishing step, not automatic. Suitable for CI pipelines or manual publishing.

**Requirements:**
- Static file server with CORS enabled
- manifest.json at `.notebook/manifest.json`

---

## Current State

### What Exists

1. **Example notebooks** in `examples/`
2. **BASE_URL handling** for GitHub Pages subdirectory deployment
3. **IndexedDB** stores single directory handle with fixed key
4. **Initialization flow**: Check for filesystem link → load or show onboarding

### What's Missing

1. **GitHub loading** - No jsDelivr integration
2. **URL-based loading** - No `?github=` or `?url=` routing
3. **Named handle registry** - Only one notebook at a time
4. **Landing page** - Just shows onboarding modal
5. **Prompt-on-edit flow** - No read-only mode with save trigger

---

## Implementation Plan

### Phase 1: Remote Loading (v0)

**Goal**: Load notebooks from GitHub or URL, prompt for folder on first edit.

#### 1.1 GitHub Loading

```javascript
async function loadNotebookFromGitHub(repoPath) {
  // Parse: "user/repo", "user/repo@branch", "user/repo@branch/path"
  const { user, repo, branch = 'main', path = '' } = parseGitHubPath(repoPath);

  // Get file listing from jsDelivr API
  const listUrl = `https://data.jsdelivr.com/v1/package/gh/${user}/${repo}@${branch}`;
  const { files } = await fetch(listUrl).then(r => r.json());

  // Filter to notebook path and relevant files
  const notebookFiles = files
    .filter(f => f.name.startsWith(path))
    .filter(f => isNotebookFile(f.name));

  // Fetch content from jsDelivr CDN
  const baseUrl = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/`;
  const fileContents = await Promise.all(
    notebookFiles.map(async (file) => {
      const content = await fetch(baseUrl + file.name).then(r => r.text());
      return { path: file.name.replace(path, ''), content };
    })
  );

  return parseFilesToNotebook(fileContents);
}

function isNotebookFile(name) {
  // Include notebook content, exclude build artifacts
  if (name.includes('node_modules/')) return false;
  if (name.includes('.git/')) return false;
  if (name.endsWith('.output.html')) return false;
  return true;
}
```

#### 1.2 URL Loading (Self-Hosted)

```javascript
async function loadNotebookFromUrl(baseUrl) {
  const url = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

  // Fetch manifest
  const manifest = await fetch(`${url}.notebook/manifest.json`).then(r => r.json());

  // Fetch all files
  const fileContents = await Promise.all(
    manifest.files.map(async (filePath) => {
      const content = await fetch(url + filePath).then(r => r.text());
      return { path: filePath, content };
    })
  );

  return parseFilesToNotebook(fileContents);
}
```

#### 1.3 URL Param Routing

```javascript
async function init() {
  const params = new URLSearchParams(window.location.search);
  const githubPath = params.get('github');
  const remoteUrl = params.get('url');
  const notebookName = params.get('notebook');

  if (githubPath) {
    // Load from GitHub via jsDelivr
    data = await loadNotebookFromGitHub(githubPath);
    viewMode = 'remote';
    remoteSource = { type: 'github', path: githubPath };
    render();
  } else if (remoteUrl) {
    // Load from URL with manifest
    data = await loadNotebookFromUrl(remoteUrl);
    viewMode = 'remote';
    remoteSource = { type: 'url', url: remoteUrl };
    render();
  } else if (notebookName) {
    // Load local notebook by name
    const handle = await getNamedHandle(notebookName);
    if (handle && await verifyDirPermission(handle)) {
      notebookDirHandle = handle;
      filesystemLinked = true;
      data = await loadFromFilesystem(handle);
      render();
    } else {
      showNotebookNotFoundModal(notebookName);
    }
  } else {
    // Try restore or show landing/onboarding
    await tryRestoreFilesystem();
  }
}
```

#### 1.4 Prompt-on-Edit Flow

```javascript
function startEditing(card) {
  if (viewMode === 'remote') {
    promptSaveToFolder();
    return;
  }
  // ... existing edit logic
}

async function promptSaveToFolder() {
  const confirmed = await showModal({
    title: 'Save to Folder',
    message: 'This notebook is read-only. Save a copy to edit.',
    buttons: ['Choose Folder...', 'Cancel']
  });

  if (confirmed) {
    await saveRemoteToFolder();
  }
}
```

#### 1.5 Deep Copy to Folder

```javascript
async function saveRemoteToFolder() {
  const dirHandle = await window.showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'documents'
  });

  // Copy all content
  for (const section of data.sections) {
    for (const item of section.items) {
      await saveCardFile(section.id, item);
    }
  }
  await saveSettings(dirHandle);

  // Register named handle
  const name = dirHandle.name;
  await saveNamedHandle(name, dirHandle);

  // Switch to filesystem mode
  notebookDirHandle = dirHandle;
  filesystemLinked = true;
  viewMode = 'filesystem';

  history.replaceState(null, '', `?notebook=${encodeURIComponent(name)}`);
  showToast(`Saved to ${name}. You can now edit freely.`);
  render();
}
```

#### 1.6 Named Handle Registry

```javascript
const IDB_HANDLES_STORE = 'notebook-handles';

async function saveNamedHandle(name, handle) {
  const db = await openDB();
  const tx = db.transaction(IDB_HANDLES_STORE, 'readwrite');
  await tx.store.put(handle, name);
  await tx.done;
}

async function getNamedHandle(name) {
  const db = await openDB();
  return await db.get(IDB_HANDLES_STORE, name);
}

async function listNamedHandles() {
  const db = await openDB();
  return await db.getAllKeys(IDB_HANDLES_STORE);
}
```

**Migration**: On first load, migrate existing single handle to named registry using folder name as key.

---

### Phase 2: Landing Page

**Goal**: Show example notebooks and "Your Notebooks" list.

#### 2.1 Landing Page UI

When visiting `/` with no params and no saved handle:

```html
<div class="landing-page">
  <h1>Research Notebook</h1>

  <section class="examples">
    <h2>Example Notebooks</h2>
    <div class="notebook-grid">
      <!-- Cards linking to ?github=user/research-notebook/examples/demo-notebook -->
    </div>
  </section>

  <section class="your-notebooks">
    <h2>Your Notebooks</h2>
    <!-- List of named handles from IndexedDB -->
  </section>

  <section class="actions">
    <button>Open Folder...</button>
    <button>Open from GitHub...</button>
  </section>
</div>
```

#### 2.2 Example Registry

**`examples/index.json`**:
```json
{
  "examples": [
    {
      "id": "demo-notebook",
      "name": "Research Notebook",
      "description": "Notes, bookmarks, and code for research",
      "github": "user/research-notebook@main/examples/demo-notebook"
    },
    {
      "id": "tutor-notebook",
      "name": "AI Tutor",
      "description": "Interactive tutoring with quizzes",
      "github": "user/research-notebook@main/examples/tutor-notebook"
    }
  ]
}
```

---

### Phase 3: Polish

- "Forget" action to remove named handle from registry
- Handle permission re-prompt when handle is stale
- Keyboard shortcut to switch notebooks (Cmd+O?)
- Recent notebooks in "Your Notebooks" sorted by last access
- Error handling for jsDelivr failures (rate limits, network issues)

---

## Future Enhancements

### IndexedDB Editing Layer

Try notebooks without saving to filesystem:
1. Remote notebook edits go to IndexedDB layer
2. "Save to folder" exports to filesystem
3. Defer unless there's demand

### Remote Write-Back

Edit remote notebooks directly:
1. **GitHub API** - Commit changes back (requires OAuth)
2. **WebDAV** - Standard read-write protocol
3. **Custom sync** - Purpose-built backend

---

## File Changes Summary

### New Files

```
examples/
  index.json                    # Example registry for landing page

scripts/
  generate_manifest.py          # For self-hosted publishing
```

### Modified Files

```
js/app.js
  - Add loadNotebookFromGitHub() using jsDelivr
  - Add loadNotebookFromUrl() for self-hosted
  - Add URL param handling (?github=, ?url=, ?notebook=)
  - Add named handle registry functions
  - Add prompt-on-edit flow for remote notebooks
  - Add saveRemoteToFolder()
  - Migrate single handle to named registry

index.html
  - Add landing page UI
```

---

## Success Criteria

- [ ] Visit `/?github=user/repo` and see notebook read-only
- [ ] Visit `/?github=user/repo@branch/subfolder` for nested notebooks
- [ ] Visit `/?url=https://...` with manifest.json and see notebook
- [ ] Click edit → prompted to save to folder
- [ ] After save, URL changes to `/?notebook={name}`
- [ ] Open `/?notebook={name}` in new tab, loads same notebook
- [ ] Landing page shows examples and "Your Notebooks"
- [ ] Multiple browser tabs with different notebooks work

---

*Status: Draft - jsDelivr for GitHub, manifest.json for self-hosted*
*Author: Claude*
*Updated: 2026-02-01*
