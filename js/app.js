// ========== SECTION: STATE_AND_CONFIG ==========
// Global data structure, state variables, editing trackers, Pyodide state, marked config

// Base URL for fetching app resources (handles GitHub Pages subdirectory)
// Computed from current page URL, ensuring trailing slash
const BASE_URL = (() => {
    const path = window.location.pathname;
    // If path ends with .html or has no extension at the end, get the directory
    const dir = path.endsWith('/') ? path : path.substring(0, path.lastIndexOf('/') + 1) || '/';
    return dir;
})();

// Data structure
let data = {
    title: 'Research Notebook',
    subtitle: 'Bookmarks, notes, and connections',
    sections: []
    // Notes are stored in sections alongside bookmarks
    // Each item has a 'type' field: 'bookmark', 'note', or 'code'
    // Root files (README.md, CLAUDE.md) are in section '.' ([root])
    // Config files (.notebook/*) are in section '.notebook'
};

// Track collapsed sections (persisted to localStorage per-notebook)
let collapsedSections = new Set();

// Debounce timers for toggle (prevents single-click firing on double-click)
let sectionToggleTimer = null;
let subdirToggleTimer = null;

// Get localStorage key for collapsed sections (notebook-specific)
function getCollapsedSectionsKey() {
    const notebookName = storageBackend?.name || notebookDirHandle?.name || 'default';
    return `collapsedSections_${notebookName}`;
}

// Save collapsed sections to localStorage
function saveCollapsedSections() {
    localStorage.setItem(getCollapsedSectionsKey(), JSON.stringify([...collapsedSections]));
}

// Restore collapsed sections from localStorage
function restoreCollapsedSections() {
    // Always reset first (in case switching notebooks)
    collapsedSections = new Set();
    const saved = localStorage.getItem(getCollapsedSectionsKey());
    if (saved) {
        try {
            collapsedSections = new Set(JSON.parse(saved));
        } catch (e) {
            console.warn('Failed to restore collapsed sections:', e);
        }
    }
}

// Track expanded subdirectories (collapsed by default, persisted per-notebook)
// Keys are in format: "sectionId/subdirPath" (e.g., "section-research/responses/batch1")
let expandedSubdirs = new Set();

// Saved state for expand all toggle (revert on second press)
let savedExpandedSubdirs = null;
let savedCollapsedSections = null;

// Focus mode: scope UI to a subdirectory path (null = show all)
// Path format: "section" or "section/subdir/path" (e.g., "2024-25/year-8-set-1")
let focusedPath = null;

// Get localStorage key for expanded subdirectories (notebook-specific)
function getExpandedSubdirsKey() {
    const notebookName = storageBackend?.name || notebookDirHandle?.name || 'default';
    return `expandedSubdirs_${notebookName}`;
}

// Save expanded subdirectories to localStorage
function saveExpandedSubdirs() {
    localStorage.setItem(getExpandedSubdirsKey(), JSON.stringify([...expandedSubdirs]));
}

// Restore expanded subdirectories from localStorage
function restoreExpandedSubdirs() {
    expandedSubdirs = new Set();
    const saved = localStorage.getItem(getExpandedSubdirsKey());
    if (saved) {
        try {
            expandedSubdirs = new Set(JSON.parse(saved));
        } catch (e) {
            console.warn('Failed to restore expanded subdirs:', e);
        }
    }
}

// Toggle subdirectory expanded state
// Uses debounce to prevent firing on double-click
function toggleSubdir(sectionId, subdirPath) {
    // Clear any existing timer
    if (subdirToggleTimer) {
        clearTimeout(subdirToggleTimer);
    }
    // Delay execution to allow double-click to cancel (300ms is standard dblclick threshold)
    subdirToggleTimer = setTimeout(() => {
        subdirToggleTimer = null;
        const key = `${sectionId}/${subdirPath}`;
        if (expandedSubdirs.has(key)) {
            expandedSubdirs.delete(key);
        } else {
            expandedSubdirs.add(key);
        }
        saveExpandedSubdirs();
        render();
    }, 300);
}

// Toggle all nested subdirectories within a subdirectory
// Called on double-click - cancels pending single-click toggle
function toggleAllNestedSubdirs(sectionId, subdirPath) {
    // Cancel pending single-click toggle
    if (subdirToggleTimer) {
        clearTimeout(subdirToggleTimer);
        subdirToggleTimer = null;
    }

    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return;

    const key = `${sectionId}/${subdirPath}`;
    const prefix = `${key}/`;

    // Build set of all nested subdirs under this path
    const nestedSubdirs = new Set();
    nestedSubdirs.add(key);  // Include this subdir itself
    for (const item of section.items) {
        const itemSubdir = getSubdirFromPath(item._path);
        if (itemSubdir && itemSubdir.startsWith(subdirPath + '/')) {
            // This item is in a nested subdir - add all path segments
            const parts = itemSubdir.split('/');
            for (let i = subdirPath.split('/').length; i <= parts.length; i++) {
                const path = parts.slice(0, i).join('/');
                nestedSubdirs.add(`${sectionId}/${path}`);
            }
        }
    }

    // Toggle based on current subdir state
    const isExpanded = expandedSubdirs.has(key);

    if (isExpanded) {
        // Collapse this subdir + all nested
        for (const k of nestedSubdirs) {
            expandedSubdirs.delete(k);
        }
    } else {
        // Expand this subdir + all nested
        for (const k of nestedSubdirs) {
            expandedSubdirs.add(k);
        }
    }
    saveExpandedSubdirs();
    render();
}

// Check if subdirectory is expanded
function isSubdirExpanded(sectionId, subdirPath) {
    const key = `${sectionId}/${subdirPath}`;
    return expandedSubdirs.has(key);
}

// Expand all subdirectories in all sections (toggle: second press reverts)
function expandAllSubdirs() {
    // Build set of all possible subdirs from visible sections
    const allSubdirs = new Set();
    const visibleSectionIds = new Set();
    for (const section of data.sections) {
        if (!section.visible) continue;
        visibleSectionIds.add(section.id);
        for (const item of section.items) {
            const subdir = getSubdirFromPath(item._path);
            if (subdir) {
                const parts = subdir.split('/');
                for (let i = 1; i <= parts.length; i++) {
                    const path = parts.slice(0, i).join('/');
                    allSubdirs.add(`${section.id}/${path}`);
                }
            }
        }
    }

    // Check if already fully expanded (all sections uncollapsed AND all subdirs expanded)
    const allSectionsExpanded = [...visibleSectionIds].every(id => !collapsedSections.has(id));
    const allSubdirsExpanded = allSubdirs.size > 0 &&
        [...allSubdirs].every(key => expandedSubdirs.has(key));
    const isFullyExpanded = allSectionsExpanded && allSubdirsExpanded;

    if (isFullyExpanded && savedExpandedSubdirs && savedCollapsedSections) {
        // Revert to saved state
        expandedSubdirs = new Set(savedExpandedSubdirs);
        collapsedSections = new Set(savedCollapsedSections);
        savedExpandedSubdirs = null;
        savedCollapsedSections = null;
        saveExpandedSubdirs();
        saveCollapsedSections();
        render();
        showToast('Reverted to previous state');
    } else {
        // Save current state and expand all
        savedExpandedSubdirs = new Set(expandedSubdirs);
        savedCollapsedSections = new Set(collapsedSections);
        expandedSubdirs = allSubdirs;
        // Uncollapse all visible sections
        for (const id of visibleSectionIds) {
            collapsedSections.delete(id);
        }
        saveExpandedSubdirs();
        saveCollapsedSections();
        render();
        showToast('Expanded all subdirectories');
    }
}

// Path helpers for unified _path field
// _path stores full path from notebook root (e.g., 'research/responses/batch1')

// Get subdirectory portion (everything after first segment, i.e., within section)
function getSubdirFromPath(path) {
    if (!path) return null;
    const parts = path.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : null;
}

// Get section name (first segment of path)
function getSectionFromPath(path) {
    if (!path) return null;
    return path.split('/')[0];
}

// Format directory name for display (kebab-case → Title Case)
// Preserves date patterns like 2025-26 or 2024-2025
// Special cases: '.' and '.notebook' display as-is (dot-prefixed system directories)
function formatDirName(dirName) {
    if (!dirName) return '';

    // Special cases for system directories - display as-is
    if (dirName === '.' || dirName === '.notebook') return dirName;

    // If preserve_dir_names is enabled, return directory name as-is
    if (notebookSettings?.preserve_dir_names) return dirName;

    // Split on hyphens and underscores
    const parts = dirName.split(/[-_]/);
    const result = [];

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const nextPart = parts[i + 1];

        // Date range: 4-digit year followed by 1-4 digit number (2025-26, 2024-2025)
        if (/^\d{4}$/.test(part) && nextPart && /^\d{1,4}$/.test(nextPart)) {
            result.push(`${part}-${nextPart}`);
            i++; // Skip next part since we consumed it
        }
        // Standalone number: keep as-is
        else if (/^\d+$/.test(part)) {
            result.push(part);
        }
        // Word: title case it
        else {
            result.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
        }
    }

    return result.join(' ');
}

// Convert display name back to directory name (Title Case → kebab-case)
function toDirName(displayName) {
    if (!displayName) return '';
    return displayName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, ''); // Remove special chars except hyphens
}

// Focus mode helpers

// Get localStorage key for focus path (notebook-specific)
function getFocusKey() {
    const notebookName = storageBackend?.name || notebookDirHandle?.name || 'default';
    return `focusedPath_${notebookName}`;
}

// Save focus to localStorage and update URL
function saveFocus() {
    if (focusedPath) {
        localStorage.setItem(getFocusKey(), focusedPath);
    } else {
        localStorage.removeItem(getFocusKey());
    }
    updateFocusURL();
}

// Restore focus from URL (priority) or localStorage
function restoreFocus() {
    // URL takes priority
    const urlParams = new URLSearchParams(window.location.search);
    const urlFocus = urlParams.get('focus');
    if (urlFocus) {
        focusedPath = urlFocus;
        return;
    }
    // Fall back to localStorage
    const saved = localStorage.getItem(getFocusKey());
    focusedPath = saved || null;
}

// Update URL to reflect current focus (without page reload)
function updateFocusURL() {
    const url = new URL(window.location);
    if (focusedPath) {
        url.searchParams.set('focus', focusedPath);
    } else {
        url.searchParams.delete('focus');
    }
    window.history.replaceState({}, '', url);
}

// Set focus to a path and re-render
function setFocus(path) {
    focusedPath = path || null;
    saveFocus();
    // Auto-expand the focused path so items are visible
    if (focusedPath) {
        autoExpandFocusedPath();
    }
    render();
}

// Clear focus and re-render
function clearFocus() {
    setFocus(null);
}

// Auto-expand subdirectories along the focused path
function autoExpandFocusedPath() {
    if (!focusedPath) return;
    const parts = focusedPath.split('/');
    if (parts.length < 2) return;  // No subdirs to expand

    const sectionName = parts[0];
    const sectionId = 'section-' + sectionName;

    // Expand each level of the subdir path
    for (let i = 2; i <= parts.length; i++) {
        const subdirPath = parts.slice(1, i).join('/');
        const key = `${sectionId}/${subdirPath}`;
        expandedSubdirs.add(key);
    }
    saveExpandedSubdirs();
}

// Check if a section matches the current focus
function sectionMatchesFocus(section) {
    if (!focusedPath) return true;  // No focus = show all
    const focusSection = getSectionFromPath(focusedPath);
    return section._dirName === focusSection;
}

// Check if an item matches the current focus (for filtering within section)
function itemMatchesFocus(item) {
    if (!focusedPath) return true;  // No focus = show all
    if (!item._path) return true;   // No path = show (shouldn't happen)

    // If focus is just a section, all items in that section match
    const focusParts = focusedPath.split('/');
    if (focusParts.length === 1) return true;

    // Focus includes subdir - item path must start with focus path
    return item._path === focusedPath || item._path.startsWith(focusedPath + '/');
}

// Get display name for a section, stripping focused prefix if applicable
// Uses formatDirName() to convert directory names to Title Case
function getSectionDisplayName(section) {
    if (!focusedPath) return formatDirName(section._dirName);

    // If focused on a subdir within this section, show just the subdir name
    const focusParts = focusedPath.split('/');
    if (focusParts.length > 1 && section._dirName === focusParts[0]) {
        // Return the last segment of the focus path as the "section" name
        return formatDirName(focusParts[focusParts.length - 1]);
    }
    return formatDirName(section._dirName);
}

// Pyodide state
let pyodide = null;
let pyodideLoading = false;
let pyodideReady = false;

// Filesystem state
let notebookDirHandle = null;  // FileSystemDirectoryHandle for linked folder
let filesystemLinked = false;   // Whether filesystem mode is active
const IDB_DIR_HANDLE_KEY = 'notebookDirHandle';  // IndexedDB key for persisting handle

// View mode state (for URL-based notebook loading)
let viewMode = 'filesystem';    // 'filesystem' | 'remote'
let remoteSource = null;        // { type: 'github'|'url', path?: string, url?: string }

// FileSystemObserver state (Phase 2: Change Detection)
let filesystemObserver = null;  // FileSystemObserver instance for watching changes
let isReloadingFromFilesystem = false;  // Flag to prevent observer triggering during reload

// Reserved directory names (excluded from section auto-discovery)
// Note: 'assets' is NOT reserved - it's a regular section (default invisible)
const RESERVED_DIRECTORIES = new Set([
    '.notebook',
    '.git',
    'node_modules'
]);

// Get the .notebook directory handle (creates if it doesn't exist when create=true)
async function getNotebookConfigDir(dirHandle, create = false) {
    if (!dirHandle) return null;
    try {
        return await dirHandle.getDirectoryHandle('.notebook', { create });
    } catch (e) {
        if (!create) return null;
        throw e;
    }
}

// Get the .notebook/templates directory handle (creates if it doesn't exist when create=true)
async function getNotebookTemplatesDir(dirHandle, create = false) {
    const configDir = await getNotebookConfigDir(dirHandle, create);
    if (!configDir) return null;
    try {
        return await configDir.getDirectoryHandle('templates', { create });
    } catch (e) {
        if (!create) return null;
        throw e;
    }
}

// Simple debounce utility — returns a function that delays invoking fn until after
// `delay` ms have elapsed since the last invocation
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Author registry (loaded from settings.yaml authors field)
// Maps author names (lowercase) to icon SVG content
let authorRegistry = {};

// Configure marked for safe rendering
marked.setOptions({
    breaks: true,
    gfm: true
});

// ========== SECTION: TEMPLATE_SYSTEM ==========
// Template and extension registry infrastructure for unified card handling
// Phase 1 (Loading): loadExtensionRegistry, loadTemplates, getExtensionRegistry,
//            getDefaultTemplates, getTemplateFileContent, ensureTemplateFiles,
//            parsers, serializers, loadCard, serializeCard
// Phase 2 (Rendering): renderCard, renderCardPreview, renderCardTitle, renderCardMeta,
//            renderDocumentPreview, renderImagePreview, renderSplitPanePreview, renderFieldsPreview,
//            openViewer, renderViewerContent, renderViewerDocument, renderViewerImage,
//            renderViewerSplitPane, renderViewerSections, renderViewerActions,
//            closeViewer, editViewerCard, deleteViewerCard, runViewerCode,
//            loadThemeCss, injectTemplateStyles

// Extension registry - maps file extensions to parsing behavior
// Loaded from settings.yaml or uses defaults
let extensionRegistry = null;

// Template registry - maps template names to their definitions
// Loaded from *.template.yaml files or uses defaults
let templateRegistry = {};

// Cache for default templates loaded from /defaults/templates/
let defaultTemplatesCache = null;

// Cache for default theme content loaded from /defaults/theme.css
let defaultThemeContentCache = null;

// Cache for theme registry loaded from /themes/index.json
let themeRegistryCache = null;

// Get the extension registry (aggregated from card type modules)
// This returns the registry built during loadCardTypeModules()
function getExtensionRegistry() {
    return cardTypeExtensions;
}

// Fetch default templates from /defaults/templates/ and /card-types/
// This must be called during app initialization before templates are used
// enabledTypes: optional array of card type names to fully load (CSS/JS)
async function fetchDefaultTemplates(enabledTypes = null) {
    if (defaultTemplatesCache) {
        return defaultTemplatesCache;
    }

    console.log('[Templates] Fetching default templates...');
    const templates = {};

    try {
        // 1. Load legacy templates from /defaults/templates/
        const indexResponse = await fetch(BASE_URL + 'defaults/templates/index.json');
        if (!indexResponse.ok) {
            throw new Error(`Failed to fetch template index: ${indexResponse.status}`);
        }
        const index = await indexResponse.json();

        for (const templateName of index.templates) {
            try {
                const response = await fetch(BASE_URL + `defaults/templates/${templateName}.yaml`);
                if (response.ok) {
                    const yamlContent = await response.text();
                    const template = jsyaml.load(yamlContent);
                    if (template && template.name) {
                        templates[template.name] = template;
                    }
                }
            } catch (e) {
                console.error(`[Templates] Error loading ${templateName}.yaml:`, e);
            }
        }

        // 2. Load card type modules (these take precedence over legacy templates)
        // Pass enabledTypes to control which types get CSS/JS loaded
        const cardTypeTemplates = await loadCardTypeModules(enabledTypes);
        Object.assign(templates, cardTypeTemplates);

        console.log(`[Templates] Loaded ${Object.keys(templates).length} default templates`);
        defaultTemplatesCache = templates;
        return templates;
    } catch (e) {
        console.error('[Templates] Error fetching defaults:', e);
        // Return empty object - app should still work with user templates only
        defaultTemplatesCache = {};
        return {};
    }
}

// Get cached default templates (synchronous, must call fetchDefaultTemplates first)
function getDefaultTemplates() {
    if (!defaultTemplatesCache) {
        console.warn('[Templates] getDefaultTemplates called before fetchDefaultTemplates - returning empty');
        return {};
    }
    return defaultTemplatesCache;
}

// ========== Card Type Modules ==========
// Self-contained card type modules from /card-types/ directory
// Each module can provide: template.yaml, styles.css, index.js

// Map of card type name -> JS module exports (render functions, actions)
let cardTypeModules = {};

// Registry for custom render functions from card type modules
// Structure: { 'quiz-response-summary': { renderPreview: fn, renderViewer: fn } }
let cardTypeRenderers = {};

// Extension registry aggregated from card type modules
// Structure: { '.md': { parser: 'yaml-frontmatter', defaultTemplate: 'note', bodyField: 'content' }, ... }
let cardTypeExtensions = {};

// Track which card types have been fully loaded (CSS + JS)
let fullyLoadedCardTypes = new Set();

// All available card types from manifest (module directory name -> template name)
let availableCardTypes = {};

// Card types currently in use in the notebook (detected from files)
let inUseCardTypes = new Set();

// Load card type modules from /card-types/
// Phase 1: Fetches manifest, loads ALL template.yaml (for extensions/schema)
// Phase 2: Loads CSS/JS only for enabledTypes (if specified)
async function loadCardTypeModules(enabledTypes = null) {
    console.log('[CardTypes] Loading modules...', enabledTypes ? `(enabled: ${[...enabledTypes].join(', ')})` : '(all)');

    try {
        // Fetch the manifest
        const response = await fetch(BASE_URL + 'card-types/index.json');
        if (!response.ok) {
            console.log('[CardTypes] No card-types manifest found, skipping');
            return {};
        }

        const manifest = await response.json();
        if (!manifest.modules || manifest.modules.length === 0) {
            console.log('[CardTypes] No modules in manifest');
            return {};
        }

        const templates = {};
        const cssBlocks = [];
        const extensions = {};

        // Convert enabledTypes to Set for fast lookup
        const enabledSet = enabledTypes ? new Set(enabledTypes) : null;

        for (const moduleName of manifest.modules) {
            // Phase 1: Always load template.yaml (required for extensions/schema)
            let template = null;
            try {
                const templateResponse = await fetch(BASE_URL + `card-types/${moduleName}/template.yaml`);
                if (templateResponse.ok) {
                    const yamlContent = await templateResponse.text();
                    template = jsyaml.load(yamlContent);
                    if (template && template.name) {
                        templates[template.name] = template;

                        // Track module name -> template name mapping
                        availableCardTypes[moduleName] = template.name;

                        // Aggregate extensions from template
                        if (template.extensions) {
                            for (const [ext, config] of Object.entries(template.extensions)) {
                                if (extensions[ext]) {
                                    console.warn(`[CardTypes] Extension conflict: ${ext} already registered by another type`);
                                }
                                extensions[ext] = {
                                    ...config,
                                    defaultTemplate: template.name
                                };
                            }
                        }
                    }
                } else {
                    console.warn(`[CardTypes] ${moduleName}: template.yaml not found`);
                    continue;
                }
            } catch (e) {
                console.error(`[CardTypes] ${moduleName}: Error loading template.yaml:`, e);
                continue;
            }

            // Phase 2: Load CSS/JS only for enabled types (or all if no filter)
            const templateName = template?.name;
            const shouldLoadAssets = !enabledSet || enabledSet.has(templateName);

            if (shouldLoadAssets && templateName && !fullyLoadedCardTypes.has(templateName)) {
                // Load styles.css (optional)
                try {
                    const cssResponse = await fetch(BASE_URL + `card-types/${moduleName}/styles.css`);
                    if (cssResponse.ok) {
                        const css = await cssResponse.text();
                        cssBlocks.push(`/* ${moduleName} */\n${css}`);
                    }
                } catch (e) {
                    // Optional, ignore errors
                }

                // Load index.js (optional) - ES module with render functions
                try {
                    const jsModule = await import(BASE_URL + `card-types/${moduleName}/index.js`);
                    if (jsModule) {
                        cardTypeModules[moduleName] = jsModule;

                        // Register render functions if provided
                        if (jsModule.renderPreview || jsModule.renderViewer) {
                            cardTypeRenderers[moduleName] = {
                                renderPreview: jsModule.renderPreview,
                                renderViewer: jsModule.renderViewer
                            };
                        }
                    }
                } catch (e) {
                    // Optional, ignore if not present (404 is expected for simple types)
                    if (!e.message?.includes('404') && !e.message?.includes('Failed to fetch')) {
                        console.error(`[CardTypes] ${moduleName}: Error loading index.js:`, e);
                    }
                }

                fullyLoadedCardTypes.add(templateName);
            }
        }

        // Inject all CSS at once
        if (cssBlocks.length > 0) {
            injectCardTypeStyles(cssBlocks.join('\n\n'));
        }

        // Add built-in .card.yaml extension (generic card type that specifies template in file)
        extensions['.card.yaml'] = {
            parser: 'yaml',
            defaultTemplate: null  // Must specify template: in file
        };

        // Store aggregated extensions
        cardTypeExtensions = extensions;

        console.log(`[CardTypes] Loaded ${Object.keys(templates).length} templates, ${fullyLoadedCardTypes.size} fully loaded, ${Object.keys(extensions).length} extensions`);
        return templates;
    } catch (e) {
        console.error('[CardTypes] Error loading modules:', e);
        return {};
    }
}

// Load CSS and JS assets for additional card types (lazy loading)
async function loadCardTypeAssets(typeNames) {
    if (!typeNames || typeNames.length === 0) return;

    const cssBlocks = [];

    for (const typeName of typeNames) {
        if (fullyLoadedCardTypes.has(typeName)) continue;

        // Find module name for this type
        const moduleName = Object.entries(availableCardTypes)
            .find(([mod, name]) => name === typeName)?.[0];

        if (!moduleName) {
            console.warn(`[CardTypes] Unknown type: ${typeName}`);
            continue;
        }

        console.log(`[CardTypes] Lazy loading ${typeName}...`);

        // Load CSS
        try {
            const cssResponse = await fetch(BASE_URL + `card-types/${moduleName}/styles.css`);
            if (cssResponse.ok) {
                cssBlocks.push(`/* ${moduleName} */\n${await cssResponse.text()}`);
            }
        } catch (e) { /* optional */ }

        // Load JS
        try {
            const jsModule = await import(BASE_URL + `card-types/${moduleName}/index.js`);
            if (jsModule) {
                cardTypeModules[moduleName] = jsModule;
                if (jsModule.renderPreview || jsModule.renderViewer) {
                    cardTypeRenderers[moduleName] = {
                        renderPreview: jsModule.renderPreview,
                        renderViewer: jsModule.renderViewer
                    };
                }
            }
        } catch (e) {
            if (!e.message?.includes('404') && !e.message?.includes('Failed to fetch')) {
                console.error(`[CardTypes] ${moduleName}: Error loading index.js:`, e);
            }
        }

        fullyLoadedCardTypes.add(typeName);
    }

    // Append CSS (don't replace, add to existing)
    if (cssBlocks.length > 0) {
        appendCardTypeStyles(cssBlocks.join('\n\n'));
    }
}

// Append additional card type CSS (for lazy loading)
function appendCardTypeStyles(css) {
    const existing = document.getElementById('card-type-styles');
    if (existing) {
        // Append to existing styles within the layer
        const currentContent = existing.textContent;
        // Extract content between @layer templates { and closing }
        const match = currentContent.match(/@layer templates \{([\s\S]*)\}$/);
        if (match) {
            existing.textContent = `@layer templates {\n${match[1]}\n${css}\n}`;
        }
    } else {
        injectCardTypeStyles(css);
    }
}

// Inject card type CSS into the page within @layer templates
function injectCardTypeStyles(css) {
    // Remove existing if present
    const existing = document.getElementById('card-type-styles');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'card-type-styles';
    style.textContent = `@layer templates {\n${css}\n}`;
    document.head.appendChild(style);
    console.log('[CardTypes] Injected styles');
}

// Get card type JS module by name
function getCardTypeModule(name) {
    return cardTypeModules[name] || null;
}

// Get card type renderer by name
function getCardTypeRenderer(name) {
    return cardTypeRenderers[name] || null;
}

// Get all available card type names (from manifest)
function getAvailableCardTypes() {
    return Object.values(availableCardTypes);
}

// Get card types currently in use in the notebook
function getInUseCardTypes() {
    return inUseCardTypes;
}

// Scan notebook files to detect which card types are in use
async function detectInUseCardTypes() {
    const detected = new Set();
    if (!storageBackend) return detected;

    const extensions = getExtensionRegistry();
    // Sort extensions by length (longer first) for correct matching
    // e.g., '.response.json' must match before '.json'
    const sortedExtensions = Object.keys(extensions).sort((a, b) => b.length - a.length);

    async function scanDir(path) {
        try {
            const entries = await storageBackend.listDirectory(path);
            for (const entry of entries) {
                if (entry.kind === 'directory') {
                    // Skip hidden directories and excluded paths
                    if (entry.name.startsWith('.')) continue;
                    const excludedPaths = notebookSettings?.excluded_paths ?? ['node_modules'];
                    if (excludedPaths.includes(entry.name)) continue;
                    try {
                        const subPath = path ? `${path}/${entry.name}` : entry.name;
                        await scanDir(subPath);
                    } catch (e) { /* skip inaccessible */ }
                } else if (entry.kind === 'file') {
                    // Check if file matches any known extension (sorted by length)
                    for (const ext of sortedExtensions) {
                        if (entry.name.endsWith(ext) && extensions[ext].defaultTemplate) {
                            detected.add(extensions[ext].defaultTemplate);
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[CardTypes] Error scanning directory:', e);
        }
    }

    await scanDir('');
    inUseCardTypes = detected;
    console.log(`[CardTypes] Detected in-use types: ${[...detected].join(', ') || '(none)'}`);
    return detected;
}

// Load instance card type overrides from .notebook/card-types/
// These override core card types: template.yaml is deep-merged, styles.css appended, index.js replaces
async function loadInstanceCardTypes() {
    if (!storageBackend) return;

    try {
        // List .notebook/card-types/ directory
        let moduleEntries;
        try {
            moduleEntries = await storageBackend.listDirectory('.notebook/card-types');
        } catch (e) {
            // .notebook/card-types/ doesn't exist, which is fine
            return;
        }

        const cssBlocks = [];
        let loadedCount = 0;

        for (const entry of moduleEntries) {
            if (entry.kind !== 'directory') continue;
            const moduleName = entry.name;
            const modulePath = `.notebook/card-types/${moduleName}`;

            console.log(`[CardTypes] Loading instance override: ${moduleName}`);
            let hasContent = false;

            // Load template.yaml (deep merge with existing)
            try {
                const { content: yamlContent } = await storageBackend.readFile(`${modulePath}/template.yaml`);
                const template = jsyaml.load(yamlContent);

                if (template && template.name) {
                    // Deep merge with existing template (instance wins)
                    const existingTemplate = templateRegistry[template.name];
                    if (existingTemplate) {
                        templateRegistry[template.name] = deepMerge(existingTemplate, template);
                        console.log(`[CardTypes] ${moduleName}: merged template.yaml`);
                    } else {
                        templateRegistry[template.name] = template;
                        console.log(`[CardTypes] ${moduleName}: added new template`);
                    }
                    hasContent = true;
                }
            } catch (e) {
                // template.yaml is optional for overrides
            }

            // Load styles.css (append after core styles)
            try {
                const { content: css } = await storageBackend.readFile(`${modulePath}/styles.css`);
                if (css.trim()) {
                    cssBlocks.push(`/* instance: ${moduleName} */\n${css}`);
                    console.log(`[CardTypes] ${moduleName}: loaded styles.css`);
                    hasContent = true;
                }
            } catch (e) {
                // styles.css is optional
            }

            // Load index.js via blob URL (replaces core renderers)
            try {
                const { content: jsText } = await storageBackend.readFile(`${modulePath}/index.js`);
                const blob = new Blob([jsText], { type: 'application/javascript' });
                const blobUrl = URL.createObjectURL(blob);

                try {
                    const jsModule = await import(blobUrl);
                    if (jsModule) {
                        cardTypeModules[moduleName] = jsModule;

                        // Register render functions if provided (override existing)
                        if (jsModule.renderPreview || jsModule.renderViewer) {
                            cardTypeRenderers[moduleName] = {
                                renderPreview: jsModule.renderPreview,
                                renderViewer: jsModule.renderViewer
                            };
                            console.log(`[CardTypes] ${moduleName}: loaded index.js with renderers`);
                        } else {
                            console.log(`[CardTypes] ${moduleName}: loaded index.js`);
                        }
                        hasContent = true;
                    }
                } finally {
                    URL.revokeObjectURL(blobUrl);
                }
            } catch (e) {
                // index.js is optional, but log actual errors (not just 404)
                if (e.name !== 'NotFoundError') {
                    console.warn(`[CardTypes] ${moduleName}: error loading index.js:`, e);
                }
            }

            if (hasContent) loadedCount++;
        }

        // Inject instance CSS (after core CSS, so instance wins in cascade)
        if (cssBlocks.length > 0) {
            appendCardTypeStyles(cssBlocks.join('\n\n'));
        }

        if (loadedCount > 0) {
            console.log(`[CardTypes] Loaded ${loadedCount} instance override(s)`);
        }
    } catch (e) {
        // .notebook/ doesn't exist or other error
        if (e.name !== 'NotFoundError') {
            console.error('[CardTypes] Error loading instance overrides:', e);
        }
    }
}

// Fetch default theme.css content from /defaults/theme.css
async function fetchDefaultThemeContent() {
    if (defaultThemeContentCache !== null) {
        return defaultThemeContentCache;
    }

    try {
        const response = await fetch(BASE_URL + 'defaults/theme.css');
        if (response.ok) {
            defaultThemeContentCache = await response.text();
            console.log('[Theme] Loaded default theme.css content');
            return defaultThemeContentCache;
        }
    } catch (e) {
        console.error('[Theme] Error fetching default theme.css:', e);
    }

    // Fallback to empty string
    defaultThemeContentCache = '';
    return '';
}

// Fetch theme registry from /themes/index.json
async function fetchThemeRegistry() {
    if (themeRegistryCache !== null) {
        return themeRegistryCache;
    }

    try {
        const response = await fetch(BASE_URL + 'themes/index.json');
        if (response.ok) {
            const data = await response.json();
            themeRegistryCache = data.themes || [];
            console.log(`[Themes] Loaded ${themeRegistryCache.length} themes from registry`);
            return themeRegistryCache;
        }
    } catch (e) {
        console.error('[Themes] Error fetching theme registry:', e);
    }

    themeRegistryCache = [];
    return [];
}

// Fetch a theme's CSS from /themes/{id}.css
async function fetchThemeCSS(themeId) {
    try {
        const response = await fetch(BASE_URL + `themes/${themeId}.css`);
        if (response.ok) {
            return await response.text();
        }
    } catch (e) {
        console.error(`[Themes] Error fetching ${themeId}.css:`, e);
    }
    return null;
}

// Generate YAML content for a template file
function getTemplateFileContent(templateName) {
    const templates = getDefaultTemplates();
    const template = templates[templateName];
    if (!template) return null;

    // Convert template object to YAML string
    return jsyaml.dump(template, {
        indent: 2,
        lineWidth: -1,  // No line wrapping
        quotingType: '"',
        forceQuotes: false
    });
}

// Check if a system card's content differs from defaults
// Covers: template files (note, code, bookmark) and theme.css
// Note: README.md and CLAUDE.md are excluded - users provide these manually
function isSystemCardModified(card) {
    const defaultContent = getSystemCardDefaultContent(card);
    if (!defaultContent) return false;

    const currentContent = getSystemCardCurrentContent(card);
    return currentContent !== defaultContent;
}

// Legacy alias for backward compatibility
function isTemplateModified(card) {
    return isSystemCardModified(card);
}

// Get the default content for a system card (template or theme.css)
// README.md and CLAUDE.md are excluded - users provide these manually
function getSystemCardDefaultContent(card) {
    // Template files (note.template.yaml, code.template.yaml, bookmark.template.yaml)
    if (card.template === 'template') {
        const defaultTemplateNames = ['note', 'code', 'bookmark'];
        if (defaultTemplateNames.includes(card.name)) {
            return getTemplateFileContent(card.name);
        }
    }

    // theme.css
    if (card.filename === 'theme.css') {
        return getDefaultThemeContent();
    }

    return null;
}

// Get the current content of a system card for comparison
function getSystemCardCurrentContent(card) {
    // Template files - reconstruct YAML
    if (card.template === 'template') {
        return getTemplateFileContentFromCard(card);
    }

    // theme.css - use the content field directly
    if (card.filename === 'theme.css') {
        return card.content || '';
    }

    return '';
}

// Generate YAML from a template card's fields (for comparison with defaults)
function getTemplateFileContentFromCard(card) {
    const templateObj = {
        name: card.name,
        description: card.description,
        schema: card.schema,
        card: card.card,
        viewer: card.viewer,
        editor: card.editor,
        style: card.style,
        ui: card.ui
    };
    // Filter out undefined values to match default generation
    Object.keys(templateObj).forEach(k => templateObj[k] === undefined && delete templateObj[k]);
    return jsyaml.dump(templateObj, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false
    });
}

// Get default theme.css content (loaded from /defaults/theme.css)
// Returns cached content or empty string if not yet loaded
function getDefaultThemeContent() {
    if (defaultThemeContentCache === null) {
        console.warn('[Theme] getDefaultThemeContent called before fetchDefaultThemeContent');
        return '';
    }
    return defaultThemeContentCache;
}

// Settings schema - single source of truth for settings fields and defaults
const SETTINGS_SCHEMA = {
    notebook_title: { default: 'Research Notebook' },
    notebook_subtitle: { default: 'Bookmarks, notes, and connections' },
    sections: { default: [
        { dir: 'assets', visible: false },
        { dir: '.', visible: false },
        { dir: '.notebook', visible: false }
    ] },
    default_author: { default: null },
    authors: { default: [{ name: 'Claude', icon: 'claude.svg' }] },
    theme: { default: null },
    quiz_self_review: { default: true },  // Allow students to self-mark pending questions
    hidden_templates: { default: [] },    // Template names to hide from create buttons
    enabled_templates: { default: ['note', 'bookmark', 'code'] }, // Card types available in this notebook
    quiz_template_mode: { default: false }, // Disable quiz-taking in viewer (for quiz templates)
    source_cards_editable: { default: false }, // Allow editing source code files (default: read-only)
    notes_editable: { default: true }, // Allow editing markdown notes (default: true, disable for foreign repos)
    sort_by: { default: 'modified' }, // Sort cards by: 'modified', 'title', 'created', 'filename'
    preserve_dir_names: { default: false }, // Show directory names as-is (default: Title Case)
    compact_cards: { default: false }, // Smaller cards for viewing large codebases
    excluded_paths: { default: ['node_modules'] }, // Directory names to skip during scan
    grading: { default: null }            // Grading settings: { roster_path, show_student_names }
};

// Build settings object from parsed data, filling in defaults
// Tracks which fields used defaults in _fromDefaults Set
function buildSettingsObject(parsed = {}) {
    const settings = {};
    const fromDefaults = new Set();
    for (const [key, config] of Object.entries(SETTINGS_SCHEMA)) {
        if (parsed[key] !== undefined) {
            // Use parsed value, with special handling for sections
            settings[key] = key === 'sections'
                ? normalizeSectionsFormat(parsed[key])
                : parsed[key];
        } else {
            // Use default (call function if needed)
            settings[key] = typeof config.default === 'function'
                ? config.default()
                : config.default;
            fromDefaults.add(key);
        }
    }
    settings._fromDefaults = fromDefaults;
    return settings;
}

// Generate default settings.yaml content
function getDefaultSettingsContent(title = 'Research Notebook', subtitle = 'Bookmarks, notes, and connections', sections = []) {
    const settings = buildSettingsObject({
        notebook_title: title,
        notebook_subtitle: subtitle,
        sections: sections
    });
    return jsyaml.dump(settings, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false
    });
}

// Global settings object (loaded from settings.yaml)
let notebookSettings = null;

// Global roster object (loaded from roster.yaml, optional)
let notebookRoster = null;

// Load settings from .notebook/settings.yaml
async function loadSettings() {
    if (!storageBackend) {
        notebookSettings = buildSettingsObject();
        return notebookSettings;
    }

    // Load from .notebook/settings.yaml
    try {
        const { content } = await storageBackend.readFile('.notebook/settings.yaml');
        const parsed = jsyaml.load(content);
        notebookSettings = buildSettingsObject(parsed);
        console.log('[Settings] Loaded .notebook/settings.yaml');
        return notebookSettings;
    } catch (e) {
        // .notebook/settings.yaml doesn't exist, use defaults
        console.log('[Settings] No .notebook/settings.yaml found, using defaults');
    }

    // No settings found - use defaults (new notebook)
    notebookSettings = buildSettingsObject();
    return notebookSettings;
}

// Check if a section dir is a special section ([root] or .notebook)
// These sections have fixed names and cannot be renamed
function isSpecialSection(dirOrPath) {
    if (!dirOrPath) return false;
    if (Array.isArray(dirOrPath)) return dirOrPath.includes('.') || dirOrPath.includes('.notebook');
    return dirOrPath === '.' || dirOrPath === '.notebook';
}

// Legacy alias for backwards compatibility
function sectionPathIncludesRoot(path) {
    return isSpecialSection(path);
}

// Normalize sections format: convert various formats to canonical {dir, visible} records
// Supported formats:
//   - String: 'research' -> {dir: 'research', visible: true}
//   - New format: {dir: 'research', visible: true}
//   - Legacy format: {name: 'Research', visible: true} or {name: 'Research', path: 'research'}
//   - Root/config sections: {dir: '.'} or {dir: '.notebook'}
function normalizeSectionsFormat(sections) {
    if (!Array.isArray(sections)) return [];
    const normalized = sections.map(s => {
        if (typeof s === 'string') {
            return { dir: s, visible: true };
        }
        // Determine dir from available fields (prefer dir, then path, then slugified name)
        let dir = s.dir || s.path || (s.name ? slugify(s.name) : '');
        // Handle legacy array path format (e.g., ['.', '.notebook'] → '.')
        if (Array.isArray(dir)) {
            dir = dir.includes('.') ? '.' : dir[0] || '';
        }
        const record = { dir, visible: s.visible !== false };
        return record;
    });
    // Ensure root and .notebook sections always exist (hidden by default)
    if (!normalized.some(s => s.dir === '.')) {
        normalized.push({ dir: '.', visible: false });
    }
    if (!normalized.some(s => s.dir === '.notebook')) {
        normalized.push({ dir: '.notebook', visible: false });
    }
    return normalized;
}

// Convert sections records to directory names array for filesystem operations
function getSectionDirs(sections) {
    return normalizeSectionsFormat(sections).map(s => s.dir);
}

// Load roster from .notebook/roster.yaml (optional student name mappings)
async function loadRoster() {
    if (!storageBackend) {
        notebookRoster = null;
        return null;
    }

    try {
        const { content } = await storageBackend.readFile('.notebook/roster.yaml');
        notebookRoster = jsyaml.load(content);
        console.log('[Roster] Loaded .notebook/roster.yaml');
        return notebookRoster;
    } catch (e) {
        // roster.yaml doesn't exist (optional)
        console.log('[Roster] No .notebook/roster.yaml found');
    }
    notebookRoster = null;
    return null;
}

// Save settings to .notebook/settings.yaml
async function saveSettings() {
    if (!storageBackend || !notebookSettings) return;

    // Create clean object without internal metadata (_fromDefaults)
    const settingsToSave = {};
    for (const key of Object.keys(SETTINGS_SCHEMA)) {
        if (notebookSettings[key] !== undefined) {
            settingsToSave[key] = notebookSettings[key];
        }
    }

    const content = jsyaml.dump(settingsToSave, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false
    });

    // Save to .notebook/settings.yaml (auto-creates .notebook dir)
    await storageBackend.writeFile('.notebook/settings.yaml', content);
    console.log('[Settings] Saved .notebook/settings.yaml');
}

// Load extension registry (uses extensions aggregated from card type modules)
async function loadExtensionRegistry() {
    extensionRegistry = cardTypeExtensions;
    console.log(`[Templates] Using extension registry with ${Object.keys(extensionRegistry).length} extensions`);
    return extensionRegistry;
}

// Default Claude icon SVG (starburst in Anthropic brand color)
const DEFAULT_CLAUDE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 50 350 410"><path fill="#D77655" fill-rule="nonzero" d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z"/></svg>`;

// Load authors from settings and their icon files from assets/author-icons/
async function loadAuthors() {
    authorRegistry = {};

    const authors = notebookSettings?.authors;
    if (!authors || !Array.isArray(authors) || authors.length === 0) {
        console.log('[Authors] No authors defined in settings');
        return authorRegistry;
    }

    // Check if author-icons directory exists
    let hasIconsDir = false;
    if (storageBackend) {
        try {
            await storageBackend.listDirectory('assets/author-icons');
            hasIconsDir = true;
        } catch (e) {
            console.log('[Authors] No assets/author-icons directory found');
        }
    }

    // Load each author's icon
    for (const author of authors) {
        if (!author.name || !author.icon) continue;

        const authorKey = author.name.toLowerCase();
        let iconContent = null;

        // Try to load icon from filesystem
        if (hasIconsDir) {
            try {
                const { content } = await storageBackend.readFile('assets/author-icons/' + author.icon);
                iconContent = content;
                console.log(`[Authors] Loaded icon for ${author.name}`);
            } catch (e) {
                console.log(`[Authors] Icon file not found: ${author.icon}`);
            }
        }

        // Fall back to default Claude icon if this is Claude and no custom icon
        if (!iconContent && authorKey === 'claude') {
            iconContent = DEFAULT_CLAUDE_ICON;
            console.log(`[Authors] Using default icon for Claude`);
        }

        if (iconContent) {
            authorRegistry[authorKey] = iconContent;
        }
    }

    console.log(`[Authors] Loaded ${Object.keys(authorRegistry).length} author(s)`);

    return authorRegistry;
}

// Load templates: core card types + instance overrides from .notebook/card-types/
async function loadTemplates() {
    // Fetch default templates from server (ensures settings is always available)
    // Pass enabled_templates from settings to control which card types get fully loaded
    const enabledTypes = notebookSettings?.enabled_templates || null;
    const defaults = await fetchDefaultTemplates(enabledTypes);
    templateRegistry = { ...defaults };

    if (!storageBackend) {
        return templateRegistry;
    }

    // Load instance card type overrides from .notebook/card-types/
    // (template.yaml, styles.css, index.js - all optional, deep-merged with core)
    await loadInstanceCardTypes();

    // Expose templateRegistry to framework.js for card type modules
    if (window.notebook) {
        window.notebook.templateRegistry = templateRegistry;
    }

    return templateRegistry;
}

// Load theme CSS: base theme from /themes/ + customizations from .notebook/theme.css
async function loadThemeCss() {
    if (!storageBackend) return;

    // Remove any existing theme style elements
    const existingBase = document.getElementById('theme-base-css');
    if (existingBase) existingBase.remove();
    const existingCustom = document.getElementById('theme-custom-css');
    if (existingCustom) existingCustom.remove();

    // 1. Load base theme from /themes/{id}.css if set in settings
    const baseThemeId = notebookSettings?.theme;
    if (baseThemeId) {
        try {
            const baseCSS = await fetchThemeCSS(baseThemeId);
            if (baseCSS) {
                const baseStyle = document.createElement('style');
                baseStyle.id = 'theme-base-css';
                baseStyle.textContent = `@layer theme {\n${baseCSS}\n}`;
                document.head.appendChild(baseStyle);
                console.log(`[Theme] Loaded base theme: ${baseThemeId}`);
            }
        } catch (e) {
            console.error(`[Theme] Error loading base theme ${baseThemeId}:`, e);
        }
    }

    // 2. Load customizations from .notebook/theme.css (layered on top)
    try {
        const { content } = await storageBackend.readFile('.notebook/theme.css');

        // Create and inject style element, wrapped in @layer theme
        // This loads after base theme, so customizations take precedence
        const style = document.createElement('style');
        style.id = 'theme-custom-css';
        style.textContent = `@layer theme {\n${content}\n}`;
        document.head.appendChild(style);
        console.log('[Theme] Loaded .notebook/theme.css customizations');
    } catch (e) {
        // File doesn't exist, that's fine (theme.css is optional)
        if (!baseThemeId) {
            console.log('[Theme] No theme configured');
        }
    }
}

// Inject CSS variables from template style definitions
function injectTemplateStyles() {
    // Remove any existing template styles
    const existing = document.getElementById('template-styles');
    if (existing) {
        existing.remove();
    }

    // Core variables that templates should not override
    const protectedVars = ['--code-bg', '--code-text', '--bg-primary', '--bg-secondary',
                           '--text-primary', '--text-secondary', '--text-muted', '--accent',
                           '--border', '--shadow', '--link-color', '--link-hover', '--note-border'];

    const rules = Object.values(templateRegistry).map(t => {
        if (!t.style?.variables) return '';

        const vars = Object.entries(t.style.variables)
            .filter(([k]) => !protectedVars.includes(k))
            .map(([k, v]) => `${k}: ${v};`)
            .join('\n  ');

        return `.card[data-template="${t.name}"],
.modal.viewer[data-template="${t.name}"] {
  ${vars}
}`;
    }).filter(r => r);

    if (rules.length > 0) {
        const style = document.createElement('style');
        style.id = 'template-styles';
        style.textContent = rules.join('\n\n');
        document.head.appendChild(style);
        console.log('[Templates] Injected template CSS variables');
    }
}

// Ensure config files exist in .notebook/ directory (creates them if missing)
async function ensureTemplateFiles() {
    if (!storageBackend) return;

    let createdFiles = [];

    // Ensure .notebook/ and .notebook/templates/ directories exist
    await storageBackend.mkdir('.notebook');
    await storageBackend.mkdir('.notebook/templates');

    // Files to create in .notebook/
    const configFiles = [
        { name: 'settings.yaml', getContent: getDefaultSettingsContent },
        { name: 'theme.css', getContent: getDefaultThemeContent }
    ];

    // Create config files in .notebook/
    for (const { name, getContent } of configFiles) {
        const path = `.notebook/${name}`;
        if (await storageBackend.exists(path)) continue;
        try {
            await storageBackend.writeFile(path, getContent());
            createdFiles.push(path);
            console.log(`[Templates] Created ${path}`);
        } catch (writeError) {
            console.error(`[Templates] Error creating ${path}:`, writeError);
        }
    }

    // Note: Card type templates are no longer auto-created here.
    // Users can override card types via .notebook/card-types/{type}/

    // Ensure assets/author-icons directory and default claude.svg exist
    try {
        await storageBackend.mkdir('assets/author-icons');

        // Create default claude.svg if it doesn't exist
        if (!await storageBackend.exists('assets/author-icons/claude.svg')) {
            try {
                await storageBackend.writeFile('assets/author-icons/claude.svg', DEFAULT_CLAUDE_ICON);
                createdFiles.push('assets/author-icons/claude.svg');
                console.log('[Templates] Created default claude.svg icon');
            } catch (writeError) {
                console.error('[Templates] Error creating claude.svg:', writeError);
            }
        }
    } catch (e) {
        console.error('[Templates] Error creating author-icons directory:', e);
    }

    if (createdFiles.length > 0) {
        showToast(`Created config files: ${createdFiles.join(', ')}`);
    }

    return createdFiles;
}

// ===== Parsers =====
// Parse file content based on parser type from extension registry

const parsers = {
    // Parse markdown with YAML frontmatter
    'yaml-frontmatter': {
        parse(content) {
            const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
            if (match) {
                // Use js-yaml for proper YAML parsing (handles quotes, arrays, etc.)
                try {
                    const frontmatter = jsyaml.load(match[1]) || {};
                    return {
                        frontmatter,
                        body: match[2].trim() || null
                    };
                } catch (e) {
                    console.warn('[Parser] YAML parse error, falling back to simple parse:', e);
                    // Fallback to simple key-value parsing
                    const frontmatter = {};
                    match[1].split('\n').forEach(line => {
                        const m = line.match(/^(\w+):\s*(.*)$/);
                        if (m) {
                            let value = m[2];
                            // Strip quotes if present
                            if ((value.startsWith('"') && value.endsWith('"')) ||
                                (value.startsWith("'") && value.endsWith("'"))) {
                                value = value.slice(1, -1);
                            }
                            frontmatter[m[1]] = value;
                        }
                    });
                    return { frontmatter, body: match[2].trim() || null };
                }
            }
            // No frontmatter, entire content is body
            return { frontmatter: {}, body: content };
        }
    },

    // Parse Python with comment-based frontmatter
    'comment-frontmatter': {
        parse(content) {
            const lines = content.split('\n');
            const frontmatter = {};
            let bodyStart = 0;
            let inFrontmatter = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === '# ---') {
                    if (!inFrontmatter) {
                        inFrontmatter = true;
                        continue;
                    } else {
                        bodyStart = i + 1;
                        break;
                    }
                }
                if (inFrontmatter) {
                    const match = line.match(/^# (\w+):\s*(.*)$/);
                    if (match) {
                        let value = match[2];
                        // Strip quotes if present
                        if ((value.startsWith('"') && value.endsWith('"')) ||
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        // Convert boolean strings
                        if (value === 'true') value = true;
                        else if (value === 'false') value = false;
                        frontmatter[match[1]] = value;
                    }
                } else if (line.trim() && !line.startsWith('#')) {
                    // Non-comment, non-empty line before frontmatter - no frontmatter
                    bodyStart = 0;
                    break;
                }
            }

            return {
                frontmatter,
                body: lines.slice(bodyStart).join('\n').trim() || null
            };
        }
    },

    // Parse JSON file
    'json': {
        parse(content) {
            return { frontmatter: JSON.parse(content), body: null };
        }
    },

    // Parse YAML file
    'yaml': {
        parse(content) {
            return { frontmatter: jsyaml.load(content), body: null };
        }
    },

    // Parse source code file (no frontmatter expected, entire file is content)
    'source-code': {
        parse(content) {
            return { frontmatter: {}, body: content };
        }
    }
};

// ===== Serializers =====
// Serialize card data back to file content

// Format a value for YAML output (quote strings with special chars)
function formatYamlValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return '[' + value.map(v => formatYamlValue(v)).join(', ') + ']';
    const str = String(value);
    // Quote if contains YAML special chars or could be misinterpreted
    if (/[:#\[\]{}|>&*!?,]/.test(str) || /^['"]/.test(str) || str.trim() !== str) {
        // Use double quotes with escaping
        return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }
    return str;
}

const serializers = {
    // Serialize to markdown with YAML frontmatter
    'yaml-frontmatter': {
        serialize(frontmatter, body) {
            const lines = ['---'];
            for (const [key, value] of Object.entries(frontmatter)) {
                if (value !== undefined && value !== null) {
                    lines.push(`${key}: ${formatYamlValue(value)}`);
                }
            }
            lines.push('---', '');
            if (body) {
                lines.push(body);
            }
            return lines.join('\n');
        }
    },

    // Serialize to Python with comment-based frontmatter
    'comment-frontmatter': {
        serialize(frontmatter, body) {
            const lines = ['# ---'];
            for (const [key, value] of Object.entries(frontmatter)) {
                if (value !== undefined && value !== null) {
                    lines.push(`# ${key}: ${formatYamlValue(value)}`);
                }
            }
            lines.push('# ---', '');
            if (body) {
                lines.push(body);
            }
            return lines.join('\n');
        }
    },

    // Serialize to JSON
    'json': {
        serialize(frontmatter, body) {
            return JSON.stringify(frontmatter, null, 2);
        }
    },

    // Serialize to YAML
    'yaml': {
        serialize(frontmatter, body) {
            return jsyaml.dump(frontmatter, { indent: 2, lineWidth: -1 });
        }
    },

    // Serialize source code (just the raw content, no frontmatter)
    'source-code': {
        serialize(frontmatter, body) {
            return body || '';
        }
    }
};

// Get extension config for a filename
function getExtensionConfig(filename) {
    if (!extensionRegistry) {
        extensionRegistry = cardTypeExtensions;
    }
    // Check extensions in order of specificity (longer matches first)
    const extensions = Object.keys(extensionRegistry).sort((a, b) => b.length - a.length);
    for (const ext of extensions) {
        if (filename.endsWith(ext)) {
            return { extension: ext, config: extensionRegistry[ext] };
        }
    }
    return null;
}

// Load a card from file content using extension registry
function loadCard(filename, content, sectionName, companionData = {}) {
    const extMatch = getExtensionConfig(filename);
    if (!extMatch) {
        console.warn(`[Templates] Unknown extension for ${filename}`);
        return null;
    }

    const { extension, config } = extMatch;
    const parser = parsers[config.parser];
    if (!parser) {
        console.warn(`[Templates] Unknown parser: ${config.parser}`);
        return null;
    }

    // Parse file content
    const { frontmatter, body } = parser.parse(content);

    // Determine template (frontmatter overrides extension default)
    const templateName = frontmatter.template || config.defaultTemplate;
    if (!templateName) {
        console.warn(`[Templates] No template specified for ${filename}`);
        return null;
    }

    // Assign body to bodyField (defined by extension)
    if (body && config.bodyField) {
        frontmatter[config.bodyField] = body;
    }

    // Add companion file data
    if (config.companionFiles) {
        for (const companion of config.companionFiles) {
            if (companionData[companion.field]) {
                frontmatter[companion.field] = companionData[companion.field];
            }
        }
    }

    // Ensure ID exists and is always a string (YAML may parse numeric IDs as numbers)
    if (!frontmatter.id) {
        // Generate unique ID from filename + timestamp to avoid collisions
        // when multiple files (especially source files) are loaded in the same millisecond
        frontmatter.id = `${slugify(filename)}-${Date.now()}`;
    } else {
        frontmatter.id = String(frontmatter.id);
    }

    // For backwards compatibility, set 'type' field based on template
    // This ensures existing render functions work
    frontmatter.type = templateName;

    // Set language for code/source files (required by render functions)
    // Use language from extension config, or default for .code.py
    if (config.language) {
        frontmatter.language = config.language;
    } else if (extension === '.code.py') {
        frontmatter.language = 'python';
    }

    // Infer title from filename if not in frontmatter (for source files and similar)
    if (!frontmatter.title) {
        frontmatter.title = filename;
    }

    // Store source info for saving
    frontmatter._source = {
        filename,
        format: config.parser,
        section: sectionName,
        extension
    };

    // For backwards compatibility with old code, also store _filename
    if (extension === '.md') {
        frontmatter._filename = filename;
    } else if (extension === '.code.py') {
        frontmatter._filename = filename.replace('.code.py', '');
    } else if (extension === '.bookmark.json') {
        frontmatter._filename = filename.replace('.bookmark.json', '');
    }

    return frontmatter;
}

// Prepare card data for saving (serialize to file content)
function serializeCard(card) {
    // Determine format from _source or derive from type
    let format, bodyField, extension;

    if (card._source) {
        const extConfig = extensionRegistry?.[card._source.extension];
        format = card._source.format;
        bodyField = extConfig?.bodyField;
        extension = card._source.extension;

        // Fallback: if extension registry lookup failed, derive bodyField from format
        if (!bodyField) {
            if (format === 'yaml-frontmatter') {
                bodyField = 'content';
            } else if (format === 'comment-frontmatter') {
                bodyField = 'code';
            }
        }
    } else {
        // New card - determine format from template/type
        // First try to look up extension from templateRegistry
        const templateName = card.template || card.type;
        const template = templateRegistry?.[templateName];

        if (template?.extensions) {
            // Get first (primary) extension from template
            const primaryExt = Object.keys(template.extensions)[0];
            const extConfig = template.extensions[primaryExt];
            extension = primaryExt;
            format = extConfig.parser;
            // Get bodyField from extensionRegistry (which has full config)
            bodyField = extensionRegistry?.[primaryExt]?.bodyField || null;
        } else if (card.type === 'note' || card.template === 'note') {
            format = 'yaml-frontmatter';
            bodyField = 'content';
            extension = '.md';
        } else if (card.type === 'code' || card.template === 'code') {
            format = 'comment-frontmatter';
            bodyField = 'code';
            extension = '.code.py';
        } else if (card.type === 'bookmark' || card.template === 'bookmark') {
            format = 'json';
            bodyField = null;
            extension = '.bookmark.json';
        } else {
            format = 'yaml';
            bodyField = null;
            extension = '.card.yaml';
        }
    }

    // Clone card data without internal fields (underscore-prefixed and type)
    const frontmatter = {};
    for (const [key, value] of Object.entries(card)) {
        if (!key.startsWith('_') && key !== 'type') {
            frontmatter[key] = value;
        }
    }

    // Extract body field for formats that separate it
    let body = null;

    if (bodyField && format !== 'yaml' && format !== 'json') {
        body = frontmatter[bodyField];
        delete frontmatter[bodyField];
    }

    // For JSON format (bookmarks), keep type for backwards compatibility
    if (format === 'json' && card.type) {
        frontmatter.type = card.type;
    }

    const serializer = serializers[format];
    const content = serializer.serialize(frontmatter, body);

    return { content, extension, format, bodyField };
}

// ===== Generic Card Rendering =====
// Template-driven card rendering that replaces type-specific renderers

// Render author badge using authorRegistry (loaded from settings.yaml)
function renderAuthorBadge(card) {
    if (!card.author) return '';
    const authorKey = card.author.toLowerCase();
    const iconSvg = authorRegistry[authorKey];
    if (iconSvg) {
        return `<div class="author-badge" title="Authored by ${escapeHtml(card.author)}">${iconSvg}</div>`;
    }
    return '';
}

// Normalize tags to array (handles array, string, or YAML-style "[a, b, c]" string)
function normalizeTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags;
    let str = String(tags).trim();
    // Handle YAML-style array string: "[tag1, tag2, tag3]"
    if (str.startsWith('[') && str.endsWith(']')) {
        str = str.slice(1, -1);
    }
    return str.split(',').map(t => t.trim()).filter(t => t);
}

// Render tag badges (traffic light colors for status tags)
// Set noWrapper=true when inserting into an existing container element
function renderTagBadges(card, containerClass = 'tag-badges', noWrapper = false) {
    const tags = normalizeTags(card.tags);
    if (tags.length === 0) return '';
    const badges = tags.map(tag => {
        const normalizedTag = tag.toLowerCase().trim();
        return `<span class="tag-badge" data-tag="${escapeHtml(normalizedTag)}">${escapeHtml(tag)}</span>`;
    }).join('');
    return noWrapper ? badges : `<div class="${containerClass}">${badges}</div>`;
}

// Compare version-style numbers (e.g., "1.1" < "1.2" < "1.10" < "2.0")
function compareVersionNumbers(a, b) {
    const aParts = String(a).split('.').map(Number);
    const bParts = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
}

// Sort section items by: number field, then modified date
function sortSectionItems(section) {
    // Get card type order from manifest (note, bookmark, image, code, source, etc.)
    const typeOrder = Object.keys(availableCardTypes);

    section.items.sort((a, b) => {
        // 1. Number field (supports "1.1" versioning for explicit ordering)
        if (a.number != null && b.number != null) {
            const cmp = compareVersionNumbers(a.number, b.number);
            if (cmp !== 0) return cmp;
        } else if (a.number != null) {
            return -1;  // Items with number come first
        } else if (b.number != null) {
            return 1;
        }

        // 2. Card type order (standard types before source files)
        const aTypeIdx = typeOrder.indexOf(a.type);
        const bTypeIdx = typeOrder.indexOf(b.type);
        // Unknown types go to end
        const aOrder = aTypeIdx >= 0 ? aTypeIdx : 999;
        const bOrder = bTypeIdx >= 0 ? bTypeIdx : 999;
        if (aOrder !== bOrder) return aOrder - bOrder;

        // 3. Sort by setting (default: modified date newest first)
        const sortBy = notebookSettings?.sort_by || 'modified';
        switch (sortBy) {
            case 'title':
                return (a.title || '').localeCompare(b.title || '');
            case 'filename':
                const aFile = a._source?.filename || a.title || '';
                const bFile = b._source?.filename || b.title || '';
                return aFile.localeCompare(bFile);
            case 'created':
                const aCreated = new Date(a.created || 0).getTime();
                const bCreated = new Date(b.created || 0).getTime();
                return bCreated - aCreated;  // newest first
            case 'modified':
            default:
                const aTime = a._fileModified || new Date(a.modified || 0).getTime();
                const bTime = b._fileModified || new Date(b.modified || 0).getTime();
                return bTime - aTime;  // newest first
        }
    });
}

function renderCard(sectionId, card) {
    const template = templateRegistry[card.template || card.type];
    if (!template) {
        console.warn(`[Render] Unknown template: ${card.template || card.type}`);
        return '';
    }

    const preview = renderCardPreview(card, template);
    const title = renderCardTitle(card, template);
    const meta = renderCardMeta(card, template);

    // Check if title should be a link (template-driven)
    const titleLinkField = template.card?.title_link_field;
    const titleLinkUrl = titleLinkField ? card[titleLinkField] : null;
    const titleHtml = titleLinkUrl
        ? `<a href="${escapeHtml(titleLinkUrl)}" target="_blank" onclick="event.stopPropagation()" title="Open link">${escapeHtml(title)}</a>`
        : escapeHtml(title);

    // Check if this is a modified template
    const isModified = isTemplateModified(card);
    const modifiedClass = isModified ? ' template-modified' : '';
    const modifiedBadge = isModified ? '<span class="modified-badge">MODIFIED</span>' : '';
    const tagBadges = renderTagBadges(card);

    // Check for git diff mode changes
    const hasChanges = cardHasChanges(card);
    const changesClass = hasChanges ? ' has-changes' : '';
    const diffStats = getCardDiffStats(card);
    const diffStatsBadge = diffStats ? `
        <div class="diff-stats">
            ${diffStats.additions > 0 ? `<span class="additions">+${diffStats.additions}</span>` : ''}
            ${diffStats.deletions > 0 ? `<span class="deletions">-${diffStats.deletions}</span>` : ''}
            ${diffStats.untracked ? '<span class="additions">new</span>' : ''}
        </div>
    ` : '';

    return `
        <div class="card${modifiedClass}${changesClass}"
             data-template="${template.name}"
             data-topic="${card.topic || ''}"
             data-item-id="${card.id}"
             data-section-id="${sectionId}"
             onclick="openViewer('${sectionId}', '${card.id}')">
            ${modifiedBadge}
            ${diffStatsBadge}
            <div class="card-preview">${preview}</div>
            <div class="card-content">
                <h3 class="card-title">${titleHtml}</h3>
                ${tagBadges}
            </div>
            <div class="card-meta">
                ${meta}
            </div>
        </div>
    `;
}

// Render card preview based on template layout
function renderCardPreview(card, template) {
    const layout = template.card?.layout || 'document';
    const placeholder = template.card?.placeholder || '';
    const templateName = template.name;

    // Check for custom renderer from card type module first
    const customRenderer = cardTypeRenderers[templateName];
    if (customRenderer?.renderPreview) {
        return customRenderer.renderPreview(card, template);
    }

    // Fall back to built-in layout renderers
    switch (layout) {
        case 'document':
            return renderDocumentPreview(card, template);
        case 'image':
            return renderImagePreview(card, template);
        case 'split-pane':
            return renderSplitPanePreview(card, template);
        case 'fields':
            return renderFieldsPreview(card, template);
        case 'yaml':
            return renderYamlPreview(card, template);
        default:
            return `<div class="preview-placeholder">${placeholder}</div>`;
    }
}

// Document layout: rendered markdown content
function renderDocumentPreview(card, template) {
    const field = template.card?.preview_field || 'content';
    const content = card[field];
    const placeholder = template.card?.placeholder || '📄';
    const authorBadge = renderAuthorBadge(card);

    if (!content) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }

    // Check field type for rendering
    const fieldDef = template.schema?.[field];
    const fieldType = fieldDef?.type || 'text';
    const format = card.format || 'markdown';

    if (fieldType === 'yaml') {
        // YAML fields: convert object to string for preview
        const yamlStr = typeof content === 'object' ? jsyaml.dump(content, { indent: 2, lineWidth: -1 }) : String(content);
        return `<pre class="preview-code">${escapeHtml(yamlStr.substring(0, 400))}</pre>`;
    } else if (fieldType === 'code') {
        // Code fields: monospace with language class (check before 'content' field name)
        // Language can come from field definition or card data (for source files)
        const language = fieldDef?.language || card.language || 'python';
        // Source cards use minimap preview with tiny font, so show more characters
        const previewLength = card.type === 'source' ? 2000 : 800;
        const codePreview = escapeHtml(content.substring(0, previewLength));
        return `<pre class="preview-code"><code class="language-${language}">${codePreview || 'No code'}</code></pre>`;
    } else if (fieldType === 'markdown' || field === 'content') {
        // Use existing renderNotePreview for markdown
        const previewHtml = renderNotePreview(content, format, 1200, card._path);
        if (!previewHtml) {
            return `<div class="preview-placeholder">${placeholder}</div>`;
        }
        return `<div class="preview-page">${authorBadge}<div class="preview-scaler"><div class="md-content preview-content">${previewHtml}</div></div></div>`;
    } else if (typeof content === 'object') {
        // Handle any object that slipped through
        const str = JSON.stringify(content, null, 2);
        return `<pre class="preview-code">${escapeHtml(str.substring(0, 400))}</pre>`;
    } else {
        return `<div class="preview-text">${escapeHtml(String(content).substring(0, 300))}</div>`;
    }
}

// Image layout: thumbnail/image preview
function renderImagePreview(card, template) {
    const field = template.card?.preview_field || 'thumbnail';
    const src = card[field];
    const placeholder = template.card?.placeholder || '🔗';

    if (!src) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }
    return `<img src="${escapeHtml(src)}" alt="" loading="lazy" class="preview-image" onerror="this.parentElement.innerHTML='<div class=\\'preview-placeholder\\'>${placeholder}</div>'">`;
}

// Split-pane layout: left/right split
function renderSplitPanePreview(card, template) {
    const slots = template.card?.slots;
    const placeholder = template.card?.placeholder || '';
    const authorBadge = renderAuthorBadge(card);

    if (!slots) {
        return renderDocumentPreview(card, template);
    }

    const leftField = slots.left?.field;
    const rightField = slots.right?.field;
    const leftContent = card[leftField];
    const rightContent = card[rightField];

    // If no left content (e.g., no output), fall back to simpler layout
    if (!leftContent && template.card?.fallback_layout) {
        const fallbackField = template.card?.fallback_field || rightField;
        const fallbackContent = card[fallbackField];
        if (!fallbackContent) {
            return `<div class="preview-placeholder">${placeholder}</div>`;
        }
        // Render as code preview for code template
        const leftFieldDef = template.schema?.[fallbackField];
        if (leftFieldDef?.type === 'code') {
            // Language can come from field definition or card data (for source files)
            const language = leftFieldDef?.language || card.language || 'python';
            const codePreview = escapeHtml(fallbackContent.substring(0, 800));
            return `<pre class="preview-code"><code class="language-${language}">${codePreview}</code></pre>`;
        }
        return `<div class="preview-text">${escapeHtml(fallbackContent.substring(0, 300))}</div>`;
    }

    // Render split pane
    const leftWidth = slots.left?.width || '60%';
    const rightWidth = slots.right?.width || '40%';

    // Determine how to render each side based on field type
    const leftFieldDef = template.schema?.[leftField];
    const rightFieldDef = template.schema?.[rightField];

    let leftHtml = '';
    if (leftFieldDef?.type === 'html') {
        leftHtml = `<div class="split-output-content">${leftContent || ''}</div>`;
    } else {
        leftHtml = `<div class="split-content">${escapeHtml(leftContent || '')}</div>`;
    }

    let rightHtml = '';
    if (rightFieldDef?.type === 'code') {
        const codePreview = escapeHtml((rightContent || '').substring(0, 800));
        rightHtml = `<pre class="split-code"><code class="language-${rightFieldDef?.language || 'python'}">${codePreview}</code></pre>`;
    } else {
        rightHtml = `<div class="split-content">${escapeHtml((rightContent || '').substring(0, 300))}</div>`;
    }

    return `
        <div class="preview-split">
            ${authorBadge}
            <div class="preview-split-left" style="flex: 0 0 ${leftWidth}">
                ${leftHtml}
            </div>
            <div class="preview-split-right" style="flex: 1">
                ${rightHtml}
            </div>
        </div>
    `;
}

// Fields layout: key-value display
function renderFieldsPreview(card, template) {
    const fields = template.card?.preview_fields || Object.keys(template.schema || {}).slice(0, 3);
    const placeholder = template.card?.placeholder || '';

    if (fields.length === 0) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }

    return `<div class="preview-fields">
        ${fields.map(f => `
            <div class="preview-field">
                <span class="preview-field-label">${f}:</span>
                <span class="preview-field-value">${escapeHtml(card[f] || '')}</span>
            </div>
        `).join('')}
    </div>`;
}

// YAML layout: show all schema fields as YAML
function renderYamlPreview(card, template) {
    const placeholder = template.card?.placeholder || '📄';
    const schema = template.schema || {};

    // Build object from schema fields (excluding internal fields)
    const previewObj = {};
    for (const field of Object.keys(schema)) {
        if (card[field] !== undefined && card[field] !== null) {
            previewObj[field] = card[field];
        }
    }

    if (Object.keys(previewObj).length === 0) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }

    const yamlStr = jsyaml.dump(previewObj, { indent: 2, lineWidth: -1 });
    return `<pre class="preview-yaml">${escapeHtml(yamlStr)}</pre>`;
}

// Render card title (may use template formatting)
function renderCardTitle(card, template) {
    if (template.card?.title_template) {
        // Simple template replacement: {{field}}
        return template.card.title_template.replace(/\{\{(\w+)\}\}/g, (match, field) => {
            return card[field] || '';
        });
    }
    return card.title || 'Untitled';
}

// Render card metadata
function renderCardMeta(card, template) {
    const created = card.created || card.modified;
    const modified = card.modified;

    let meta = '';

    // For image cards, show path and filesize instead of dates
    if (card.template === 'image' || card.type === 'image') {
        if (card.path) {
            meta += `<span class="card-meta-path">${escapeHtml(card.path)}</span>`;
        }
        if (card.filesize) {
            meta += `<span>${escapeHtml(card.filesize)}</span>`;
        }
        return meta || `<span>${formatDate(created)}</span>`;
    }

    // For source cards, show language and line count
    if (card.template === 'source' || card.type === 'source') {
        if (card.language) {
            meta += `<span>${escapeHtml(card.language)}</span>`;
        }
        if (card.lineCount) {
            meta += `<span>${card.lineCount} lines</span>`;
        }
        return meta || `<span>${formatDate(modified)}</span>`;
    }

    meta = `<span>${formatDate(created)}</span>`;
    if (modified && created && modified !== created) {
        meta += `<span>Updated ${formatDate(modified)}</span>`;
    }
    return meta;
}

// ===== Generic Viewer =====
// Template-driven viewer that replaces type-specific viewers

let currentViewingCard = null;

function openViewer(sectionId, itemId) {
    // Convert itemId to string for comparison (YAML may parse numeric IDs as numbers)
    const itemIdStr = String(itemId);
    const section = data.sections.find(s => s.id === sectionId);
    const card = section?.items.find(i => String(i.id) === itemIdStr);

    if (!card) {
        console.warn(`[Viewer] Card not found: ${sectionId}/${itemId}`);
        return;
    }

    const template = templateRegistry[card.template || card.type];
    if (!template) {
        console.warn(`[Viewer] Unknown template: ${card.template || card.type}`);
        return;
    }

    currentViewingCard = { ...card, sectionId };

    // Set title
    document.getElementById('viewerTitle').textContent = card.title || 'Untitled';

    // Set tags
    document.getElementById('viewerTags').innerHTML = renderTagBadges(card, '', true);

    // Render content based on viewer layout, with author badge inside content area
    const contentEl = document.getElementById('viewerContent');

    // In diff mode with changes, show diff content
    if (diffMode.active && cardHasChanges(card)) {
        contentEl.innerHTML = '<div class="viewer-loading">Loading diff...</div>';
        // Load diff asynchronously
        getCardDiff(card).then(diffResult => {
            if (diffResult) {
                const diffStats = getCardDiffStats(card);
                const statsText = diffStats ? `+${diffStats.additions} -${diffStats.deletions}` : '';

                if (diffResult.type === 'rich') {
                    // Rich diff for markdown - side by side rendered view
                    contentEl.innerHTML = `
                        <div class="viewer-diff-header">
                            <span class="diff-comparing">Changes since ${diffMode.commitInfo?.shortHash || 'commit'}</span>
                            <span class="diff-stats-inline">${statsText}</span>
                        </div>
                        ${diffResult.html}
                    `;
                } else if (diffResult.type === 'image') {
                    // Image diff - show old and new side by side
                    const oldPanel = diffResult.oldSrc
                        ? `<div class="image-diff-panel image-diff-old">
                               <div class="image-diff-label">Removed</div>
                               <img src="${diffResult.oldSrc}" alt="Previous version">
                           </div>`
                        : '';
                    const newPanel = diffResult.newSrc
                        ? `<div class="image-diff-panel image-diff-new">
                               <div class="image-diff-label">${diffResult.isNew ? 'New file' : 'Added'}</div>
                               <img src="${diffResult.newSrc}" alt="Current version">
                           </div>`
                        : '';
                    contentEl.innerHTML = `
                        <div class="viewer-diff-header">
                            <span class="diff-comparing">Changes since ${diffMode.commitInfo?.shortHash || 'commit'}</span>
                        </div>
                        <div class="image-diff-container">
                            ${oldPanel}
                            ${newPanel}
                        </div>
                    `;
                } else {
                    // Unified diff for code/other files
                    contentEl.innerHTML = `
                        <div class="viewer-diff-header">
                            <span class="diff-comparing">Changes since ${diffMode.commitInfo?.shortHash || 'commit'}</span>
                            <span class="diff-stats-inline">${statsText}</span>
                        </div>
                        <pre class="diff-content viewer-diff">${diffResult.html}</pre>
                    `;
                }
            } else {
                contentEl.innerHTML = renderViewerContent(card, template) + renderAuthorBadge(card);
            }
        });
    } else {
        contentEl.innerHTML = renderViewerContent(card, template) + renderAuthorBadge(card);
    }

    // Apply syntax highlighting if needed (for non-diff content)
    if (!diffMode.active || !cardHasChanges(card)) {
        contentEl.querySelectorAll('pre code').forEach(el => {
            if (!el.getAttribute('data-highlighted')) {
                hljs.highlightElement(el);
            }
        });
    }

    // Add backlinks
    const backlinks = findBacklinks(itemId);
    const backlinksEl = document.getElementById('viewerBacklinks');
    if (backlinks.length > 0) {
        backlinksEl.innerHTML = `
            <div class="backlinks">
                <div class="backlinks-title">Linked from</div>
                <div class="backlinks-list">
                    ${backlinks.map(bl => `
                        <span class="backlink-item internal-link" data-link-section="${bl.sectionId}" data-link-item="${bl.id}">${escapeHtml(bl.title)}</span>
                    `).join('')}
                </div>
            </div>
        `;
    } else {
        backlinksEl.innerHTML = '';
    }

    // Set meta info
    const isSystemNote = card.system && card.type === 'note';
    const isSourceCard = card.template === 'source' || card.type === 'source';
    let metaText;
    if (isSourceCard) {
        // Show language and line count for source cards
        const parts = [];
        if (card.language) parts.push(card.language);
        if (card.lineCount) parts.push(`${card.lineCount} lines`);
        if (card.modified) parts.push(`Modified ${formatDate(card.modified)}`);
        metaText = parts.join(' · ');
    } else if (isSystemNote) {
        metaText = card.modified ? `Modified ${formatDate(card.modified)}` : '';
    } else {
        metaText = formatDate(card.created || card.modified);
        if (card.modified && card.created && card.modified !== card.created) {
            metaText += ` · Updated ${formatDate(card.modified)}`;
        }
    }
    document.getElementById('viewerMeta').textContent = metaText;

    // Configure action buttons based on template
    const actionsEl = document.getElementById('viewerActions');
    actionsEl.innerHTML = renderViewerActions(card, template, isSystemNote);

    // Set template attribute on modal for CSS styling
    const modal = document.getElementById('viewerModal');
    const modalInner = modal.querySelector('.modal');
    modalInner.setAttribute('data-template', template.name);
    modalInner.setAttribute('data-topic', card.topic || '');

    // Add modified indicator for templates that differ from defaults
    const isModified = isTemplateModified(card);
    modalInner.classList.toggle('template-modified', isModified);

    modal.classList.add('active');
}

// Refresh the viewer if it's open (called after filesystem reload)
function refreshOpenViewer() {
    const modal = document.getElementById('viewerModal');
    if (!modal?.classList.contains('active') || !currentViewingCard) {
        return;
    }

    // Find the updated card in the reloaded data
    const cardId = currentViewingCard.id;
    const sectionId = currentViewingCard.sectionId;
    const card = findCardById(cardId);

    if (!card) {
        console.log('[Viewer] Card no longer exists after reload');
        return;
    }

    const template = templateRegistry[card.template || card.type];
    if (!template) return;

    // Update currentViewingCard reference
    currentViewingCard = { ...card, sectionId };

    // Re-render content
    const contentEl = document.getElementById('viewerContent');
    contentEl.innerHTML = renderViewerContent(card, template) + renderAuthorBadge(card);

    // Apply syntax highlighting if needed
    contentEl.querySelectorAll('pre code').forEach(el => {
        if (!el.getAttribute('data-highlighted')) {
            hljs.highlightElement(el);
        }
    });

    console.log('[Viewer] Refreshed open viewer for card:', cardId);
}

function renderViewerContent(card, template) {
    const layout = template.viewer?.layout || 'document';
    const templateName = template.name;

    // Check for custom renderer from card type module first
    const customRenderer = cardTypeRenderers[templateName];
    if (customRenderer?.renderViewer) {
        return customRenderer.renderViewer(card, template);
    }

    // Fall back to built-in layout renderers
    switch (layout) {
        case 'document':
            return renderViewerDocument(card, template);
        case 'image':
            return renderViewerImage(card, template);
        case 'split-pane':
            return renderViewerSplitPane(card, template);
        case 'sections':
            return renderViewerSections(card, template);
        case 'yaml':
            return renderViewerYaml(card, template);
        default:
            return renderViewerDocument(card, template);
    }
}

// Document viewer: single content area
function renderViewerDocument(card, template) {
    const field = template.viewer?.content_field || 'content';
    const content = card[field];
    const format = card.format || 'markdown';

    if (!content) {
        return '<div class="viewer-empty">No content</div>';
    }

    // Check field type
    const fieldDef = template.schema?.[field];
    const fieldType = fieldDef?.type || 'text';

    if (fieldType === 'yaml') {
        // YAML fields: convert object to YAML string for display
        const yamlStr = typeof content === 'object' ? jsyaml.dump(content, { indent: 2, lineWidth: -1 }) : content;
        return `<pre class="viewer-text">${escapeHtml(yamlStr)}</pre>`;
    } else if (format === 'text' || format === 'yaml' || fieldType === 'text') {
        return `<pre class="viewer-text">${escapeHtml(content)}</pre>`;
    } else if (fieldType === 'code') {
        // Language can come from field definition or card data (for source files)
        const language = fieldDef?.language || card.language || 'python';
        return `<div class="viewer-code"><pre><code class="language-${language}">${escapeHtml(content)}</code></pre></div>`;
    } else {
        return `<div class="md-content viewer-markdown">${renderMarkdownWithLinks(content, card._path)}</div>`;
    }
}

// YAML viewer: show all schema fields as YAML
function renderViewerYaml(card, template) {
    const schema = template.schema || {};

    // Build object from schema fields
    const viewObj = {};
    for (const field of Object.keys(schema)) {
        if (card[field] !== undefined && card[field] !== null) {
            viewObj[field] = card[field];
        }
    }

    if (Object.keys(viewObj).length === 0) {
        return '<div class="viewer-empty">No content</div>';
    }

    const yamlStr = jsyaml.dump(viewObj, { indent: 2, lineWidth: -1 });
    return `<pre class="viewer-yaml">${escapeHtml(yamlStr)}</pre>`;
}

// Helper: find card by ID across all sections
function findCardById(cardId) {
    // Convert to string for comparison (YAML may parse numeric IDs as numbers)
    const cardIdStr = String(cardId);
    for (const section of data.sections) {
        const item = section.items.find(i => String(i.id) === cardIdStr);
        if (item) return item;
    }
    return null;
}

// Helper: find the section containing a card
function findSectionByItem(card) {
    if (!card) return null;
    const cardIdStr = String(card.id);
    return data.sections.find(s => s.items.some(i => String(i.id) === cardIdStr));
}


// Image viewer: large image with description
function renderViewerImage(card, template) {
    const imageField = template.viewer?.image_field || 'thumbnail';
    const contentField = template.viewer?.content_field || 'description';
    const src = card[imageField];
    const content = card[contentField];
    const url = card.url;

    let html = '<div class="viewer-image-container">';

    if (src) {
        html += `<div class="viewer-thumbnail"><img src="${escapeHtml(src)}" alt="" onerror="this.parentElement.innerHTML='<div class=\\'placeholder\\'>🔗</div>'"></div>`;
    } else {
        html += '<div class="viewer-thumbnail"><div class="placeholder">🔗</div></div>';
    }

    // For image cards, show path and filesize
    if (card.path || card.filesize) {
        html += '<div class="viewer-image-meta">';
        if (card.path) {
            html += `<code class="viewer-image-path">${escapeHtml(card.path)}</code>`;
        }
        if (card.filesize) {
            html += `<span class="viewer-image-size">${escapeHtml(card.filesize)}</span>`;
        }
        html += '</div>';
    }

    if (url) {
        html += `<div class="viewer-url"><a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></div>`;
    }

    if (content) {
        html += `<div class="md-content viewer-description">${renderMarkdownWithLinks(content, card._path)}</div>`;
    }

    html += '</div>';
    return html;
}

// Split-pane viewer: side-by-side
function renderViewerSplitPane(card, template) {
    const slots = template.viewer?.slots;
    if (!slots) {
        return renderViewerDocument(card, template);
    }

    const leftField = slots.left?.field;
    const rightField = slots.right?.field;
    const leftContent = card[leftField];
    const rightContent = card[rightField];
    const leftWidth = slots.left?.width || '60%';

    // If no left content, show code-only view
    if (!leftContent) {
        const rightFieldDef = template.schema?.[rightField];
        if (rightFieldDef?.type === 'code') {
            return `<div class="viewer-code-only"><pre><code class="language-${rightFieldDef?.language || 'python'}">${escapeHtml(rightContent || '')}</code></pre></div>`;
        }
        return `<div class="viewer-text-only">${escapeHtml(rightContent || '')}</div>`;
    }

    // Render split pane
    const leftFieldDef = template.schema?.[leftField];
    const rightFieldDef = template.schema?.[rightField];

    let leftHtml = '';
    if (leftFieldDef?.type === 'html') {
        leftHtml = `<div class="viewer-output-content">${leftContent}</div>`;
    } else {
        leftHtml = `<div class="viewer-content">${escapeHtml(leftContent)}</div>`;
    }

    let rightHtml = '';
    if (rightFieldDef?.type === 'code') {
        rightHtml = `<pre><code class="language-${rightFieldDef?.language || 'python'}">${escapeHtml(rightContent || '')}</code></pre>`;
    } else {
        rightHtml = `<div class="viewer-content">${escapeHtml(rightContent || '')}</div>`;
    }

    return `
        <div class="viewer-split-pane">
            <div class="viewer-split-left" style="flex: 0 0 ${leftWidth}">
                ${leftHtml}
            </div>
            <div class="viewer-split-right">
                ${rightHtml}
            </div>
        </div>
    `;
}

// Sections viewer: labeled sections
function renderViewerSections(card, template) {
    const sections = template.viewer?.sections || [];
    if (sections.length === 0) {
        return renderViewerDocument(card, template);
    }

    return sections.map(section => {
        const content = card[section.field];
        if (!content) return '';

        const fieldDef = template.schema?.[section.field];
        let html = '';

        if (fieldDef?.type === 'markdown') {
            html = renderMarkdownWithLinks(content, card._path);
        } else {
            html = `<p>${escapeHtml(content)}</p>`;
        }

        return `
            <div class="viewer-section">
                <h3 class="viewer-section-title">${escapeHtml(section.label)}</h3>
                <div class="viewer-section-content">${html}</div>
            </div>
        `;
    }).join('');
}

// Render viewer action buttons based on template
function renderViewerActions(card, template, isSystemNote) {
    const templateName = template.name;
    let actions = '';

    // Template-specific actions
    if (templateName === 'bookmark' && card.url) {
        actions += `<a href="${escapeHtml(card.url)}" target="_blank" class="btn btn-primary btn-small">Open ↗</a>`;
    }
    if (templateName === 'code') {
        actions += `<button class="btn btn-run btn-small" onclick="runViewerCode()">▶ Run</button>`;
    }

    // Diff/Merge/Reset buttons for modified system cards
    if (isSystemCardModified(card)) {
        actions += `<button class="btn btn-secondary btn-small" onclick="showSystemCardDiff()">Show Diff</button>`;
        // Merge only makes sense for YAML templates, not markdown files
        if (card.template === 'template') {
            actions += `<button class="btn btn-primary btn-small" onclick="mergeTemplateDefaults()">Merge Defaults</button>`;
        }
        actions += `<button class="btn btn-secondary btn-small" onclick="resetSystemCardDefaults()">Reset to Defaults</button>`;
    }

    // Common actions
    // Hide edit/delete for source cards unless source_cards_editable is enabled
    // Hide edit/delete for note cards unless notes_editable is enabled (default true)
    // Always hide edit/delete for read-only card types (notebook, file)
    const isSourceCard = templateName === 'source';
    const isNoteCard = templateName === 'note';
    const isReadOnlyCard = templateName === 'notebook' || templateName === 'file';
    const canEditSource = !isSourceCard || notebookSettings?.source_cards_editable;
    const canEditNote = !isNoteCard || notebookSettings?.notes_editable !== false;
    const canEdit = canEditSource && canEditNote && !isReadOnlyCard;
    if (canEdit) {
        actions += `<button class="btn btn-secondary btn-small" onclick="editViewerCard()">✎ Edit</button>`;
        actions += `<button class="btn btn-secondary btn-small" onclick="deleteViewerCard()">× Delete</button>`;
    }

    return actions;
}

function closeViewer() {
    document.getElementById('viewerModal').classList.remove('active');
    currentViewingCard = null;
}

function editViewerCard() {
    if (!currentViewingCard) return;
    const sectionId = currentViewingCard.sectionId;
    const card = { ...currentViewingCard };
    const templateName = card.template || card.type || 'note';
    closeViewer();

    // Use generic editor (Phase 3)
    openEditor(templateName, sectionId, card);
}

async function deleteViewerCard() {
    if (!currentViewingCard) return;
    const sectionId = currentViewingCard.sectionId;
    const cardId = currentViewingCard.id;
    const templateName = currentViewingCard.template || currentViewingCard.type;
    closeViewer();
    await confirmDeleteItem(sectionId, cardId, templateName);
}

// Merge current template with defaults (adds missing fields, keeps customizations)
async function mergeTemplateDefaults() {
    if (!currentViewingCard) return;
    const card = currentViewingCard;

    // Only works for templates with defaults
    const defaults = getDefaultTemplates()[card.name];
    if (!defaults) {
        showToast('No defaults available for this template');
        return;
    }

    // Deep merge: defaults as base, current card values on top
    const currentValues = {
        name: card.name,
        description: card.description,
        schema: card.schema,
        card: card.card,
        viewer: card.viewer,
        editor: card.editor,
        style: card.style,
        ui: card.ui
    };
    // Filter out undefined values
    Object.keys(currentValues).forEach(k => currentValues[k] === undefined && delete currentValues[k]);

    const merged = deepMerge(defaults, currentValues);

    // Find and update the actual card in its section
    const section = data.sections.find(s => s.items.some(i => i.id === card.id));
    const actualCard = section?.items.find(i => i.id === card.id);
    if (actualCard && section) {
        Object.assign(actualCard, merged);
        await saveCardFile(section.id, actualCard);
        await loadTemplates();
        render();
        openViewer(section.id, card.id);
        showToast('Template merged with defaults');
    }
}

// Reset any system card (template, README.md, CLAUDE.md) to defaults
async function resetSystemCardDefaults() {
    if (!currentViewingCard) return;
    const card = currentViewingCard;

    const defaultContent = getSystemCardDefaultContent(card);
    if (!defaultContent) {
        showToast('No defaults available for this file');
        return;
    }

    const filename = card.filename || (card.name + '.template.yaml');
    if (!confirm(`Reset ${filename} to defaults? Your customizations will be lost.`)) return;

    // Find and update the actual card in its section
    const section = data.sections.find(s => s.items.some(i => i.id === card.id));
    const actualCard = section?.items.find(i => i.id === card.id);
    if (!actualCard || !section) return;

    if (card.template === 'template') {
        // Template file - replace with default template object
        const defaults = getDefaultTemplates()[card.name];
        const preserved = {
            id: actualCard.id,
            filename: actualCard.filename,
            _path: actualCard._path,
            template: actualCard.template,
            system: actualCard.system,
            title: actualCard.title,
            modified: new Date().toISOString()
        };
        Object.assign(actualCard, defaults, preserved);
        await saveCardFile(section.id, actualCard);
        await loadTemplates();
    } else {
        // Markdown file (README.md, CLAUDE.md) - replace content
        actualCard.content = defaultContent;
        actualCard.modified = new Date().toISOString();
        await saveCardFile(section.id, actualCard);
    }

    render();
    openViewer(section.id, card.id);
    showToast(`${filename} reset to defaults`);
}

// Legacy alias
async function resetTemplateDefaults() {
    await resetSystemCardDefaults();
}

// Show diff between current system card and defaults
function showSystemCardDiff() {
    if (!currentViewingCard) return;
    const card = currentViewingCard;

    const defaultContent = getSystemCardDefaultContent(card);
    const currentContent = getSystemCardCurrentContent(card);

    if (!defaultContent) {
        showToast('No defaults available for this file');
        return;
    }

    // Determine the filename for the title
    let filename = card.filename || (card.name + '.template.yaml');

    // Use jsdiff to create a unified diff
    const diff = Diff.createTwoFilesPatch(
        'defaults',
        'current',
        defaultContent,
        currentContent,
        'Built-in defaults',
        'Your version'
    );

    // Format the diff with syntax highlighting
    const diffHtml = formatDiffHtml(diff);

    document.getElementById('diffTitle').textContent = `Changes to ${filename}`;
    document.getElementById('diffContent').innerHTML = diffHtml;
    document.getElementById('diffModal').classList.add('active');
}

// Legacy alias
function showTemplateDiff() {
    showSystemCardDiff();
}

// Format unified diff output as colored HTML
function formatDiffHtml(diff) {
    const lines = diff.split('\n');
    let html = '';

    for (const line of lines) {
        // Skip the file header lines (---, +++, @@)
        if (line.startsWith('===') || line.startsWith('---') || line.startsWith('+++')) {
            html += `<span class="diff-header">${escapeHtml(line)}</span>\n`;
        } else if (line.startsWith('@@')) {
            html += `<span class="diff-hunk">${escapeHtml(line)}</span>\n`;
        } else if (line.startsWith('-')) {
            html += `<span class="diff-removed">${escapeHtml(line)}</span>\n`;
        } else if (line.startsWith('+')) {
            html += `<span class="diff-added">${escapeHtml(line)}</span>\n`;
        } else {
            html += `<span class="diff-context">${escapeHtml(line)}</span>\n`;
        }
    }

    return html;
}

function closeDiffModal() {
    document.getElementById('diffModal').classList.remove('active');
}

// ========== Git Diff Mode ==========
// Notebook-level diff mode: compare all cards against a selected commit

let diffMode = {
    active: false,
    commit: null,           // Commit hash to compare against
    commitInfo: null,       // { shortHash, subject, date }
    changedFiles: {},       // Map of filePath -> { additions, deletions, status }
    commits: [],            // Recent commits for selection
    diffCache: {}           // Cache of file diffs: filePath -> diffHtml
};

// Format relative time for git commits
function formatCommitTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return date.toLocaleDateString();
}

// Fetch recent commits for the notebook
async function fetchRecentCommits() {
    try {
        const response = await fetch(BASE_URL + 'api/git-log?limit=20');
        if (!response.ok) {
            const error = await response.json();
            return { error: error.error };
        }
        return await response.json();
    } catch (err) {
        console.error('[Git] Failed to fetch commits:', err);
        return null;
    }
}

// Fetch diff stats between a commit and working tree
async function fetchDiffStats(commit) {
    try {
        const response = await fetch(BASE_URL + `api/git-diff-stat?commit=${encodeURIComponent(commit)}`);
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (err) {
        console.error('[Git] Failed to fetch diff stats:', err);
        return null;
    }
}

// Toggle diff mode on/off
async function toggleDiffMode() {
    if (diffMode.active) {
        exitDiffMode();
        return;
    }

    // Fetch recent commits
    const commits = await fetchRecentCommits();

    if (!commits) {
        showToast('Could not fetch git history');
        return;
    }

    if (commits.error === 'git_not_configured') {
        showToast('Git features require: notebook /path/to/notebook');
        return;
    }

    if (commits.error === 'not_a_repo') {
        showToast('Notebook is not a git repository');
        return;
    }

    if (commits.length === 0) {
        showToast('No git history available');
        return;
    }

    diffMode.commits = commits;
    showCommitSelector();
}

// Show commit selector dropdown
function showCommitSelector() {
    const existing = document.getElementById('commitSelectorDropdown');
    if (existing) {
        existing.remove();
        return;
    }

    const dropdownHtml = `
        <div class="commit-selector-dropdown" id="commitSelectorDropdown">
            <div class="commit-selector-header">Compare working tree with...</div>
            <div class="commit-selector-list">
                ${diffMode.commits.map((c, i) => `
                    <div class="commit-selector-item" data-commit="${escapeHtml(c.hash)}">
                        <span class="git-commit-hash">${escapeHtml(c.shortHash)}</span>
                        <span class="git-commit-subject">${escapeHtml(c.subject)}</span>
                        <span class="git-commit-time">${formatCommitTime(c.date)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Add dropdown near the diff mode button (in toolbar)
    const toolbar = document.querySelector('.toolbar');
    toolbar.insertAdjacentHTML('beforeend', dropdownHtml);

    // Add click handlers
    document.querySelectorAll('.commit-selector-item').forEach(item => {
        item.onclick = () => enterDiffMode(item.dataset.commit);
    });

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', closeCommitSelector);
    }, 0);
}

function closeCommitSelector(e) {
    const dropdown = document.getElementById('commitSelectorDropdown');
    if (dropdown && !dropdown.contains(e?.target) && !e?.target?.closest('.btn-diff-mode')) {
        dropdown.remove();
        document.removeEventListener('click', closeCommitSelector);
    }
}

// Enter diff mode with selected commit
async function enterDiffMode(commitHash) {
    // Close dropdown
    const dropdown = document.getElementById('commitSelectorDropdown');
    if (dropdown) dropdown.remove();
    document.removeEventListener('click', closeCommitSelector);

    // Find commit info
    const commitInfo = diffMode.commits.find(c => c.hash === commitHash);

    // Fetch diff stats
    const stats = await fetchDiffStats(commitHash);
    if (!stats || stats.error) {
        showToast('Could not fetch diff information');
        return;
    }

    // Activate diff mode
    diffMode.active = true;
    diffMode.commit = commitHash;
    diffMode.commitInfo = commitInfo;
    diffMode.changedFiles = stats.files || {};
    diffMode.diffCache = {};

    // Update UI
    document.body.classList.add('diff-mode-active');
    updateDiffModeButton();
    render();

    const fileCount = Object.keys(diffMode.changedFiles).length;
    showToast(`Diff mode: ${fileCount} file${fileCount !== 1 ? 's' : ''} changed since ${commitInfo?.shortHash || commitHash.slice(0, 7)}`);
}

// Exit diff mode
function exitDiffMode() {
    diffMode.active = false;
    diffMode.commit = null;
    diffMode.commitInfo = null;
    diffMode.changedFiles = {};
    diffMode.diffCache = {};

    document.body.classList.remove('diff-mode-active');
    updateDiffModeButton();
    render();
}

// Update diff mode button state
function updateDiffModeButton() {
    const btn = document.getElementById('diffModeBtn');
    if (!btn) return;

    if (diffMode.active) {
        btn.classList.add('active');
        btn.title = `Comparing with ${diffMode.commitInfo?.subject || diffMode.commit}\nClick to exit diff mode`;
    } else {
        btn.classList.remove('active');
        btn.title = 'Compare with previous commit';
    }
}

// Check if git features are available and show/hide diff button
async function checkGitAvailability() {
    const btn = document.getElementById('diffModeBtn');
    if (!btn) return;

    try {
        const response = await fetch(BASE_URL + 'api/git-log?limit=1');
        const result = await response.json();

        // Show button if git is available (not an error response)
        if (!result.error) {
            btn.style.display = '';
        }
    } catch (err) {
        // Git not available - button stays hidden
    }
}

// Check if a card has changes in diff mode
function cardHasChanges(card) {
    if (!diffMode.active) return false;
    const filePath = getCardFilePath(card);
    return filePath && diffMode.changedFiles[filePath];
}

// Get diff stats for a card
function getCardDiffStats(card) {
    if (!diffMode.active) return null;
    const filePath = getCardFilePath(card);
    return filePath ? diffMode.changedFiles[filePath] : null;
}

// Fetch and cache diff for a specific card
async function getCardDiff(card) {
    const filePath = getCardFilePath(card);
    if (!filePath || !diffMode.active) return null;

    // Check cache
    if (diffMode.diffCache[filePath]) {
        return diffMode.diffCache[filePath];
    }

    try {
        // Fetch historical content
        const response = await fetch(BASE_URL + `api/git-show?path=${encodeURIComponent(filePath)}&commit=${encodeURIComponent(diffMode.commit)}`);
        const result = await response.json();

        let historicalContent = '';
        let isNewFile = false;
        if (result.error === 'not_found') {
            // New file - no historical content
            historicalContent = '';
            isNewFile = true;
        } else if (result.error) {
            return null;
        } else {
            historicalContent = result.content;
        }

        // Check if this is an image file
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
        const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
        const isImage = imageExtensions.includes(ext);

        // For images, show side-by-side comparison
        if (isImage) {
            // Historical content is already a data URL from the server (or empty for new files)
            const oldSrc = isNewFile ? null : historicalContent;
            // Get current image as data URL
            const currentSrc = await getCurrentCardContent(card, true);
            diffMode.diffCache[filePath] = {
                type: 'image',
                oldSrc,
                newSrc: currentSrc,
                isNew: isNewFile
            };
            return diffMode.diffCache[filePath];
        }

        // Get current content
        const currentContent = await getCurrentCardContent(card);
        if (currentContent === null) {
            return null;
        }

        // For markdown files, create a rich diff view
        const isMarkdown = filePath.endsWith('.md');
        if (isMarkdown) {
            const richDiff = createRichMarkdownDiff(historicalContent, currentContent, isNewFile);
            diffMode.diffCache[filePath] = { type: 'rich', html: richDiff };
            return diffMode.diffCache[filePath];
        }

        // For other files, create unified diff
        const diff = Diff.createTwoFilesPatch(
            diffMode.commitInfo?.shortHash || 'old',
            'current',
            historicalContent,
            currentContent,
            `${diffMode.commitInfo?.shortHash || ''} ${diffMode.commitInfo?.subject || ''}`.trim(),
            'Working tree'
        );

        const diffHtml = formatDiffHtml(diff);
        diffMode.diffCache[filePath] = { type: 'unified', html: diffHtml };
        return diffMode.diffCache[filePath];
    } catch (err) {
        console.error('[Git] Failed to get card diff:', err);
        return null;
    }
}

// Create rich inline diff for markdown files
// Shows a single unified flow with removed sections in red, added in green
function createRichMarkdownDiff(oldContent, newContent, isNewFile) {
    // Parse frontmatter from both versions (skip it in diff view)
    const oldBody = extractMarkdownBody(oldContent);
    const newBody = extractMarkdownBody(newContent);

    if (isNewFile) {
        // New file - just show the new content with "new file" indicator
        const rendered = renderMarkdownWithLinks(newBody);
        return `
            <div class="rich-diff-inline">
                <div class="diff-block diff-block-added">
                    <div class="diff-block-marker">new file</div>
                    <div class="diff-block-content md-content">${rendered}</div>
                </div>
            </div>
        `;
    }

    // Split content into segments (code blocks vs prose) to diff atomically
    const oldSegments = splitMarkdownSegments(oldBody);
    const newSegments = splitMarkdownSegments(newBody);

    // Diff at segment level - treats code blocks as atomic units
    const diffResult = Diff.diffArrays(oldSegments, newSegments);

    // Build unified inline diff with rendered markdown blocks
    let html = '<div class="rich-diff-inline">';

    for (const part of diffResult) {
        // Join segments back together for rendering
        const text = part.value.join('\n\n').trim();
        if (!text) continue;

        const rendered = renderMarkdownWithLinks(text);

        if (part.added) {
            html += `
                <div class="diff-block diff-block-added">
                    <div class="diff-block-marker">+</div>
                    <div class="diff-block-content md-content">${rendered}</div>
                </div>
            `;
        } else if (part.removed) {
            html += `
                <div class="diff-block diff-block-removed">
                    <div class="diff-block-marker">−</div>
                    <div class="diff-block-content md-content">${rendered}</div>
                </div>
            `;
        } else {
            // Unchanged - render normally without highlight
            html += `
                <div class="diff-block diff-block-unchanged">
                    <div class="diff-block-content md-content">${rendered}</div>
                </div>
            `;
        }
    }

    html += '</div>';

    // Also provide expandable word-level diff for detailed inspection
    const wordDiff = Diff.diffWords(oldBody, newBody);
    let inlineDiff = '';
    for (const part of wordDiff) {
        const text = escapeHtml(part.value);
        if (part.added) {
            inlineDiff += `<ins class="diff-ins">${text}</ins>`;
        } else if (part.removed) {
            inlineDiff += `<del class="diff-del">${text}</del>`;
        } else {
            inlineDiff += text;
        }
    }

    html += `
        <details class="rich-diff-raw">
            <summary>Show word-level changes</summary>
            <pre class="diff-inline-content">${inlineDiff}</pre>
        </details>
    `;

    return html;
}

// Split markdown into segments for diffing - keeps code blocks atomic
// Returns array of segments (each is either a code block or prose block)
function splitMarkdownSegments(content) {
    const segments = [];
    const lines = content.split('\n');
    let currentSegment = [];
    let inCodeBlock = false;

    for (const line of lines) {
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                // End of code block - include closing fence and finalize
                currentSegment.push(line);
                segments.push(currentSegment.join('\n'));
                currentSegment = [];
                inCodeBlock = false;
            } else {
                // Start of code block - finalize prose first
                if (currentSegment.length > 0) {
                    const prose = currentSegment.join('\n').trim();
                    if (prose) segments.push(prose);
                }
                currentSegment = [line];
                inCodeBlock = true;
            }
        } else {
            currentSegment.push(line);
        }
    }

    // Finalize last segment
    if (currentSegment.length > 0) {
        const text = currentSegment.join('\n').trim();
        if (text) segments.push(text);
    }

    return segments;
}

// Extract markdown body (skip YAML frontmatter)
function extractMarkdownBody(content) {
    if (!content) return '';
    if (content.startsWith('---')) {
        const endIndex = content.indexOf('---', 3);
        if (endIndex !== -1) {
            return content.slice(endIndex + 3).trim();
        }
    }
    return content.trim();
}

// Get current content of a card from its file
async function getCurrentCardContent(card, asDataUrl = false) {
    if (!storageBackend) return null;

    // Get filename from _source (set during filesystem loading)
    const filename = card._source?.filename || card.filename;
    if (!filename) {
        console.error('[Git] No filename for card:', card.id);
        return null;
    }

    try {
        // Build full path from _path + filename
        const fullPath = card._path ? `${card._path}/${filename}` : filename;

        // For binary files (images), return as data URL
        if (asDataUrl) {
            const { dataUrl } = await storageBackend.readFileAsDataUrl(fullPath);
            return dataUrl;
        }

        const { content } = await storageBackend.readFile(fullPath);
        return content;
    } catch (err) {
        console.error('[Git] Failed to read current file:', err, { path: card._path, filename });
        return null;
    }
}

// Get full file path for git operations (directory path + filename)
function getCardFilePath(card) {
    const filename = card._source?.filename || card.filename;
    if (!filename) return null;

    if (card._path) {
        return `${card._path}/${filename}`;
    }
    return filename;
}

async function runViewerCode() {
    if (!currentViewingCard) return;

    // Show running status
    const contentEl = document.getElementById('viewerContent');
    contentEl.innerHTML = '<div class="viewer-loading">Running...</div>';

    try {
        const py = await initPyodide();
        const result = await executePythonCode(py, currentViewingCard.code);

        // Update stored output
        const section = data.sections.find(s => s.id === currentViewingCard.sectionId);
        if (section) {
            const codeNote = section.items.find(c => c.id === currentViewingCard.id);
            if (codeNote) {
                codeNote.output = result;
                codeNote.modified = new Date().toISOString();
                currentViewingCard.output = result;
                await saveData();
                await saveCardFile(currentViewingCard.sectionId, codeNote);
                render();

                // Re-render the viewer with new output
                openViewer(currentViewingCard.sectionId, currentViewingCard.id);
            }
        }
    } catch (error) {
        contentEl.innerHTML = `<div class="viewer-error"><pre class="error">${escapeHtml(error.toString())}</pre></div>`;
    }
}

// ========== SECTION: GENERIC_EDITOR ==========
// Generic editor modal for all card types (Phase 3 Template System)
// Functions: openEditor, closeEditor, saveEditor, renderEditorField, getEditorFieldValue,
//            handleEditorAction, initEditorThumbnailUpload, runEditorCode

// State for generic editor
let editingCard = null;  // { templateName, sectionId, card, isNew }
let editorManualThumbnail = null;  // For thumbnail field uploads

// CodeMirror editor instances (field name -> EditorView)
let codeMirrorInstances = {};
let codeMirrorLoaded = false;
let codeMirrorModules = null;  // Cached imports: { EditorView, basicSetup, python, yaml, css }

// Load CodeMirror modules (lazy, once)
async function loadCodeMirror() {
    if (codeMirrorModules) return codeMirrorModules;
    if (codeMirrorLoaded) {
        // Wait for loading to complete
        while (!codeMirrorModules) {
            await new Promise(r => setTimeout(r, 50));
        }
        return codeMirrorModules;
    }
    codeMirrorLoaded = true;
    try {
        const [cm, langPython, langYaml, langCss, langMarkdown, themeOneDark, cmCommands, cmView, cmLanguage, lezerHighlight] = await Promise.all([
            import('codemirror'),
            import('@codemirror/lang-python'),
            import('@codemirror/lang-yaml'),
            import('@codemirror/lang-css'),
            import('@codemirror/lang-markdown'),
            import('@codemirror/theme-one-dark'),
            import('@codemirror/commands'),
            import('@codemirror/view'),
            import('@codemirror/language'),
            import('@lezer/highlight')
        ]);
        // Create custom markdown highlight style with warm, readable colors
        const t = lezerHighlight.tags;
        const markdownHighlightStyle = cmLanguage.HighlightStyle.define([
            { tag: t.heading1, color: '#8b4513', fontSize: '1.4em', fontWeight: 'bold' },
            { tag: t.heading2, color: '#8b4513', fontSize: '1.25em', fontWeight: 'bold' },
            { tag: t.heading3, color: '#8b4513', fontSize: '1.1em', fontWeight: 'bold' },
            { tag: t.heading4, color: '#8b4513', fontWeight: 'bold' },
            { tag: t.heading5, color: '#8b4513', fontWeight: 'bold' },
            { tag: t.heading6, color: '#8b4513', fontWeight: 'bold' },
            { tag: t.heading, color: '#8b4513', fontWeight: 'bold' },
            { tag: t.strong, fontWeight: 'bold', color: '#2d3748' },
            { tag: t.emphasis, fontStyle: 'italic', color: '#4a5568' },
            { tag: t.strikethrough, textDecoration: 'line-through', color: '#718096' },
            { tag: t.link, color: '#2b6cb0', textDecoration: 'underline' },
            { tag: t.url, color: '#3182ce' },
            { tag: t.monospace, color: '#c53030', backgroundColor: '#fef2f2', fontFamily: 'monospace' },
            { tag: t.quote, color: '#6b7280', fontStyle: 'italic', borderLeft: '3px solid #d1d5db' },
            { tag: t.list, color: '#7c3aed' },
            { tag: t.contentSeparator, color: '#9ca3af' },
            { tag: t.processingInstruction, color: '#9ca3af' },  // For markdown markers like #, *, etc.
            { tag: t.meta, color: '#9ca3af' }  // For frontmatter, etc.
        ]);

        codeMirrorModules = {
            EditorView: cm.EditorView,
            basicSetup: cm.basicSetup,
            minimalSetup: cm.minimalSetup,
            python: langPython.python,
            yaml: langYaml.yaml,
            css: langCss.css,
            markdown: langMarkdown.markdown,
            oneDark: themeOneDark.oneDark,
            markdownHighlightStyle: markdownHighlightStyle,
            syntaxHighlighting: cmLanguage.syntaxHighlighting,
            indentWithTab: cmCommands.indentWithTab,
            keymap: cmView.keymap,
            lineNumbers: cmView.lineNumbers,
            highlightActiveLine: cmView.highlightActiveLine,
            highlightActiveLineGutter: cmView.highlightActiveLineGutter
        };
        console.log('[CodeMirror] Loaded successfully');
        return codeMirrorModules;
    } catch (err) {
        console.error('[CodeMirror] Failed to load:', err);
        codeMirrorLoaded = false;
        throw err;
    }
}

// Create a CodeMirror editor in a container element
async function createCodeMirrorEditor(container, options = {}) {
    const { language = 'python', value = '', fieldName = '' } = options;
    const cm = await loadCodeMirror();

    // Get language extension
    let langExtension;
    switch (language) {
        case 'yaml': langExtension = cm.yaml(); break;
        case 'css': langExtension = cm.css(); break;
        case 'markdown': langExtension = cm.markdown(); break;
        case 'python':
        default: langExtension = cm.python(); break;
    }

    // Build extensions based on language type
    const isMarkdown = language === 'markdown';
    const extensions = [
        // Use minimal setup for markdown (no line numbers), basic for code
        isMarkdown ? cm.minimalSetup : cm.basicSetup,
        langExtension,
        cm.keymap.of([cm.indentWithTab]),
        cm.EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' }
        })
    ];

    // Add theme: custom light theme for markdown, One Dark for code
    if (isMarkdown) {
        // Light theme with custom markdown syntax highlighting
        extensions.push(cm.EditorView.theme({
            '&': {
                backgroundColor: '#faf8f5',
                color: '#3a3632'
            },
            '.cm-content': {
                caretColor: '#4a4542',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                fontSize: '14px',
                lineHeight: '1.6'
            },
            '.cm-cursor': {
                borderLeftColor: '#4a4542'
            },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
                backgroundColor: '#d7d4cf'
            },
            '.cm-activeLine': {
                backgroundColor: '#f0ebe0'
            }
        }, { dark: false }));
        extensions.push(cm.syntaxHighlighting(cm.markdownHighlightStyle));
        extensions.push(cm.highlightActiveLine());
    } else {
        // Dark theme for code/yaml/css
        extensions.push(cm.oneDark);
    }

    // Create editor
    const editor = new cm.EditorView({
        doc: value,
        extensions,
        parent: container
    });

    // Store instance if field name provided
    if (fieldName) {
        codeMirrorInstances[fieldName] = editor;
    }

    return editor;
}

// Get value from a CodeMirror instance by field name
function getCodeMirrorValue(fieldName) {
    const editor = codeMirrorInstances[fieldName];
    return editor ? editor.state.doc.toString() : '';
}

// Destroy all CodeMirror instances (call when closing editor)
function destroyCodeMirrorInstances() {
    for (const [name, editor] of Object.entries(codeMirrorInstances)) {
        editor.destroy();
    }
    codeMirrorInstances = {};
}

// Open the generic editor modal
async function openEditor(templateName, sectionId, card = null) {
    const template = templateRegistry[templateName];
    if (!template) {
        showToast(`Unknown template: ${templateName}`);
        return;
    }

    const isNew = !card;
    editingCard = {
        templateName,
        sectionId,
        card: card || { id: generateId(), template: templateName },
        isNew
    };
    editorManualThumbnail = null;

    // Set modal data-template for CSS
    const modal = document.querySelector('#editorModal .modal');
    modal.setAttribute('data-template', templateName);
    modal.setAttribute('data-topic', editingCard.topic || '');

    // Set title
    const buttonLabel = template.ui?.button_label || templateName;
    document.getElementById('editorTitle').textContent = isNew ? `New ${buttonLabel}` : `Edit ${buttonLabel}`;

    // Build form body
    const bodyEl = document.getElementById('editorBody');
    bodyEl.innerHTML = '';

    // Location display (read-only)
    const section = data.sections.find(s => s.id === sectionId);
    const sectionDirName = section?._dirName || sectionId.replace('section-', '');

    // For existing cards, use their path; for new cards, use section + focused subdir
    let locationPath;
    if (card && card._path) {
        locationPath = card._path;
    } else {
        // New card: inherit from focus mode or default to section root
        const focusSubdir = focusedPath && focusedPath.includes('/')
            ? getSubdirFromPath(focusedPath)
            : null;
        locationPath = focusSubdir ? `${sectionDirName}/${focusSubdir}` : sectionDirName;
    }

    // Store computed path for saveEditorCard
    editingCard.locationPath = locationPath;

    const locationGroup = document.createElement('div');
    locationGroup.className = 'form-group';
    locationGroup.innerHTML = `
        <label>Location</label>
        <input type="text" value="${escapeHtml(locationPath)}" disabled class="location-readonly" title="File location (use terminal to move files)">
    `;
    bodyEl.appendChild(locationGroup);

    // Render each field from template.editor.fields
    const fields = template.editor?.fields || [];
    for (const fieldConfig of fields) {
        // Check showIf condition (e.g., showIf: { field: 'enabled_templates', includes: 'quiz' })
        if (fieldConfig.showIf) {
            const checkValue = card?.[fieldConfig.showIf.field] || [];
            const arr = Array.isArray(checkValue) ? checkValue : [checkValue];
            if (fieldConfig.showIf.includes && !arr.includes(fieldConfig.showIf.includes)) {
                continue; // Skip this field - condition not met
            }
        }
        const fieldDef = template.schema[fieldConfig.field];
        // For markdown fields, prefer original (pre-image-resolution) content for editing
        let value = fieldDef?.default || '';
        if (card) {
            const fieldName = fieldConfig.field;
            value = (fieldDef?.type === 'markdown' && card._originalMarkdown?.[fieldName])
                ? card._originalMarkdown[fieldName]
                : card[fieldName];
        }
        const fieldEl = renderEditorField(fieldConfig, fieldDef, value);
        bodyEl.appendChild(fieldEl);
    }

    // Universal tags and order fields (for all card types except system cards)
    if (!['settings', 'template'].includes(templateName)) {
        const tagsGroup = document.createElement('div');
        tagsGroup.className = 'form-group';
        const tagsValue = normalizeTags(card?.tags).join(', ');
        tagsGroup.innerHTML = `
            <label for="editorTags">Tags</label>
            <input type="text" id="editorTags" value="${escapeHtml(tagsValue)}" placeholder="e.g., ongoing, feature, architecture">
            <span class="field-hint">Comma-separated. Status tags (completed, ongoing, future) get traffic light colors.</span>
        `;
        bodyEl.appendChild(tagsGroup);

        // Number field (for explicit sorting) - skip if template has its own 'number' field (like lesson)
        if (!template.schema?.number) {
            const numberGroup = document.createElement('div');
            numberGroup.className = 'form-group form-group-quarter';
            const numberValue = card?.number ?? '';
            numberGroup.innerHTML = `
                <label for="editorNumber">Number</label>
                <input type="text" id="editorNumber" value="${escapeHtml(String(numberValue))}" placeholder="e.g., 1.2">
                <span class="field-hint">Sort position (1, 1.1, 2.0)</span>
            `;
            bodyEl.appendChild(numberGroup);
        }
    }

    // Handle output display for code templates
    const outputEl = document.getElementById('editorOutput');
    const outputContentEl = document.getElementById('editorCodeOutput');
    if (template.schema?.output && card?.output) {
        outputEl.style.display = 'block';
        outputContentEl.innerHTML = card.output;
    } else {
        outputEl.style.display = 'none';
        outputContentEl.innerHTML = '';
    }

    // Render action buttons (Run, etc.) and special controls
    const actionsEl = document.getElementById('editorActions');
    const actions = template.editor?.actions || [];
    let actionsHtml = '';

    // Standard action buttons
    if (actions.length > 0) {
        actionsHtml = actions.map(action => {
            if (action.action === 'execute') {
                return `
                    <button class="btn btn-run btn-small" id="editorRunBtn" onclick="runEditorCode()">
                        ${action.icon || '▶'} ${action.label}
                    </button>
                    <span class="editor-status" id="editorStatus"></span>
                `;
            }
            return `<button class="btn btn-secondary btn-small" onclick="handleEditorAction('${action.action}')">${action.icon || ''} ${action.label}</button>`;
        }).join('');
    }

    // Settings-specific: add storage info and system notes toggle
    if (templateName === 'settings') {
        const folderName = notebookDirHandle ? notebookDirHandle.name : 'Not linked';
        actionsHtml += `
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <span style="font-size: 12px; color: var(--text-muted);">
                    📁 <code style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px;">${escapeHtml(folderName)}</code>
                </span>
                <button class="btn btn-secondary btn-small" onclick="refreshFromFilesystem()" title="Reload from filesystem">🔄 Refresh</button>
                <button class="btn btn-secondary btn-small" onclick="changeNotebookFolder()" title="Switch notebook folder">📁 Change</button>
            </div>
        `;
    }

    actionsEl.innerHTML = actionsHtml;

    // Update Pyodide status if this is a code template
    if (templateName === 'code') {
        updateEditorPyodideStatus();
    }

    // Set submit button text
    if (templateName === 'settings') {
        document.getElementById('editorSubmitBtn').textContent = 'Save to Disk';
    } else {
        document.getElementById('editorSubmitBtn').textContent = isNew ? `Save ${buttonLabel}` : 'Save Changes';
    }

    // Show modal
    document.getElementById('editorModal').classList.add('active');

    // Focus first input
    const firstInput = bodyEl.querySelector('input, textarea');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }

    // Initialize thumbnail upload if present
    initEditorThumbnailUpload();

    // Settings auto-apply: attach listeners so changes take effect immediately
    if (templateName === 'settings') {
        attachSettingsAutoApply(template);
    }
}

// Render a single editor field based on its configuration
function renderEditorField(fieldConfig, fieldDef, value) {
    const { field, label, width, multiline, rows, monospace, preview, widget, auto_fetch } = fieldConfig;
    // Check fieldConfig.type first (explicit override), then schema type, then default to text
    const type = fieldConfig.type || fieldDef?.type || 'text';
    const required = fieldDef?.required || false;

    const div = document.createElement('div');
    div.className = `form-group ${width === 'half' ? 'form-field-half' : ''}`;
    div.setAttribute('data-field', field);

    const labelEl = document.createElement('label');
    labelEl.setAttribute('for', `editor-${field}`);
    labelEl.textContent = label + (required ? ' *' : '');
    div.appendChild(labelEl);

    let inputEl;

    // Handle different field types/widgets
    if (widget === 'thumbnail-upload' || type === 'thumbnail') {
        // Thumbnail upload widget
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.className = 'thumbnail-upload';
        thumbnailDiv.id = 'editorThumbnailPreview';
        thumbnailDiv.innerHTML = `
            <div class="thumbnail-placeholder">
                <span class="thumbnail-icon">🖼️</span>
                <p class="thumbnail-hint">Drag & drop image here<br>or click to upload</p>
            </div>
            <input type="file" id="editorThumbnailFile" accept="image/*" style="display: none">
        `;
        if (value) {
            thumbnailDiv.classList.add('has-image');
            thumbnailDiv.style.backgroundImage = `url('${value}')`;
            thumbnailDiv.style.backgroundSize = 'cover';
            thumbnailDiv.style.backgroundPosition = 'center';
        }
        div.appendChild(thumbnailDiv);
    } else if (type === 'markdown' && preview) {
        // Markdown with preview tabs and CodeMirror editor
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'editor-tabs';
        tabsDiv.innerHTML = `
            <button type="button" class="editor-tab active" onclick="switchEditorTab('write')">Write</button>
            <button type="button" class="editor-tab" onclick="switchEditorTab('preview')">Preview</button>
        `;
        div.appendChild(tabsDiv);

        // CodeMirror container for markdown editing
        const editorContainer = document.createElement('div');
        editorContainer.id = `editor-${field}`;
        editorContainer.className = 'codemirror-container markdown-editor';
        editorContainer.setAttribute('data-language', 'markdown');
        editorContainer.setAttribute('data-field', field);
        div.appendChild(editorContainer);

        // Initialize CodeMirror async
        createCodeMirrorEditor(editorContainer, {
            language: 'markdown',
            value: value || '',
            fieldName: field
        }).catch(err => {
            console.error('Failed to initialize CodeMirror for markdown:', err);
            // Fallback to textarea
            editorContainer.innerHTML = `<textarea class="markdown-editor-fallback" style="width:100%;height:300px;">${escapeHtml(value || '')}</textarea>`;
        });

        const previewDiv = document.createElement('div');
        previewDiv.id = 'editorPreview';
        previewDiv.className = 'editor-preview';
        div.appendChild(previewDiv);

        const hint = document.createElement('p');
        hint.className = 'form-hint';
        hint.textContent = 'Supports Markdown and LaTeX ($inline$, $$display$$). Link with [[Title]] or [[id:xyz]]';
        div.appendChild(hint);
    } else if (type === 'yaml') {
        // YAML editor with CodeMirror
        // Convert object to YAML string for editing
        let yamlValue = '';
        if (value && typeof value === 'object') {
            yamlValue = jsyaml.dump(value, { indent: 2, lineWidth: -1 });
        } else if (typeof value === 'string') {
            yamlValue = value;
        }

        const editorContainer = document.createElement('div');
        editorContainer.id = `editor-${field}`;
        editorContainer.className = 'codemirror-container';
        editorContainer.setAttribute('data-language', 'yaml');
        editorContainer.setAttribute('data-field', field);
        div.appendChild(editorContainer);

        // Initialize CodeMirror async
        createCodeMirrorEditor(editorContainer, {
            language: 'yaml',
            value: yamlValue,
            fieldName: field
        }).catch(err => {
            console.error('Failed to initialize CodeMirror for YAML:', err);
            // Fallback to textarea
            editorContainer.innerHTML = `<textarea class="code-editor" style="width:100%;height:300px;">${escapeHtml(yamlValue)}</textarea>`;
        });

        const yamlHint = document.createElement('p');
        yamlHint.className = 'form-hint';
        yamlHint.textContent = 'Edit YAML configuration. Invalid YAML will show an error on save.';
        div.appendChild(yamlHint);
    } else if (type === 'code' || (multiline && monospace)) {
        // Code editor with CodeMirror
        // Determine language from fieldConfig or default to python
        const language = fieldConfig.language || 'python';

        const editorContainer = document.createElement('div');
        editorContainer.id = `editor-${field}`;
        editorContainer.className = 'codemirror-container';
        editorContainer.setAttribute('data-language', language);
        editorContainer.setAttribute('data-field', field);
        div.appendChild(editorContainer);

        // Initialize CodeMirror async
        createCodeMirrorEditor(editorContainer, {
            language: language,
            value: value || '',
            fieldName: field
        }).catch(err => {
            console.error('Failed to initialize CodeMirror for code:', err);
            // Fallback to textarea
            editorContainer.innerHTML = `<textarea class="code-editor" style="width:100%;height:300px;">${escapeHtml(value || '')}</textarea>`;
        });
    } else if (type === 'markdown') {
        // Markdown field without preview tabs - use CodeMirror with markdown highlighting
        const editorContainer = document.createElement('div');
        editorContainer.id = `editor-${field}`;
        editorContainer.className = 'codemirror-container codemirror-markdown-compact';
        editorContainer.setAttribute('data-language', 'markdown');
        editorContainer.setAttribute('data-field', field);
        // Set height based on rows config
        editorContainer.style.height = `${(rows || 4) * 24}px`;
        div.appendChild(editorContainer);

        // Initialize CodeMirror async
        createCodeMirrorEditor(editorContainer, {
            language: 'markdown',
            value: value || '',
            fieldName: field
        }).catch(err => {
            console.error('Failed to initialize CodeMirror for markdown:', err);
            // Fallback to textarea
            editorContainer.innerHTML = `<textarea style="width:100%;height:100%;">${escapeHtml(value || '')}</textarea>`;
        });
    } else if (multiline) {
        // Regular textarea for non-markdown multiline
        inputEl = document.createElement('textarea');
        inputEl.id = `editor-${field}`;
        inputEl.rows = rows || 4;
        inputEl.placeholder = label;
        inputEl.value = value || '';
        div.appendChild(inputEl);
    } else if (type === 'url') {
        // URL input
        inputEl = document.createElement('input');
        inputEl.type = 'url';
        inputEl.id = `editor-${field}`;
        inputEl.placeholder = 'https://example.com';
        inputEl.value = value || '';
        if (auto_fetch) {
            inputEl.setAttribute('data-auto-fetch', 'true');
        }
        div.appendChild(inputEl);
    } else if (type === 'number') {
        inputEl = document.createElement('input');
        inputEl.type = 'number';
        inputEl.id = `editor-${field}`;
        inputEl.value = value || '';
        div.appendChild(inputEl);
    } else if (type === 'boolean') {
        inputEl = document.createElement('input');
        inputEl.type = 'checkbox';
        inputEl.id = `editor-${field}`;
        inputEl.checked = !!value;
        div.appendChild(inputEl);
    } else if (type === 'date') {
        inputEl = document.createElement('input');
        inputEl.type = 'date';
        inputEl.id = `editor-${field}`;
        inputEl.value = value ? String(value).split('T')[0] : '';
        div.appendChild(inputEl);
    } else if (type === 'datetime') {
        inputEl = document.createElement('input');
        inputEl.type = 'datetime-local';
        inputEl.id = `editor-${field}`;
        inputEl.value = value ? String(value).slice(0, 16) : '';
        div.appendChild(inputEl);
    } else if (type === 'enum' && fieldDef?.options) {
        inputEl = document.createElement('select');
        inputEl.id = `editor-${field}`;
        fieldDef.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            option.selected = opt === value;
            inputEl.appendChild(option);
        });
        div.appendChild(inputEl);
    } else if (type === 'list') {
        // List editor with reorderable items
        const listContainer = document.createElement('div');
        listContainer.className = 'list-editor';
        listContainer.id = `editor-${field}`;
        listContainer.setAttribute('data-item-type', fieldDef?.item_type || 'text');
        const allowDelete = fieldDef?.allowDelete !== false;
        const allowAdd = fieldDef?.allowAdd !== false;
        listContainer.setAttribute('data-allow-delete', allowDelete);

        const itemsArray = Array.isArray(value) ? value : [];
        itemsArray.forEach((item, idx) => {
            const itemRow = createListEditorItem(field, item, idx, allowDelete);
            listContainer.appendChild(itemRow);
        });

        div.appendChild(listContainer);

        // Add button (only if allowAdd is true)
        if (allowAdd) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'list-editor-add';
            addBtn.textContent = '+ Add item';
            addBtn.onclick = () => {
                const container = document.getElementById(`editor-${field}`);
                const newIdx = container.children.length;
                const canDelete = container.getAttribute('data-allow-delete') === 'true';
                const newRow = createListEditorItem(field, '', newIdx, canDelete);
                container.appendChild(newRow);
                // Focus the new input
                const input = newRow.querySelector('input');
                if (input) input.focus();
            };
            div.appendChild(addBtn);
        }
    } else if (type === 'records') {
        // Records editor - datatable with headers and draggable rows
        const schema = fieldDef?.schema || {};
        const allowDelete = fieldDef?.allowDelete !== false;
        const allowAdd = fieldDef?.allowAdd !== false;

        const table = document.createElement('table');
        table.className = 'records-editor';
        table.setAttribute('data-schema', JSON.stringify(schema));
        table.setAttribute('data-allow-delete', allowDelete);
        table.setAttribute('data-allow-add', allowAdd);
        table.setAttribute('data-field', field);

        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // Drag handle column header
        const dragTh = document.createElement('th');
        dragTh.style.width = '40px';
        headerRow.appendChild(dragTh);

        // Schema field headers
        for (const [key, def] of Object.entries(schema)) {
            const th = document.createElement('th');
            th.textContent = def.label || key;
            headerRow.appendChild(th);
        }

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement('tbody');
        tbody.id = `editor-${field}`;

        const recordsArray = Array.isArray(value) ? value : [];
        recordsArray.forEach((record, idx) => {
            const recordRow = createRecordsEditorItem(field, schema, record, idx, allowDelete);
            tbody.appendChild(recordRow);
        });

        table.appendChild(tbody);
        div.appendChild(table);

        // Add button (only if allowAdd is true)
        if (allowAdd) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'records-editor-add';
            addBtn.textContent = '+ Add item';
            addBtn.onclick = () => {
                const tbody = document.getElementById(`editor-${field}`);
                const table = tbody.closest('table');
                const schemaStr = table.getAttribute('data-schema');
                const schema = JSON.parse(schemaStr);
                const canDelete = table.getAttribute('data-allow-delete') === 'true';
                const newIdx = tbody.children.length;
                // Create default record from schema
                const defaultRecord = {};
                for (const [key, def] of Object.entries(schema)) {
                    defaultRecord[key] = def.default !== undefined ? def.default : (def.type === 'boolean' ? true : '');
                }
                const newRow = createRecordsEditorItem(field, schema, defaultRecord, newIdx, canDelete);
                tbody.appendChild(newRow);
                tbody.dispatchEvent(new Event('records-add', { bubbles: true }));
            };
            div.appendChild(addBtn);
        }
    } else if (type === 'questions') {
        // Quiz questions editor - specialized editor for quiz question arrays
        const questionsContainer = document.createElement('div');
        questionsContainer.className = 'quiz-questions-editor';
        questionsContainer.id = `editor-${field}`;

        const questionsArray = Array.isArray(value) ? value : [];
        questionsArray.forEach((question, idx) => {
            const questionEl = createQuestionEditor(question, idx, questionsArray.length);
            questionsContainer.appendChild(questionEl);
        });

        div.appendChild(questionsContainer);

        // Add question button
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'quiz-add-question';
        addBtn.textContent = '+ Add Question';
        addBtn.onclick = () => {
            const container = document.getElementById(`editor-${field}`);
            const newIdx = container.children.length;
            const newQuestion = {
                type: 'multiple_choice',
                question: '',
                options: ['', ''],
                correct: 0,
                points: 1
            };
            const questionEl = createQuestionEditor(newQuestion, newIdx, newIdx + 1);
            container.appendChild(questionEl);
            // Expand the new question
            questionEl.classList.add('expanded');
            updateQuestionEditorIndices();
        };
        div.appendChild(addBtn);
    } else if (type === 'select') {
        // Generic select dropdown with options from schema
        inputEl = document.createElement('select');
        inputEl.id = `editor-${field}`;

        const options = fieldDef?.options || [];
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            option.selected = opt.value === value;
            inputEl.appendChild(option);
        });

        div.appendChild(inputEl);
    } else if (type === 'theme') {
        // Theme picker dropdown - populated from theme registry
        inputEl = document.createElement('select');
        inputEl.id = `editor-${field}`;

        // Add "None" option for no base theme
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(None - use theme.css only)';
        noneOption.selected = !value;
        inputEl.appendChild(noneOption);

        // Add themes from registry
        const themes = themeRegistryCache || [];
        themes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.name;
            option.title = theme.description || '';
            option.selected = theme.id === value;
            inputEl.appendChild(option);
        });

        div.appendChild(inputEl);

        // Add description hint
        const hint = document.createElement('p');
        hint.className = 'form-hint';
        hint.textContent = 'Base theme from /themes/. Your .notebook/theme.css customizations are layered on top.';
        div.appendChild(hint);
    } else if (type === 'templates') {
        // Card type selector - checkbox grid for available card types
        const container = document.createElement('div');
        container.className = 'templates-selector';
        container.id = `editor-${field}`;

        const availableTypes = getAvailableCardTypes();
        const enabledTypes = Array.isArray(value) ? value : [];
        const currentInUse = getInUseCardTypes();

        // Sort: in-use first, then alphabetically
        const sortedTypes = [...availableTypes].sort((a, b) => {
            const aInUse = currentInUse.has(a);
            const bInUse = currentInUse.has(b);
            if (aInUse !== bInUse) return bInUse - aInUse;
            return a.localeCompare(b);
        });

        sortedTypes.forEach(typeName => {
            const template = templateRegistry[typeName];
            // Skip system types that don't show create buttons
            if (!template || template.ui?.show_create_button === false) return;

            const isInUse = currentInUse.has(typeName);
            const isEnabled = enabledTypes.includes(typeName) || isInUse;

            const item = document.createElement('label');
            item.className = 'template-selector-item' + (isInUse ? ' in-use' : '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = typeName;
            checkbox.checked = isEnabled;
            checkbox.disabled = isInUse;

            const labelText = document.createElement('span');
            labelText.className = 'template-selector-label';
            labelText.textContent = template.name || typeName;

            item.appendChild(checkbox);
            item.appendChild(labelText);

            if (isInUse) {
                const badge = document.createElement('span');
                badge.className = 'template-selector-badge';
                badge.textContent = '(in use)';
                item.appendChild(badge);
            }

            container.appendChild(item);
        });

        div.appendChild(container);

        // Add description hint
        const hint = document.createElement('p');
        hint.className = 'form-hint';
        hint.textContent = 'Card types with existing cards cannot be disabled.';
        div.appendChild(hint);
    } else {
        // Default text input
        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.id = `editor-${field}`;
        inputEl.placeholder = label;
        inputEl.value = value || '';
        if (fieldConfig.readonly) {
            inputEl.readOnly = true;
            inputEl.style.background = 'var(--bg-secondary)';
            inputEl.style.color = 'var(--text-muted)';
            inputEl.style.cursor = 'default';
        }
        div.appendChild(inputEl);
    }

    return div;
}

// Create a single list editor item row with up/down/delete buttons
function createListEditorItem(field, value, index, allowDelete = true) {
    const row = document.createElement('div');
    row.className = 'list-editor-item';
    row.setAttribute('data-index', index);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'list-editor-input';
    input.value = value || '';
    input.placeholder = 'Item value';
    input.readOnly = !allowDelete; // If can't delete, also can't edit (for sections)
    row.appendChild(input);

    const buttons = document.createElement('div');
    buttons.className = 'list-editor-buttons';

    // Move up button
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'list-editor-btn';
    upBtn.textContent = '▲';
    upBtn.title = 'Move up';
    upBtn.onclick = () => moveListItem(field, row, -1);
    buttons.appendChild(upBtn);

    // Move down button
    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'list-editor-btn';
    downBtn.textContent = '▼';
    downBtn.title = 'Move down';
    downBtn.onclick = () => moveListItem(field, row, 1);
    buttons.appendChild(downBtn);

    // Delete button (only if allowed)
    if (allowDelete) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'list-editor-btn list-editor-btn-delete';
        delBtn.textContent = '×';
        delBtn.title = 'Remove';
        delBtn.onclick = () => {
            const container = row.parentNode;
            row.remove();
            updateListEditorIndices(field);
            if (container) container.dispatchEvent(new Event('list-delete', { bubbles: true }));
        };
        buttons.appendChild(delBtn);
    }

    row.appendChild(buttons);
    return row;
}

// Move a list item up or down
function moveListItem(field, row, direction) {
    const container = document.getElementById(`editor-${field}`);
    const items = Array.from(container.children);
    const currentIndex = items.indexOf(row);
    const newIndex = currentIndex + direction;

    if (newIndex < 0 || newIndex >= items.length) return;

    if (direction < 0) {
        container.insertBefore(row, items[newIndex]);
    } else {
        container.insertBefore(items[newIndex], row);
    }
    updateListEditorIndices(field);
    container.dispatchEvent(new Event('list-reorder', { bubbles: true }));
}

// Update data-index attributes after reordering
function updateListEditorIndices(field) {
    const container = document.getElementById(`editor-${field}`);
    Array.from(container.children).forEach((row, idx) => {
        row.setAttribute('data-index', idx);
    });
}

// Create a single records editor table row with drag handle
function createRecordsEditorItem(field, schema, record, index, allowDelete) {
    const row = document.createElement('tr');
    row.className = 'records-editor-row';
    row.setAttribute('data-index', index);
    row.setAttribute('draggable', 'true');

    // Detect if this is the System section (path or dir includes '.')
    const isSystemSection = sectionPathIncludesRoot(record.path) || sectionPathIncludesRoot(record.dir);
    if (isSystemSection) {
        row.classList.add('is-system-section');
    }

    // Drag handle cell
    const dragCell = document.createElement('td');
    const dragHandle = document.createElement('span');
    dragHandle.className = 'records-editor-drag-handle';
    dragHandle.textContent = '⋮⋮';
    dragHandle.title = 'Drag to reorder';
    dragCell.appendChild(dragHandle);
    row.appendChild(dragCell);

    // Set up drag events
    row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
        // Store the field name for cross-table safety
        e.dataTransfer.setData('application/x-records-field', field);
    });

    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        // Clean up all drag-over states
        const tbody = document.getElementById(`editor-${field}`);
        tbody.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Only show indicator if not dragging over self
        if (!row.classList.contains('dragging')) {
            row.classList.add('drag-over');
        }
    });

    row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
    });

    row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');

        // Verify same field (table)
        const sourceField = e.dataTransfer.getData('application/x-records-field');
        if (sourceField !== field) return;

        const tbody = document.getElementById(`editor-${field}`);
        const draggingRow = tbody.querySelector('.dragging');
        if (!draggingRow || draggingRow === row) return;

        // Insert dragged row before or after this row based on position
        const rows = Array.from(tbody.children);
        const draggedIdx = rows.indexOf(draggingRow);
        const targetIdx = rows.indexOf(row);

        if (draggedIdx < targetIdx) {
            row.parentNode.insertBefore(draggingRow, row.nextSibling);
        } else {
            row.parentNode.insertBefore(draggingRow, row);
        }
        updateRecordsEditorIndices(field);
        tbody.dispatchEvent(new Event('records-reorder', { bubbles: true }));
    });

    // Create cells for each schema field
    for (const [key, def] of Object.entries(schema)) {
        const td = document.createElement('td');
        const value = record[key];
        const fieldType = def.type || 'text';
        // System section: name and path are frozen (read-only)
        const isFrozenField = isSystemSection && (key === 'name' || key === 'path');
        const readOnly = def.readOnly === true || isFrozenField;

        if (fieldType === 'boolean') {
            // Render as clickable toggle with checkmark
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'records-editor-toggle';
            toggle.setAttribute('data-field', key);
            const isChecked = value !== false;
            toggle.setAttribute('data-value', isChecked ? 'true' : 'false');
            toggle.title = def.label || key;
            toggle.textContent = isChecked ? '✓' : '';
            toggle.classList.toggle('is-checked', isChecked);
            // Grey out row when visible field is false
            if (key === 'visible' && !isChecked) {
                row.classList.add('is-hidden');
            }
            toggle.onclick = () => {
                const current = toggle.getAttribute('data-value') === 'true';
                const newVal = !current;
                toggle.setAttribute('data-value', newVal ? 'true' : 'false');
                toggle.textContent = newVal ? '✓' : '';
                toggle.classList.toggle('is-checked', newVal);
                // Grey out row when visible field is toggled
                if (key === 'visible') {
                    row.classList.toggle('is-hidden', !newVal);
                }
                toggle.dispatchEvent(new Event('records-toggle', { bubbles: true }));
            };
            td.appendChild(toggle);
        } else {
            // Text input
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'records-editor-input';
            input.setAttribute('data-field', key);
            // Format array values for display (e.g., path arrays)
            let displayValue = value || '';
            if (Array.isArray(value)) {
                // Format paths nicely: '.' becomes 'root'
                displayValue = value.map(p => p === '.' ? 'root' : p).join(', ');
                // Store original array value as JSON for retrieval
                input.setAttribute('data-original-value', JSON.stringify(value));
            }
            input.value = displayValue;
            input.placeholder = def.placeholder || def.label || key;
            input.readOnly = readOnly;
            if (readOnly) {
                input.title = isFrozenField ? 'System section field (read-only)' : (def.label || key);
                input.classList.add('is-frozen');
            }
            td.appendChild(input);
        }
        row.appendChild(td);
    }

    // Set initial hidden state based on visible field
    if (record.visible === false) {
        row.classList.add('is-hidden');
    }

    return row;
}

// Update data-index attributes after reordering records
function updateRecordsEditorIndices(field) {
    const tbody = document.getElementById(`editor-${field}`);
    Array.from(tbody.children).forEach((row, idx) => {
        row.setAttribute('data-index', idx);
    });
}

// Question types supported in the editor
const SUPPORTED_QUESTION_TYPES = ['multiple_choice', 'checkbox', 'dropdown', 'short_answer', 'worked', 'numeric', 'scale', 'grid'];

// Types that share the same options structure (can convert between without losing data)
const OPTIONS_BASED_TYPES = ['multiple_choice', 'checkbox', 'dropdown'];

// Create a single question editor element
function createQuestionEditor(question, index, total) {
    const questionEl = document.createElement('div');
    questionEl.className = 'quiz-question-editor';
    questionEl.setAttribute('data-index', index);

    // Store question data
    questionEl.setAttribute('data-question', JSON.stringify(question));

    // Header row with collapse/expand, type badge, preview, and controls
    const header = document.createElement('div');
    header.className = 'quiz-question-header';

    // Drag handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'quiz-question-drag';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = 'Drag to reorder';
    header.appendChild(dragHandle);

    // Question number
    const qNum = document.createElement('span');
    qNum.className = 'quiz-question-num';
    qNum.textContent = `Q${index + 1}`;
    header.appendChild(qNum);

    // Type badge/selector
    const typeSelect = document.createElement('select');
    typeSelect.className = 'quiz-question-type';
    SUPPORTED_QUESTION_TYPES.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t.replace('_', ' ');
        opt.selected = t === question.type;
        typeSelect.appendChild(opt);
    });
    typeSelect.onchange = (e) => handleQuestionTypeChange(questionEl, e.target.value);
    header.appendChild(typeSelect);

    // Preview text (truncated question)
    const preview = document.createElement('span');
    preview.className = 'quiz-question-preview';
    preview.textContent = question.question ? question.question.substring(0, 50) + (question.question.length > 50 ? '...' : '') : '(no question text)';
    header.appendChild(preview);

    // Spacer
    const spacer = document.createElement('span');
    spacer.className = 'quiz-question-spacer';
    header.appendChild(spacer);

    // Expand/collapse toggle
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'quiz-question-toggle';
    toggle.innerHTML = '▼';
    toggle.title = 'Expand/collapse';
    toggle.onclick = () => {
        questionEl.classList.toggle('expanded');
        toggle.innerHTML = questionEl.classList.contains('expanded') ? '▲' : '▼';
    };
    header.appendChild(toggle);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'quiz-question-delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete question';
    deleteBtn.onclick = () => {
        if (confirm('Delete this question?')) {
            questionEl.remove();
            updateQuestionEditorIndices();
        }
    };
    header.appendChild(deleteBtn);

    questionEl.appendChild(header);

    // Content area (shown when expanded)
    const content = document.createElement('div');
    content.className = 'quiz-question-content';

    // Question text field
    const questionField = document.createElement('div');
    questionField.className = 'quiz-field';
    questionField.innerHTML = `<label>Question</label>`;
    const questionTextarea = document.createElement('textarea');
    questionTextarea.className = 'quiz-question-text';
    questionTextarea.value = question.question || '';
    questionTextarea.rows = 3;
    questionTextarea.placeholder = 'Enter question text (supports Markdown)';
    questionTextarea.oninput = () => {
        // Update preview text
        preview.textContent = questionTextarea.value ? questionTextarea.value.substring(0, 50) + (questionTextarea.value.length > 50 ? '...' : '') : '(no question text)';
    };
    questionField.appendChild(questionTextarea);
    content.appendChild(questionField);

    // Audio fields (for spelling tests, dictation, aural exams)
    const audioRow = document.createElement('div');
    audioRow.className = 'quiz-field quiz-audio-row';

    // Audio text field
    const audioField = document.createElement('div');
    audioField.className = 'quiz-audio-field';
    audioField.innerHTML = `<label>Audio text <span class="quiz-field-hint">(spoken aloud for spelling/dictation)</span></label>`;
    const audioInput = document.createElement('input');
    audioInput.type = 'text';
    audioInput.className = 'quiz-audio-text';
    audioInput.value = question.audio || '';
    audioInput.placeholder = 'Text to speak aloud (leave empty for visual-only)';
    audioField.appendChild(audioInput);
    audioRow.appendChild(audioField);

    // Language selector
    const langField = document.createElement('div');
    langField.className = 'quiz-audio-lang-field';
    langField.innerHTML = `<label>Language</label>`;
    const langSelect = document.createElement('select');
    langSelect.className = 'quiz-audio-lang';
    const languages = [
        { code: '', label: 'Default' },
        { code: 'en-GB', label: 'English (UK)' },
        { code: 'en-US', label: 'English (US)' },
        { code: 'fr-FR', label: 'French' },
        { code: 'de-DE', label: 'German' },
        { code: 'es-ES', label: 'Spanish' },
        { code: 'it-IT', label: 'Italian' },
        { code: 'pt-PT', label: 'Portuguese' },
        { code: 'nl-NL', label: 'Dutch' },
        { code: 'ja-JP', label: 'Japanese' },
        { code: 'zh-CN', label: 'Chinese' }
    ];
    languages.forEach(lang => {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = lang.label;
        opt.selected = (question.audioLang || '') === lang.code;
        langSelect.appendChild(opt);
    });
    langField.appendChild(langSelect);
    audioRow.appendChild(langField);

    content.appendChild(audioRow);

    // Type-specific fields
    const typeFields = document.createElement('div');
    typeFields.className = 'quiz-type-fields';
    renderQuestionTypeFields(typeFields, question.type, question);
    content.appendChild(typeFields);

    // Points field
    const pointsField = document.createElement('div');
    pointsField.className = 'quiz-field quiz-field-inline';
    pointsField.innerHTML = `
        <label>Points</label>
        <input type="number" class="quiz-points" value="${question.points || 1}" min="0" step="0.5">
    `;
    content.appendChild(pointsField);

    // Determine if this type needs AI grading fields
    const needsAIGrading = ['short_answer', 'worked'].includes(question.type);

    // Advanced fields section (collapsible)
    const advancedSection = document.createElement('div');
    advancedSection.className = 'quiz-advanced-section';

    // Label varies by type: worked gets AI grading fields only, others get feedback fields
    const advancedLabel = question.type === 'worked'
        ? 'Advanced (model answer, rubric)'
        : needsAIGrading
            ? 'Advanced (feedback, model answer, rubric)'
            : 'Advanced (feedback)';

    const advancedToggle = document.createElement('button');
    advancedToggle.type = 'button';
    advancedToggle.className = 'quiz-advanced-toggle';
    advancedToggle.innerHTML = `▸ ${advancedLabel}`;
    advancedToggle.onclick = () => {
        advancedSection.classList.toggle('expanded');
        advancedToggle.innerHTML = advancedSection.classList.contains('expanded')
            ? `▾ ${advancedLabel}`
            : `▸ ${advancedLabel}`;
    };
    advancedSection.appendChild(advancedToggle);

    const advancedContent = document.createElement('div');
    advancedContent.className = 'quiz-advanced-content';

    // Feedback when correct/wrong - only for auto-gradable types (not worked)
    // worked questions get personalized feedback from the grader, not pre-written feedback
    if (question.type !== 'worked') {
        // Feedback when correct (maps to Google Forms whenRight)
        const whenRightField = document.createElement('div');
        whenRightField.className = 'quiz-field';
        whenRightField.innerHTML = `<label>Feedback when correct</label>`;
        const whenRightTextarea = document.createElement('textarea');
        whenRightTextarea.className = 'quiz-when-right';
        whenRightTextarea.value = question.whenRight || '';
        whenRightTextarea.rows = 2;
        whenRightTextarea.placeholder = 'Shown when answer is correct';
        whenRightField.appendChild(whenRightTextarea);
        advancedContent.appendChild(whenRightField);

        // Feedback when wrong (maps to Google Forms whenWrong)
        const whenWrongField = document.createElement('div');
        whenWrongField.className = 'quiz-field';
        whenWrongField.innerHTML = `<label>Feedback when wrong</label>`;
        const whenWrongTextarea = document.createElement('textarea');
        whenWrongTextarea.className = 'quiz-when-wrong';
        whenWrongTextarea.value = question.whenWrong || '';
        whenWrongTextarea.rows = 2;
        whenWrongTextarea.placeholder = 'Shown when answer is incorrect';
        whenWrongField.appendChild(whenWrongTextarea);
        advancedContent.appendChild(whenWrongField);
    }

    // Model answer and rubric only for types needing AI grading
    if (needsAIGrading) {
        // Model answer field
        const modelField = document.createElement('div');
        modelField.className = 'quiz-field';
        modelField.innerHTML = `<label>Model Answer</label>`;
        const modelTextarea = document.createElement('textarea');
        modelTextarea.className = 'quiz-model-answer';
        modelTextarea.value = question.modelAnswer || '';
        modelTextarea.rows = 2;
        modelTextarea.placeholder = 'Model answer for AI grading';
        modelField.appendChild(modelTextarea);
        advancedContent.appendChild(modelField);

        // Rubric field
        const rubricField = document.createElement('div');
        rubricField.className = 'quiz-field';
        rubricField.innerHTML = `<label>Rubric</label>`;
        const rubricTextarea = document.createElement('textarea');
        rubricTextarea.className = 'quiz-rubric';
        rubricTextarea.value = question.rubric || '';
        rubricTextarea.rows = 3;
        rubricTextarea.placeholder = 'Grading criteria for AI grading';
        rubricField.appendChild(rubricTextarea);
        advancedContent.appendChild(rubricField);
    }

    advancedSection.appendChild(advancedContent);
    content.appendChild(advancedSection);

    questionEl.appendChild(content);

    // Setup drag and drop
    setupQuestionDragDrop(questionEl, dragHandle);

    return questionEl;
}

// Render type-specific fields for a question
function renderQuestionTypeFields(container, type, question) {
    container.innerHTML = '';

    // Options-based types: multiple_choice, checkbox, dropdown
    if (OPTIONS_BASED_TYPES.includes(type)) {
        const isCheckbox = type === 'checkbox';

        // Type description
        const typeDesc = document.createElement('p');
        typeDesc.className = 'quiz-type-info';
        if (type === 'multiple_choice') {
            typeDesc.textContent = 'Single answer - student selects one option';
        } else if (type === 'checkbox') {
            typeDesc.textContent = 'Multiple answers - student can select several options';
        } else if (type === 'dropdown') {
            typeDesc.textContent = 'Dropdown - student selects one option from a dropdown menu';
        }
        container.appendChild(typeDesc);

        // Options list with correct answer selector
        const optionsField = document.createElement('div');
        optionsField.className = 'quiz-field quiz-options-field';
        optionsField.innerHTML = `<label>Options</label>`;

        const optionsList = document.createElement('div');
        optionsList.className = 'quiz-options-list';

        const options = question.options || ['', ''];
        const correctMultiple = question.correctMultiple || [];
        const correctSingle = question.correct ?? 0;

        options.forEach((opt, idx) => {
            const isCorrect = isCheckbox ? correctMultiple.includes(idx) : (correctSingle === idx);
            const optionRow = createOptionRow(opt, idx, isCheckbox, isCorrect);
            optionsList.appendChild(optionRow);
        });

        optionsField.appendChild(optionsList);

        // Add option button
        const addOptionBtn = document.createElement('button');
        addOptionBtn.type = 'button';
        addOptionBtn.className = 'quiz-add-option';
        addOptionBtn.textContent = '+ Add option';
        addOptionBtn.onclick = () => {
            const newIdx = optionsList.children.length;
            const optionRow = createOptionRow('', newIdx, isCheckbox, false);
            optionsList.appendChild(optionRow);
            optionRow.querySelector('input[type="text"]').focus();
        };
        optionsField.appendChild(addOptionBtn);

        container.appendChild(optionsField);

    } else if (type === 'short_answer' || type === 'worked') {
        // These types primarily use the model answer and rubric from advanced section
        const infoText = document.createElement('p');
        infoText.className = 'quiz-type-info';
        infoText.textContent = type === 'short_answer'
            ? 'Short answer questions are graded using the model answer and rubric in the Advanced section.'
            : 'Worked problems show work area for students. Grade using model answer and rubric in the Advanced section.';
        container.appendChild(infoText);

    } else if (type === 'numeric') {
        // Numeric: answer + tolerance
        const typeDesc = document.createElement('p');
        typeDesc.className = 'quiz-type-info';
        typeDesc.textContent = 'Numeric answer - student enters a number, graded within tolerance';
        container.appendChild(typeDesc);

        // Answer and tolerance in a row
        const answerRow = document.createElement('div');
        answerRow.className = 'quiz-field quiz-numeric-row';

        // Expected answer
        const answerField = document.createElement('div');
        answerField.className = 'quiz-numeric-field';
        answerField.innerHTML = `
            <label>Answer</label>
            <input type="number" class="quiz-numeric-answer" value="${question.answer ?? ''}" step="any" placeholder="Expected answer">
        `;
        answerRow.appendChild(answerField);

        // Tolerance
        const toleranceField = document.createElement('div');
        toleranceField.className = 'quiz-numeric-field';
        toleranceField.innerHTML = `
            <label>Tolerance (±)</label>
            <input type="number" class="quiz-numeric-tolerance" value="${question.tolerance ?? 0}" min="0" step="any" placeholder="0">
        `;
        answerRow.appendChild(toleranceField);

        container.appendChild(answerRow);

    } else if (type === 'scale') {
        // Scale: low/high bounds + labels + optional correct value
        const typeDesc = document.createElement('p');
        typeDesc.className = 'quiz-type-info';
        typeDesc.textContent = 'Scale rating - student selects a value on a linear scale';
        container.appendChild(typeDesc);

        // Bounds row
        const boundsRow = document.createElement('div');
        boundsRow.className = 'quiz-field quiz-scale-row';

        // Low bound
        const lowField = document.createElement('div');
        lowField.className = 'quiz-scale-field';
        lowField.innerHTML = `
            <label>Low value</label>
            <input type="number" class="quiz-scale-low" value="${question.low ?? 1}" step="1">
        `;
        boundsRow.appendChild(lowField);

        // High bound
        const highField = document.createElement('div');
        highField.className = 'quiz-scale-field';
        highField.innerHTML = `
            <label>High value</label>
            <input type="number" class="quiz-scale-high" value="${question.high ?? 5}" step="1">
        `;
        boundsRow.appendChild(highField);

        container.appendChild(boundsRow);

        // Labels row
        const labelsRow = document.createElement('div');
        labelsRow.className = 'quiz-field quiz-scale-row';

        // Low label
        const lowLabelField = document.createElement('div');
        lowLabelField.className = 'quiz-scale-field';
        lowLabelField.innerHTML = `
            <label>Low label</label>
            <input type="text" class="quiz-scale-low-label" value="${escapeHtml(question.lowLabel || '')}" placeholder="e.g., Strongly disagree">
        `;
        labelsRow.appendChild(lowLabelField);

        // High label
        const highLabelField = document.createElement('div');
        highLabelField.className = 'quiz-scale-field';
        highLabelField.innerHTML = `
            <label>High label</label>
            <input type="text" class="quiz-scale-high-label" value="${escapeHtml(question.highLabel || '')}" placeholder="e.g., Strongly agree">
        `;
        labelsRow.appendChild(highLabelField);

        container.appendChild(labelsRow);

        // Optional correct value (for graded scales)
        const correctField = document.createElement('div');
        correctField.className = 'quiz-field quiz-scale-correct';
        correctField.innerHTML = `
            <label>Expected answer <span class="quiz-field-hint">(optional, for graded scales)</span></label>
            <input type="number" class="quiz-scale-correct" value="${question.correct ?? ''}" step="1" placeholder="Leave blank for survey-style">
        `;
        container.appendChild(correctField);

    } else if (type === 'grid') {
        // Grid: rows + columns + optional correct answers matrix
        const typeDesc = document.createElement('p');
        typeDesc.className = 'quiz-type-info';
        typeDesc.textContent = 'Grid/matrix - student selects one option per row (Likert scales, matching, etc.)';
        container.appendChild(typeDesc);

        const rows = question.rows || ['Row 1', 'Row 2'];
        const columns = question.columns || ['Column 1', 'Column 2', 'Column 3'];

        // Build correct answers lookup from question data
        const correctAnswers = question.correctAnswers || [];
        const correctLookup = {};
        if (Array.isArray(correctAnswers)) {
            correctAnswers.forEach(([rowIdx, colIdx]) => {
                correctLookup[rowIdx] = colIdx;
            });
        }

        // Rows editor
        const rowsField = document.createElement('div');
        rowsField.className = 'quiz-field quiz-grid-rows-field';
        rowsField.innerHTML = `<label>Rows</label>`;

        const rowsList = document.createElement('div');
        rowsList.className = 'quiz-grid-items-list';
        rows.forEach((row, idx) => {
            rowsList.appendChild(createGridItemRow(row, idx, 'row'));
        });
        rowsField.appendChild(rowsList);

        const addRowBtn = document.createElement('button');
        addRowBtn.type = 'button';
        addRowBtn.className = 'quiz-grid-add-item';
        addRowBtn.textContent = '+ Add row';
        addRowBtn.onclick = () => {
            const newIdx = rowsList.children.length;
            rowsList.appendChild(createGridItemRow(`Row ${newIdx + 1}`, newIdx, 'row'));
            updateGridMatrix(container);
        };
        rowsField.appendChild(addRowBtn);
        container.appendChild(rowsField);

        // Columns editor
        const colsField = document.createElement('div');
        colsField.className = 'quiz-field quiz-grid-cols-field';
        colsField.innerHTML = `<label>Columns</label>`;

        const colsList = document.createElement('div');
        colsList.className = 'quiz-grid-items-list';
        columns.forEach((col, idx) => {
            colsList.appendChild(createGridItemRow(col, idx, 'col'));
        });
        colsField.appendChild(colsList);

        const addColBtn = document.createElement('button');
        addColBtn.type = 'button';
        addColBtn.className = 'quiz-grid-add-item';
        addColBtn.textContent = '+ Add column';
        addColBtn.onclick = () => {
            const newIdx = colsList.children.length;
            colsList.appendChild(createGridItemRow(`Column ${newIdx + 1}`, newIdx, 'col'));
            updateGridMatrix(container);
        };
        colsField.appendChild(addColBtn);
        container.appendChild(colsField);

        // Correct answers matrix (collapsible)
        const matrixSection = document.createElement('div');
        matrixSection.className = 'quiz-grid-matrix-section';

        const hasCorrect = Object.keys(correctLookup).length > 0;
        const matrixToggle = document.createElement('button');
        matrixToggle.type = 'button';
        matrixToggle.className = 'quiz-grid-matrix-toggle';
        matrixToggle.innerHTML = hasCorrect ? '▾ Correct answers (for grading)' : '▸ Correct answers (for grading)';
        matrixToggle.onclick = () => {
            matrixSection.classList.toggle('expanded');
            matrixToggle.innerHTML = matrixSection.classList.contains('expanded')
                ? '▾ Correct answers (for grading)'
                : '▸ Correct answers (for grading)';
        };
        matrixSection.appendChild(matrixToggle);

        const matrixContent = document.createElement('div');
        matrixContent.className = 'quiz-grid-matrix-content';

        const matrixHint = document.createElement('p');
        matrixHint.className = 'quiz-grid-matrix-hint';
        matrixHint.textContent = 'Click cells to mark correct answers. Leave empty for survey-style questions.';
        matrixContent.appendChild(matrixHint);

        // Build the matrix grid
        const matrix = buildGridMatrix(rows, columns, correctLookup);
        matrixContent.appendChild(matrix);

        matrixSection.appendChild(matrixContent);
        container.appendChild(matrixSection);

        if (hasCorrect) {
            matrixSection.classList.add('expanded');
        }
    }
}

// Create a row/column item for grid editor
function createGridItemRow(value, index, type) {
    const row = document.createElement('div');
    row.className = `quiz-grid-item-row quiz-grid-${type}-item`;
    row.setAttribute('data-index', index);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `quiz-grid-item-input quiz-grid-${type}-input`;
    input.value = value || '';
    input.placeholder = type === 'row' ? `Row ${index + 1}` : `Column ${index + 1}`;
    input.oninput = () => {
        // Update matrix labels when input changes
        const container = row.closest('.quiz-type-fields');
        if (container) updateGridMatrix(container);
    };
    row.appendChild(input);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'quiz-grid-item-delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = `Remove ${type}`;
    deleteBtn.onclick = () => {
        const list = row.parentElement;
        if (list.children.length > 1) {
            row.remove();
            const container = row.closest('.quiz-type-fields') || list.closest('.quiz-type-fields');
            if (container) updateGridMatrix(container);
        } else {
            showToast(`Need at least 1 ${type}`, true);
        }
    };
    row.appendChild(deleteBtn);

    return row;
}

// Build the clickable matrix for marking correct answers
function buildGridMatrix(rows, columns, correctLookup) {
    const matrix = document.createElement('div');
    matrix.className = 'quiz-grid-matrix';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.className = 'quiz-grid-matrix-row quiz-grid-matrix-header';
    headerRow.innerHTML = '<div class="quiz-grid-matrix-cell quiz-grid-matrix-corner"></div>';
    columns.forEach((col, colIdx) => {
        const cell = document.createElement('div');
        cell.className = 'quiz-grid-matrix-cell quiz-grid-matrix-col-label';
        cell.textContent = col || `Col ${colIdx + 1}`;
        headerRow.appendChild(cell);
    });
    matrix.appendChild(headerRow);

    // Data rows
    rows.forEach((row, rowIdx) => {
        const matrixRow = document.createElement('div');
        matrixRow.className = 'quiz-grid-matrix-row';

        const rowLabel = document.createElement('div');
        rowLabel.className = 'quiz-grid-matrix-cell quiz-grid-matrix-row-label';
        rowLabel.textContent = row || `Row ${rowIdx + 1}`;
        matrixRow.appendChild(rowLabel);

        columns.forEach((col, colIdx) => {
            const cell = document.createElement('div');
            cell.className = 'quiz-grid-matrix-cell quiz-grid-matrix-option';
            cell.setAttribute('data-row', rowIdx);
            cell.setAttribute('data-col', colIdx);

            if (correctLookup[rowIdx] === colIdx) {
                cell.classList.add('selected');
                cell.innerHTML = '✓';
            }

            cell.onclick = () => {
                // Toggle selection (one per row)
                const currentRow = matrixRow;
                currentRow.querySelectorAll('.quiz-grid-matrix-option').forEach(c => {
                    c.classList.remove('selected');
                    c.innerHTML = '';
                });

                if (correctLookup[rowIdx] !== colIdx) {
                    cell.classList.add('selected');
                    cell.innerHTML = '✓';
                    correctLookup[rowIdx] = colIdx;
                } else {
                    delete correctLookup[rowIdx];
                }
            };

            matrixRow.appendChild(cell);
        });

        matrix.appendChild(matrixRow);
    });

    return matrix;
}

// Update the grid matrix when rows/columns change
function updateGridMatrix(container) {
    const rowInputs = container.querySelectorAll('.quiz-grid-row-input');
    const colInputs = container.querySelectorAll('.quiz-grid-col-input');
    const matrixContent = container.querySelector('.quiz-grid-matrix-content');

    if (!matrixContent) return;

    const rows = Array.from(rowInputs).map(input => input.value);
    const columns = Array.from(colInputs).map(input => input.value);

    // Preserve existing correct answers where possible
    const oldMatrix = matrixContent.querySelector('.quiz-grid-matrix');
    const correctLookup = {};
    if (oldMatrix) {
        oldMatrix.querySelectorAll('.quiz-grid-matrix-option.selected').forEach(cell => {
            const rowIdx = parseInt(cell.getAttribute('data-row'));
            const colIdx = parseInt(cell.getAttribute('data-col'));
            // Only keep if still valid
            if (rowIdx < rows.length && colIdx < columns.length) {
                correctLookup[rowIdx] = colIdx;
            }
        });
        oldMatrix.remove();
    }

    // Find hint and insert matrix after it
    const hint = matrixContent.querySelector('.quiz-grid-matrix-hint');
    const newMatrix = buildGridMatrix(rows, columns, correctLookup);
    if (hint) {
        hint.after(newMatrix);
    } else {
        matrixContent.appendChild(newMatrix);
    }
}

// Create a single option row for multiple choice (styled like quiz viewer)
function createOptionRow(value, index, isCheckbox, isCorrect) {
    const row = document.createElement('div');
    row.className = 'quiz-option-row' + (isCorrect ? ' is-correct' : '');
    row.setAttribute('data-index', index);

    // Letter circle (styled like viewer)
    const letter = document.createElement('span');
    letter.className = 'quiz-option-letter';
    letter.textContent = String.fromCharCode(65 + index);
    row.appendChild(letter);

    // Option text input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quiz-option-input';
    input.value = value || '';
    input.placeholder = `Enter option ${String.fromCharCode(65 + index)}`;
    row.appendChild(input);

    // Correct answer toggle (checkmark style)
    const correctBtn = document.createElement('button');
    correctBtn.type = 'button';
    correctBtn.className = 'quiz-option-correct-btn' + (isCorrect ? ' is-correct' : '');
    correctBtn.innerHTML = '✓';
    correctBtn.title = isCorrect ? 'Correct answer' : 'Mark as correct';
    correctBtn.onclick = () => {
        const optionsList = row.parentElement;
        if (isCheckbox) {
            // Checkbox mode - toggle this option
            row.classList.toggle('is-correct');
            correctBtn.classList.toggle('is-correct');
        } else {
            // Radio mode - only one correct
            optionsList.querySelectorAll('.quiz-option-row').forEach(r => {
                r.classList.remove('is-correct');
                r.querySelector('.quiz-option-correct-btn')?.classList.remove('is-correct');
            });
            row.classList.add('is-correct');
            correctBtn.classList.add('is-correct');
        }
    };
    row.appendChild(correctBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'quiz-option-delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Remove option';
    deleteBtn.onclick = () => {
        const optionsList = row.parentElement;
        if (optionsList.children.length > 2) {
            row.remove();
            updateOptionIndices(optionsList);
        } else {
            showToast('Need at least 2 options', true);
        }
    };
    row.appendChild(deleteBtn);

    return row;
}

// Update option indices (A, B, C labels) after deletion
function updateOptionIndices(optionsList) {
    Array.from(optionsList.children).forEach((row, idx) => {
        row.setAttribute('data-index', idx);
        const label = row.querySelector('.quiz-option-label');
        if (label) label.textContent = String.fromCharCode(65 + idx) + '.';
        const input = row.querySelector('.quiz-option-text');
        if (input) input.placeholder = `Option ${String.fromCharCode(65 + idx)}`;
    });
}

// Handle question type change with confirmation
function handleQuestionTypeChange(questionEl, newType) {
    const currentData = JSON.parse(questionEl.getAttribute('data-question') || '{}');
    const oldType = currentData.type;

    if (oldType === newType) return;

    const oldIsOptions = OPTIONS_BASED_TYPES.includes(oldType);
    const newIsOptions = OPTIONS_BASED_TYPES.includes(newType);

    // Warn if changing FROM options-based TO non-options (will lose options)
    if (oldIsOptions && !newIsOptions && currentData.options && currentData.options.some(o => o.trim())) {
        if (!confirm('Changing type will remove your options. Continue?')) {
            const select = questionEl.querySelector('.quiz-question-type');
            select.value = oldType;
            return;
        }
    }

    // Warn if changing FROM numeric (will lose answer/tolerance)
    if (oldType === 'numeric' && newType !== 'numeric' && currentData.answer !== undefined) {
        if (!confirm('Changing type will remove your numeric answer and tolerance. Continue?')) {
            const select = questionEl.querySelector('.quiz-question-type');
            select.value = oldType;
            return;
        }
    }

    // Warn if changing FROM scale (will lose scale settings)
    if (oldType === 'scale' && newType !== 'scale' && (currentData.lowLabel || currentData.highLabel)) {
        if (!confirm('Changing type will remove your scale settings. Continue?')) {
            const select = questionEl.querySelector('.quiz-question-type');
            select.value = oldType;
            return;
        }
    }

    // Update question data - preserve common fields
    const newData = {
        type: newType,
        question: currentData.question || '',
        points: currentData.points || 1,
        whenRight: currentData.whenRight,
        whenWrong: currentData.whenWrong,
        modelAnswer: currentData.modelAnswer,
        rubric: currentData.rubric
    };

    // Handle options-based types
    if (newIsOptions) {
        if (oldIsOptions && currentData.options) {
            // Preserve options when switching between MC-family types
            newData.options = currentData.options;

            // Convert correct answer format
            if (newType === 'checkbox') {
                // Convert single correct to array
                if (currentData.correctMultiple) {
                    newData.correctMultiple = currentData.correctMultiple;
                } else if (currentData.correct !== undefined) {
                    newData.correctMultiple = [currentData.correct];
                } else {
                    newData.correctMultiple = [];
                }
            } else {
                // multiple_choice or dropdown - single correct
                if (currentData.correct !== undefined) {
                    newData.correct = currentData.correct;
                } else if (currentData.correctMultiple && currentData.correctMultiple.length > 0) {
                    newData.correct = currentData.correctMultiple[0];
                } else {
                    newData.correct = 0;
                }
            }
        } else {
            // New options-based question - create defaults
            newData.options = ['', ''];
            if (newType === 'checkbox') {
                newData.correctMultiple = [];
            } else {
                newData.correct = 0;
            }
        }
    }

    // Handle numeric type defaults
    if (newType === 'numeric') {
        newData.tolerance = 0;
    }

    // Handle scale type defaults
    if (newType === 'scale') {
        newData.low = 1;
        newData.high = 5;
    }

    // Handle grid type defaults
    if (newType === 'grid') {
        newData.rows = ['Row 1', 'Row 2'];
        newData.columns = ['Column 1', 'Column 2', 'Column 3'];
    }

    questionEl.setAttribute('data-question', JSON.stringify(newData));

    // Re-render type fields
    const typeFields = questionEl.querySelector('.quiz-type-fields');
    renderQuestionTypeFields(typeFields, newType, newData);
}

// Update question editor indices after reordering
function updateQuestionEditorIndices() {
    const container = document.querySelector('.quiz-questions-editor');
    if (!container) return;

    Array.from(container.children).forEach((questionEl, idx) => {
        questionEl.setAttribute('data-index', idx);
        const qNum = questionEl.querySelector('.quiz-question-num');
        if (qNum) qNum.textContent = `Q${idx + 1}`;
    });
}

// Setup drag and drop for question reordering
function setupQuestionDragDrop(questionEl, dragHandle) {
    dragHandle.setAttribute('draggable', 'true');

    dragHandle.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', questionEl.getAttribute('data-index'));
        questionEl.classList.add('dragging');
    });

    dragHandle.addEventListener('dragend', () => {
        questionEl.classList.remove('dragging');
        document.querySelectorAll('.quiz-question-editor').forEach(el => {
            el.classList.remove('drag-over');
        });
    });

    questionEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = document.querySelector('.quiz-question-editor.dragging');
        if (dragging && dragging !== questionEl) {
            questionEl.classList.add('drag-over');
        }
    });

    questionEl.addEventListener('dragleave', () => {
        questionEl.classList.remove('drag-over');
    });

    questionEl.addEventListener('drop', (e) => {
        e.preventDefault();
        questionEl.classList.remove('drag-over');

        const dragging = document.querySelector('.quiz-question-editor.dragging');
        if (!dragging || dragging === questionEl) return;

        const container = questionEl.parentElement;
        const dragIdx = parseInt(dragging.getAttribute('data-index'));
        const dropIdx = parseInt(questionEl.getAttribute('data-index'));

        if (dragIdx < dropIdx) {
            container.insertBefore(dragging, questionEl.nextSibling);
        } else {
            container.insertBefore(dragging, questionEl);
        }

        updateQuestionEditorIndices();
    });
}

// Get all questions data from the editor
function getQuestionsEditorValue() {
    const container = document.querySelector('.quiz-questions-editor');
    if (!container) return [];

    const questions = [];
    Array.from(container.children).forEach(questionEl => {
        const question = {};

        // Get type
        const typeSelect = questionEl.querySelector('.quiz-question-type');
        question.type = typeSelect ? typeSelect.value : 'multiple_choice';

        // Get question text
        const questionText = questionEl.querySelector('.quiz-question-text');
        question.question = questionText ? questionText.value : '';

        // Get points
        const points = questionEl.querySelector('.quiz-points');
        question.points = points ? parseFloat(points.value) || 1 : 1;

        // Get type-specific fields for options-based types
        if (OPTIONS_BASED_TYPES.includes(question.type)) {
            const options = [];
            const optionRows = questionEl.querySelectorAll('.quiz-option-row');
            const correctIndices = [];

            optionRows.forEach((row, idx) => {
                const textInput = row.querySelector('.quiz-option-input');
                options.push(textInput ? textInput.value : '');

                // Check for is-correct class
                if (row.classList.contains('is-correct')) {
                    correctIndices.push(idx);
                }
            });

            question.options = options;

            // Checkbox type uses correctMultiple, others use single correct
            if (question.type === 'checkbox') {
                question.correctMultiple = correctIndices;
            } else {
                question.correct = correctIndices.length > 0 ? correctIndices[0] : 0;
            }
        }

        // Get numeric-specific fields
        if (question.type === 'numeric') {
            const answer = questionEl.querySelector('.quiz-numeric-answer');
            if (answer && answer.value !== '') {
                question.answer = parseFloat(answer.value);
            }

            const tolerance = questionEl.querySelector('.quiz-numeric-tolerance');
            question.tolerance = tolerance ? parseFloat(tolerance.value) || 0 : 0;
        }

        // Get scale-specific fields
        if (question.type === 'scale') {
            const low = questionEl.querySelector('.quiz-scale-low');
            question.low = low ? parseInt(low.value) || 1 : 1;

            const high = questionEl.querySelector('.quiz-scale-high');
            question.high = high ? parseInt(high.value) || 5 : 5;

            const lowLabel = questionEl.querySelector('.quiz-scale-low-label');
            if (lowLabel && lowLabel.value.trim()) {
                question.lowLabel = lowLabel.value.trim();
            }

            const highLabel = questionEl.querySelector('.quiz-scale-high-label');
            if (highLabel && highLabel.value.trim()) {
                question.highLabel = highLabel.value.trim();
            }

            const correct = questionEl.querySelector('.quiz-scale-correct');
            if (correct && correct.value !== '') {
                question.correct = parseInt(correct.value);
            }
        }

        // Get grid-specific fields
        if (question.type === 'grid') {
            const rowInputs = questionEl.querySelectorAll('.quiz-grid-row-input');
            const colInputs = questionEl.querySelectorAll('.quiz-grid-col-input');

            question.rows = Array.from(rowInputs).map(input => input.value || '');
            question.columns = Array.from(colInputs).map(input => input.value || '');

            // Get correct answers from matrix
            const selectedCells = questionEl.querySelectorAll('.quiz-grid-matrix-option.selected');
            if (selectedCells.length > 0) {
                const correctAnswers = [];
                selectedCells.forEach(cell => {
                    const rowIdx = parseInt(cell.getAttribute('data-row'));
                    const colIdx = parseInt(cell.getAttribute('data-col'));
                    correctAnswers.push([rowIdx, colIdx]);
                });
                question.correctAnswers = correctAnswers;
            }
        }

        // Get feedback fields
        const whenRight = questionEl.querySelector('.quiz-when-right');
        if (whenRight && whenRight.value.trim()) question.whenRight = whenRight.value.trim();

        const whenWrong = questionEl.querySelector('.quiz-when-wrong');
        if (whenWrong && whenWrong.value.trim()) question.whenWrong = whenWrong.value.trim();

        const modelAnswer = questionEl.querySelector('.quiz-model-answer');
        if (modelAnswer && modelAnswer.value.trim()) question.modelAnswer = modelAnswer.value.trim();

        const rubric = questionEl.querySelector('.quiz-rubric');
        if (rubric && rubric.value.trim()) question.rubric = rubric.value.trim();

        // Get audio fields
        const audioText = questionEl.querySelector('.quiz-audio-text');
        if (audioText && audioText.value.trim()) question.audio = audioText.value.trim();

        const audioLang = questionEl.querySelector('.quiz-audio-lang');
        if (audioLang && audioLang.value) question.audioLang = audioLang.value;

        questions.push(question);
    });

    return questions;
}

// Get value from an editor field
function getEditorFieldValue(fieldName, fieldDef, fieldConfig) {
    // Check fieldConfig.type first (explicit override), then schema type, then default to text
    const type = fieldConfig?.type || fieldDef?.type || 'text';

    // Special handling for thumbnail
    if (type === 'thumbnail') {
        return editorManualThumbnail || editingCard.card[fieldName] || null;
    }

    // Check for CodeMirror instance first (for code and yaml types)
    if (codeMirrorInstances[fieldName]) {
        const cmValue = getCodeMirrorValue(fieldName);
        if (type === 'yaml') {
            // Parse YAML string back to object
            try {
                return cmValue ? jsyaml.load(cmValue) : null;
            } catch (e) {
                console.error('[Editor] Invalid YAML:', e.message);
                showToast('Invalid YAML: ' + e.message, true);
                return null;
            }
        }
        return cmValue;
    }

    const el = document.getElementById(`editor-${fieldName}`);
    if (!el) return null;

    if (type === 'boolean') {
        return el.checked;
    } else if (type === 'number') {
        return el.value ? parseFloat(el.value) : null;
    } else if (type === 'datetime' && el.value) {
        return new Date(el.value).toISOString();
    } else if (type === 'date' && el.value) {
        return el.value;
    } else if (type === 'yaml') {
        // Fallback for textarea (if CodeMirror failed to load)
        // Parse YAML string back to object
        try {
            return el.value ? jsyaml.load(el.value) : null;
        } catch (e) {
            console.error('[Editor] Invalid YAML:', e.message);
            showToast('Invalid YAML: ' + e.message, true);
            return null;
        }
    } else if (type === 'list') {
        // Collect values from list editor items in order
        const values = [];
        const rows = el.querySelectorAll('.list-editor-item');
        rows.forEach(row => {
            const input = row.querySelector('.list-editor-input');
            if (input && input.value.trim()) {
                values.push(input.value.trim());
            }
        });
        return values;
    } else if (type === 'records') {
        // Collect record objects from records editor table rows in order
        // el is the tbody, schema is on the parent table
        const table = el.closest('table');
        const schemaStr = table?.getAttribute('data-schema') || el.getAttribute('data-schema');
        const schema = JSON.parse(schemaStr || '{}');
        const records = [];
        const rows = el.querySelectorAll('.records-editor-row');
        rows.forEach(row => {
            const record = {};
            for (const key of Object.keys(schema)) {
                const fieldType = schema[key].type || 'text';
                if (fieldType === 'boolean') {
                    const toggle = row.querySelector(`[data-field="${key}"]`);
                    record[key] = toggle ? toggle.getAttribute('data-value') === 'true' : true;
                } else {
                    const input = row.querySelector(`[data-field="${key}"]`);
                    // Check for original value (array paths stored as JSON)
                    const originalValue = input?.getAttribute('data-original-value');
                    if (originalValue) {
                        try {
                            record[key] = JSON.parse(originalValue);
                        } catch (e) {
                            record[key] = input ? input.value : '';
                        }
                    } else {
                        record[key] = input ? input.value : '';
                    }
                }
            }
            records.push(record);
        });
        return records;
    } else if (type === 'questions') {
        // Use the dedicated function to extract questions data
        return getQuestionsEditorValue();
    } else if (type === 'templates') {
        // Collect checked template names from checkbox grid
        const checkboxes = el.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    return el.value;
}

// Switch between write/preview tabs
function switchEditorTab(tab) {
    const tabs = document.querySelectorAll('#editorBody .editor-tab');
    const editorContainer = document.querySelector('#editorBody .codemirror-container.markdown-editor');
    const fallbackTextarea = document.querySelector('#editorBody textarea.markdown-editor-fallback');
    const preview = document.getElementById('editorPreview');

    // Get the editor element (CodeMirror container or fallback textarea)
    const editorEl = editorContainer || fallbackTextarea;
    if (!editorEl || !preview) return;

    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    if (tab === 'preview') {
        editorEl.style.display = 'none';
        preview.style.display = 'block';
        preview.classList.add('active');

        // Render markdown preview - get content from CodeMirror or fallback textarea
        let content;
        if (editorContainer && codeMirrorInstances['content']) {
            content = getCodeMirrorValue('content');
        } else if (fallbackTextarea) {
            content = fallbackTextarea.value;
        } else {
            content = '';
        }

        const format = editingCard.card.format || 'markdown';
        if (format === 'markdown') {
            preview.innerHTML = renderMarkdownWithLinks(content, editingCard.card._path);
        } else {
            preview.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
        }
    } else {
        editorEl.style.display = 'block';
        preview.style.display = 'none';
        preview.classList.remove('active');
    }
}

// Initialize thumbnail drag-drop for editor
function initEditorThumbnailUpload() {
    const previewEl = document.getElementById('editorThumbnailPreview');
    const fileInput = document.getElementById('editorThumbnailFile');
    if (!previewEl || !fileInput) return;

    // Click to upload
    previewEl.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleEditorThumbnailFile(e.target.files[0]);
        }
    });

    // Drag and drop
    previewEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        previewEl.classList.add('drag-over');
    });

    previewEl.addEventListener('dragleave', () => {
        previewEl.classList.remove('drag-over');
    });

    previewEl.addEventListener('drop', (e) => {
        e.preventDefault();
        previewEl.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleEditorThumbnailFile(e.dataTransfer.files[0]);
        }
    });
}

// Handle thumbnail file selection
function handleEditorThumbnailFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be smaller than 5MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        editorManualThumbnail = e.target.result;
        const previewEl = document.getElementById('editorThumbnailPreview');
        if (previewEl) {
            previewEl.classList.add('has-image');
            previewEl.style.backgroundImage = `url('${editorManualThumbnail}')`;
            previewEl.style.backgroundSize = 'cover';
            previewEl.style.backgroundPosition = 'center';
        }
    };
    reader.readAsDataURL(file);
}

// Update Pyodide status in editor
function updateEditorPyodideStatus() {
    const statusEl = document.getElementById('editorStatus');
    if (!statusEl) return;

    if (pyodideReady) {
        statusEl.textContent = '🟢 Python ready';
    } else if (pyodideLoading) {
        statusEl.textContent = '⏳ Loading Python...';
    } else {
        statusEl.textContent = 'Will load on first run';
    }
}

// Run code in editor (for code template)
async function runEditorCode() {
    const outputEl = document.getElementById('editorCodeOutput');
    const outputContainer = document.getElementById('editorOutput');
    const runBtn = document.getElementById('editorRunBtn');

    if (!outputEl) return;

    // Get code from CodeMirror instance or fallback to textarea
    let code = '';
    if (codeMirrorInstances['code']) {
        code = getCodeMirrorValue('code');
    } else {
        const codeEl = document.getElementById('editor-code');
        code = codeEl ? codeEl.value : '';
    }

    if (!code.trim()) {
        showToast('Please enter some code first');
        return;
    }

    // Show output area
    outputContainer.style.display = 'block';
    outputEl.innerHTML = '<div style="color: var(--text-muted);">⏳ Running...</div>';

    if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = '⏳ Running...';
    }

    try {
        const py = await initPyodide();
        const result = await executePythonCode(py, code);
        outputEl.innerHTML = result;
    } catch (error) {
        outputEl.innerHTML = `<pre class="error">${escapeHtml(error.toString())}</pre>`;
    }

    if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '▶ Run';
    }

    updateEditorPyodideStatus();
}

// Close the editor modal
function closeEditor() {
    // Clean up CodeMirror instances before clearing DOM
    destroyCodeMirrorInstances();

    document.getElementById('editorModal').classList.remove('active');
    document.getElementById('editorBody').innerHTML = '';
    document.getElementById('editorActions').innerHTML = '';
    document.getElementById('editorOutput').style.display = 'none';
    document.getElementById('editorCodeOutput').innerHTML = '';
    editingCard = null;
    editorManualThumbnail = null;
}

// Save the editor content
async function saveEditor() {
    if (!editingCard) return;

    // Check if we're in remote/read-only mode - prompt to save to folder first
    if (isRemoteMode()) {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
        // After saving to folder, continue with the edit save (now in filesystem mode)
    }

    const { templateName, sectionId, card, isNew } = editingCard;
    const template = templateRegistry[templateName];
    if (!template) return;

    const submitBtn = document.getElementById('editorSubmitBtn');
    const originalText = submitBtn.textContent;

    // Validate required fields and collect values
    const fields = template.editor?.fields || [];
    const cardData = { ...card, template: templateName };
    let hasError = false;

    for (const fieldConfig of fields) {
        const fieldDef = template.schema[fieldConfig.field];
        const value = getEditorFieldValue(fieldConfig.field, fieldDef, fieldConfig);

        if (fieldDef?.required && !value) {
            showToast(`${fieldConfig.label} is required`);
            hasError = true;
            break;
        }

        cardData[fieldConfig.field] = value;
    }

    if (hasError) return;

    // Parse tags from universal tags field
    const tagsInput = document.getElementById('editorTags');
    if (tagsInput) {
        const tagsValue = tagsInput.value.trim();
        if (tagsValue) {
            cardData.tags = tagsValue.split(',').map(t => t.trim()).filter(t => t);
        } else {
            delete cardData.tags;
        }
    }

    // Parse number from universal number field (for sorting)
    const numberInput = document.getElementById('editorNumber');
    if (numberInput) {
        const numberValue = numberInput.value.trim();
        if (numberValue) {
            // Store as number if it's a simple integer, otherwise as string for "1.2" style
            const numVal = Number(numberValue);
            cardData.number = !isNaN(numVal) && String(numVal) === numberValue ? numVal : numberValue;
        } else {
            delete cardData.number;
        }
    }

    // Use stored location path (computed in openEditor, not editable by user)
    cardData._path = editingCard.locationPath || card._path;

    // Set timestamps
    const now = new Date().toISOString();
    if (isNew) {
        cardData.created = now;
        // Apply default author for new cards if not already set
        if (!cardData.author && notebookSettings?.default_author) {
            cardData.author = notebookSettings.default_author;
        }
    }
    cardData.modified = now;

    // Handle thumbnail auto-generation for bookmarks
    if (templateName === 'bookmark' && cardData.url) {
        if (editorManualThumbnail) {
            cardData.thumbnail = editorManualThumbnail;
        } else if (!cardData.thumbnail || isNew) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading-spinner"></span> Generating thumbnail...';
            try {
                cardData.thumbnail = await generateThumbnail(cardData.url);
            } catch (e) {
                console.log('Thumbnail generation failed:', e);
            }
        }
    }

    // Handle auto-execute for code
    if (templateName === 'code' && cardData.code) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Running & Saving...';
        try {
            const py = await initPyodide();
            cardData.output = await executePythonCode(py, cardData.code);
            cardData.showOutput = true;
        } catch (e) {
            cardData.output = `<pre class="error">${escapeHtml(e.toString())}</pre>`;
        }
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';

    try {
        // Update or add card in section
        const section = data.sections.find(s => s.id === sectionId);
        if (section) {
            if (isNew) {
                section.items.push(cardData);
            } else {
                const idx = section.items.findIndex(i => i.id === card.id);
                if (idx >= 0) {
                    // Handle title change (requires file rename)
                    if (card.title && card.title !== cardData.title) {
                        await deleteItemFile(sectionId, card);
                    }
                    section.items[idx] = cardData;
                }
            }
            // Re-sort section after modification (order field may have changed)
            sortSectionItems(section);
        }

        await saveData();
        await saveCardFile(sectionId, cardData);

        closeEditor();
        render();
        if (templateName === 'settings') {
            showToast('Settings saved to disk');
        } else {
            showToast(isNew ? `${template.ui?.button_label || 'Card'} created` : 'Changes saved');
        }

    } catch (error) {
        console.error('Save error:', error);
        showToast('Error saving: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Handle generic editor actions
function handleEditorAction(action) {
    if (action === 'execute') {
        runEditorCode();
    }
    // Add other actions as needed
}

// ========== SECTION: DATA_PERSISTENCE ==========
// IndexedDB operations: loadData, openDB, saveData
// Storage config: IDB_NAME, IDB_STORE, IDB_KEY

// Load data from IndexedDB
async function loadData() {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);

        const jsonStr = await new Promise((resolve, reject) => {
            const request = store.get(IDB_KEY);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        db.close();

        if (jsonStr) {
            data = JSON.parse(jsonStr);
            // Ensure title and subtitle exist (backwards compatibility)
            if (!data.title) data.title = 'Research Notebook';
            if (!data.subtitle) data.subtitle = 'Bookmarks, notes, and connections';
            console.log(`Loaded data from IndexedDB (${(jsonStr.length / 1024).toFixed(1)}KB)`);
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('⚠️ Error loading data: ' + error.message);
    }
    render();
}

// Storage configuration - using IndexedDB for reliable large dataset support
const IDB_NAME = 'ResearchNotebookDB';
const IDB_STORE = 'notebook';
const IDB_KEY = 'data';
const IDB_HANDLES_STORE = 'notebook-handles';  // Named handle registry for multi-notebook support

// IndexedDB helper functions
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 2);  // Version 2: added notebook-handles store

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Version 1: notebook store for data and legacy handle
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
            // Version 2: separate store for named handles (multi-notebook support)
            if (!db.objectStoreNames.contains(IDB_HANDLES_STORE)) {
                db.createObjectStore(IDB_HANDLES_STORE);
            }
        };
    });
}

// Save data to IndexedDB only (filesystem saves handled separately by targeted functions)
async function saveData() {
    try {
        const jsonStr = JSON.stringify(data);
        const db = await openDB();
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(jsonStr, IDB_KEY);

        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        db.close();
        console.log(`Data saved to IndexedDB (${(jsonStr.length / 1024).toFixed(1)}KB)`);
    } catch (error) {
        console.error('Error saving data:', error);
        showToast('⚠️ Error saving data: ' + error.message);
        throw error;
    }
}

// ========== SECTION: STORAGE_BACKEND ==========
// Abstraction layer for file I/O. All paths are relative to notebook root with forward slashes.
// FileSystemBackend wraps the File System Access API; future backends (e.g., GitHub API) implement
// the same interface.

// Active storage backend (FileSystemBackend or future alternatives)
let storageBackend = null;

// Storage backend using the File System Access API (Chrome/Edge)
class FileSystemBackend {
    type = 'filesystem';
    readonly = false;

    constructor(dirHandle) {
        this._root = dirHandle;
    }

    get name() {
        return this._root.name;
    }

    // Navigate from root handle through path segments, returning the final handle
    // For a file path like 'research/my-note.md', returns the handle for 'research/' directory
    // For a directory path like 'research/subdir', returns the handle for 'subdir/'
    async _resolvePath(path) {
        if (!path || path === '' || path === '.') return { dir: this._root, segments: [] };
        const parts = path.split('/').filter(p => p && p !== '.');
        let current = this._root;
        for (let i = 0; i < parts.length - 1; i++) {
            current = await current.getDirectoryHandle(parts[i]);
        }
        return { dir: current, name: parts[parts.length - 1], segments: parts };
    }

    // Read a text file. Returns {content, lastModified, size}
    async readFile(path) {
        const { dir, name } = await this._resolvePath(path);
        const fileHandle = await dir.getFileHandle(name);
        const file = await fileHandle.getFile();
        const content = await file.text();
        return { content, lastModified: file.lastModified, size: file.size };
    }

    // Read a file as a data URL (for binary files like images). Returns {dataUrl, lastModified, size}
    async readFileAsDataUrl(path) {
        const { dir, name } = await this._resolvePath(path);
        const fileHandle = await dir.getFileHandle(name);
        const file = await fileHandle.getFile();
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        return { dataUrl, lastModified: file.lastModified, size: file.size };
    }

    // Write a text or binary file, auto-creating parent directories
    async writeFile(path, content) {
        const parts = path.split('/').filter(p => p && p !== '.');
        let current = this._root;
        // Create parent directories as needed
        for (let i = 0; i < parts.length - 1; i++) {
            current = await current.getDirectoryHandle(parts[i], { create: true });
        }
        const filename = parts[parts.length - 1];
        const fileHandle = await current.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    }

    // Delete a file or directory. options.recursive for non-empty directories.
    async deleteEntry(path, options = {}) {
        const { dir, name } = await this._resolvePath(path);
        await dir.removeEntry(name, { recursive: !!options.recursive });
    }

    // List contents of a directory. Returns [{name, kind: 'file'|'directory'}]
    async listDirectory(path) {
        let dirHandle;
        if (!path || path === '' || path === '.') {
            dirHandle = this._root;
        } else {
            const parts = path.split('/').filter(p => p && p !== '.');
            dirHandle = this._root;
            for (const part of parts) {
                dirHandle = await dirHandle.getDirectoryHandle(part);
            }
        }
        const entries = [];
        for await (const [name, handle] of dirHandle.entries()) {
            entries.push({ name, kind: handle.kind });
        }
        return entries;
    }

    // Create a directory (and any missing parents)
    async mkdir(path) {
        const parts = path.split('/').filter(p => p && p !== '.');
        let current = this._root;
        for (const part of parts) {
            current = await current.getDirectoryHandle(part, { create: true });
        }
    }

    // Check if a file or directory exists
    async exists(path) {
        try {
            const { dir, name } = await this._resolvePath(path);
            try {
                await dir.getFileHandle(name);
                return true;
            } catch {
                try {
                    await dir.getDirectoryHandle(name);
                    return true;
                } catch {
                    return false;
                }
            }
        } catch {
            return false;
        }
    }
}

// ========== SECTION: FILESYSTEM_STORAGE ==========
// File System Access API integration for direct folder read/write
// Functions: slugify, noteToMarkdown, markdownToNote, codeToFile, fileToCode,
//            bookmarkToJson, jsonToBookmark, loadFromFilesystem, saveToFilesystem,
//            saveDirHandle, loadDirHandle, linkNotebookFolder, unlinkNotebookFolder

// Check if File System Access API is available
function isFileSystemAccessSupported() {
    return 'showDirectoryPicker' in window;
}

// Convert title to filename-safe slug
function slugify(title, maxLength = 50) {
    if (!title) return 'untitled';
    let slug = title.toLowerCase();
    slug = slug.replace(/[^\w\s-]/g, '');  // Remove special chars
    slug = slug.replace(/[\s_]+/g, '-');   // Spaces to hyphens
    slug = slug.trim().replace(/^-+|-+$/g, '');  // Trim hyphens
    return slug.substring(0, maxLength) || 'untitled';
}

// Note: Old type-specific conversion functions (noteToMarkdown, markdownToNote,
// codeToFile, fileToCode, bookmarkToJson, jsonToBookmark) have been replaced by
// the generic loadCard() and serializeCard() functions in TEMPLATE_SYSTEM section.

// Save directory handle to IndexedDB for persistence
async function saveDirHandle(handle) {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(handle, IDB_DIR_HANDLE_KEY);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        console.log('[Filesystem] Directory handle saved to IndexedDB');
    } catch (error) {
        console.error('[Filesystem] Error saving directory handle:', error);
    }
}

// Load directory handle from IndexedDB
async function loadDirHandle() {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const handle = await new Promise((resolve, reject) => {
            const request = store.get(IDB_DIR_HANDLE_KEY);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return handle || null;
    } catch (error) {
        console.error('[Filesystem] Error loading directory handle:', error);
        return null;
    }
}

// Save a named handle to IndexedDB (for multi-notebook support)
async function saveNamedHandle(name, handle) {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(IDB_HANDLES_STORE);
        await new Promise((resolve, reject) => {
            const request = store.put(handle, name);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        db.close();
        console.log(`[Filesystem] Saved handle for "${name}"`);
    } catch (error) {
        console.error('[Filesystem] Failed to save named handle:', error);
    }
}

// Get a named handle from IndexedDB
async function getNamedHandle(name) {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_HANDLES_STORE, 'readonly');
        const store = tx.objectStore(IDB_HANDLES_STORE);
        const handle = await new Promise((resolve, reject) => {
            const request = store.get(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return handle || null;
    } catch (error) {
        console.error('[Filesystem] Failed to get named handle:', error);
        return null;
    }
}

// List all named handles
async function listNamedHandles() {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_HANDLES_STORE, 'readonly');
        const store = tx.objectStore(IDB_HANDLES_STORE);
        const keys = await new Promise((resolve, reject) => {
            const request = store.getAllKeys();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return keys || [];
    } catch (error) {
        console.error('[Filesystem] Failed to list handles:', error);
        return [];
    }
}

// Delete a named handle from IndexedDB
async function deleteNamedHandle(name) {
    try {
        const db = await openDB();
        const tx = db.transaction(IDB_HANDLES_STORE, 'readwrite');
        const store = tx.objectStore(IDB_HANDLES_STORE);
        await new Promise((resolve, reject) => {
            const request = store.delete(name);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        db.close();
        console.log(`[Filesystem] Deleted handle for "${name}"`);
    } catch (error) {
        console.error('[Filesystem] Failed to delete handle:', error);
    }
}

// Migrate legacy single handle to named registry (one-time migration)
async function migrateLegacyHandle() {
    try {
        const db = await openDB();

        // Check for legacy handle in the old location
        const tx1 = db.transaction(IDB_STORE, 'readonly');
        const store1 = tx1.objectStore(IDB_STORE);
        const legacyHandle = await new Promise((resolve, reject) => {
            const request = store1.get(IDB_DIR_HANDLE_KEY);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (legacyHandle) {
            // Migrate to named registry using folder name
            const name = legacyHandle.name;
            await saveNamedHandle(name, legacyHandle);

            // Remove legacy entry
            const tx2 = db.transaction(IDB_STORE, 'readwrite');
            const store2 = tx2.objectStore(IDB_STORE);
            await new Promise((resolve, reject) => {
                const request = store2.delete(IDB_DIR_HANDLE_KEY);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            console.log(`[Filesystem] Migrated legacy handle to "${name}"`);
            db.close();
            return { name, handle: legacyHandle };
        }

        db.close();
    } catch (error) {
        console.error('[Filesystem] Migration failed:', error);
    }
    return null;
}

// Request permission for directory handle (needed after page reload)
async function verifyDirPermission(handle) {
    if (!handle) return false;
    try {
        const options = { mode: 'readwrite' };
        if (await handle.queryPermission(options) === 'granted') {
            return true;
        }
        if (await handle.requestPermission(options) === 'granted') {
            return true;
        }
        return false;
    } catch (error) {
        console.error('[Filesystem] Permission error:', error);
        return false;
    }
}

// Resolve relative image paths in all markdown fields of a card based on its template schema
// Stores original values in card._originalMarkdown for editor use
async function resolveCardMarkdownImages(card, basePath) {
    if (!card || !basePath || !storageBackend) return card;

    const template = templateRegistry[card.template || card.type];
    if (!template?.schema) return card;

    // Store original markdown content for editor (so users see paths, not data URLs)
    card._originalMarkdown = {};

    // Helper to resolve a single field value, storing original
    async function resolveField(value, fieldSchema, storeKey) {
        if (!value || typeof value !== 'string') return value;
        if (fieldSchema?.type !== 'markdown') return value;
        const resolved = await resolveMarkdownImages(value, basePath);
        // Only store original if resolution changed something
        if (resolved !== value && storeKey) {
            card._originalMarkdown[storeKey] = value;
        }
        return resolved;
    }

    // Helper to resolve markdown fields in an object based on schema properties
    async function resolveObjectFields(obj, properties, arrayField, index) {
        if (!obj || !properties) return obj;
        for (const [fieldName, fieldSchema] of Object.entries(properties)) {
            if (obj[fieldName] !== undefined && fieldSchema.type === 'markdown') {
                const storeKey = `${arrayField}[${index}].${fieldName}`;
                obj[fieldName] = await resolveField(obj[fieldName], fieldSchema, storeKey);
            }
        }
        return obj;
    }

    // Walk through schema fields
    for (const [fieldName, fieldSchema] of Object.entries(template.schema)) {
        if (card[fieldName] === undefined) continue;

        if (fieldSchema.type === 'markdown') {
            // Direct markdown field
            card[fieldName] = await resolveField(card[fieldName], fieldSchema, fieldName);
        } else if (fieldSchema.type === 'array' && Array.isArray(card[fieldName])) {
            // Array field - check if items have markdown properties
            const itemSchema = fieldSchema.items;
            if (itemSchema?.type === 'object' && itemSchema.properties) {
                // Find markdown properties in item schema
                const markdownProps = Object.entries(itemSchema.properties)
                    .filter(([_, propSchema]) => propSchema.type === 'markdown');

                if (markdownProps.length > 0) {
                    // Resolve markdown fields in each array item
                    for (let i = 0; i < card[fieldName].length; i++) {
                        const item = card[fieldName][i];
                        if (item && typeof item === 'object') {
                            await resolveObjectFields(item, itemSchema.properties, fieldName, i);
                        }
                    }
                }
            }
        }
    }

    return card;
}

// Resolve relative image paths in markdown content to data URLs
// basePath: the card's directory path (e.g., 'decisions' or 'decisions/subdir')
async function resolveMarkdownImages(content, basePath) {
    if (!content || !basePath || !storageBackend) return content;

    // Find all markdown image references: ![alt](path)
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = [...content.matchAll(imagePattern)];

    if (matches.length === 0) return content;

    let result = content;
    for (const match of matches) {
        const [fullMatch, alt, src] = match;

        // Skip absolute paths, URLs, and data URIs
        if (src.startsWith('/') || src.startsWith('http://') ||
            src.startsWith('https://') || src.startsWith('data:')) {
            continue;
        }

        try {
            let dataUrl;

            // Try 1: Resolve relative to card's directory
            // basePath is 'decisions', src is 'diagrams/foo.png'
            // Full path: 'decisions/diagrams/foo.png'
            try {
                const relativePath = basePath + '/' + src;
                const imgResult = await storageBackend.readFileAsDataUrl(relativePath);
                dataUrl = imgResult.dataUrl;
                console.log(`[Filesystem] Resolved image (relative): ${src}`);
            } catch {
                // Try 2: Resolve from notebook root
                // src is 'assets/emperor-penguins.png', try as-is from root
                const imgResult = await storageBackend.readFileAsDataUrl(src);
                dataUrl = imgResult.dataUrl;
                console.log(`[Filesystem] Resolved image (from root): ${src}`);
            }

            // Replace the markdown image with data URL version
            result = result.replace(fullMatch, `![${alt}](${dataUrl})`);
        } catch (e) {
            // Image not found in either location
            console.warn(`[Filesystem] Could not resolve image: ${src}`, e.message);
        }
    }

    return result;
}

// Load notebook data from filesystem
async function loadFromFilesystem() {
    console.log('[Filesystem] Loading from directory...');

    // Load settings first (handles migration from legacy format)
    await loadSettings();

    // Load roster (optional student name mappings)
    await loadRoster();

    // Load templates first (populates cardTypeExtensions via loadCardTypeModules)
    // Only loads CSS/JS for enabled_templates from settings
    await loadTemplates();
    // Then load extension registry (uses cardTypeExtensions)
    await loadExtensionRegistry();

    // Detect in-use card types and lazy-load their CSS/JS
    const inUseTypes = await detectInUseCardTypes();
    const additionalTypes = [...inUseTypes].filter(t => !fullyLoadedCardTypes.has(t));
    if (additionalTypes.length > 0) {
        console.log(`[CardTypes] Loading assets for in-use types: ${additionalTypes.join(', ')}`);
        await loadCardTypeAssets(additionalTypes);
    }

    // Auto-enable preserve_dir_names if source files detected and setting wasn't explicitly set
    if (inUseTypes.has('source') && notebookSettings?._fromDefaults?.has('preserve_dir_names')) {
        notebookSettings.preserve_dir_names = true;
        console.log('[Settings] Auto-enabled preserve_dir_names (source files detected)');
    }

    await loadAuthors();

    // Inject template CSS variables and load user theme
    injectTemplateStyles();
    await loadThemeCss();

    const loadedData = {
        title: notebookSettings?.notebook_title || 'Research Notebook',
        subtitle: notebookSettings?.notebook_subtitle || 'Bookmarks, notes, and connections',
        sections: []
    };

    try {

        // Load [root] section items (README.md, CLAUDE.md, etc.)
        // and .notebook section items (settings.yaml, theme.css, templates/)

        const excludedExtensions = ['.json', '.html', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
        const rootItems = [];
        const notebookItems = [];

        // Load config files from .notebook/ directory
        let hasConfigDir = false;
        try {
            await storageBackend.listDirectory('.notebook');
            hasConfigDir = true;
        } catch (e) { /* .notebook doesn't exist yet */ }

        if (hasConfigDir) {
            // Load settings.yaml from .notebook/
            try {
                const { lastModified } = await storageBackend.readFile('.notebook/settings.yaml');
                notebookItems.push({
                    template: 'settings',
                    system: true,
                    id: 'system-settings.yaml',
                    filename: 'settings.yaml',
                    _path: '.notebook',
                    title: 'Settings',
                    notebook_title: notebookSettings?.notebook_title || 'Research Notebook',
                    notebook_subtitle: notebookSettings?.notebook_subtitle || '',
                    sections: notebookSettings?.sections || [],
                    theme: notebookSettings?.theme || null,
                    default_author: notebookSettings?.default_author || null,
                    authors: notebookSettings?.authors || [],
                    enabled_templates: notebookSettings?.enabled_templates || null,
                    modified: lastModified ? new Date(lastModified).toISOString() : new Date().toISOString()
                });
                console.log('[Filesystem] Loaded settings card');
            } catch (e) {
                // settings.yaml not found (new notebook)
            }

            // Load theme.css from .notebook/
            try {
                const { content, lastModified } = await storageBackend.readFile('.notebook/theme.css');
                notebookItems.push({
                    template: 'theme',
                    system: true,
                    id: 'system-theme.css',
                    filename: 'theme.css',
                    _path: '.notebook',
                    title: 'Theme',
                    content: content,
                    modified: lastModified ? new Date(lastModified).toISOString() : new Date().toISOString()
                });
                console.log('[Filesystem] Loaded theme card');
            } catch (e) {
                // theme.css not found (optional)
            }

            // Load templates from .notebook/templates/
            try {
                const templateEntries = await storageBackend.listDirectory('.notebook/templates');
                for (const entry of templateEntries) {
                    if (entry.kind !== 'file' || !entry.name.endsWith('.yaml')) continue;
                    try {
                        const { content, lastModified } = await storageBackend.readFile(`.notebook/templates/${entry.name}`);
                        const parsed = jsyaml.load(content);
                        const templateName = entry.name.replace(/\.yaml$/, '');
                        notebookItems.push({
                            template: 'template',
                            system: true,
                            id: 'system-' + templateName + '.template.yaml',
                            filename: entry.name,
                            _path: '.notebook/templates',
                            title: templateName + ' (template)',
                            name: parsed.name || templateName,
                            description: parsed.description || '',
                            schema: parsed.schema || {},
                            card: parsed.card || {},
                            viewer: parsed.viewer || {},
                            editor: parsed.editor || {},
                            style: parsed.style || {},
                            ui: parsed.ui || {},
                            modified: lastModified ? new Date(lastModified).toISOString() : new Date().toISOString()
                        });
                        console.log(`[Filesystem] Loaded template: ${templateName}`);
                    } catch (e) {
                        console.error(`[Filesystem] Error parsing template ${entry.name}:`, e);
                    }
                }
            } catch (e) {
                // .notebook/templates/ doesn't exist
            }
        }

        // Read user files from root directory (README.md, CLAUDE.md, etc.)
        // Config files (settings.yaml, theme.css, *.template.yaml) are only in .notebook/
        const rootEntries = await storageBackend.listDirectory('');
        for (const entry of rootEntries) {
            if (entry.kind !== 'file') continue;
            const filename = entry.name;

            // Skip files with excluded extensions
            if (excludedExtensions.some(ext => filename.endsWith(ext))) continue;

            // Skip all dotfiles (hidden files)
            if (filename.startsWith('.')) continue;

            // Skip config files - they belong in .notebook/ only
            if (filename === 'settings.yaml') continue;
            if (filename === 'theme.css') continue;
            if (filename.endsWith('.template.yaml')) continue;

            try {
                const { content, lastModified } = await storageBackend.readFile(filename);

                // System files that need special handling (README.md, CLAUDE.md)
                const systemFiles = ['README.md', 'CLAUDE.md'];
                const isSystemFile = systemFiles.includes(filename);

                // Use loadCard for files with extension registry support
                const extConfig = getExtensionConfig(filename);
                if (extConfig && !isSystemFile) {
                    // Use generic loadCard for proper frontmatter parsing
                    const card = loadCard(filename, content, '.', {});
                    if (card) {
                        card._path = '.';
                        card.system = false;  // User files, not system files
                        rootItems.push(card);
                        console.log(`[Filesystem] Loaded root file: ${filename} (via loadCard)`);
                        continue;
                    }
                }

                // Fallback for system files or unsupported formats
                const isMarkdown = filename.endsWith('.md');
                const isYaml = filename.endsWith('.yaml');
                let titleFromFilename = filename;
                if (isMarkdown) titleFromFilename = filename.replace(/\.md$/, '');
                else if (isYaml) titleFromFilename = filename.replace(/\.yaml$/, '');

                let format = 'text';
                if (isMarkdown) format = 'markdown';
                else if (isYaml) format = 'yaml';

                rootItems.push({
                    type: 'note',
                    system: isSystemFile,
                    id: isSystemFile ? 'system-' + filename : `root-${filename}-${Date.now()}`,
                    filename: filename,
                    _path: '.',
                    title: titleFromFilename,
                    content: content,
                    format: format,
                    modified: lastModified ? new Date(lastModified).toISOString() : new Date().toISOString()
                });
                console.log(`[Filesystem] Loaded root file: ${filename} (${format})`);
            } catch (e) {
                console.error(`[Filesystem] Error reading root file ${filename}:`, e);
            }
        }

        // Create [root] section if it has items
        if (rootItems.length > 0) {
            const rootSettingsMatch = notebookSettings?.sections?.find(s =>
                typeof s === 'object' && s.dir === '.'
            );
            loadedData.sections.push({
                id: 'section-.',
                items: rootItems,
                visible: rootSettingsMatch?.visible === true,
                _dirName: '.'
            });
            console.log(`[Filesystem] Created [root] section with ${rootItems.length} items`);
        }

        // Create .notebook section if it has items
        if (notebookItems.length > 0) {
            const notebookSettingsMatch = notebookSettings?.sections?.find(s =>
                typeof s === 'object' && s.dir === '.notebook'
            );
            // Track subdirs from _path fields (relative to section root, not full paths)
            const subdirPaths = [...new Set(notebookItems.map(i => i._path).filter(p => p && p !== '.notebook'))]
                .map(p => p.startsWith('.notebook/') ? p.slice('.notebook/'.length) : p);
            loadedData.sections.push({
                id: 'section-.notebook',
                items: notebookItems,
                visible: notebookSettingsMatch?.visible === true,
                _dirName: '.notebook',
                _subdirPaths: subdirPaths
            });
            console.log(`[Filesystem] Created .notebook section with ${notebookItems.length} items`);
        }

        // Helper function to load cards from a section directory
        // subdirPath parameter tracks full path for nested directories (e.g., 'responses/batch1')
        // loadSectionItems: path-based — uses storageBackend instead of FS handles
        // currentPath is the full path from notebook root (e.g., 'research' or 'research/subdir')
        async function loadSectionItems(currentPath, sectionDirName, subdirPath = null) {
            const items = [];

            // First pass: collect all files, directories, and identify companion files
            const fileNames = [];
            const subdirNames = [];
            const companionFiles = {};
            const entries = await storageBackend.listDirectory(currentPath);
            for (const entry of entries) {
                if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

                if (entry.kind === 'directory') {
                    const excludedPaths = notebookSettings?.excluded_paths ?? ['node_modules'];
                    if (excludedPaths.includes(entry.name)) continue;
                    subdirNames.push(entry.name);
                    continue;
                }

                if (entry.kind !== 'file') continue;

                // Check if this is a companion file (e.g., .output.html)
                let isCompanion = false;
                for (const ext of Object.keys(extensionRegistry)) {
                    const config = extensionRegistry[ext];
                    if (config.companionFiles) {
                        for (const companion of config.companionFiles) {
                            if (entry.name.endsWith(companion.suffix)) {
                                const baseFilename = entry.name.slice(0, -companion.suffix.length) + ext;
                                if (!companionFiles[baseFilename]) companionFiles[baseFilename] = {};
                                try {
                                    const { content } = await storageBackend.readFile(`${currentPath}/${entry.name}`);
                                    companionFiles[baseFilename][companion.field] = content;
                                } catch (e) {
                                    console.warn(`[Filesystem] Error reading companion file ${entry.name}:`, e);
                                }
                                isCompanion = true;
                                break;
                            }
                        }
                    }
                    if (isCompanion) break;
                }

                if (!isCompanion) {
                    fileNames.push(entry.name);
                }
            }

            // Second pass: load cards with their companion data
            for (const filename of fileNames) {
                try {
                    const filePath = `${currentPath}/${filename}`;

                    // Get companion data for this file
                    const companionData = companionFiles[filename] || {};

                    // Check for image files (need binary reading, not text)
                    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
                    const isImage = imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));

                    if (isImage) {
                        // Read image as data URL
                        const { dataUrl, lastModified, size } = await storageBackend.readFileAsDataUrl(filePath);

                        const formatFileSize = (bytes) => {
                            if (bytes < 1024) return bytes + ' B';
                            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                        };

                        const relativePath = subdirPath
                            ? `${sectionDirName}/${subdirPath}/${filename}`
                            : `${sectionDirName}/${filename}`;

                        const card = {
                            id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            template: 'image',
                            type: 'image',
                            title: filename,
                            path: relativePath,
                            filesize: formatFileSize(size),
                            src: dataUrl,
                            _path: subdirPath ? `${sectionDirName}/${subdirPath}` : sectionDirName,
                            _source: {
                                filename,
                                format: filename.toLowerCase().endsWith('.svg') ? 'text-image' : 'binary-image',
                                section: sectionDirName,
                                subdir: subdirPath,
                                extension: filename.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
                            },
                            _fileModified: lastModified,
                            modified: lastModified ? new Date(lastModified).toISOString() : new Date().toISOString()
                        };
                        items.push(card);
                        console.log(`[Filesystem] Loaded image: ${subdirPath ? subdirPath + '/' : ''}${filename}`);
                        continue;
                    }

                    const { content, lastModified, size } = await storageBackend.readFile(filePath);

                    // Special handling for bookmarks: load thumbnail from assets
                    if (filename.endsWith('.bookmark.json')) {
                        try {
                            const bookmarkData = JSON.parse(content);
                            if (bookmarkData.thumbnail && !bookmarkData.thumbnail.startsWith('data:')) {
                                try {
                                    const thumbFilename = bookmarkData.thumbnail.split('/').pop();
                                    const { dataUrl } = await storageBackend.readFileAsDataUrl(`assets/thumbnails/${thumbFilename}`);
                                    companionData.thumbnail = dataUrl;
                                } catch (e) {
                                    console.warn(`[Filesystem] Could not load thumbnail ${bookmarkData.thumbnail}:`, e);
                                }
                            }
                        } catch (e) {
                            // JSON parse error, will be caught below
                        }
                    }

                    // Use generic loadCard function
                    const card = loadCard(filename, content, sectionDirName, companionData);
                    if (card) {
                        if (companionData.thumbnail) {
                            card.thumbnail = companionData.thumbnail;
                        }
                        card._path = subdirPath ? `${sectionDirName}/${subdirPath}` : sectionDirName;
                        if (card._source) {
                            card._source.subdir = subdirPath;
                        }
                        card._fileModified = lastModified;
                        if (!card.modified && lastModified) {
                            card.modified = new Date(lastModified).toISOString();
                        }
                        if (card.code) {
                            card.lineCount = card.code.split('\n').length;
                        }
                        if (card._path) {
                            await resolveCardMarkdownImages(card, card._path);
                        }
                        items.push(card);
                    } else {
                        // Fallback: create a generic file card for unrecognized extensions
                        const isBinary = content.includes('\x00') || /[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 1000));
                        const formatSize = (bytes) => {
                            if (bytes < 1024) return bytes + ' B';
                            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                        };
                        const relativePath = subdirPath
                            ? `${sectionDirName}/${subdirPath}/${filename}`
                            : `${sectionDirName}/${filename}`;
                        const fallbackCard = {
                            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            template: 'file',
                            type: 'file',
                            title: filename,
                            path: relativePath,
                            filesize: formatSize(size),
                            binary: isBinary,
                            content: isBinary ? '[Binary file]' : content,
                            _path: subdirPath ? `${sectionDirName}/${subdirPath}` : sectionDirName,
                            _source: {
                                filename,
                                format: isBinary ? 'binary' : 'text',
                                section: sectionDirName,
                                subdir: subdirPath,
                                extension: filename.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
                            },
                            _fileModified: lastModified,
                            modified: lastModified ? new Date(lastModified).toISOString() : new Date().toISOString()
                        };
                        items.push(fallbackCard);
                        console.log(`[Filesystem] Loaded as fallback file: ${subdirPath ? subdirPath + '/' : ''}${filename}`);
                    }
                } catch (e) {
                    console.error(`[Filesystem] Error reading ${filename}:`, e);
                }
            }

            // Third pass: recursively load from subdirectories (arbitrary depth)
            const allSubdirPaths = [];
            for (const subdirName of subdirNames) {
                const newSubdirPath = subdirPath ? `${subdirPath}/${subdirName}` : subdirName;
                allSubdirPaths.push(newSubdirPath);
                const subdirFullPath = `${currentPath}/${subdirName}`;
                const subdirItems = await loadSectionItems(subdirFullPath, sectionDirName, newSubdirPath);
                items.push(...subdirItems);
                if (subdirItems._subdirPaths) {
                    allSubdirPaths.push(...subdirItems._subdirPaths);
                }
                if (subdirItems.length > 0) {
                    console.log(`[Filesystem] Loaded ${subdirItems.length} items from ${sectionDirName}/${newSubdirPath}/`);
                }
            }

            items._subdirPaths = allSubdirPaths;
            return items;
        }

        // Discover section directories at root (excluding reserved names)
        const discoveredSections = new Map(); // dirName -> {}
        const allRootEntries = await storageBackend.listDirectory('');

        for (const entry of allRootEntries) {
            if (entry.kind !== 'directory') continue;
            if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
            if (RESERVED_DIRECTORIES.has(entry.name)) continue;

            discoveredSections.set(entry.name, {});
        }

        console.log(`[Filesystem] Discovered ${discoveredSections.size} section directories`);

        // Load sections and match to settings
        // Filter out [root] and .notebook sections (loaded specially above) and legacy _system
        const sectionsFromSettings = (notebookSettings?.sections || []).filter(s => {
            if (typeof s === 'string') return !s.startsWith('_');
            const dir = s.dir || s.path;
            // Skip [root] section (dir === '.' or array containing '.') and .notebook section
            if (dir === '.' || dir === '.notebook') return false;
            if (Array.isArray(dir) && dir.includes('.')) return false;
            return s.name || s.dir;  // Accept either name or dir field
        });

        // Build lookup map for matching directories to settings
        // Supports both new format {dir, visible} and legacy {name, visible, path}
        const settingsByDir = new Map(); // dir name -> settings record
        sectionsFromSettings.forEach((s, i) => {
            if (typeof s === 'object') {
                // New format uses 'dir', legacy uses 'path' or slugified 'name'
                const dir = s.dir || s.path || (s.name ? slugify(s.name) : null);
                if (dir) {
                    settingsByDir.set(dir, { record: s, index: i });
                }
            } else if (typeof s === 'string') {
                // Legacy string format: treat as display name, slugify for dir
                settingsByDir.set(slugify(s), { record: s, index: i });
            }
        });

        // Track which settings entries we've matched
        const matchedSettings = new Set();

        for (const [dirName] of discoveredSections) {
            // Special defaults for known directories
            const knownDirectoryDefaults = {
                'assets': { visible: false }
            };
            const defaults = knownDirectoryDefaults[dirName] || { visible: true };

            const section = {
                id: 'section-' + dirName,  // Stable ID based on directory name
                items: [],
                visible: defaults.visible,  // Default visible (or known default)
                _dirName: dirName  // Store for filesystem operations
            };

            // Try to match to settings by dir name
            const settingsMatch = settingsByDir.get(dirName);

            if (settingsMatch) {
                const { record: settingsRecord, index } = settingsMatch;
                matchedSettings.add(settingsRecord);
                if (typeof settingsRecord === 'object') {
                    section.visible = settingsRecord.visible !== false;
                    section._settingsIndex = index;
                }
            }

            // Load items from the section
            const loadedItems = await loadSectionItems(dirName, dirName);
            section.items = loadedItems;
            // Store all discovered subdirectory paths (including empty ones)
            section._subdirPaths = loadedItems._subdirPaths || [];

            sortSectionItems(section);
            loadedData.sections.push(section);
        }

        // Sort sections by settings order, then alphabetically for new ones
        loadedData.sections.sort((a, b) => {
            const aOrder = a._settingsIndex !== undefined ? a._settingsIndex : 999;
            const bOrder = b._settingsIndex !== undefined ? b._settingsIndex : 999;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return (a._dirName || a.name).localeCompare(b._dirName || b.name);
        });

        console.log(`[Filesystem] Loaded ${loadedData.sections.length} sections`);

        // Check for sections in settings that don't have directories
        // (These might be newly added via settings UI - create directories for them)
        for (const settingsRecord of sectionsFromSettings) {
            if (matchedSettings.has(settingsRecord)) continue;

            // Get dir name from new format (dir) or legacy (path, slugified name)
            let dirName;
            if (typeof settingsRecord === 'object') {
                dirName = settingsRecord.dir || settingsRecord.path || (settingsRecord.name ? slugify(settingsRecord.name) : null);
            } else if (typeof settingsRecord === 'string') {
                dirName = slugify(settingsRecord);
            }
            if (!dirName) continue;

            console.log(`[Filesystem] Section "${dirName}" in settings has no directory, will create: ${dirName}/`);

            // Create empty section - directory will be created on first save
            const section = {
                id: 'section-' + dirName,  // Stable ID based on directory name
                items: [],
                visible: typeof settingsRecord === 'object' ? settingsRecord.visible !== false : true,
                _dirName: dirName,
                _needsDirectory: true  // Flag to create directory on save
            };
            loadedData.sections.push(section);
        }

        // Update the settings card to reflect discovered sections and auto-detected settings
        // (The card was created before section discovery, so it may be out of sync)
        const notebookSection = loadedData.sections.find(s => s._dirName === '.notebook');
        const settingsCard = notebookSection?.items.find(n => n.template === 'settings');
        if (settingsCard) {
            // Sync all settings from notebookSettings to card (for editor display)
            // This avoids having to explicitly list each field (which is error-prone)
            for (const key of Object.keys(SETTINGS_SCHEMA)) {
                if (notebookSettings?.[key] !== undefined) {
                    settingsCard[key] = notebookSettings[key];
                }
            }
            // Override sections with actual discovered sections (includes visibility)
            settingsCard.sections = loadedData.sections.map(s => ({
                dir: s._dirName,
                visible: s.visible !== false
            }));
        }

        return loadedData;

    } catch (error) {
        console.error('[Filesystem] Error loading from filesystem:', error);
        throw error;
    }
}

// Save notebook data to filesystem
async function saveToFilesystem() {
    console.log('[Filesystem] Saving to directory...');

    try {
        // Update and save settings.yaml
        notebookSettings = {
            notebook_title: data.title,
            notebook_subtitle: data.subtitle,
            // Save display names (not slugs) - directory mapping is by slugified name
            sections: data.sections.map(s => ({ name: s.name, visible: s.visible !== false })),
            theme: notebookSettings?.theme || null
        };
        await saveSettings();

        // Note: README.md and CLAUDE.md are not auto-created
        // Users should provide these by forking from a demo notebook

        // Create assets/thumbnails directory
        await storageBackend.mkdir('assets/thumbnails');

        // Note: Section directories are created by createSectionDir() after this function
        // Card files are saved incrementally by saveCardFile()
        // Root files and .notebook files are saved via saveCardFile() for their sections

        console.log('[Filesystem] Save complete');
    } catch (error) {
        console.error('[Filesystem] Error saving to filesystem:', error);
        throw error;
    }
}

// ========== Targeted filesystem save functions ==========
// These functions save only specific files, avoiding full rewrites
// Each records its save path so the observer can ignore our own writes

// Track recent saves to ignore observer events for files we just wrote
// Maps relative path -> timestamp
let recentSaves = new Map();

// Record that we just saved a file (path relative to notebook root)
function recordSave(relativePath) {
    recentSaves.set(relativePath, Date.now());
    // Clean up old entries (older than 2s)
    const cutoff = Date.now() - 2000;
    for (const [path, time] of recentSaves) {
        if (time < cutoff) recentSaves.delete(path);
    }
}

// Check if we recently saved this file (within 1s)
function wasRecentlySaved(relativePath) {
    const saveTime = recentSaves.get(relativePath);
    return saveTime && (Date.now() - saveTime < 1000);
}

// Save only settings.yaml (for settings, section order changes)
async function saveNotebookMeta() {
    if (!storageBackend) return;

    // Update notebookSettings with current data, preserving existing settings
    notebookSettings = buildSettingsObject({
        ...notebookSettings,
        notebook_title: data.title,
        notebook_subtitle: data.subtitle,
        // Save dir name + visibility (display name is computed from dir via formatDirName)
        sections: data.sections.map(s => ({ dir: s._dirName, visible: s.visible !== false }))
    });
    await saveSettings();
    recordSave('settings.yaml');
}

// Generic card save function using template system
async function saveCardFile(sectionId, card) {
    if (!storageBackend) return;

    // Settings card is handled specially
    if (card.template === 'settings' || card.filename === 'settings.yaml') {
        // Track if excluded_paths changed (requires filesystem reload)
        const oldExcludedPaths = JSON.stringify(notebookSettings?.excluded_paths ?? ['node_modules']);

        // Update notebookSettings from card fields defined in SETTINGS_SCHEMA
        const updatedSettings = { ...notebookSettings };
        for (const key of Object.keys(SETTINGS_SCHEMA)) {
            if (card[key] !== undefined) {
                updatedSettings[key] = card[key];
            }
        }
        notebookSettings = buildSettingsObject(updatedSettings);
        data.title = notebookSettings.notebook_title;
        data.subtitle = notebookSettings.notebook_subtitle;
        await loadAuthors();

        // Lazy-load CSS/JS for newly enabled card types
        if (notebookSettings.enabled_templates) {
            const newlyEnabled = notebookSettings.enabled_templates.filter(t => !fullyLoadedCardTypes.has(t));
            if (newlyEnabled.length > 0) {
                await loadCardTypeAssets(newlyEnabled);
            }
        }

        // Reorder data.sections to match the new order from settings
        if (card.sections && Array.isArray(card.sections)) {
            const newOrder = [];
            for (const sectionRecord of card.sections) {
                let dirName;
                if (typeof sectionRecord === 'object') {
                    dirName = sectionRecord.dir || sectionRecord.path || (sectionRecord.name ? slugify(sectionRecord.name) : null);
                } else if (typeof sectionRecord === 'string') {
                    dirName = slugify(sectionRecord);
                }
                if (!dirName) continue;

                let section = data.sections.find(s => s._dirName === dirName);

                if (section) {
                    if (typeof sectionRecord === 'object') {
                        section.visible = sectionRecord.visible !== false;
                    }
                    newOrder.push(section);
                } else if (dirName !== '.') {
                    const newSection = {
                        id: 'section-' + dirName,
                        items: [],
                        visible: typeof sectionRecord === 'object' ? sectionRecord.visible !== false : true,
                        _dirName: dirName,
                        _needsDirectory: true
                    };
                    try {
                        await storageBackend.mkdir(dirName);
                        newSection._needsDirectory = false;
                        console.log(`[Filesystem] Created section directory: ${dirName}/`);
                    } catch (e) {
                        console.error('[Filesystem] Error creating section directory:', e);
                    }
                    newOrder.push(newSection);
                }
            }
            for (const section of data.sections) {
                if (!newOrder.includes(section)) {
                    newOrder.push(section);
                }
            }
            data.sections = newOrder;
        }

        await saveSettings();
        await loadThemeCss();
        card.filename = '.notebook/settings.yaml';
        card.id = 'system-settings.yaml';
        recordSave('.notebook/settings.yaml');
        console.log('[Filesystem] Saved .notebook/settings.yaml');

        const newExcludedPaths = JSON.stringify(notebookSettings?.excluded_paths ?? ['node_modules']);
        if (oldExcludedPaths !== newExcludedPaths) {
            console.log('[Settings] excluded_paths changed, reloading from filesystem');
            await reloadFromFilesystem(false);
        }
        return;
    }

    // Template cards - save to .notebook/templates/{name}.yaml
    if (card.template === 'template') {
        const templateObj = {
            name: card.name,
            description: card.description
        };
        if (card.schema && Object.keys(card.schema).length > 0) templateObj.schema = card.schema;
        if (card.card && Object.keys(card.card).length > 0) templateObj.card = card.card;
        if (card.viewer && Object.keys(card.viewer).length > 0) templateObj.viewer = card.viewer;
        if (card.editor && Object.keys(card.editor).length > 0) templateObj.editor = card.editor;
        if (card.style && Object.keys(card.style).length > 0) templateObj.style = card.style;
        if (card.ui && Object.keys(card.ui).length > 0) templateObj.ui = card.ui;

        const yamlContent = jsyaml.dump(templateObj, {
            indent: 2,
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false
        });

        const templateFilename = (card.name || 'custom') + '.yaml';
        const savedPath = `.notebook/templates/${templateFilename}`;
        await storageBackend.writeFile(savedPath, yamlContent);

        card.filename = savedPath;
        card.id = 'system-' + card.name + '.template.yaml';
        templateRegistry[card.name] = templateObj;

        recordSave(savedPath);
        console.log('[Filesystem] Saved template:', savedPath);
        return;
    }

    // Theme card - save to .notebook/theme.css
    if (card.template === 'theme') {
        const savedPath = '.notebook/theme.css';
        await storageBackend.writeFile(savedPath, card.content);

        card.filename = savedPath;
        card.id = 'system-theme.css';
        await loadThemeCss();

        recordSave(savedPath);
        console.log('[Filesystem] Saved theme');
        return;
    }

    // System notes (root files like README.md, CLAUDE.md) are saved with raw content
    if (card.system && card.type === 'note') {
        const baseFilename = card.filename || (card.title + '.md');
        const section = data.sections.find(s => s.id === sectionId);
        const sectionDir = section?._dirName;

        let savedPath;
        if (sectionDir === '.') {
            savedPath = baseFilename;
        } else if (sectionDir === '.notebook') {
            const subPath = card._path;
            if (subPath === '.notebook/templates') {
                savedPath = `.notebook/templates/${baseFilename}`;
            } else {
                savedPath = `.notebook/${baseFilename}`;
            }
        } else {
            savedPath = baseFilename;
        }

        await storageBackend.writeFile(savedPath, card.content);
        card.filename = baseFilename;
        recordSave(savedPath);
        console.log('[Filesystem] Saved system note:', savedPath);
        return;
    }

    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Get or create section directory
    let sectionPath;
    if (section._needsDirectory) {
        const dirName = section._dirName;
        await storageBackend.mkdir(dirName);
        sectionPath = dirName;
        delete section._needsDirectory;
        console.log(`[Filesystem] Created section directory: ${dirName}/`);
    } else {
        sectionPath = getSectionPath(section);
        if (!sectionPath) {
            console.error('[Filesystem] Cannot get section path for', section._dirName);
            return;
        }
    }

    // Handle subdirectory if specified
    const subdir = getSubdirFromPath(card._path);
    if (subdir) {
        await storageBackend.mkdir(`${sectionPath}/${subdir}`);
        sectionPath = `${sectionPath}/${subdir}`;
    }

    // Use serializeCard to get the file content and extension
    const { content, extension, format } = serializeCard(card);

    // Preserve original filename if card was loaded from filesystem
    let baseFilename;
    if (card._source?.filename) {
        const origFilename = card._source.filename;
        if (origFilename.endsWith(extension)) {
            baseFilename = origFilename.slice(0, -extension.length);
        } else {
            baseFilename = origFilename.replace(/\.(md|code\.py|bookmark\.json|card\.yaml)$/, '');
        }
    } else {
        baseFilename = slugify(card.title);
    }

    // Special handling for bookmarks: save thumbnail to assets folder
    if ((card.type === 'bookmark' || card.template === 'bookmark') && card.thumbnail && card.thumbnail.startsWith('data:')) {
        const thumbFilename = `${card.id || baseFilename}.png`;
        const depth = sectionPath.split('/').length;
        const thumbnailPath = '../'.repeat(depth) + `assets/thumbnails/${thumbFilename}`;

        try {
            const response = await fetch(card.thumbnail);
            const blob = await response.blob();
            await storageBackend.mkdir('assets/thumbnails');
            await storageBackend.writeFile(`assets/thumbnails/${thumbFilename}`, await blob.arrayBuffer());
            recordSave(`assets/thumbnails/${thumbFilename}`);

            const bookmarkJson = JSON.parse(content);
            bookmarkJson.thumbnail = thumbnailPath;
            const updatedContent = JSON.stringify(bookmarkJson, null, 2);

            const filename = `${baseFilename}${extension}`;
            await storageBackend.writeFile(`${sectionPath}/${filename}`, updatedContent);
            recordSave(`${sectionPath}/${filename}`);
            return;
        } catch (e) {
            console.error('[Filesystem] Error saving thumbnail:', e);
        }
    }

    // Write main card file
    const filename = `${baseFilename}${extension}`;
    await storageBackend.writeFile(`${sectionPath}/${filename}`, content);
    recordSave(`${sectionPath}/${filename}`);

    // Handle companion files based on extension registry
    const extConfig = extensionRegistry[extension];
    if (extConfig?.companionFiles) {
        for (const companion of extConfig.companionFiles) {
            const fieldValue = card[companion.field];
            if (fieldValue) {
                const companionFilename = `${baseFilename}${companion.suffix}`;
                await storageBackend.writeFile(`${sectionPath}/${companionFilename}`, fieldValue);
                recordSave(`${sectionPath}/${companionFilename}`);
            }
        }
    }
}

// Get the path string for a section directory (relative to notebook root)
function getSectionPath(sectionOrName) {
    if (!storageBackend) return null;

    const section = typeof sectionOrName === 'string'
        ? data.sections.find(s => s.name === sectionOrName || s.id === sectionOrName)
        : sectionOrName;

    // Use stored _dirName if available (from filesystem load), otherwise slugify name
    return section?._dirName || slugify(section?.name || sectionOrName);
}

// Create a new section directory at notebook root
async function createSectionDir(section) {
    if (!storageBackend) return;

    const dirName = section._dirName;
    await storageBackend.mkdir(dirName);
    console.log(`[Filesystem] Created section directory: ${dirName}/`);
    recordSave(`${dirName}`);
}

// Delete a section directory at notebook root
async function deleteSectionDir(dirName) {
    if (!storageBackend) return;

    try {
        await storageBackend.deleteEntry(dirName, { recursive: true });
        recordSave(dirName);
        console.log(`[Filesystem] Deleted section directory: ${dirName}/`);
    } catch (e) {
        console.error('[Filesystem] Error deleting section dir:', e);
    }
}

// Create a new subfolder within a section
async function createSubfolder(sectionId) {
    if (!storageBackend) {
        showToast('Filesystem not linked');
        return;
    }

    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Prompt for folder name
    const displayName = prompt('New folder name:');
    if (!displayName || !displayName.trim()) return;

    const dirName = toDirName(displayName.trim());
    if (!dirName) {
        showToast('Invalid folder name');
        return;
    }

    try {
        // Get current focus subdir if any (create inside focused folder)
        let targetPath = section._dirName;
        if (focusedPath && focusedPath.startsWith(section._dirName + '/')) {
            const focusSubdir = getSubdirFromPath(focusedPath);
            if (focusSubdir) {
                targetPath = focusedPath;
            }
        }

        // Create the new subfolder
        await storageBackend.mkdir(`${targetPath}/${dirName}`);
        console.log(`[Filesystem] Created subfolder: ${targetPath}/${dirName}/`);

        // Auto-expand the parent so new folder is visible
        const parentSubdir = getSubdirFromPath(targetPath);
        if (parentSubdir) {
            expandedSubdirs.add(`${sectionId}:${parentSubdir}`);
            saveExpandedSubdirs();
        }

        // Reload and re-render
        await reloadFromFilesystem(false);
        showToast(`Created folder: ${formatDirName(dirName)}`);
    } catch (e) {
        console.error('[Filesystem] Error creating subfolder:', e);
        showToast('Failed to create folder: ' + e.message);
    }
}

// Delete an empty subfolder within a section
// fullPath is the full path from notebook root (e.g., 'section/subdir/nested')
async function deleteSubfolder(fullPath) {
    // Check if we're in remote/read-only mode
    if (isRemoteMode()) {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
    }

    if (!storageBackend) {
        showToast('Filesystem not linked');
        return;
    }

    const displayName = formatDirName(fullPath.split('/').pop());
    console.log('[Filesystem] Attempting to delete subfolder:', fullPath);
    if (!confirm(`Delete empty folder "${displayName}"?`)) return;

    try {
        await storageBackend.deleteEntry(fullPath, { recursive: false });
        console.log(`[Filesystem] Deleted subfolder: ${fullPath}/`);

        // Reload and re-render
        await reloadFromFilesystem(false);
        showToast(`Deleted folder: ${displayName}`);
    } catch (e) {
        console.error('[Filesystem] Error deleting subfolder:', e);
        if (e.name === 'InvalidModificationError') {
            showToast('Cannot delete: folder is not empty');
        } else {
            showToast('Failed to delete folder: ' + e.message);
        }
    }
}

// Delete a single item file
async function deleteItemFile(sectionId, item) {
    if (!storageBackend) return;

    try {
        const section = data.sections.find(s => s.id === sectionId);
        if (!section) return;

        const sectionPath = getSectionPath(section);
        if (!sectionPath) return;

        // Support both legacy type field and new template field (Phase 3)
        const itemType = item.template || item.type;

        // Use stored _filename if available (from filesystem load), otherwise derive from title
        if (itemType === 'note') {
            const filename = item._filename || `${slugify(item.title)}.md`;
            await storageBackend.deleteEntry(`${sectionPath}/${filename}`);
            recordSave(`${sectionPath}/${filename}`);
        } else if (itemType === 'code') {
            const baseFilename = item._filename || slugify(item.title);
            const filename = `${baseFilename}.code.py`;
            await storageBackend.deleteEntry(`${sectionPath}/${filename}`);
            recordSave(`${sectionPath}/${filename}`);
            try {
                const outputFilename = `${baseFilename}.output.html`;
                await storageBackend.deleteEntry(`${sectionPath}/${outputFilename}`);
                recordSave(`${sectionPath}/${outputFilename}`);
            } catch (e) { /* output might not exist */ }
        } else if (itemType === 'bookmark') {
            const baseFilename = item._filename || slugify(item.title);
            const filename = `${baseFilename}.bookmark.json`;
            await storageBackend.deleteEntry(`${sectionPath}/${filename}`);
            recordSave(`${sectionPath}/${filename}`);
        }
    } catch (e) {
        console.error('[Filesystem] Error deleting item file:', e);
    }
}

// Recursively copy a directory's contents to a new location using storageBackend
async function copyDirectoryContents(sourcePath, destPath) {
    const entries = await storageBackend.listDirectory(sourcePath);
    for (const entry of entries) {
        const srcEntryPath = `${sourcePath}/${entry.name}`;
        const destEntryPath = `${destPath}/${entry.name}`;
        if (entry.kind === 'file') {
            const { content } = await storageBackend.readFile(srcEntryPath);
            await storageBackend.writeFile(destEntryPath, content);
            recordSave(destEntryPath);
        } else if (entry.kind === 'directory') {
            await storageBackend.mkdir(destEntryPath);
            await copyDirectoryContents(srcEntryPath, destEntryPath);
        }
    }
}

// Rename a section directory at notebook root
// Takes directory names directly (not display names)
async function renameSectionDir(oldDirName, newDirName, section) {
    if (!storageBackend) {
        throw new Error('Filesystem not linked');
    }

    if (oldDirName === newDirName) return; // No actual rename needed

    // Create new directory
    await storageBackend.mkdir(newDirName);

    // Recursively copy all files and subdirectories from old to new
    await copyDirectoryContents(oldDirName, newDirName);

    // Delete old directory
    await storageBackend.deleteEntry(oldDirName, { recursive: true });
    recordSave(oldDirName);

    // Update all item _path fields in this section
    for (const item of section.items) {
        if (item._path) {
            item._path = item._path.replace(new RegExp(`^${oldDirName}(/|$)`), `${newDirName}$1`);
        }
    }

    // Update section's internal tracking
    section._dirName = newDirName;
    section.id = `section-${newDirName}`;

    console.log(`[Filesystem] Renamed section: ${oldDirName}/ -> ${newDirName}/`);
}

// Link a notebook folder - show picker and save handle
async function linkNotebookFolder() {
    if (!isFileSystemAccessSupported()) {
        showToast('❌ File System Access not supported in this browser');
        return false;
    }

    try {
        // Show directory picker
        const handle = await window.showDirectoryPicker({
            id: 'research-notebook',
            mode: 'readwrite',
            startIn: 'documents'
        });

        // Save as named handle using folder name
        const name = handle.name;
        await saveNamedHandle(name, handle);
        // Also save as legacy handle for backwards compatibility
        await saveDirHandle(handle);

        notebookDirHandle = handle;
        storageBackend = new FileSystemBackend(handle);
        filesystemLinked = true;
        viewMode = 'filesystem';
        remoteSource = null;

        // Update URL to include notebook name
        history.replaceState(null, '', `?notebook=${encodeURIComponent(name)}`);

        // Check if directory has existing content (sections or .notebook/settings.yaml)
        let hasContent = false;
        for await (const [entryName, entry] of handle.entries()) {
            if (entry.kind === 'directory' &&
                !entryName.startsWith('.') &&
                !RESERVED_DIRECTORIES.has(entryName)) {
                hasContent = true;
                break;
            }
        }
        // Also check for existing .notebook/settings.yaml (existing notebook without sections)
        if (!hasContent) {
            try {
                const configDir = await handle.getDirectoryHandle('.notebook');
                await configDir.getFileHandle('settings.yaml');
                hasContent = true;  // Has settings.yaml, so it's an existing notebook
            } catch (e) {
                // No .notebook/settings.yaml, truly a new folder
            }
        }

        if (hasContent) {
            // Load from filesystem
            const fsData = await loadFromFilesystem();
            data = fsData;
            restoreCollapsedSections();
            restoreExpandedSubdirs();
            restoreFocus();
            render();
            showToast(`📁 Opened ${name}`);
        } else {
            // New notebook: start empty, user adds sections via Add Section button
            data.sections = [];
            await saveToFilesystem();
            await ensureTemplateFiles();  // Create template files for new notebooks
            // Reload to pick up the newly created system notes
            const fsData = await loadFromFilesystem();
            data = fsData;
            restoreCollapsedSections();
            restoreExpandedSubdirs();
            restoreFocus();
            render();
            showToast(`📁 Created new notebook: ${name}`);
        }

        // Start watching for external changes
        await startWatchingFilesystem(handle);

        return true;

    } catch (error) {
        if (error.name === 'AbortError') {
            // User cancelled picker
            return false;
        }
        console.error('[Filesystem] Error linking folder:', error);
        showToast('❌ Error linking folder: ' + error.message);
        return false;
    }
}

// Unlink notebook folder
async function unlinkNotebookFolder() {
    try {
        // Stop watching for changes
        stopWatchingFilesystem();

        const db = await openDB();
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.delete(IDB_DIR_HANDLE_KEY);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();

        notebookDirHandle = null;
        storageBackend = null;
        filesystemLinked = false;
        showToast('📦 Switched to browser storage');
    } catch (error) {
        console.error('[Filesystem] Error unlinking folder:', error);
    }
}

// Initialize filesystem on page load (restore saved handle)
async function initFilesystem() {
    if (!isFileSystemAccessSupported()) {
        console.log('[Filesystem] File System Access API not supported');
        return;
    }

    const savedHandle = await loadDirHandle();
    if (savedHandle) {
        const hasPermission = await verifyDirPermission(savedHandle);
        if (hasPermission) {
            notebookDirHandle = savedHandle;
            storageBackend = new FileSystemBackend(savedHandle);
            filesystemLinked = true;
            console.log(`[Filesystem] Restored link to folder: ${savedHandle.name}`);

            // Load data from filesystem
            try {
                const fsData = await loadFromFilesystem();
                data = fsData;

                // Start watching for external changes
                await startWatchingFilesystem(savedHandle);
            } catch (error) {
                console.error('[Filesystem] Error loading from saved folder:', error);
                showToast('⚠️ Error loading from linked folder');
            }
        } else {
            console.log('[Filesystem] Permission denied for saved folder');
        }
    }
}

// ========== SECTION: REMOTE_LOADING ==========
// Functions for loading notebooks from GitHub repos or URLs
// Functions: parseGitHubPath, isNotebookFile, flattenJsDelivrFiles, loadNotebookFromGitHub,
//            loadNotebookFromUrl, parseFilesToNotebook

// Parse GitHub path: "user/repo", "user/repo@branch", "user/repo@branch/path"
function parseGitHubPath(githubPath) {
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
    // Exclude common non-notebook directories
    if (filePath.includes('node_modules/')) return false;
    if (filePath.includes('.git/')) return false;
    if (filePath.startsWith('.github/')) return false;

    // Exclude output files (loaded as companion data, not separate cards)
    if (filePath.endsWith('.output.html')) return false;

    // Get just the filename for extension checking
    const filename = filePath.split('/').pop();

    // Skip hidden files
    if (filename.startsWith('.') || filename.startsWith('_')) return false;

    // Use extension registry if loaded, otherwise use fallback list
    if (extensionRegistry && Object.keys(extensionRegistry).length > 0) {
        const extensions = Object.keys(extensionRegistry).sort((a, b) => b.length - a.length);
        for (const ext of extensions) {
            if (filename.endsWith(ext)) return true;
        }
    }

    // Fallback: common notebook file extensions
    const validExtensions = [
        '.md', '.yaml', '.yml', '.json', '.css',
        '.code.py', '.code.js', '.code.r',
        '.bookmark.json', '.quiz.json', '.lesson.yaml',
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'
    ];

    return validExtensions.some(ext => filePath.endsWith(ext));
}

// Flatten jsDelivr's nested file structure to array of paths
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

// Load notebook from GitHub via jsDelivr CDN
async function loadNotebookFromGitHub(githubPath) {
    const { user, repo, branch, path } = parseGitHubPath(githubPath);

    console.log(`[Remote] Loading from GitHub: ${user}/${repo}@${branch}/${path}`);

    // Get file listing from jsDelivr API
    const listUrl = `https://data.jsdelivr.com/v1/package/gh/${user}/${repo}@${branch}`;
    const response = await fetch(listUrl);

    if (!response.ok) {
        // Try to get error message from response
        let errorMsg = `Failed to load GitHub repo: ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData.message) {
                // jsDelivr returns helpful messages like "Couldn't find version main for user/repo"
                errorMsg = errorData.message;
                // Make the message more user-friendly
                if (response.status === 404) {
                    errorMsg = `Repository not found: ${user}/${repo}@${branch}. ` +
                        'Make sure the repository is public and the branch exists.';
                }
            }
        } catch (e) {
            // Ignore JSON parse errors
        }
        throw new Error(errorMsg);
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

    // Check if any files were found at the specified path
    if (notebookFiles.length === 0) {
        const pathDisplay = path ? path.replace(/\/$/, '') : 'root';
        throw new Error(`No notebook found at "${pathDisplay}". Make sure the path exists in ${user}/${repo}.`);
    }

    // Fetch content from jsDelivr CDN
    const baseUrl = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${path}`;

    const fileContents = await Promise.all(
        notebookFiles.map(async (filePath) => {
            const url = baseUrl + filePath;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.warn(`[Remote] Failed to fetch ${filePath}: ${response.status}`);
                    return null;
                }
                const content = await response.text();
                return { path: filePath, content };
            } catch (err) {
                console.warn(`[Remote] Error fetching ${filePath}:`, err);
                return null;
            }
        })
    );

    // Filter out failed fetches
    const validFiles = fileContents.filter(f => f !== null);

    const notebook = parseFilesToNotebook(validFiles);

    // Default title to repo name (or repo/path for subdirectories)
    if (notebook.title === 'Untitled Notebook') {
        notebook.title = path ? `${repo}/${path.replace(/\/$/, '')}` : repo;
    }

    return notebook;
}

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
            try {
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    console.warn(`[Remote] Failed to fetch ${filePath}: ${response.status}`);
                    return null;
                }
                const content = await response.text();
                return { path: filePath, content };
            } catch (err) {
                console.warn(`[Remote] Error fetching ${filePath}:`, err);
                return null;
            }
        })
    );

    const validFiles = fileContents.filter(f => f !== null);

    return parseFilesToNotebook(validFiles);
}

// Parse array of {path, content} into notebook data structure
function parseFilesToNotebook(files) {
    const notebook = {
        title: 'Untitled Notebook',
        subtitle: '',
        sections: []
    };

    // Separate companion files (e.g., .output.html) from main files
    const mainFiles = [];
    const companionData = {};

    for (const file of files) {
        const { path, content } = file;
        const filename = path.split('/').pop();

        // Check if this is a companion file
        let isCompanion = false;
        if (extensionRegistry) {
            for (const ext of Object.keys(extensionRegistry)) {
                const config = extensionRegistry[ext];
                if (config.companionFiles) {
                    for (const companion of config.companionFiles) {
                        if (filename.endsWith(companion.suffix)) {
                            // Store by base path (without the companion suffix, with main extension)
                            const basePath = path.slice(0, -companion.suffix.length) + ext;
                            if (!companionData[basePath]) companionData[basePath] = {};
                            companionData[basePath][companion.field] = content;
                            isCompanion = true;
                            break;
                        }
                    }
                }
                if (isCompanion) break;
            }
        }

        if (!isCompanion) {
            mainFiles.push(file);
        }
    }

    // Parse settings first if present
    const settingsFile = mainFiles.find(f => f.path === '.notebook/settings.yaml');
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

    // Group files by section (first directory component)
    const sectionMap = new Map();

    for (const file of mainFiles) {
        const { path } = file;

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
        sectionMap.get(sectionSlug).push({ path, relativePath, content: file.content });
    }

    // Build sections
    for (const [sectionSlug, sectionFiles] of sectionMap) {
        const sectionId = `section-${sectionSlug}`;

        // Get section name from settings or derive from slug
        let sectionName = sectionSlug;
        if (settings.sections) {
            const sectionConfig = settings.sections.find(s =>
                (typeof s === 'object' && (s.dir === sectionSlug || s.name === sectionSlug)) ||
                (typeof s === 'string' && s === sectionSlug)
            );
            if (sectionConfig && typeof sectionConfig === 'object') {
                sectionName = sectionConfig.name || sectionSlug;
            }
        }

        const section = {
            id: sectionId,
            name: sectionName,
            visible: !sectionSlug.startsWith('.'),
            items: [],
            _dirName: sectionSlug
        };

        // Parse each file into a card
        for (const file of sectionFiles) {
            const filename = file.relativePath.split('/').pop();
            const fileCompanionData = companionData[file.path] || {};

            // Handle special system files
            if (file.path === '.notebook/settings.yaml') {
                section.items.push({
                    template: 'settings',
                    type: 'settings',
                    system: true,
                    id: 'system-settings.yaml',
                    filename: 'settings.yaml',
                    _path: '.notebook',
                    title: 'Settings',
                    ...settings
                });
                continue;
            }

            if (file.path === '.notebook/theme.css') {
                section.items.push({
                    template: 'theme',
                    type: 'theme',
                    system: true,
                    id: 'system-theme.css',
                    filename: 'theme.css',
                    _path: '.notebook',
                    title: 'Theme',
                    content: file.content
                });
                continue;
            }

            // Use loadCard for regular files
            const card = loadCard(filename, file.content, sectionName, fileCompanionData);
            if (card) {
                // Add path info for subdirectory support
                const subdirPath = file.relativePath.includes('/')
                    ? file.relativePath.substring(0, file.relativePath.lastIndexOf('/'))
                    : null;
                if (subdirPath) {
                    card._path = sectionSlug + '/' + subdirPath;
                } else {
                    card._path = sectionSlug;
                }
                section.items.push(card);
            }
        }

        // Sort items (reuse existing function)
        sortSectionItems(section);

        notebook.sections.push(section);
    }

    return notebook;
}

// Apply settings and theme from remote notebook data
// This handles what loadSettings() and loadThemeCss() do for filesystem notebooks
async function applyRemoteNotebookSettings(notebookData) {
    // Find settings card in .notebook section
    const notebookSection = notebookData.sections.find(s => s.id === 'section-.notebook');
    const settingsCard = notebookSection?.items.find(i => i.type === 'settings');

    if (settingsCard) {
        // Build notebookSettings from card fields
        notebookSettings = {};
        for (const key of Object.keys(settingsCard)) {
            if (!key.startsWith('_') && !['type', 'id', 'template', 'system', 'filename', 'title'].includes(key)) {
                notebookSettings[key] = settingsCard[key];
            }
        }
        console.log('[Remote] Applied settings:', Object.keys(notebookSettings).join(', '));
    }

    // Inject template CSS variables
    injectTemplateStyles();

    // Load base theme if specified in settings
    if (notebookSettings?.theme) {
        try {
            const themeCSS = await fetchThemeCSS(notebookSettings.theme);
            if (themeCSS) {
                // Remove existing theme styles
                document.getElementById('theme-base-css')?.remove();
                document.getElementById('theme-custom-css')?.remove();

                // Inject base theme
                const baseStyle = document.createElement('style');
                baseStyle.id = 'theme-base-css';
                baseStyle.textContent = `@layer theme {\n${themeCSS}\n}`;
                document.head.appendChild(baseStyle);
                console.log(`[Remote] Loaded base theme: ${notebookSettings.theme}`);
            }
        } catch (e) {
            console.warn('[Remote] Failed to load theme:', e);
        }
    }

    // Load notebook theme.css if present
    const themeCard = notebookSection?.items.find(i => i.type === 'theme');
    if (themeCard?.content) {
        const customStyle = document.createElement('style');
        customStyle.id = 'theme-custom-css';
        customStyle.textContent = `@layer theme {\n${themeCard.content}\n}`;
        document.head.appendChild(customStyle);
        console.log('[Remote] Loaded notebook theme.css customizations');
    }
}

// Check if notebook is in remote/read-only mode
function isRemoteMode() {
    return viewMode === 'remote';
}

// Prompt user to save remote notebook to local folder before editing
// Returns true if saved successfully or false if cancelled
async function promptSaveToFolder() {
    return new Promise((resolve) => {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'saveToFolderModal';
        modal.innerHTML = `
            <div class="modal" style="max-width: 480px;">
                <div class="modal-header">
                    <h2>Save to Folder</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body" style="padding: 1.5rem;">
                    <p style="margin-bottom: 1rem;">This notebook is read-only. To make changes, save a copy to your computer first.</p>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">Your edits will be saved to the local folder. You can continue editing after saving.</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="saveToFolderCancel">Cancel</button>
                    <button class="btn btn-primary" id="saveToFolderConfirm">Choose Folder...</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Handle cancel
        document.getElementById('saveToFolderCancel').onclick = () => {
            modal.remove();
            resolve(false);
        };

        // Handle close button
        modal.querySelector('.modal-close').onclick = () => {
            modal.remove();
            resolve(false);
        };

        // Handle confirm
        document.getElementById('saveToFolderConfirm').onclick = async () => {
            modal.remove();
            const saved = await saveRemoteToFolder();
            resolve(saved);
        };

        // Handle click outside
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        };

        // Handle Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                resolve(false);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    });
}

// Save current (remote) notebook to local folder (Phase 5)
// Stub implementation - will be completed in Phase 5
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

        // Get settings from section if present
        const notebookSection = data.sections.find(s => s.id === 'section-.notebook');
        const settingsCard = notebookSection?.items.find(i => i.type === 'settings');
        if (settingsCard) {
            // Build settings object from card fields
            const settingsObj = {};
            for (const key of Object.keys(settingsCard)) {
                if (!key.startsWith('_') && !['type', 'id', 'template', 'system'].includes(key)) {
                    settingsObj[key] = settingsCard[key];
                }
            }
            await writeFileToHandle(notebookDir, 'settings.yaml', jsyaml.dump(settingsObj));
        }

        // Save theme if present
        const themeCard = notebookSection?.items.find(i => i.type === 'theme');
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
            const sectionSlug = section._dirName || section.id.replace('section-', '');
            const sectionDir = await dirHandle.getDirectoryHandle(sectionSlug, { create: true });

            // Save each card (handling subdirectories)
            for (const card of section.items) {
                // Determine target directory based on card._path
                let targetDir = sectionDir;
                if (card._path && card._path !== sectionSlug) {
                    // Card is in a subdirectory - create nested directories
                    const subPath = card._path.startsWith(sectionSlug + '/')
                        ? card._path.substring(sectionSlug.length + 1)
                        : card._path.replace(sectionSlug, '').replace(/^\//, '');
                    if (subPath) {
                        const subDirs = subPath.split('/');
                        for (const subDir of subDirs) {
                            if (subDir) {
                                targetDir = await targetDir.getDirectoryHandle(subDir, { create: true });
                            }
                        }
                    }
                }
                await saveCardToHandle(targetDir, card);
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
        storageBackend = new FileSystemBackend(dirHandle);
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
    // Use the generic serializeCard function
    const { content, extension } = serializeCard(card);

    // Preserve original filename if available, otherwise generate from title
    let filename;
    if (card._source?.filename) {
        filename = card._source.filename;
    } else {
        filename = slugify(card.title || 'untitled') + extension;
    }

    await writeFileToHandle(dirHandle, filename, content);
}

// ========== SECTION: FILESYSTEM_OBSERVER ==========
// FileSystemObserver for detecting external changes (Phase 2)
// Functions: isFileSystemObserverSupported, startWatchingFilesystem, stopWatchingFilesystem,
//            handleFilesystemChanges, reloadFromFilesystem

// Check if FileSystemObserver API is available
function isFileSystemObserverSupported() {
    return 'FileSystemObserver' in window;
}

// Start watching filesystem for external changes
async function startWatchingFilesystem(dirHandle) {
    if (!isFileSystemObserverSupported()) {
        console.log('[Observer] FileSystemObserver not supported - manual refresh only');
        return false;
    }

    // Stop any existing observer
    stopWatchingFilesystem();

    try {
        filesystemObserver = new FileSystemObserver(handleFilesystemChanges);
        await filesystemObserver.observe(dirHandle, { recursive: true });
        console.log('[Observer] Started watching filesystem for changes');
        return true;
    } catch (error) {
        console.error('[Observer] Error starting filesystem observer:', error);
        filesystemObserver = null;
        return false;
    }
}

// Stop watching filesystem
function stopWatchingFilesystem() {
    if (filesystemObserver) {
        filesystemObserver.disconnect();
        filesystemObserver = null;
        console.log('[Observer] Stopped watching filesystem');
    }
}

// Handle filesystem change events
async function handleFilesystemChanges(records, observer) {
    // Ignore changes while reloading (prevents loops)
    if (isReloadingFromFilesystem) {
        console.log('[Observer] Ignoring changes during reload');
        return;
    }

    // Filter to relevant changes (ignore non-notebook files and files we recently saved)
    const relevantChanges = records.filter(record => {
        const pathComponents = record.relativePathComponents || [];
        const relativePath = pathComponents.join('/');
        const filename = pathComponents[pathComponents.length - 1] || '';

        // Skip files we recently saved (our own writes echoing back)
        if (wasRecentlySaved(relativePath)) {
            console.log(`[Observer] Ignoring recently saved: ${relativePath}`);
            return false;
        }

        // Relevant: .md, .code.py, .bookmark.json, settings.yaml, .output.html
        // Also include directory changes (for new sections)
        if (record.changedHandle?.kind === 'directory') return true;
        if (filename.endsWith('.md')) return true;
        if (filename.endsWith('.code.py')) return true;
        if (filename.endsWith('.output.html')) return true;
        if (filename.endsWith('.bookmark.json')) return true;
        if (filename.endsWith('.quiz.json')) return true;
        if (filename === 'settings.yaml') return true;
        return false;
    });

    if (relevantChanges.length === 0) {
        console.log('[Observer] No relevant changes detected');
        return;
    }

    // Log what changed for debugging
    console.log(`[Observer] Detected ${relevantChanges.length} relevant changes:`);
    relevantChanges.forEach(record => {
        const path = (record.relativePathComponents || []).join('/');
        console.log(`  - ${record.type}: ${path || record.changedHandle?.name || 'unknown'}`);
    });

    // Reload from filesystem
    await reloadFromFilesystem();
}

// Reload notebook data from filesystem (called by observer or manual refresh)
// showNotification: if true, shows toast for external sync (used by observer)
async function reloadFromFilesystem(showNotification = true) {
    if (!storageBackend) {
        console.log('[Observer] Cannot reload - no folder linked');
        return;
    }

    isReloadingFromFilesystem = true;

    try {
        console.log('[Observer] Reloading from filesystem...');
        const fsData = await loadFromFilesystem();
        data = fsData;
        render();

        // If viewer is open, refresh it with updated data
        refreshOpenViewer();

        if (showNotification) {
            showToast('🔄 Synced external changes');
        }
        console.log('[Observer] Reload complete');
    } catch (error) {
        console.error('[Observer] Error reloading from filesystem:', error);
        if (showNotification) {
            showToast('⚠️ Error syncing changes');
        }
        throw error;  // Re-throw so caller can handle
    } finally {
        isReloadingFromFilesystem = false;
    }
}

// ========== SECTION: UI_UTILITIES ==========
// Toast notifications and misc UI helpers

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3000);
}

// Show loading indicator overlay
function showLoadingIndicator(message) {
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

// Hide loading indicator overlay
function hideLoadingIndicator() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
    }
}

// Show error when named notebook not found
function showNotebookNotFoundError(name) {
    const modal = document.getElementById('onboardingModal');
    const content = modal.querySelector('.modal-content');
    content.innerHTML = `
        <h2>Notebook Not Found</h2>
        <p>No notebook named "<strong>${escapeHtml(name)}</strong>" was found.</p>
        <p>It may have been removed or renamed.</p>
        <div class="onboarding-actions">
            <button class="primary-btn" onclick="linkNotebookFolder()">Open Folder...</button>
            <button class="secondary-btn" onclick="closeOnboarding(); history.replaceState(null, '', location.pathname);">Cancel</button>
        </div>
    `;
    modal.classList.add('active');
}

// Show permission required modal for named notebook
function showPermissionRequiredModal(name, handle) {
    const modal = document.getElementById('onboardingModal');
    const content = modal.querySelector('.modal-content');
    content.innerHTML = `
        <h2>Permission Required</h2>
        <p>Please grant permission to access "<strong>${escapeHtml(name)}</strong>".</p>
        <div class="onboarding-actions">
            <button class="primary-btn" onclick="requestNamedHandlePermission('${escapeHtml(name)}')">Grant Access</button>
            <button class="secondary-btn" onclick="closeOnboarding(); history.replaceState(null, '', location.pathname);">Cancel</button>
        </div>
    `;
    modal.classList.add('active');
}

// Request permission for a named handle and reload
async function requestNamedHandlePermission(name) {
    const handle = await getNamedHandle(name);
    if (handle) {
        const permission = await handle.requestPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
            location.reload();
        }
    }
}

// Show error when remote notebook fails to load
function showLoadError(message) {
    const modal = document.getElementById('onboardingModal');
    if (!modal) {
        // Fallback: show alert if modal doesn't exist
        alert('Failed to load notebook: ' + message);
        return;
    }

    // Update the modal body content
    const header = modal.querySelector('.modal-header h2');
    const body = modal.querySelector('.modal-body');

    if (header) header.textContent = 'Failed to Load Notebook';
    if (body) {
        body.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 20px;">⚠️</div>
            <p style="color: var(--text-primary); font-size: 1rem; margin-bottom: 20px; line-height: 1.6;">
                ${escapeHtml(message)}
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button class="btn btn-primary" onclick="location.reload()">Try Again</button>
                <button class="btn btn-secondary" onclick="linkNotebookFolder()">Open Folder...</button>
            </div>
        `;
    }

    modal.classList.add('active');
}

// ========== SECTION: SECTION_MODAL ==========
// Section creation modal: open, close, create

// Section Modal
function openSectionModal() {
    document.getElementById('sectionModal').classList.add('active');
    document.getElementById('sectionName').focus();
}

function closeSectionModal() {
    document.getElementById('sectionModal').classList.remove('active');
    document.getElementById('sectionName').value = '';
}

async function createSection() {
    // Check if we're in remote/read-only mode
    if (isRemoteMode()) {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
    }

    const name = document.getElementById('sectionName').value.trim();
    if (!name) {
        showToast('Please enter a section name');
        return;
    }

    const section = {
        id: Date.now().toString(),
        name: name,
        items: []
    };
    data.sections.push(section);

    await saveData();
    await saveNotebookMeta();  // Update settings.yaml with new section list
    await createSectionDir(section);  // Create section directory
    render();
    closeSectionModal();
    showToast('Section created');
}

// ========== SECTION: SETTINGS_MODAL ==========
// Settings are now handled via the settings.yaml system card
// Storage settings: refreshFromFilesystem, changeNotebookFolder

// Open settings editor (template-based approach)
// This opens the generic editor for the settings.yaml system card
function openSettingsEditor() {
    // Find the settings card in the .notebook section
    const notebookSection = data.sections.find(s => s._dirName === '.notebook');
    let settingsCard = notebookSection?.items.find(n => n.template === 'settings' || n.filename === 'settings.yaml');

    // If no settings card exists, create one with current values
    if (!settingsCard) {
        settingsCard = {
            template: 'settings',
            system: true,
            id: 'system-settings.yaml',
            filename: 'settings.yaml',
            _path: '.notebook',
            title: 'Settings',
            notebook_title: data.title || 'Research Notebook',
            notebook_subtitle: data.subtitle || '',
            sections: data.sections.map(s => ({ dir: s._dirName, visible: s.visible !== false })),
            theme: notebookSettings?.theme || null,
            enabled_templates: notebookSettings?.enabled_templates || null,
            modified: new Date().toISOString()
        };
        // Add to .notebook section (create section if needed)
        if (!notebookSection) {
            data.sections.push({
                id: 'section-.notebook',
                items: [settingsCard],
                visible: false,
                _dirName: '.notebook'
            });
        } else {
            notebookSection.items.unshift(settingsCard);
        }
    }

    // Open the generic editor with the settings card
    openEditor('settings', 'section-.notebook', settingsCard);
}

// Apply settings from editor fields to app state + IndexedDB (no filesystem write)
// Extracts current editor values, updates notebookSettings/data, triggers side effects,
// saves to IndexedDB, and re-renders. Called on every field change for instant feedback.
let _applyingSettings = false;
async function applySettingsFromEditor() {
    if (_applyingSettings) return; // prevent re-entrant calls
    if (!editingCard || editingCard.templateName !== 'settings') return;

    _applyingSettings = true;
    try {
        const template = templateRegistry['settings'];
        if (!template) return;

        const fields = template.editor?.fields || [];
        const card = { ...editingCard.card, template: 'settings' };

        // Collect current field values from editor DOM
        for (const fieldConfig of fields) {
            // Skip fields hidden by showIf conditions
            if (fieldConfig.showIf) {
                const checkValue = card[fieldConfig.showIf.field] || [];
                const arr = Array.isArray(checkValue) ? checkValue : [checkValue];
                if (fieldConfig.showIf.includes && !arr.includes(fieldConfig.showIf.includes)) {
                    continue;
                }
            }
            const fieldDef = template.schema[fieldConfig.field];
            const value = getEditorFieldValue(fieldConfig.field, fieldDef, fieldConfig);
            if (value !== null) {
                card[fieldConfig.field] = value;
            }
        }

        // Sync collected values back to the card object in data model
        // so re-opening the editor shows current state
        Object.assign(editingCard.card, card);

        // Update notebookSettings from card fields (mirrors saveCardFile logic)
        const updatedSettings = { ...notebookSettings };
        for (const key of Object.keys(SETTINGS_SCHEMA)) {
            if (card[key] !== undefined) {
                updatedSettings[key] = card[key];
            }
        }
        notebookSettings = buildSettingsObject(updatedSettings);

        // Update data.title/subtitle
        data.title = notebookSettings.notebook_title;
        data.subtitle = notebookSettings.notebook_subtitle;

        // Reload author registry
        await loadAuthors();

        // Lazy-load CSS/JS for newly enabled card types
        if (notebookSettings.enabled_templates) {
            const newlyEnabled = notebookSettings.enabled_templates.filter(t => !fullyLoadedCardTypes.has(t));
            if (newlyEnabled.length > 0) {
                await loadCardTypeAssets(newlyEnabled);
            }
        }

        // Reorder data.sections from editor (skip directory creation — that's for Save)
        if (card.sections && Array.isArray(card.sections)) {
            const newOrder = [];
            for (const sectionRecord of card.sections) {
                let dirName;
                if (typeof sectionRecord === 'object') {
                    dirName = sectionRecord.dir || sectionRecord.path || (sectionRecord.name ? slugify(sectionRecord.name) : null);
                } else if (typeof sectionRecord === 'string') {
                    dirName = slugify(sectionRecord);
                }
                if (!dirName) continue;

                let section = data.sections.find(s => s._dirName === dirName);
                if (section) {
                    if (typeof sectionRecord === 'object') {
                        section.visible = sectionRecord.visible !== false;
                    }
                    newOrder.push(section);
                }
                // Skip new-section directory creation — deferred to explicit Save
            }
            // Append any sections not in the editor list
            for (const section of data.sections) {
                if (!newOrder.includes(section)) {
                    newOrder.push(section);
                }
            }
            data.sections = newOrder;
        }

        // Reload theme in case base theme changed
        await loadThemeCss();

        // Persist to IndexedDB (not filesystem)
        await saveData();
        render();
    } finally {
        _applyingSettings = false;
    }
}

// Attach auto-apply listeners to settings editor fields
// Called once after openEditor renders the settings form
function attachSettingsAutoApply(template) {
    const bodyEl = document.getElementById('editorBody');
    if (!bodyEl) return;

    const debouncedApply = debounce(() => applySettingsFromEditor(), 300);

    const fields = template.editor?.fields || [];
    for (const fieldConfig of fields) {
        const fieldDef = template.schema[fieldConfig.field];
        const type = fieldConfig.type || fieldDef?.type || 'text';
        const el = document.getElementById(`editor-${fieldConfig.field}`);

        if (type === 'boolean') {
            // Checkbox — apply on click
            if (el) el.addEventListener('change', () => applySettingsFromEditor());
        } else if (type === 'theme' || type === 'select' || type === 'enum') {
            // Dropdown — apply on change
            if (el) el.addEventListener('change', () => applySettingsFromEditor());
        } else if (type === 'templates') {
            // Checkbox grid — apply on any checkbox change
            if (el) el.addEventListener('change', () => applySettingsFromEditor());
        } else if (type === 'records') {
            // Records table — listen for custom events from drag-drop, toggle, add
            if (el) {
                el.addEventListener('records-reorder', () => debouncedApply());
                el.addEventListener('records-toggle', () => applySettingsFromEditor());
                el.addEventListener('records-add', () => debouncedApply());
            }
        } else if (type === 'list') {
            // List editor — listen for reorder and delete events, plus blur on inputs
            if (el) {
                el.addEventListener('list-reorder', () => debouncedApply());
                el.addEventListener('list-delete', () => debouncedApply());
                el.addEventListener('blur', (e) => {
                    if (e.target.classList.contains('list-editor-input')) {
                        debouncedApply();
                    }
                }, true); // capture phase to catch blur on child inputs
            }
        } else {
            // Text inputs — apply on blur (focus loss)
            if (el) el.addEventListener('blur', () => debouncedApply());
        }
    }
}

// Change to a different notebook folder
async function changeNotebookFolder() {
    const success = await linkNotebookFolder();
    if (success) {
        closeEditor();  // Close settings editor if open
        render();
    }
}

// Refresh data from filesystem
async function refreshFromFilesystem() {
    if (!storageBackend) {
        showToast('❌ No folder linked');
        return;
    }

    try {
        showToast('🔄 Refreshing from folder...');
        await reloadFromFilesystem(false);  // Don't show auto-sync toast
        showToast(`✅ Refreshed (${data.sections.length} sections)`);
    } catch (error) {
        console.error('[Filesystem] Refresh error:', error);
        showToast('❌ Error refreshing: ' + error.message);
    }
}

// ========== SECTION: ONBOARDING ==========
// First-time setup flow for new notebooks

// Show onboarding modal
function showOnboarding() {
    // Check browser support
    if (!isFileSystemAccessSupported()) {
        document.getElementById('onboardingUnsupported').style.display = 'block';
    }
    document.getElementById('onboardingModal').classList.add('active');
}

// Close onboarding modal
function closeOnboarding() {
    document.getElementById('onboardingModal').classList.remove('active');
}

// Setup notebook folder from onboarding
async function setupNotebookFolder() {
    const success = await linkNotebookFolder();
    if (success) {
        closeOnboarding();
        render();
    }
}

// ========== SECTION: PYODIDE_RUNTIME ==========
// Python execution via Pyodide: initPyodide, updatePyodideStatus, runCode, executePythonCode
// Config: Pyodide v0.28.2 from jsDelivr CDN, pre-loads numpy/pandas/matplotlib, 120s timeout
// IMPORTANT: initPyodide() not loadPyodide() to avoid collision with window.loadPyodide

// Load Pyodide lazily
async function initPyodide() {
    if (pyodideReady) return pyodide;
    if (pyodideLoading) {
        // Wait for existing load to complete
        while (pyodideLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return pyodide;
    }

    pyodideLoading = true;
    updatePyodideStatus('loading', 'Initializing Python runtime...');
    console.log('[Pyodide] Starting to initialize Pyodide runtime...');

    try {
        // Check if loadPyodide is available
        if (!window.loadPyodide) {
            throw new Error('Pyodide script not loaded. Please refresh the page.');
        }

        console.log('[Pyodide] Calling window.loadPyodide...');
        const startTime = Date.now();

        // Add timeout wrapper to prevent infinite hanging (120 seconds for slow connections)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Pyodide initialization timed out after 120 seconds. Please check your internet connection.')), 120000);
        });

        pyodide = await Promise.race([
            window.loadPyodide({
                indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.2/full/',
                stdout: console.log,
                stderr: console.error
            }),
            timeoutPromise
        ]);

        const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[Pyodide] Runtime initialized successfully in ${loadTime}s`);

        // Load common packages
        console.log('[Pyodide] Loading numpy, pandas, matplotlib...');
        updatePyodideStatus('loading', 'Loading Python packages...');
        const pkgStart = Date.now();

        await pyodide.loadPackage(['numpy', 'pandas', 'matplotlib']);

        const pkgTime = ((Date.now() - pkgStart) / 1000).toFixed(2);
        console.log(`[Pyodide] Packages loaded in ${pkgTime}s`);

        // Set up Python environment
        console.log('[Pyodide] Setting up Python environment...');
        updatePyodideStatus('loading', 'Setting up Python environment...');
        await pyodide.runPythonAsync(`
import sys
import io
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('AGG')
import matplotlib.pyplot as plt

# Helper function for matplotlib plots
def _get_plot_as_base64():
    import base64
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close('all')
    return img_base64
        `);

        pyodideReady = true;
        pyodideLoading = false;
        updatePyodideStatus('ready', 'Python ready');
        console.log('[Pyodide] Ready to execute Python code');
        console.log('[Pyodide] Available packages: numpy, pandas, matplotlib');
        return pyodide;
    } catch (error) {
        console.error('[Pyodide] Load failed:', error);
        pyodideLoading = false;
        updatePyodideStatus('error', 'Failed to load Python: ' + error.message);
        throw error;
    }
}

function updatePyodideStatus(state, message) {
    const statusEl = document.getElementById('pyodideStatus');
    if (!statusEl) return;
    
    statusEl.className = 'pyodide-status ' + state;
    if (state === 'loading') {
        statusEl.innerHTML = `<span class="spinner-small"></span> ${message}`;
    } else {
        statusEl.textContent = message;
    }
}

// Run Python code
async function runCode() {
    const code = document.getElementById('codeContent').value;
    const outputEl = document.getElementById('codeOutput');
    const runBtn = document.getElementById('runCodeBtn');

    if (!code.trim()) {
        outputEl.innerHTML = '<span class="error">No code to run</span>';
        return;
    }

    runBtn.disabled = true;
    runBtn.textContent = '⏳ Running...';
    outputEl.innerHTML = '<span style="color: var(--text-muted);">Running...</span>';

    try {
        const py = await initPyodide();
        const result = await executePythonCode(py, code);
        outputEl.innerHTML = result;
    } catch (error) {
        outputEl.innerHTML = `<pre class="error">${escapeHtml(error.toString())}</pre>`;
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run';
    }
}

async function executePythonCode(py, code) {
    let output = '';

    // Capture stdout
    await py.runPythonAsync(`
import sys
from io import StringIO
_stdout_capture = StringIO()
_stderr_capture = StringIO()
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
    `);

    try {
        // Run the user's code
        const result = await py.runPythonAsync(code);

        // Get captured output
        const stdout = await py.runPythonAsync('_stdout_capture.getvalue()');
        const stderr = await py.runPythonAsync('_stderr_capture.getvalue()');

        // Check for matplotlib figures
        let hasFigure = false;
        try {
            hasFigure = await py.runPythonAsync(`len(plt.get_fignums()) > 0`);
        } catch (e) {
            // matplotlib not available or error, skip figure checking
        }

        // Show stdout
        if (stdout) {
            output += `<pre>${escapeHtml(stdout)}</pre>`;
        }

        // Show stderr
        if (stderr) {
            output += `<pre class="stderr">${escapeHtml(stderr)}</pre>`;
        }

        // Show matplotlib plots
        if (hasFigure) {
            const imgBase64 = await py.runPythonAsync('_get_plot_as_base64()');
            output += `<img src="data:image/png;base64,${imgBase64}" alt="Plot">`;
        }

        // Check if last line result is a DataFrame
        if (result && !hasFigure) {
            try {
                const isDataFrame = await py.runPythonAsync(`
import pandas as pd
isinstance(${code.trim().split('\n').pop()}, pd.DataFrame) if '${code.trim().split('\n').pop()}' else False
                `).catch(() => false);

                if (isDataFrame) {
                    const html = await py.runPythonAsync(`${code.trim().split('\n').pop()}.to_html(max_rows=20)`);
                    output += html;
                }
            } catch (e) {
                // Not a DataFrame or error
            }
        }

        // Show return value only if:
        // - There's a result
        // - No matplotlib figure was created
        // - No other output was generated
        // - Result is not a matplotlib object
        if (result !== undefined && result !== null && !output && !hasFigure) {
            const resultStr = result.toString();
            // Don't show matplotlib objects
            if (resultStr &&
                resultStr !== 'undefined' &&
                !resultStr.includes('matplotlib') &&
                !resultStr.includes('<') &&
                !resultStr.includes('object at 0x')) {
                output += `<pre>${escapeHtml(resultStr)}</pre>`;
            }
        }

        if (!output) {
            output = '<span style="color: var(--text-muted);">Code executed successfully (no output)</span>';
        }

    } catch (error) {
        output = `<pre class="error">${escapeHtml(error.toString())}</pre>`;
    } finally {
        // Reset stdout/stderr
        await py.runPythonAsync(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
        `);
    }

    return output;
}

// ========== SECTION: INTERNAL_LINKING ==========
// Wiki-style [[links]]: renderMarkdownWithLinks, renderNotePreview, resolveLink, findBacklinks, navigateToItem

// Internal linking
// basePath: directory path for resolving relative image URLs (e.g., 'decisions' for 'decisions/foo.md')
function renderMarkdownWithLinks(text, basePath = null) {
    if (!text) return '';
    
    // Store all special elements to protect from markdown processing
    const protectedBlocks = [];
    let processed = text;
    
    // Protect display math $$...$$ 
    processed = processed.replace(/\$\$([^$]+)\$\$/g, (match, latex) => {
        protectedBlocks.push({ type: 'displaymath', content: latex });
        return `%%PROTECTED_${protectedBlocks.length - 1}%%`;
    });
    
    // Protect inline math $...$
    processed = processed.replace(/\$([^$\n]+)\$/g, (match, latex) => {
        protectedBlocks.push({ type: 'inlinemath', content: latex });
        return `%%PROTECTED_${protectedBlocks.length - 1}%%`;
    });
    
    // Protect internal links [[Title]] or [[id:xyz]]
    const linkPattern = /\[\[([^\]]+)\]\]/g;
    processed = processed.replace(linkPattern, (match, linkText) => {
        const target = resolveLink(linkText);
        if (target) {
            protectedBlocks.push({ 
                type: 'link', 
                sectionId: target.sectionId, 
                itemId: target.id, 
                title: target.title 
            });
        } else {
            protectedBlocks.push({ 
                type: 'brokenlink', 
                text: linkText 
            });
        }
        return `%%PROTECTED_${protectedBlocks.length - 1}%%`;
    });
    
    // Render markdown
    let html = marked.parse(processed);
    
    // Restore protected blocks
    html = html.replace(/%%PROTECTED_(\d+)%%/g, (match, index) => {
        const block = protectedBlocks[parseInt(index)];
        switch (block.type) {
            case 'displaymath':
                try {
                    return katex.renderToString(block.content, {
                        displayMode: true,
                        throwOnError: false
                    });
                } catch (e) {
                    return `<span style="color: var(--accent);">${escapeHtml(block.content)}</span>`;
                }
            case 'inlinemath':
                try {
                    return katex.renderToString(block.content, {
                        displayMode: false,
                        throwOnError: false
                    });
                } catch (e) {
                    return `<span style="color: var(--accent);">${escapeHtml(block.content)}</span>`;
                }
            case 'link':
                return `<span class="internal-link" data-link-section="${block.sectionId}" data-link-item="${block.itemId}">${escapeHtml(block.title)}</span>`;
            case 'brokenlink':
                return `<span class="internal-link broken" title="Link not found">${escapeHtml(block.text)}</span>`;
            default:
                return match;
        }
    });

    // Rewrite relative image URLs if basePath is provided
    // basePath is the item's directory path (e.g., 'decisions' or 'decisions/subdir')
    if (basePath) {
        // Ensure basePath ends with / for path joining
        const baseDir = basePath.endsWith('/') ? basePath : basePath + '/';

        // Rewrite relative image src attributes
        html = html.replace(/<img([^>]*)\ssrc=["']([^"']+)["']/gi, (match, attrs, src) => {
            // Skip absolute paths, URLs, and data URIs
            if (src.startsWith('/') || src.startsWith('http://') ||
                src.startsWith('https://') || src.startsWith('data:')) {
                return match;
            }
            // Prepend base directory to relative path
            const resolvedSrc = baseDir + src;
            return `<img${attrs} src="${resolvedSrc}"`;
        });
    }

    return html;
}

// Render preview for note cards (truncated, with clickable links)
function renderNotePreview(text, format = 'markdown', maxLength = 1200, basePath = null) {
    if (!text) return '';

    // For raw text or yaml format, just escape and truncate
    if (format === 'text' || format === 'yaml') {
        let truncated = text;
        if (text.length > maxLength) {
            truncated = text.substring(0, maxLength);
            const lastNewline = truncated.lastIndexOf('\n');
            if (lastNewline > maxLength * 0.5) {
                truncated = truncated.substring(0, lastNewline);
            }
            truncated += '...';
        }
        return `<pre style="margin: 0; white-space: pre-wrap; font-size: 0.75rem; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;">${escapeHtml(truncated)}</pre>`;
    }

    // Collapse multiple newlines for cleaner preview
    let cleaned = text.replace(/\n{3,}/g, '\n\n').trim();

    // Truncate text for performance
    let truncated = cleaned;
    if (cleaned.length > maxLength) {
        truncated = cleaned.substring(0, maxLength);
        // Try to break at a word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.7) {
            truncated = truncated.substring(0, lastSpace);
        }
        truncated += '...';
    }

    return renderMarkdownWithLinks(truncated, basePath);
}

function resolveLink(linkText) {
    // Check if it's an ID link: [[id:abc123]]
    if (linkText.startsWith('id:')) {
        const id = linkText.substring(3);
        for (const section of data.sections) {
            const item = section.items.find(i => i.id === id);
            if (item) {
                return { ...item, sectionId: section.id };
            }
        }
        return null;
    }

    // Check for section-scoped link: [[Section > Card title]]
    const scopedMatch = linkText.match(/^(.+?)\s*>\s*(.+)$/);
    if (scopedMatch) {
        const sectionName = scopedMatch[1].trim().toLowerCase();
        const cardTitle = scopedMatch[2].trim().toLowerCase();
        const section = data.sections.find(s => s.name && s.name.toLowerCase() === sectionName);
        if (section) {
            const item = section.items.find(i => i.title && i.title.toLowerCase() === cardTitle);
            if (item) {
                return { ...item, sectionId: section.id };
            }
        }
        return null;
    }

    // Otherwise search by title across all sections (case-insensitive)
    const searchTitle = linkText.toLowerCase();
    for (const section of data.sections) {
        const item = section.items.find(i => i.title && i.title.toLowerCase() === searchTitle);
        if (item) {
            return { ...item, sectionId: section.id };
        }
    }
    return null;
}

function findBacklinks(itemId) {
    const backlinks = [];

    // Get the target item's title and section
    let targetTitle = null;
    let targetSectionName = null;
    for (const section of data.sections) {
        const item = section.items.find(i => i.id === itemId);
        if (item && item.title) {
            targetTitle = item.title.toLowerCase();
            targetSectionName = formatDirName(section._dirName).toLowerCase();
            break;
        }
    }

    for (const section of data.sections) {
        for (const item of section.items) {
            if (item.id === itemId) continue;

            const content = item.type === 'note' ? item.content : item.description;
            if (!content) continue;

            // Check for ID link
            if (content.includes(`[[id:${itemId}]]`)) {
                backlinks.push({ ...item, sectionId: section.id });
                continue;
            }

            // Check for title link (plain or section-scoped)
            if (targetTitle) {
                const matches = content.matchAll(/\[\[([^\]]+)\]\]/g);
                for (const match of matches) {
                    const linkText = match[1];
                    // Check for section-scoped link: [[Section > Card title]]
                    const scopedMatch = linkText.match(/^(.+?)\s*>\s*(.+)$/);
                    if (scopedMatch) {
                        const sectionName = scopedMatch[1].trim().toLowerCase();
                        const cardTitle = scopedMatch[2].trim().toLowerCase();
                        if (cardTitle === targetTitle && targetSectionName && sectionName === targetSectionName) {
                            backlinks.push({ ...item, sectionId: section.id });
                            break;
                        }
                    } else if (linkText.toLowerCase() === targetTitle) {
                        // Plain title link
                        backlinks.push({ ...item, sectionId: section.id });
                        break;
                    }
                }
            }
        }
    }

    return backlinks;
}

function navigateToItem(sectionId, itemId) {
    // Close current viewer and open target
    closeViewer();
    openViewer(sectionId, itemId);
}

// ========== SECTION: THUMBNAIL_GENERATION ==========
// Auto-thumbnail via microlink API and PDF.js: resizeAndCompressThumbnail, urlToDataUrl, generateThumbnail, generatePdfThumbnail, extractDomain

// Helper function to resize and compress a canvas or image to reduce storage size
// Target: 1000px width for high quality display, JPEG 90% quality
async function resizeAndCompressThumbnail(source, maxWidth = 1000, quality = 0.90) {
    try {
        // Create an image element from the source
        let img;
        if (source instanceof HTMLCanvasElement) {
            // If source is a canvas, convert to image
            img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = source.toDataURL('image/jpeg', 0.95);
            });
        } else if (typeof source === 'string') {
            // If source is a data URL string
            img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = source;
            });
        } else if (source instanceof Blob) {
            // If source is a blob
            img = new Image();
            const url = URL.createObjectURL(source);
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject();
                };
                img.src = url;
            });
        } else {
            throw new Error('Unsupported source type');
        }

        // Calculate new dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }

        // Create a new canvas with target dimensions
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Draw image to canvas (browser does high-quality downsampling)
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to data URL with compression
        return canvas.toDataURL('image/jpeg', quality);
    } catch (error) {
        console.log('Failed to resize thumbnail:', error);
        return null;
    }
}

// Helper function to convert remote image URL to data URL for offline storage
async function urlToDataUrl(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Failed to fetch image');

        const blob = await response.blob();

        // Resize and compress the image before storing
        return await resizeAndCompressThumbnail(blob);
    } catch (error) {
        console.log('Failed to convert URL to data URL:', error);
        return null;
    }
}

// Generate thumbnail using a service or PDF.js for PDFs
async function generateThumbnail(url) {
    try {
        // Check if it's a PDF
        const isPdf = url.toLowerCase().endsWith('.pdf') ||
                      url.toLowerCase().includes('/pdf/') ||
                      url.toLowerCase().includes('arxiv.org/pdf');

        if (isPdf) {
            return await generatePdfThumbnail(url);
        }

        // For regular pages, use microlink
        const encodedUrl = encodeURIComponent(url);
        const apiUrl = `https://api.microlink.io/?url=${encodedUrl}&screenshot=true&meta=false`;
        const response = await fetch(apiUrl);
        const json = await response.json();

        // Extract screenshot URL from the response
        if (json.status === 'success' && json.data?.screenshot?.url) {
            // Convert remote URL to data URL for offline access
            return await urlToDataUrl(json.data.screenshot.url);
        }

        return null;
    } catch {
        return null;
    }
}

// Generate thumbnail from PDF first page using PDF.js
async function generatePdfThumbnail(url) {
    try {
        // Set worker source
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        // Load the PDF
        const loadingTask = pdfjsLib.getDocument({
            url: url,
        });
        
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        // Set scale for good quality
        const scale = 2;
        const viewport = page.getViewport({ scale });
        
        // Create canvas for full page render
        const fullCanvas = document.createElement('canvas');
        const fullContext = fullCanvas.getContext('2d');
        fullCanvas.width = viewport.width;
        fullCanvas.height = viewport.height;
        
        // Render page to canvas
        await page.render({
            canvasContext: fullContext,
            viewport: viewport
        }).promise;
        
        // Create a cropped canvas with just the top 45% of the page
        const cropRatio = 0.45;
        const croppedCanvas = document.createElement('canvas');
        const croppedContext = croppedCanvas.getContext('2d');
        croppedCanvas.width = viewport.width;
        croppedCanvas.height = viewport.height * cropRatio;
        
        // Copy top portion from full canvas to cropped canvas
        croppedContext.drawImage(
            fullCanvas,
            0, 0, viewport.width, viewport.height * cropRatio,
            0, 0, viewport.width, viewport.height * cropRatio
        );

        // Resize and compress before returning
        return await resizeAndCompressThumbnail(croppedCanvas);
    } catch (error) {
        console.log('PDF thumbnail failed, using fallback:', error.message);
        // Fallback to microlink for PDFs that can't be loaded directly (CORS issues)
        const encodedUrl = encodeURIComponent(url);
        const apiUrl = `https://api.microlink.io/?url=${encodedUrl}&screenshot=true&meta=false`;
        const response = await fetch(apiUrl);
        const json = await response.json();
        // Convert remote URL to data URL for offline access
        return json.status === 'success' && json.data?.screenshot?.url
            ? await urlToDataUrl(json.data.screenshot.url)
            : null;
    }
}

function extractDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return url;
    }
}

// ========== SECTION: DATA_OPERATIONS ==========
// Section/item actions: toggleSection, toggleCodeOutput, confirmDeleteItem, deleteSection, deleteItem, updateSectionName

// Toggle section collapsed state (does not affect subdirectory expansion)
// Uses debounce to prevent firing on double-click
function toggleSection(sectionId) {
    // Clear any existing timer
    if (sectionToggleTimer) {
        clearTimeout(sectionToggleTimer);
    }
    // Delay execution to allow double-click to cancel (300ms is standard dblclick threshold)
    sectionToggleTimer = setTimeout(() => {
        sectionToggleTimer = null;
        if (collapsedSections.has(sectionId)) {
            collapsedSections.delete(sectionId);
        } else {
            collapsedSections.add(sectionId);
        }
        saveCollapsedSections();
        render();
    }, 300);
}

// Toggle all subdirectories within a section (expand all / collapse all)
// Called on double-click - cancels pending single-click toggle
function toggleAllSubdirsInSection(sectionId) {
    // Cancel pending single-click toggle
    if (sectionToggleTimer) {
        clearTimeout(sectionToggleTimer);
        sectionToggleTimer = null;
    }

    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Build set of all subdirs in this section
    const sectionSubdirs = new Set();
    for (const item of section.items) {
        const subdir = getSubdirFromPath(item._path);
        if (subdir) {
            const parts = subdir.split('/');
            for (let i = 1; i <= parts.length; i++) {
                const path = parts.slice(0, i).join('/');
                sectionSubdirs.add(`${sectionId}/${path}`);
            }
        }
    }

    // No subdirs - just toggle the section
    if (sectionSubdirs.size === 0) {
        if (collapsedSections.has(sectionId)) {
            collapsedSections.delete(sectionId);
        } else {
            collapsedSections.add(sectionId);
        }
        saveCollapsedSections();
        render();
        return;
    }

    // Toggle based on section state (not subdir state)
    const isCollapsed = collapsedSections.has(sectionId);

    if (isCollapsed) {
        // Expand section + all subdirs
        for (const key of sectionSubdirs) {
            expandedSubdirs.add(key);
        }
        collapsedSections.delete(sectionId);
        saveCollapsedSections();
        showToast('Expanded all subdirectories');
    } else {
        // Collapse all subdirs + section
        for (const key of sectionSubdirs) {
            expandedSubdirs.delete(key);
        }
        collapsedSections.add(sectionId);
        saveCollapsedSections();
        showToast('Collapsed section');
    }
    saveExpandedSubdirs();
    render();
}

async function toggleCodeOutput(sectionId, codeId) {
    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return;
    const codeNote = section.items.find(item => item.id === codeId && item.type === 'code');
    if (!codeNote) return;

    codeNote.showOutput = !codeNote.showOutput;
    await saveData();
    await saveCardFile(sectionId, codeNote);  // Save code file with updated showOutput
    render();
}

// Confirm before deleting item
async function confirmDeleteItem(sectionId, itemId, itemType) {
    // Check if we're in remote/read-only mode
    if (isRemoteMode()) {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
    }

    if (confirm(`Delete this ${itemType}?`)) {
        deleteItem(sectionId, itemId);
    }
}

// Delete section
async function deleteSection(sectionId) {
    // Check if we're in remote/read-only mode
    if (isRemoteMode()) {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
    }

    if (!confirm('Delete this section?')) return;
    const section = data.sections.find(s => s.id === sectionId);
    const sectionName = section?.name;
    data.sections = data.sections.filter(s => s.id !== sectionId);
    await saveData();
    await saveNotebookMeta();  // Update settings.yaml
    if (sectionName) await deleteSectionDir(sectionName);  // Delete section directory
    render();
    showToast('Section deleted');
}

// Delete item
async function deleteItem(sectionId, itemId) {
    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return;
    const item = section.items.find(i => i.id === itemId);
    section.items = section.items.filter(i => i.id !== itemId);
    await saveData();
    if (item) await deleteItemFile(sectionId, item);  // Delete specific file
    render();
    showToast('Item deleted');
}

// Update section name (renames folder on disk)
async function updateSectionName(sectionId, newDisplayName) {
    // Check if we're in remote/read-only mode
    if (isRemoteMode()) {
        const shouldSave = await promptSaveToFolder();
        if (!shouldSave) return;
    }

    const section = data.sections.find(s => s.id === sectionId);
    if (!section || !newDisplayName.trim()) return;

    const oldDirName = section._dirName;
    const newDirName = toDirName(newDisplayName.trim());

    // Skip if dir name hasn't actually changed
    if (oldDirName === newDirName) return;

    try {
        await renameSectionDir(oldDirName, newDirName, section);
        await saveData();
        await saveNotebookMeta();
        render();
    } catch (e) {
        console.error('[Section] Rename failed:', e);
        showToast('Failed to rename section: ' + e.message);
        render(); // Re-render to restore original name in UI
    }
}

// ========== SECTION: UTILITY_FUNCTIONS ==========
// Misc utility functions

// Deep merge objects (target values override source, but missing keys filled from source)
// Used for merging user template overrides with built-in defaults
function deepMerge(source, target) {
    if (!target) return source;
    if (!source) return target;
    if (typeof source !== 'object' || typeof target !== 'object') return target;
    if (Array.isArray(source) || Array.isArray(target)) return target;

    const result = { ...source };
    for (const key of Object.keys(target)) {
        if (typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key]) &&
            typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            result[key] = deepMerge(source[key], target[key]);
        } else {
            result[key] = target[key];
        }
    }
    return result;
}

// Generate unique ID
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
}

// Get plain text preview from markdown
function getPlainTextPreview(markdown, maxLength = 200) {
    if (!markdown) return '';
    // Remove markdown syntax
    let text = markdown
        .replace(/\[\[([^\]]+)\]\]/g, '$1') // Internal links
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // External links
        .replace(/[#*_`~]/g, '') // Headers, bold, italic, code
        .replace(/\n+/g, ' ') // Newlines
        .trim();
    if (text.length > maxLength) {
        text = text.substring(0, maxLength) + '...';
    }
    return text;
}

// ========== SECTION: RENDER_FUNCTIONS ==========
// Main render and template buttons: render, renderTemplateButtons, findNote, findCode, escapeHtml
// Note: Generic renderCard() and openViewer() are in TEMPLATE_SYSTEM section

// Generate template-driven "New X" buttons for a section
function renderTemplateButtons(sectionId) {
    // Get hidden_templates from settings (per-notebook configuration)
    const hiddenTemplates = notebookSettings?.hidden_templates || [];
    // Get enabled_templates from settings (if set, only show these types)
    const enabledTemplates = notebookSettings?.enabled_templates;
    const hasEnabledFilter = Array.isArray(enabledTemplates) && enabledTemplates.length > 0;
    // In-use types should also show create buttons
    const currentInUse = getInUseCardTypes();

    // Get templates sorted by sort_order
    const templates = Object.values(templateRegistry)
        .filter(t => t.ui?.show_create_button !== false)
        .filter(t => !hiddenTemplates.includes(t.name))
        .filter(t => !hasEnabledFilter || enabledTemplates.includes(t.name) || currentInUse.has(t.name))
        .sort((a, b) => (a.ui?.sort_order || 99) - (b.ui?.sort_order || 99));

    // Button styles by template type
    const buttonStyles = {
        note: 'btn-note',
        code: 'btn-code',
        bookmark: 'btn-secondary'
    };

    return templates.map(t => {
        // Use generic editor (Phase 3)
        const opener = `openEditor('${t.name}', '${sectionId}')`;
        const style = buttonStyles[t.name] || 'btn-secondary';
        const label = t.ui?.button_label || t.name;
        const icon = t.ui?.icon || '';
        return `<button class="btn ${style} btn-small" onclick="${opener}">
            ${icon ? icon + ' ' : '+ '}${label}
        </button>`;
    }).join('');
}

// Helper: build a tree structure from flat items with _path field
// Returns { items: [...], subdirs: { name: { items: [...], subdirs: {...} } } }
// getSubdir extracts the subdirectory portion (within section) from an item
function buildSubdirTree(items, getSubdir = item => getSubdirFromPath(item._path), emptySubdirs = []) {
    const tree = { items: [], subdirs: {} };

    // First, ensure all known subdirectory paths exist in the tree (even if empty)
    // emptySubdirs contains paths relative to section root (e.g., 'test' or 'module-1/lesson-1')
    for (const subdirPath of emptySubdirs) {
        if (!subdirPath) continue;
        const parts = subdirPath.split('/');
        let current = tree;
        for (const part of parts) {
            if (!current.subdirs[part]) {
                current.subdirs[part] = { items: [], subdirs: {} };
            }
            current = current.subdirs[part];
        }
    }

    // Then add items to the tree
    items.forEach(item => {
        const subdirPath = getSubdir(item);
        if (!subdirPath) {
            // Root item
            tree.items.push(item);
        } else {
            // Navigate/create tree path
            const parts = subdirPath.split('/');
            let current = tree;
            for (const part of parts) {
                if (!current.subdirs[part]) {
                    current.subdirs[part] = { items: [], subdirs: {} };
                }
                current = current.subdirs[part];
            }
            current.items.push(item);
        }
    });

    return tree;
}

// Helper: count total items in a subtree (for showing count when collapsed)
function countSubtreeItems(node) {
    let count = node.items.length;
    for (const subdir of Object.values(node.subdirs)) {
        count += countSubtreeItems(subdir);
    }
    return count;
}

// Helper: render a subdirectory node with its items and nested subdirs
function renderSubdirNode(sectionId, subdirName, node, parentPath, depth, sectionDirName) {
    const subdirPath = parentPath ? `${parentPath}/${subdirName}` : subdirName;
    const isExpanded = isSubdirExpanded(sectionId, subdirPath);
    const itemCount = countSubtreeItems(node);
    // Full path from notebook root for focus (section/subdir/path)
    const fullPath = sectionDirName ? `${sectionDirName}/${subdirPath}` : subdirPath;

    // Subdirectory header with toggle
    const displayName = formatDirName(subdirName);
    const isEmpty = itemCount === 0 && Object.keys(node.subdirs).length === 0;
    let html = `
        <div class="subdir-node ${isEmpty ? 'subdir-empty' : ''}" data-depth="${depth}" style="--subdir-depth: ${depth}">
            ${isEmpty ? `<button class="subdir-delete" onclick="event.stopPropagation(); deleteSubfolder('${escapeJsAttr(fullPath)}')" title="Delete empty folder">×</button>` : ''}
            <div class="subdir-header">
                <div class="subdir-header-left" onclick="toggleSubdir('${escapeJsAttr(sectionId)}', '${escapeJsAttr(subdirPath)}')" ondblclick="toggleAllNestedSubdirs('${escapeJsAttr(sectionId)}', '${escapeJsAttr(subdirPath)}')" title="Double-click to expand/collapse all nested">
                    <button class="subdir-toggle ${isExpanded ? '' : 'collapsed'}" title="${isExpanded ? 'Collapse' : 'Expand'}">▼</button>
                    <span class="subdir-name">${escapeHtml(displayName)}</span>
                    ${!isExpanded ? `<span class="subdir-count">(${itemCount})</span>` : ''}
                </div>
                <button class="btn-focus btn-focus-subdir" onclick="event.stopPropagation(); setFocus('${escapeJsAttr(fullPath)}')" title="Focus on ${escapeHtml(displayName)}">⊙</button>
            </div>
            <div class="subdir-content ${isExpanded ? '' : 'collapsed'}">
    `;

    if (isExpanded) {
        // Render items at this level
        if (node.items.length > 0) {
            html += `<div class="subdir-items">`;
            html += node.items.map(item => renderCard(sectionId, item)).join('');
            html += `</div>`;
        }

        // Render nested subdirs (sorted alphabetically)
        const nestedSubdirs = Object.keys(node.subdirs).sort();
        for (const nestedName of nestedSubdirs) {
            html += renderSubdirNode(sectionId, nestedName, node.subdirs[nestedName], subdirPath, depth + 1, sectionDirName);
        }
    }

    html += `
            </div>
        </div>
    `;

    return html;
}

// Helper: render items grouped by subdirectory with collapsible nested subdirs
// getSubdir is a function that extracts subdirectory (within section) from an item
// sectionDirName is the directory name for building focus paths (null for system section)
// emptySubdirs is an array of subdirectory paths that exist but have no items
function renderItemsWithSubsections(items, sectionId, getSubdir = item => getSubdirFromPath(item._path), sectionDirName = null, emptySubdirs = []) {
    // Build tree structure from flat items (including empty subdirs)
    const tree = buildSubdirTree(items, getSubdir, emptySubdirs);

    // Check if tree has any content (items or subdirs)
    const hasContent = items.length > 0 || Object.keys(tree.subdirs).length > 0;
    if (!hasContent) {
        return '<p style="color: var(--text-muted); grid-column: 1/-1;">No items yet. Add a bookmark, note, or code!</p>';
    }

    let html = '';

    // Render root items first (no subdirectory)
    if (tree.items.length > 0) {
        html += tree.items.map(item => renderCard(sectionId, item)).join('');
    }

    // Render subdirectories as collapsible nodes
    // Sort alphabetically, but put 'root' first (for System section)
    const subdirNames = Object.keys(tree.subdirs).sort((a, b) => {
        if (a === 'root') return -1;
        if (b === 'root') return 1;
        return a.localeCompare(b);
    });

    for (const subdirName of subdirNames) {
        html += renderSubdirNode(sectionId, subdirName, tree.subdirs[subdirName], null, 0, sectionDirName);
    }

    return html;
}

// Render focus breadcrumb bar
function renderFocusBreadcrumb() {
    if (!focusedPath) return '';

    const parts = focusedPath.split('/');
    const breadcrumbParts = parts.map((part, i) => {
        const path = parts.slice(0, i + 1).join('/');
        const displayName = formatDirName(part);
        const isLast = i === parts.length - 1;
        if (isLast) {
            return `<span class="breadcrumb-current">${escapeHtml(displayName)}</span>`;
        }
        return `<a href="#" class="breadcrumb-link" onclick="setFocus('${escapeJsAttr(path)}'); return false;">${escapeHtml(displayName)}</a>`;
    });

    return `
        <div class="focus-breadcrumb">
            <span class="breadcrumb-path">${breadcrumbParts.join('<span class="breadcrumb-sep">/</span>')}</span>
            <button class="breadcrumb-clear" onclick="clearFocus()" title="Clear focus">×</button>
        </div>
    `;
}

// Render the UI
function render() {
    // Update header and page title with current title and subtitle
    const title = data.title || 'Research Notebook';
    document.getElementById('headerTitle').textContent = title;
    document.getElementById('headerSubtitle').textContent = data.subtitle || 'Bookmarks, notes, and connections';
    document.title = title;

    // Apply compact cards mode if enabled
    document.body.classList.toggle('compact-cards', notebookSettings?.compact_cards === true);

    const content = document.getElementById('content');

    // Filter sections by visibility and focus
    const visibleSections = data.sections
        .filter(s => s.visible !== false)
        .filter(s => sectionMatchesFocus(s));

    // Start with breadcrumb if focused
    let sectionsHtml = renderFocusBreadcrumb();

    if (visibleSections.length === 0) {
        if (focusedPath) {
            // Focus path doesn't match any section
            content.innerHTML = sectionsHtml + `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h2>Focus path not found</h2>
                    <p>The path "${escapeHtml(focusedPath)}" doesn't exist in this notebook</p>
                    <button class="btn btn-primary" onclick="clearFocus()">Clear Focus</button>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📚</div>
                    <h2>Your research notebook awaits</h2>
                    <p>Create a section to start organizing your bookmarks and notes</p>
                </div>
            `;
        }
        return;
    }

    sectionsHtml += visibleSections.map(section => {
        const isCollapsed = collapsedSections.has(section.id);
        // Filter items by focus
        const focusedItems = section.items.filter(item => itemMatchesFocus(item));
        const itemCount = focusedItems.length;
        const displayName = getSectionDisplayName(section);
        // When focused on a subdir, don't show section name input (it would be confusing)
        const isFocusedOnSubdir = focusedPath && focusedPath.includes('/');
        // Adjust getSubdir to be relative to focus path (so focused subdir appears as root)
        const focusSubdir = isFocusedOnSubdir ? getSubdirFromPath(focusedPath) : null;
        const getSubdir = focusSubdir
            ? item => {
                const subdir = getSubdirFromPath(item._path);
                if (!subdir) return null;
                if (subdir === focusSubdir) return null;  // At focus root
                if (subdir.startsWith(focusSubdir + '/')) {
                    return subdir.slice(focusSubdir.length + 1);  // Strip focus prefix
                }
                return subdir;
            }
            : item => getSubdirFromPath(item._path);

        // Filter and adjust empty subdirs for focus mode (same logic as items)
        const focusedSubdirs = focusSubdir
            ? (section._subdirPaths || [])
                .filter(p => p === focusSubdir || p.startsWith(focusSubdir + '/'))
                .map(p => p === focusSubdir ? null : p.slice(focusSubdir.length + 1))
                .filter(p => p)
            : (section._subdirPaths || []);

        return `
        <div class="section" data-section-id="${section.id}">
            ${itemCount === 0 && !focusedPath ? `<button class="section-delete" onclick="deleteSection('${section.id}')" title="Delete empty section">×</button>` : ''}
            <div class="section-header">
                <button class="section-toggle ${isCollapsed ? 'collapsed' : ''}" onclick="toggleSection('${section.id}')" ondblclick="toggleAllSubdirsInSection('${section.id}')" title="${isCollapsed ? 'Expand' : 'Collapse'} (double-click: expand/collapse all subdirs)">▼</button>
                <h2 class="section-title">
                    ${isFocusedOnSubdir ? `<span>${escapeHtml(displayName)}</span>` : `
                    <input type="text" value="${escapeHtml(displayName)}"
                        onchange="updateSectionName('${section.id}', this.value)"
                        onblur="updateSectionName('${section.id}', this.value)">`}
                    ${isCollapsed && itemCount > 0 ? `<span class="section-count">(${itemCount})</span>` : ''}
                </h2>
                <div class="section-actions">
                    ${!focusedPath ? `<button class="btn-focus" onclick="setFocus('${escapeJsAttr(section._dirName)}')" title="Focus on this section">⊙</button>` : ''}
                    ${renderTemplateButtons(section.id)}
                    <button class="btn btn-secondary btn-small btn-new-folder" onclick="createSubfolder('${section.id}')" title="New folder">📁+</button>
                </div>
            </div>
            <div class="items-grid ${isCollapsed ? 'collapsed' : ''}">
                ${renderItemsWithSubsections(focusedItems, section.id, getSubdir, focusSubdir ? `${section._dirName}/${focusSubdir}` : section._dirName, focusedSubdirs)}
            </div>
        </div>
    `}).join('');

    content.innerHTML = sectionsHtml;

    // Apply syntax highlighting only to unhighlighted code blocks
    document.querySelectorAll('pre code:not([data-highlighted])').forEach(block => {
        hljs.highlightElement(block);
    });

    // Add remote mode banner if viewing remote notebook
    renderRemoteBanner();
}

// Render banner when viewing remote notebook
function renderRemoteBanner() {
    let banner = document.getElementById('remote-banner');

    if (isRemoteMode() && remoteSource) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'remote-banner';
            banner.className = 'remote-banner';
            // Insert after header, before content
            const header = document.querySelector('header');
            if (header) {
                header.after(banner);
            } else {
                document.body.prepend(banner);
            }
        }

        const sourceLabel = remoteSource.type === 'github'
            ? `GitHub: ${remoteSource.path}`
            : remoteSource.url;

        banner.innerHTML = `
            <span class="remote-icon">📡</span>
            <span class="remote-label">Viewing: ${escapeHtml(sourceLabel)}</span>
            <button class="btn btn-small btn-primary" onclick="saveRemoteToFolder()">Save to Folder...</button>
            <span class="remote-hint">Read-only mode</span>
        `;
    } else if (banner) {
        banner.remove();
    }
}

function findNote(sectionId, noteId) {
    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return null;
    return section.items.find(n => n.id === noteId);
}

function findCode(sectionId, codeId) {
    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return null;
    return section.items.find(c => c.id === codeId);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape a string for use in JavaScript within an HTML attribute
// e.g., onclick="func('${escapeJsAttr(value)}')"
function escapeJsAttr(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ========== SECTION: EVENT_HANDLERS_AND_INIT ==========
// Keyboard shortcuts, modal close handlers, internal link delegation, initialization

// Handle Enter key in modals
document.getElementById('sectionName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createSection();
});

// Generic editor keyboard handling (Phase 3)
document.getElementById('editorModal').addEventListener('keydown', (e) => {
    // Tab in code editors
    if (e.key === 'Tab' && e.target.classList.contains('code-editor')) {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.substring(0, start) + '    ' + e.target.value.substring(end);
        e.target.selectionStart = e.target.selectionEnd = start + 4;
    }
    // Ctrl/Cmd+Enter to save
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveEditor();
    }
    // Ctrl/Cmd+S to save
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveEditor();
    }
});

// Close modals on overlay click - but prevent accidental close during text selection
// Track where mousedown occurred to ensure intentional clicks only
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    let mousedownTarget = null;

    overlay.addEventListener('mousedown', (e) => {
        mousedownTarget = e.target;
    });

    overlay.addEventListener('click', (e) => {
        // Only close if BOTH mousedown and mouseup (click) happened on the overlay itself
        // This prevents accidental closes when selecting text and dragging outside the modal
        if (e.target === overlay && mousedownTarget === overlay) {
            // Call proper close function based on modal type for cleanup
            if (overlay.id === 'editorModal') {
                closeEditor();
            } else if (overlay.id === 'viewerModal') {
                closeViewer();
            } else if (overlay.id === 'sectionModal') {
                closeSectionModal();
            } else if (overlay.id === 'diffModal') {
                closeDiffModal();
            } else if (overlay.id === 'onboardingModal') {
                closeOnboarding();
            } else {
                overlay.classList.remove('active');
            }
        }
        mousedownTarget = null;
    });
});

// Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Escape closes modals
    if (e.key === 'Escape') {
        closeSectionModal();
        closeEditor();
        closeViewer();
    }

    // Skip shortcuts if typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }

    // Cmd/Ctrl + Shift + E = Toggle expand all subdirectories
    if (e.key.toLowerCase() === 'e' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        expandAllSubdirs();
    }
});

// Event delegation for internal links (only in viewer modals, not in card previews)
document.addEventListener('click', (e) => {
    const link = e.target.closest('.internal-link[data-link-section][data-link-item]');
    if (link) {
        // Only handle clicks if the link is inside a viewer modal
        const isInViewer = link.closest('#viewerModal');
        if (isInViewer) {
            e.preventDefault();
            e.stopPropagation();
            const sectionId = link.dataset.linkSection;
            const itemId = link.dataset.linkItem;
            navigateToItem(sectionId, itemId);
        }
    }
});

// Show error when opened via file:// protocol (requires server)
function showFileProtocolError() {
    document.body.innerHTML = `
        <div style="max-width: 600px; margin: 100px auto; padding: 40px; font-family: system-ui, sans-serif; text-align: center;">
            <h1 style="color: #c9302c; margin-bottom: 20px;">Server Required</h1>
            <p style="color: #555; line-height: 1.6; margin-bottom: 30px;">
                This app needs to be served via HTTP, not opened directly as a file.
                The <code>file://</code> protocol doesn't support the features this app needs.
            </p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: left;">
                <p style="margin: 0 0 15px 0; font-weight: 600;">To run the notebook:</p>
                <pre style="background: #282c34; color: #abb2bf; padding: 15px; border-radius: 4px; overflow-x: auto; margin: 0;"><code>cd ${window.location.pathname.split('/').slice(0, -1).join('/') || '/path/to/research-notebook'}
npm link
notebook</code></pre>
            </div>
            <p style="color: #888; font-size: 14px; margin-top: 20px;">
                This will start a local server and open the app in your browser.
            </p>
        </div>
    `;
}

// ========== FRAMEWORK API REGISTRATION ==========
// Expose functions for card type modules to import via js/framework.js
// Card type modules use: import { findCardById, saveCard } from '/js/framework.js';
// The framework module proxies to window.notebook for these operations.
window.notebook = {
    // Data access
    get data() { return data; },
    get notebookSettings() { return notebookSettings; },
    get notebookRoster() { return notebookRoster; },
    get currentViewingCard() { return currentViewingCard; },
    templateRegistry: null,  // Set after loadTemplates()

    // Card operations
    findCardById,
    findSectionByItem,
    saveCardFile,
    saveData,

    // Filesystem helpers
    getSubdirFromPath,

    // UI operations
    render,
    showToast,
    openViewer,
    closeViewer,
    refreshOpenViewer,

    // Markdown rendering
    renderMarkdownWithLinks,

    // Card type modules (set after loadCardTypeModules)
    get cardTypeModules() { return cardTypeModules; },
    getCardTypeModule,

    // Card type renderers (custom render functions from modules)
    get cardTypeRenderers() { return cardTypeRenderers; },
    getCardTypeRenderer,
};

// Default initialization flow (no URL params)
async function initDefaultFlow() {
    // First, migrate any legacy handle to named registry
    const migrated = await migrateLegacyHandle();

    // Try to restore last used notebook from named handles
    const handles = await listNamedHandles();

    if (handles.length > 0) {
        // Try the migrated handle first, or first in list
        const name = migrated?.name || handles[0];
        const handle = await getNamedHandle(name);

        if (handle) {
            const hasPermission = await verifyDirPermission(handle);
            if (hasPermission) {
                notebookDirHandle = handle;
                storageBackend = new FileSystemBackend(handle);
                filesystemLinked = true;
                viewMode = 'filesystem';

                // Update URL to include notebook name
                history.replaceState(null, '', `?notebook=${encodeURIComponent(name)}`);

                // Load data from filesystem
                try {
                    data = await loadFromFilesystem();
                    await startWatchingFilesystem(handle);

                    // Restore UI state
                    restoreCollapsedSections();
                    restoreExpandedSubdirs();
                    restoreFocus();
                    render();
                    return;
                } catch (error) {
                    console.error('[Filesystem] Error loading from saved folder:', error);
                    showToast('⚠️ Error loading from linked folder');
                }
            }
        }
    }

    // Fall back to legacy initFilesystem for backwards compatibility
    await initFilesystem();

    if (filesystemLinked) {
        restoreCollapsedSections();
        restoreExpandedSubdirs();
        restoreFocus();
        render();
    } else {
        // No restorable notebook - show onboarding
        showOnboarding();
    }
}

// Initialize
async function init() {
    // Check for file:// protocol - app requires server
    if (window.location.protocol === 'file:') {
        showFileProtocolError();
        return;
    }

    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const githubPath = params.get('github');
    const remoteUrl = params.get('url');
    const notebookName = params.get('notebook');

    // Fetch default assets from server (templates, theme content, theme registry)
    // These are needed before rendering for modified indicators and theme picker
    await Promise.all([
        fetchDefaultThemeContent(),
        fetchThemeRegistry()
    ]);
    // Note: fetchDefaultTemplates() is called by loadTemplates() during filesystem load

    try {
        if (githubPath) {
            // Load from GitHub via jsDelivr
            console.log(`[Init] Loading GitHub notebook: ${githubPath}`);
            showLoadingIndicator('Loading from GitHub...');

            // Load all templates (system templates from defaults/ + card types from card-types/)
            templateRegistry = await fetchDefaultTemplates();
            await loadExtensionRegistry();

            data = await loadNotebookFromGitHub(githubPath);
            viewMode = 'remote';
            remoteSource = { type: 'github', path: githubPath };

            // Apply settings and theme from remote notebook
            await applyRemoteNotebookSettings(data);

            hideLoadingIndicator();
            render();

        } else if (remoteUrl) {
            // Load from URL with manifest
            console.log(`[Init] Loading remote notebook: ${remoteUrl}`);
            showLoadingIndicator('Loading notebook...');

            // Load all templates (system templates from defaults/ + card types from card-types/)
            templateRegistry = await fetchDefaultTemplates();
            await loadExtensionRegistry();

            data = await loadNotebookFromUrl(remoteUrl);
            viewMode = 'remote';
            remoteSource = { type: 'url', url: remoteUrl };

            // Apply settings and theme from remote notebook
            await applyRemoteNotebookSettings(data);

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
            storageBackend = new FileSystemBackend(handle);
            filesystemLinked = true;
            viewMode = 'filesystem';

            data = await loadFromFilesystem();
            await startWatchingFilesystem(handle);

            restoreCollapsedSections();
            restoreExpandedSubdirs();
            restoreFocus();
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

    // Check if git features are available (non-blocking)
    checkGitAvailability();

    // Remove loading state to reveal content (prevents FOUC)
    document.body.classList.remove('loading');
}
init();
