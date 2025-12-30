// ========== SECTION: STATE_AND_CONFIG ==========
// Global data structure, state variables, editing trackers, Pyodide state, marked config

// Data structure
let data = {
    title: 'Research Notebook',
    subtitle: 'Bookmarks, notes, and connections',
    sections: [],
    systemNotes: [],  // Markdown files at notebook root (README.md, CLAUDE.md, etc.)
    // Notes are stored in sections alongside bookmarks
    // Each item has a 'type' field: 'bookmark', 'note', or 'code'
};

// Track collapsed sections (persisted to localStorage per-notebook)
let collapsedSections = new Set();

// Get localStorage key for collapsed sections (notebook-specific)
function getCollapsedSectionsKey() {
    const notebookName = notebookDirHandle?.name || 'default';
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

// Pyodide state
let pyodide = null;
let pyodideLoading = false;
let pyodideReady = false;

// Filesystem state
let notebookDirHandle = null;  // FileSystemDirectoryHandle for linked folder
let filesystemLinked = false;   // Whether filesystem mode is active
const IDB_DIR_HANDLE_KEY = 'notebookDirHandle';  // IndexedDB key for persisting handle

// FileSystemObserver state (Phase 2: Change Detection)
let filesystemObserver = null;  // FileSystemObserver instance for watching changes
let isReloadingFromFilesystem = false;  // Flag to prevent observer triggering during reload

// Quiz state: tracks current answers during quiz-taking
let quizAnswers = {};  // { quizId: { questionIndex: answer, ... } }

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
// Phase 1 (Loading): loadExtensionRegistry, loadTemplates, getDefaultExtensionRegistry,
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

// Get the default extension registry (hardcoded fallback)
function getDefaultExtensionRegistry() {
    return {
        '.md': {
            parser: 'yaml-frontmatter',
            defaultTemplate: 'note',
            bodyField: 'content'
        },
        '.code.py': {
            parser: 'comment-frontmatter',
            defaultTemplate: 'code',
            bodyField: 'code',
            companionFiles: [
                { suffix: '.output.html', field: 'output' }
            ]
        },
        '.bookmark.json': {
            parser: 'json',
            defaultTemplate: 'bookmark'
        },
        '.quiz.json': {
            parser: 'json',
            defaultTemplate: 'quiz'
        },
        '.response.json': {
            parser: 'json',
            defaultTemplate: 'quiz-response'
        },
        '.card.yaml': {
            parser: 'yaml',
            defaultTemplate: null  // Must specify template: in file
        },
        // Image files - loaded as binary data URLs
        '.png': { parser: 'binary-image', defaultTemplate: 'image' },
        '.jpg': { parser: 'binary-image', defaultTemplate: 'image' },
        '.jpeg': { parser: 'binary-image', defaultTemplate: 'image' },
        '.gif': { parser: 'binary-image', defaultTemplate: 'image' },
        '.webp': { parser: 'binary-image', defaultTemplate: 'image' },
        '.svg': { parser: 'text-image', defaultTemplate: 'image' }
    };
}

// Fetch default templates from /defaults/templates/
// This must be called during app initialization before templates are used
async function fetchDefaultTemplates() {
    if (defaultTemplatesCache) {
        return defaultTemplatesCache;
    }

    console.log('[Templates] Fetching default templates...');
    const templates = {};

    try {
        // Fetch the template index
        const indexResponse = await fetch('/defaults/templates/index.json');
        if (!indexResponse.ok) {
            throw new Error(`Failed to fetch template index: ${indexResponse.status}`);
        }
        const index = await indexResponse.json();

        // Fetch each template YAML file
        for (const templateName of index.templates) {
            try {
                const response = await fetch(`/defaults/templates/${templateName}.yaml`);
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

// Fetch default theme.css content from /defaults/theme.css
async function fetchDefaultThemeContent() {
    if (defaultThemeContentCache !== null) {
        return defaultThemeContentCache;
    }

    try {
        const response = await fetch('/defaults/theme.css');
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
        const response = await fetch('/themes/index.json');
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
        const response = await fetch(`/themes/${themeId}.css`);
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
        { name: 'Assets', path: 'assets', visible: false },
        { name: 'System', path: '.', visible: false }
    ] },
    default_author: { default: null },
    authors: { default: [{ name: 'Claude', icon: 'claude.svg' }] },
    extensions: { default: () => getDefaultExtensionRegistry() },
    theme: { default: null },
    quiz_self_review: { default: true }  // Allow students to self-mark pending questions
};

// Build settings object from parsed data, filling in defaults
function buildSettingsObject(parsed = {}) {
    const settings = {};
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
        }
    }
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

// Load settings from .notebook/settings.yaml
async function loadSettings(dirHandle) {
    if (!dirHandle) {
        notebookSettings = buildSettingsObject();
        return notebookSettings;
    }

    // Load from .notebook/settings.yaml
    const configDir = await getNotebookConfigDir(dirHandle, false);
    if (configDir) {
        try {
            const settingsFile = await configDir.getFileHandle('settings.yaml');
            const file = await settingsFile.getFile();
            const content = await file.text();
            const parsed = jsyaml.load(content);
            notebookSettings = buildSettingsObject(parsed);
            console.log('[Settings] Loaded .notebook/settings.yaml');
            return notebookSettings;
        } catch (e) {
            // .notebook/settings.yaml doesn't exist, use defaults
            console.log('[Settings] No .notebook/settings.yaml found, using defaults');
        }
    }

    // No settings found - use defaults (new notebook)
    notebookSettings = buildSettingsObject();
    return notebookSettings;
}

// Check if a section path includes root directory ('.')
// This identifies the System section
// Path can be '.' or an array like ['.', '.notebook', '.notebook/templates']
function sectionPathIncludesRoot(path) {
    if (!path) return false;
    if (Array.isArray(path)) return path.includes('.');
    return path === '.';
}

// Normalize sections format: convert string array to records format
// Old format: ['research', 'projects']
// New format: [{name: 'research', visible: true}, {name: 'projects', visible: true}]
function normalizeSectionsFormat(sections) {
    if (!Array.isArray(sections)) return [];
    const normalized = sections.map(s => {
        if (typeof s === 'string') {
            return { name: s, visible: true };
        }
        // Already an object, preserve path and ensure visible has a default
        const record = { name: s.name || '', visible: s.visible !== false };
        if (s.path) record.path = s.path;
        // Normalize System section path to canonical array
        // This upgrades old `path: '.'` to the full array
        if (sectionPathIncludesRoot(record.path)) {
            record.path = ['.', '.notebook', '.notebook/templates'];
        }
        return record;
    });
    // Ensure System section always exists (hidden by default)
    // Path array documents what it covers (actual loading is hardcoded)
    if (!normalized.some(s => sectionPathIncludesRoot(s.path))) {
        normalized.push({ name: 'System', path: ['.', '.notebook', '.notebook/templates'], visible: false });
    }
    return normalized;
}

// Convert sections records to simple names array for filesystem operations
function getSectionNames(sections) {
    return normalizeSectionsFormat(sections).map(s => s.name);
}

// Check if the System section (root files) is visible in settings
function getSystemSectionVisible() {
    if (!notebookSettings?.sections) return false;
    const systemSection = notebookSettings.sections.find(s =>
        typeof s === 'object' && sectionPathIncludesRoot(s.path)
    );
    return systemSection?.visible === true;
}

// Save settings to .notebook/settings.yaml
async function saveSettings(dirHandle) {
    if (!dirHandle || !notebookSettings) return;

    const content = jsyaml.dump(notebookSettings, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false
    });

    // Save to .notebook/settings.yaml (creates .notebook dir if needed)
    const configDir = await getNotebookConfigDir(dirHandle, true);
    const settingsFile = await configDir.getFileHandle('settings.yaml', { create: true });
    const writable = await settingsFile.createWritable();
    await writable.write(content);
    await writable.close();
    console.log('[Settings] Saved .notebook/settings.yaml');
}

// Load extension registry from settings (or use defaults)
async function loadExtensionRegistry(dirHandle) {
    // Use extensions from settings if available, otherwise use defaults
    if (notebookSettings && notebookSettings.extensions) {
        extensionRegistry = notebookSettings.extensions;
        console.log('[Templates] Using extensions from settings');
    } else {
        extensionRegistry = getDefaultExtensionRegistry();
        console.log('[Templates] Using default extension registry');
    }
    return extensionRegistry;
}

// Default Claude icon SVG (starburst in Anthropic brand color)
const DEFAULT_CLAUDE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 50 350 410"><path fill="#D77655" fill-rule="nonzero" d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z"/></svg>`;

// Load authors from settings and their icon files from assets/author-icons/
async function loadAuthors(dirHandle) {
    authorRegistry = {};

    const authors = notebookSettings?.authors;
    if (!authors || !Array.isArray(authors) || authors.length === 0) {
        console.log('[Authors] No authors defined in settings');
        return authorRegistry;
    }

    // Try to get assets/author-icons directory
    let iconsDir = null;
    if (dirHandle) {
        try {
            const assetsDir = await dirHandle.getDirectoryHandle('assets');
            iconsDir = await assetsDir.getDirectoryHandle('author-icons');
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
        if (iconsDir) {
            try {
                const iconFile = await iconsDir.getFileHandle(author.icon);
                const file = await iconFile.getFile();
                iconContent = await file.text();
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

// Load templates from .notebook/templates/
async function loadTemplates(dirHandle) {
    // Fetch default templates from server (ensures settings is always available)
    const defaults = await fetchDefaultTemplates();
    templateRegistry = { ...defaults };

    if (!dirHandle) {
        return templateRegistry;
    }

    const templatesToUpdate = [];

    // Load from .notebook/templates/
    const templatesDir = await getNotebookTemplatesDir(dirHandle, false);
    if (templatesDir) {
        try {
            for await (const [name, handle] of templatesDir.entries()) {
                if (handle.kind === 'file' && name.endsWith('.yaml')) {
                    try {
                        const file = await handle.getFile();
                        const content = await file.text();
                        const template = jsyaml.load(content);
                        if (template && template.name) {
                            // Deep merge: user overrides win, but new default fields are inherited
                            const defaultTemplate = defaults[template.name];
                            const mergedTemplate = defaultTemplate
                                ? deepMerge(defaultTemplate, template)
                                : template;
                            templateRegistry[template.name] = mergedTemplate;

                            // Check if merge added new fields - if so, save updated template
                            if (defaultTemplate) {
                                const mergedYaml = jsyaml.dump(mergedTemplate, { indent: 2, lineWidth: -1, quotingType: '"', forceQuotes: false });
                                if (mergedYaml !== content) {
                                    templatesToUpdate.push({ name, handle, content: mergedYaml });
                                    console.log(`[Templates] Loaded ${name} (will update with new defaults)`);
                                } else {
                                    console.log(`[Templates] Loaded ${name}`);
                                }
                            } else {
                                console.log(`[Templates] Loaded ${name} (custom template)`);
                            }
                        }
                    } catch (e) {
                        console.error(`[Templates] Error parsing ${name}:`, e);
                    }
                }
            }
        } catch (e) {
            console.error('[Templates] Error scanning .notebook/templates/:', e);
        }
    }

    // Save any templates that were updated with new defaults
    for (const { name, handle, content } of templatesToUpdate) {
        try {
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            console.log(`[Templates] Updated ${name} with new defaults`);
        } catch (e) {
            console.error(`[Templates] Error saving ${name}:`, e);
        }
    }

    return templateRegistry;
}

// Load theme CSS: base theme from /themes/ + customizations from .notebook/theme.css
async function loadThemeCss(dirHandle) {
    if (!dirHandle) return;

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
    const configDir = await getNotebookConfigDir(dirHandle, false);
    if (configDir) {
        try {
            const themeFile = await configDir.getFileHandle('theme.css');
            const file = await themeFile.getFile();
            const content = await file.text();

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
async function ensureTemplateFiles(dirHandle) {
    if (!dirHandle) return;

    let createdFiles = [];

    // Get or create .notebook directory
    const configDir = await getNotebookConfigDir(dirHandle, true);
    const templatesDir = await getNotebookTemplatesDir(dirHandle, true);

    // Files to create in .notebook/
    const configFiles = [
        { name: 'settings.yaml', getContent: getDefaultSettingsContent },
        { name: 'theme.css', getContent: getDefaultThemeContent }
    ];

    // Template files to create in .notebook/templates/
    const templateFiles = [
        { name: 'note.yaml', getContent: () => getTemplateFileContent('note') },
        { name: 'code.yaml', getContent: () => getTemplateFileContent('code') },
        { name: 'bookmark.yaml', getContent: () => getTemplateFileContent('bookmark') }
    ];

    // Create config files in .notebook/
    for (const { name, getContent } of configFiles) {
        try {
            await configDir.getFileHandle(name);
            // File exists, don't overwrite
        } catch (e) {
            // File doesn't exist, create it
            try {
                const fileHandle = await configDir.getFileHandle(name, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(getContent());
                await writable.close();
                createdFiles.push(`.notebook/${name}`);
                console.log(`[Templates] Created .notebook/${name}`);
            } catch (writeError) {
                console.error(`[Templates] Error creating .notebook/${name}:`, writeError);
            }
        }
    }

    // Create template files in .notebook/templates/
    for (const { name, getContent } of templateFiles) {
        try {
            await templatesDir.getFileHandle(name);
            // File exists, don't overwrite
        } catch (e) {
            // File doesn't exist, create it
            try {
                const fileHandle = await templatesDir.getFileHandle(name, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(getContent());
                await writable.close();
                createdFiles.push(`.notebook/templates/${name}`);
                console.log(`[Templates] Created .notebook/templates/${name}`);
            } catch (writeError) {
                console.error(`[Templates] Error creating .notebook/templates/${name}:`, writeError);
            }
        }
    }

    // Ensure assets/author-icons directory and default claude.svg exist
    try {
        const assetsDir = await dirHandle.getDirectoryHandle('assets', { create: true });
        const iconsDir = await assetsDir.getDirectoryHandle('author-icons', { create: true });

        // Create default claude.svg if it doesn't exist
        try {
            await iconsDir.getFileHandle('claude.svg');
        } catch (e) {
            try {
                const iconFile = await iconsDir.getFileHandle('claude.svg', { create: true });
                const writable = await iconFile.createWritable();
                await writable.write(DEFAULT_CLAUDE_ICON);
                await writable.close();
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

// Ensure template files exist for card types that are already in use
// This supports customization of existing cards without auto-creating
// templates the user may have intentionally removed
async function ensureTemplatesForExistingCards(dirHandle, loadedData) {
    if (!dirHandle) return [];

    // Collect all template types in use across all sections
    const templateTypesInUse = new Set();
    for (const section of loadedData.sections || []) {
        for (const item of section.items || []) {
            const templateName = item.template || item.type;
            if (templateName) {
                templateTypesInUse.add(templateName);
            }
        }
    }

    if (templateTypesInUse.size === 0) {
        return [];
    }

    // Standard template names we know about
    const knownTemplates = ['note', 'code', 'bookmark'];

    let createdFiles = [];

    // Get .notebook/templates/ directory (may not exist yet)
    const templatesDir = await getNotebookTemplatesDir(dirHandle, false);

    for (const templateName of templateTypesInUse) {
        if (!knownTemplates.includes(templateName)) continue;  // Skip unknown/custom templates

        // Check if template file exists in .notebook/templates/
        let exists = false;
        if (templatesDir) {
            try {
                await templatesDir.getFileHandle(`${templateName}.yaml`);
                exists = true;
            } catch (e) {
                // Not found
            }
        }

        if (!exists) {
            // Template doesn't exist, create it
            try {
                const newTemplatesDir = await getNotebookTemplatesDir(dirHandle, true);
                const content = getTemplateFileContent(templateName);
                const newFilename = `${templateName}.yaml`;
                const fileHandle = await newTemplatesDir.getFileHandle(newFilename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
                const savedPath = `.notebook/templates/${newFilename}`;
                createdFiles.push(savedPath);
                console.log(`[Templates] Created ${savedPath} for existing ${templateName} cards`);

                // Add to systemNotes so it appears in System section
                const parsed = jsyaml.load(content);
                loadedData.systemNotes.push({
                    template: 'template',
                    system: true,
                    id: 'system-' + templateName + '.template.yaml',
                    filename: savedPath,
                    title: templateName + ' (template)',
                    name: parsed.name || templateName,
                    description: parsed.description || '',
                    schema: parsed.schema || {},
                    card: parsed.card || {},
                    viewer: parsed.viewer || {},
                    editor: parsed.editor || {},
                    style: parsed.style || {},
                    ui: parsed.ui || {},
                    modified: new Date().toISOString()
                });
            } catch (writeError) {
                console.error(`[Templates] Error creating template for ${templateName}:`, writeError);
            }
        }
    }

    if (createdFiles.length > 0) {
        showToast(`Created templates for existing cards: ${createdFiles.join(', ')}`);
        // Reload templates so the registry has the newly created templates
        await loadTemplates(dirHandle);
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
    }
};

// Get extension config for a filename
function getExtensionConfig(filename) {
    if (!extensionRegistry) {
        extensionRegistry = getDefaultExtensionRegistry();
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
        frontmatter.id = Date.now().toString();
    } else {
        frontmatter.id = String(frontmatter.id);
    }

    // For backwards compatibility, set 'type' field based on template
    // This ensures existing render functions work
    frontmatter.type = templateName;

    // Set language for code files (required by render functions)
    if (extension === '.code.py') {
        frontmatter.language = 'python';
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
        const extConfig = extensionRegistry[card._source.extension];
        format = card._source.format;
        bodyField = extConfig?.bodyField;
        extension = card._source.extension;
    } else {
        // New card - determine format from template/type
        if (card.type === 'note' || card.template === 'note') {
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

    // Clone card data without internal fields
    const { _source, _filename, type, ...cardData } = card;

    // Extract body field for formats that separate it
    let body = null;
    const frontmatter = { ...cardData };

    if (bodyField && format !== 'yaml' && format !== 'json') {
        body = frontmatter[bodyField];
        delete frontmatter[bodyField];
    }

    // For JSON format (bookmarks), keep all fields together
    if (format === 'json') {
        frontmatter.type = type;  // Keep type for backwards compatibility
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

    return `
        <div class="card${modifiedClass}"
             data-template="${template.name}"
             data-item-id="${card.id}"
             data-section-id="${sectionId}"
             onclick="openViewer('${sectionId}', '${card.id}')">
            ${modifiedBadge}
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
        case 'quiz':
            return renderQuizPreview(card, template);
        case 'quiz-response':
            return renderQuizResponsePreview(card, template);
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
        const codePreview = escapeHtml(content.substring(0, 800));
        return `<pre class="preview-code"><code class="language-${fieldDef?.language || 'python'}">${codePreview || 'No code'}</code></pre>`;
    } else if (fieldType === 'markdown' || field === 'content') {
        // Use existing renderNotePreview for markdown
        const previewHtml = renderNotePreview(content, format);
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
            const codePreview = escapeHtml(fallbackContent.substring(0, 800));
            return `<pre class="preview-code"><code class="language-${leftFieldDef?.language || 'python'}">${codePreview}</code></pre>`;
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

// Quiz layout: show question count and progress
function renderQuizPreview(card, template) {
    const questions = card.questions || [];
    const attempts = card.attempts || [];
    const placeholder = template.card?.placeholder || '❓';
    const topic = card.topic ? `<div class="quiz-topic">${escapeHtml(card.topic)}</div>` : '';

    if (questions.length === 0) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }

    // Check if quiz has any graded questions (not a pure survey)
    const hasGradedQuestions = quizHasGradedQuestions(questions);

    // Calculate progress from most recent attempt
    let progressHtml = '';
    let stateClass = 'quiz-not-started';

    if (attempts.length > 0) {
        const lastAttempt = attempts[attempts.length - 1];
        const score = lastAttempt.score || {};
        const correct = score.correct || 0;
        const total = score.total || questions.length;
        const pending = score.pending_review || 0;

        if (!hasGradedQuestions) {
            // Pure survey - just show completed
            stateClass = 'quiz-completed';
            progressHtml = `<div class="quiz-progress">
                <span class="quiz-score">Completed</span>
            </div>`;
        } else if (pending > 0) {
            stateClass = 'quiz-pending-review';
            // Show points-based score, excluding pending from denominator
            const hasPointsScore = score.earned !== undefined && score.possible !== undefined;
            const pendingPoints = lastAttempt.answers
                ?.filter(a => (a.autoGrade?.status || a.status) === 'pending_review')
                .reduce((sum, a) => sum + (a.autoGrade?.maxScore || 1), 0) || 0;
            const gradedPossible = (score.possible || 0) - pendingPoints;
            const gradedTotal = total - pending;
            const scoreText = hasPointsScore
                ? `${score.earned}/${gradedPossible} pts`
                : `${correct}/${gradedTotal} correct`;
            progressHtml = `<div class="quiz-progress">
                <span class="quiz-score">${scoreText}</span>
                <span class="quiz-pending">${pending} awaiting review</span>
            </div>`;
        } else {
            stateClass = 'quiz-completed';
            // Show points-based score if available
            const hasPointsScore = score.earned !== undefined && score.possible !== undefined;
            const scoreText = hasPointsScore
                ? `${score.earned}/${score.possible} pts${score.percentage !== null ? ` (${score.percentage}%)` : ''}`
                : `${correct}/${total} correct`;
            progressHtml = `<div class="quiz-progress">
                <span class="quiz-score">${scoreText}</span>
            </div>`;
        }
    }

    return `
        <div class="quiz-preview ${stateClass}">
            ${topic}
            <div class="quiz-question-count">${questions.length} question${questions.length !== 1 ? 's' : ''}</div>
            ${progressHtml}
        </div>
    `;
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
    let card;
    const isSystemNote = sectionId === '_system';
    // Convert itemId to string for comparison (YAML may parse numeric IDs as numbers)
    const itemIdStr = String(itemId);

    if (isSystemNote) {
        card = data.systemNotes?.find(n => String(n.id) === itemIdStr);
    } else {
        const section = data.sections.find(s => s.id === sectionId);
        if (section) {
            card = section.items.find(i => String(i.id) === itemIdStr);
        }
    }

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
    contentEl.innerHTML = renderViewerContent(card, template) + renderAuthorBadge(card);

    // Apply syntax highlighting if needed
    contentEl.querySelectorAll('pre code').forEach(el => {
        if (!el.getAttribute('data-highlighted')) {
            hljs.highlightElement(el);
        }
    });

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
    let metaText;
    if (isSystemNote) {
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
        case 'quiz':
            return renderQuizViewer(card, template);
        case 'quiz-response':
            return renderQuizResponseViewer(card, template);
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
        return `<div class="viewer-code"><pre><code class="language-${fieldDef?.language || 'python'}">${escapeHtml(content)}</code></pre></div>`;
    } else {
        return `<div class="md-content viewer-markdown">${renderMarkdownWithLinks(content)}</div>`;
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

// Check if a quiz has any graded questions (vs pure survey)
function quizHasGradedQuestions(questions) {
    return questions.some(q => {
        switch (q.type) {
            case 'multiple_choice':
            case 'dropdown':
                return q.correct !== undefined;
            case 'checkbox':
                return q.correctMultiple && q.correctMultiple.length > 0;
            case 'scale':
                return q.correct !== undefined;
            case 'grid':
                return q.correctAnswers && (Array.isArray(q.correctAnswers) ? q.correctAnswers.length > 0 : Object.keys(q.correctAnswers).length > 0);
            case 'numeric':
                return q.answer !== undefined;
            case 'short_answer':
            case 'worked':
                return true; // Needs review
            default:
                return false;
        }
    });
}

// Quiz viewer: display all questions with their content
function renderQuizViewer(card, template) {
    const questions = card.questions || [];
    const attempts = card.attempts || [];

    if (questions.length === 0) {
        return '<div class="viewer-empty">No questions in this quiz</div>';
    }

    // Get latest attempt for showing previous answers
    const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

    // Interactive mode: no attempts yet, or user clicked "Retake"
    const isInteractive = !lastAttempt || card._quizRetakeMode;

    // Check if this is a graded quiz or pure survey
    const hasGradedQuestions = quizHasGradedQuestions(questions);

    let html = `<div class="quiz-viewer" data-quiz-id="${card.id}" data-interactive="${isInteractive}">`;

    // Topic header if present
    if (card.topic) {
        html += `<div class="quiz-viewer-topic">${escapeHtml(card.topic)}</div>`;
    }

    // Mode header: Take Quiz vs Review Results
    if (isInteractive) {
        html += `<div class="quiz-mode-header">
            <span class="quiz-mode-label">Take Quiz</span>
            <span class="quiz-mode-count">${questions.length} question${questions.length !== 1 ? 's' : ''}</span>
        </div>`;
    } else {
        // Progress summary for review mode
        const score = lastAttempt.score || {};
        if (hasGradedQuestions) {
            // Show points-based score, excluding pending review from denominator
            const hasPointsScore = score.earned !== undefined && score.possible !== undefined;
            const pending = score.pending_review || 0;
            // Calculate graded-only denominator (exclude pending questions' points)
            const pendingPoints = lastAttempt.answers
                ?.filter(a => (a.autoGrade?.status || a.status) === 'pending_review')
                .reduce((sum, a) => sum + (a.autoGrade?.maxScore || 1), 0) || 0;
            const gradedPossible = (score.possible || 0) - pendingPoints;
            const gradedTotal = (score.total || questions.length) - pending;

            const scoreDisplay = hasPointsScore
                ? `${score.earned}/${gradedPossible} pts${gradedPossible > 0 ? ` (${Math.round((score.earned / gradedPossible) * 100)}%)` : ''}`
                : `${score.correct || 0}/${gradedTotal} correct`;
            html += `<div class="quiz-summary">
                <span class="quiz-summary-score">${scoreDisplay}</span>
                ${pending ? `<span class="quiz-summary-pending">${pending} awaiting review</span>` : ''}
            </div>`;
        } else {
            html += `<div class="quiz-summary">
                <span class="quiz-summary-score">Survey completed</span>
            </div>`;
        }
    }

    // Render each question
    questions.forEach((q, index) => {
        html += renderQuizQuestion(q, index, isInteractive ? null : lastAttempt, isInteractive);
    });

    // Submit button for interactive mode, Retake button for review mode
    if (isInteractive) {
        html += `<div class="quiz-actions">
            <button class="quiz-submit-btn" onclick="submitQuiz('${card.id}')">Submit Quiz</button>
        </div>`;
    } else if (lastAttempt) {
        html += `<div class="quiz-actions">
            <button class="quiz-retake-btn" onclick="retakeQuiz('${card.id}')">Retake Quiz</button>
        </div>`;
    }

    html += '</div>';
    return html;
}

// Render a single quiz question (interactive or review mode)
function renderQuizQuestion(question, index, attempt, isInteractive = false) {
    const qNum = index + 1;
    const attemptAnswer = attempt?.answers?.find(a => a.questionIndex === index);

    let statusClass = '';
    let statusBadge = '';
    if (attemptAnswer) {
        // Get status from autoGrade (new structure) or fall back to legacy status field
        const status = attemptAnswer.autoGrade?.status || attemptAnswer.status;
        const autoGrade = attemptAnswer.autoGrade;

        if (status === 'correct') {
            statusClass = 'quiz-correct';
            statusBadge = '<span class="quiz-status-badge correct">✓</span>';
        } else if (status === 'partial') {
            // Partial credit - show score
            statusClass = 'quiz-partial';
            const scoreText = autoGrade ? `${autoGrade.score}/${autoGrade.maxScore}` : '◐';
            statusBadge = `<span class="quiz-status-badge partial">${scoreText}</span>`;
        } else if (status === 'incorrect') {
            statusClass = 'quiz-incorrect';
            statusBadge = '<span class="quiz-status-badge incorrect">✗</span>';
        } else if (status === 'pending_review') {
            statusClass = 'quiz-pending';
            statusBadge = '<span class="quiz-status-badge pending">⏳</span>';
        } else if (status === 'answered') {
            // Survey question - just recorded, no grading
            statusClass = 'quiz-answered';
            statusBadge = '<span class="quiz-status-badge answered">•</span>';
        }
    }

    let html = `<div class="quiz-question ${statusClass}" data-question-index="${index}" data-question-type="${question.type || 'multiple_choice'}">`;
    html += `<div class="quiz-question-header">
        <span class="quiz-question-number">Q${qNum}</span>
        ${statusBadge}
    </div>`;

    // Question text (supports markdown)
    html += `<div class="quiz-question-text md-content">${marked.parse(question.question || '')}</div>`;

    // Render answer area based on question type
    html += renderQuizAnswerArea(question, attemptAnswer, isInteractive, index);

    // Feedback based on answer correctness (maps to Google Forms whenRight/whenWrong)
    if (attemptAnswer) {
        const isCorrect = attemptAnswer?.autoGrade?.status === 'correct' || attemptAnswer?.status === 'correct';
        const feedback = isCorrect ? question.whenRight : question.whenWrong;
        if (feedback) {
            html += `<div class="quiz-feedback quiz-feedback-${isCorrect ? 'correct' : 'incorrect'}">
                <div class="md-content">${marked.parse(feedback)}</div>
            </div>`;
        }
    }

    // Review UI for pending_review questions
    const answerStatus = attemptAnswer?.autoGrade?.status || attemptAnswer?.status;
    if (answerStatus === 'pending_review') {
        html += renderReviewUI(attemptAnswer, index);
    }

    // Show existing review feedback if present
    if (attemptAnswer?.review) {
        html += renderReviewFeedback(attemptAnswer.review);
    }

    html += '</div>';
    return html;
}

// Render review UI for pending_review questions
function renderReviewUI(attemptAnswer, questionIndex) {
    // Check if self-review is allowed
    const allowSelfReview = notebookSettings?.quiz_self_review !== false;

    if (!allowSelfReview) {
        // Show awaiting review message instead of buttons
        return `<div class="quiz-awaiting-review">
            <span class="quiz-awaiting-icon">⏳</span>
            Awaiting review
        </div>`;
    }

    return `<div class="quiz-review-ui" data-question-index="${questionIndex}">
        <div class="quiz-review-label">Mark this answer:</div>
        <div class="quiz-review-buttons">
            <button class="quiz-review-btn correct" onclick="submitQuizReview(${questionIndex}, 'correct')">
                ✓ Correct
            </button>
            <button class="quiz-review-btn incorrect" onclick="submitQuizReview(${questionIndex}, 'incorrect')">
                ✗ Incorrect
            </button>
        </div>
        <textarea class="quiz-review-feedback" placeholder="Optional feedback..."
                  id="reviewFeedback_${questionIndex}"></textarea>
    </div>`;
}

// Render existing review feedback
function renderReviewFeedback(review) {
    let html = '<div class="quiz-review-result">';
    if (review.feedback) {
        html += `<div class="quiz-review-feedback-display">
            <span class="quiz-review-feedback-label">Feedback:</span>
            <div class="md-content">${marked.parse(review.feedback)}</div>
        </div>`;
    }
    if (review.reviewer) {
        html += `<div class="quiz-review-attribution">Reviewed by ${escapeHtml(review.reviewer)}</div>`;
    }
    html += '</div>';
    return html;
}

// Render the answer area for a question based on its type
function renderQuizAnswerArea(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const type = question.type || 'multiple_choice';

    switch (type) {
        case 'multiple_choice':
            return renderMultipleChoiceAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'checkbox':
            return renderCheckboxAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'dropdown':
            return renderDropdownAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'numeric':
            return renderNumericAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'short_answer':
            return renderShortAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'worked':
            return renderWorkedAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'scale':
            return renderScaleAnswer(question, attemptAnswer, isInteractive, questionIndex);
        case 'grid':
            return renderGridAnswer(question, attemptAnswer, isInteractive, questionIndex);
        default:
            return '<div class="quiz-unknown-type">Unknown question type</div>';
    }
}

// Multiple choice: radio/checkbox/dropdown options
function renderMultipleChoiceAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const options = question.options || [];
    const allowMultiple = question.allowMultiple || false;
    const display = question.display || 'radio';
    const correctIndex = question.correct;
    const correctMultiple = question.correctMultiple || [];
    const userAnswer = attemptAnswer?.answer;

    // Dropdown mode
    if (display === 'dropdown' && !allowMultiple) {
        return renderDropdownAnswer(question, attemptAnswer, isInteractive, questionIndex);
    }

    // Checkbox mode
    if (allowMultiple) {
        return renderCheckboxAnswer(question, attemptAnswer, isInteractive, questionIndex);
    }

    // Default: Radio button mode
    let html = '<div class="quiz-options">';
    options.forEach((opt, i) => {
        let optClass = 'quiz-option';
        let indicator = '';

        if (isInteractive) {
            // Interactive mode: clickable options
            optClass += ' interactive';
            html += `<div class="${optClass}" data-option-index="${i}" onclick="selectQuizOption(this, ${questionIndex}, ${i})">
                <span class="quiz-option-radio"></span>
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${escapeHtml(opt)}</span>
            </div>`;
        } else {
            // Review mode: show correct/incorrect (only if correct answer defined)
            if (attemptAnswer) {
                if (correctIndex !== undefined) {
                    if (i === correctIndex) {
                        optClass += ' correct';
                        indicator = '<span class="quiz-option-indicator">✓</span>';
                    }
                    if (i === userAnswer && i !== correctIndex) {
                        optClass += ' selected incorrect';
                        indicator = '<span class="quiz-option-indicator">✗</span>';
                    } else if (i === userAnswer) {
                        optClass += ' selected';
                    }
                } else if (i === userAnswer) {
                    // Survey question - just show selected, no grading
                    optClass += ' selected';
                }
            }
            html += `<div class="${optClass}">
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${escapeHtml(opt)}</span>
                ${indicator}
            </div>`;
        }
    });
    html += '</div>';
    return html;
}

// Checkbox mode: multiple selections allowed
function renderCheckboxAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const options = question.options || [];
    const correctMultiple = question.correctMultiple || [];
    const userAnswers = Array.isArray(attemptAnswer?.answer) ? attemptAnswer.answer : [];

    let html = '<div class="quiz-options quiz-options-checkbox">';
    options.forEach((opt, i) => {
        let optClass = 'quiz-option';
        let indicator = '';
        const isSelected = userAnswers.includes(i);
        const isCorrect = correctMultiple.includes(i);

        if (isInteractive) {
            optClass += ' interactive';
            html += `<div class="${optClass}" data-option-index="${i}" onclick="toggleQuizCheckbox(this, ${questionIndex}, ${i})">
                <span class="quiz-option-checkbox"></span>
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${escapeHtml(opt)}</span>
            </div>`;
        } else {
            // Review mode
            if (attemptAnswer && correctMultiple.length > 0) {
                if (isCorrect) {
                    optClass += ' correct';
                    indicator = '<span class="quiz-option-indicator">✓</span>';
                }
                if (isSelected && !isCorrect) {
                    optClass += ' selected incorrect';
                    indicator = '<span class="quiz-option-indicator">✗</span>';
                } else if (isSelected) {
                    optClass += ' selected';
                }
            } else if (isSelected) {
                optClass += ' selected';
            }
            html += `<div class="${optClass}">
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${escapeHtml(opt)}</span>
                ${indicator}
            </div>`;
        }
    });
    html += '</div>';
    return html;
}

// Dropdown mode: select element
function renderDropdownAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const options = question.options || [];
    const correctIndex = question.correct;
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-dropdown">';
    if (isInteractive) {
        html += `<select class="quiz-dropdown-select" onchange="updateQuizAnswer(${questionIndex}, parseInt(this.value))">
            <option value="">Select an answer...</option>`;
        options.forEach((opt, i) => {
            html += `<option value="${i}">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</option>`;
        });
        html += '</select>';
    } else if (attemptAnswer !== undefined) {
        // Review mode
        const selectedOpt = options[userAnswer];

        if (correctIndex !== undefined) {
            // Graded question - show correct/incorrect
            const correctOpt = options[correctIndex];
            const isCorrect = userAnswer === correctIndex;

            html += `<div class="quiz-dropdown-answer ${isCorrect ? 'correct' : 'incorrect'}">
                <span class="quiz-dropdown-label">Your answer:</span>
                <span class="quiz-dropdown-value">${userAnswer !== undefined ? `${String.fromCharCode(65 + userAnswer)}. ${escapeHtml(selectedOpt)}` : '(none)'}</span>
                ${isCorrect ? '<span class="quiz-option-indicator">✓</span>' : '<span class="quiz-option-indicator">✗</span>'}
            </div>`;
            if (!isCorrect) {
                html += `<div class="quiz-dropdown-correct">
                    <span class="quiz-dropdown-label">Correct:</span>
                    <span class="quiz-dropdown-value">${String.fromCharCode(65 + correctIndex)}. ${escapeHtml(correctOpt)}</span>
                </div>`;
            }
        } else {
            // Survey question - just show selected answer without grading
            html += `<div class="quiz-dropdown-answer">
                <span class="quiz-dropdown-label">Your answer:</span>
                <span class="quiz-dropdown-value">${userAnswer !== undefined ? `${String.fromCharCode(65 + userAnswer)}. ${escapeHtml(selectedOpt)}` : '(none)'}</span>
            </div>`;
        }
    }
    html += '</div>';
    return html;
}

// Numeric: show expected answer and tolerance
function renderNumericAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const answer = question.answer;
    const tolerance = question.tolerance || 0;
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-numeric">';
    if (isInteractive) {
        // Interactive mode: number input
        html += `<div class="quiz-numeric-input-area">
            <input type="number" class="quiz-numeric-input" data-question-index="${questionIndex}"
                   placeholder="Enter your answer" step="any"
                   onchange="updateQuizAnswer(${questionIndex}, this.value)">
        </div>`;
    } else if (attemptAnswer) {
        // Review mode: show user answer and correct answer
        html += `<div class="quiz-numeric-user">Your answer: <strong>${userAnswer !== undefined ? userAnswer : '—'}</strong></div>`;
        html += `<div class="quiz-numeric-correct">Expected: <strong>${answer}</strong>`;
        if (tolerance > 0) {
            html += ` (±${tolerance})`;
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

// Short answer: textarea for free response
function renderShortAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-short-answer">';
    if (isInteractive) {
        // Interactive mode: textarea
        html += `<textarea class="quiz-short-answer-input" data-question-index="${questionIndex}"
                   placeholder="Type your answer here..."
                   onchange="updateQuizAnswer(${questionIndex}, this.value)"></textarea>`;
    } else if (attemptAnswer) {
        // Review mode: show user response
        html += `<div class="quiz-short-answer-response">${escapeHtml(userAnswer || '(No response)')}</div>`;
    }
    html += '</div>';
    return html;
}

// Worked problem: multi-step solution
function renderWorkedAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const userAnswer = attemptAnswer?.answer;

    let html = '<div class="quiz-worked">';
    if (isInteractive) {
        // Interactive mode: textarea for showing work
        html += `<div class="quiz-worked-input-area">
            <label class="quiz-worked-label">Show your work:</label>
            <textarea class="quiz-worked-input" data-question-index="${questionIndex}"
                   placeholder="Enter your solution step by step..."
                   onchange="updateQuizAnswer(${questionIndex}, this.value)"></textarea>
        </div>`;
    } else if (attemptAnswer && userAnswer) {
        // Review mode: show user's work
        if (Array.isArray(userAnswer)) {
            html += '<div class="quiz-worked-steps">';
            userAnswer.forEach((step, i) => {
                html += `<div class="quiz-worked-step">
                    <span class="quiz-step-number">Step ${i + 1}:</span>
                    <span class="quiz-step-content">${escapeHtml(step)}</span>
                </div>`;
            });
            html += '</div>';
        } else {
            html += `<div class="quiz-worked-response">${escapeHtml(userAnswer)}</div>`;
        }
    }
    html += '</div>';
    return html;
}

// Scale: linear scale selection (maps to Google Forms ScaleQuestion)
function renderScaleAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const low = question.low || 1;
    const high = question.high || 5;
    const lowLabel = question.lowLabel || '';
    const highLabel = question.highLabel || '';
    const correctValue = question.correct;
    const selectedValue = attemptAnswer?.answer;

    let html = '<div class="quiz-scale">';

    // Scale labels
    if (lowLabel || highLabel) {
        html += '<div class="quiz-scale-labels">';
        html += `<span class="quiz-scale-label-low">${escapeHtml(lowLabel)}</span>`;
        html += `<span class="quiz-scale-label-high">${escapeHtml(highLabel)}</span>`;
        html += '</div>';
    }

    // Scale options
    html += '<div class="quiz-scale-options">';
    for (let i = low; i <= high; i++) {
        let optClass = 'quiz-scale-option';

        if (isInteractive) {
            optClass += ' interactive';
            html += `<div class="${optClass}" data-value="${i}" onclick="selectScaleOption(this, ${questionIndex}, ${i})">
                <span class="quiz-scale-radio"></span>
                <span class="quiz-scale-value">${i}</span>
            </div>`;
        } else {
            // Review mode
            if (attemptAnswer) {
                if (correctValue !== undefined && i === correctValue) {
                    optClass += ' correct';
                }
                if (i === selectedValue) {
                    optClass += ' selected';
                    if (correctValue !== undefined && i !== correctValue) {
                        optClass += ' incorrect';
                    }
                }
            }
            html += `<div class="${optClass}">
                <span class="quiz-scale-value">${i}</span>
            </div>`;
        }
    }
    html += '</div>';

    html += '</div>';
    return html;
}

// Grid: matrix of radio buttons (maps to Google Forms Grid/RowQuestion)
function renderGridAnswer(question, attemptAnswer, isInteractive = false, questionIndex = 0) {
    const rows = question.rows || [];
    const columns = question.columns || [];
    const correctAnswers = question.correctAnswers; // Array [[rowIdx, colIdx], ...] or Object {rowName: colName}
    const userAnswers = attemptAnswer?.answer || {}; // Object: { rowIndex: colIndex }

    // Build correct answers lookup (normalize both formats to {rowIdx: colIdx})
    const correctLookup = {};
    if (correctAnswers) {
        if (Array.isArray(correctAnswers)) {
            // Array format: [[0, 2], [2, 3]]
            correctAnswers.forEach(([rowIdx, colIdx]) => {
                correctLookup[rowIdx] = colIdx;
            });
        } else {
            // Object format: {"Row Name": "Column Name"} - more intuitive for authoring
            Object.entries(correctAnswers).forEach(([rowName, colName]) => {
                const rowIdx = rows.indexOf(rowName);
                const colIdx = columns.indexOf(colName);
                if (rowIdx !== -1 && colIdx !== -1) {
                    correctLookup[rowIdx] = colIdx;
                }
            });
        }
    }
    const hasCorrectAnswers = Object.keys(correctLookup).length > 0;

    let html = '<div class="quiz-grid">';

    // Header row with column labels
    html += '<div class="quiz-grid-header">';
    html += '<div class="quiz-grid-cell quiz-grid-corner"></div>';
    columns.forEach(col => {
        html += `<div class="quiz-grid-cell quiz-grid-col-label">${escapeHtml(col)}</div>`;
    });
    html += '</div>';

    // Data rows
    rows.forEach((row, rowIdx) => {
        html += '<div class="quiz-grid-row">';
        html += `<div class="quiz-grid-cell quiz-grid-row-label">${escapeHtml(row)}</div>`;

        columns.forEach((col, colIdx) => {
            let cellClass = 'quiz-grid-cell quiz-grid-option';
            const isSelected = userAnswers[rowIdx] === colIdx;
            const isCorrect = correctLookup[rowIdx] === colIdx;

            if (isInteractive) {
                cellClass += ' interactive';
                html += `<div class="${cellClass}" onclick="selectGridOption(this, ${questionIndex}, ${rowIdx}, ${colIdx})">
                    <span class="quiz-grid-radio"></span>
                </div>`;
            } else {
                // Review mode
                if (attemptAnswer) {
                    if (hasCorrectAnswers && isCorrect) {
                        cellClass += ' correct';
                    }
                    if (isSelected) {
                        cellClass += ' selected';
                        if (hasCorrectAnswers && !isCorrect) {
                            cellClass += ' incorrect';
                        }
                    }
                }
                html += `<div class="${cellClass}">
                    ${isSelected ? '<span class="quiz-grid-selected">●</span>' : ''}
                </div>`;
            }
        });

        html += '</div>';
    });

    html += '</div>';
    return html;
}

// Helper: shuffle array (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Helper: find card by ID across all sections
function findCardById(cardId) {
    // Convert to string for comparison (YAML may parse numeric IDs as numbers)
    const cardIdStr = String(cardId);
    for (const section of data.sections) {
        const item = section.items.find(i => String(i.id) === cardIdStr);
        if (item) return item;
    }
    // Also check systemNotes
    const systemNote = data.systemNotes?.find(n => String(n.id) === cardIdStr);
    if (systemNote) return systemNote;
    return null;
}

// Quiz interaction: select multiple choice option
function selectQuizOption(element, questionIndex, optionIndex) {
    const quizViewer = element.closest('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    // Deselect all options in this question
    const question = element.closest('.quiz-question');
    question.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));

    // Select this option
    element.classList.add('selected');

    // Store answer
    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};
    quizAnswers[quizId][questionIndex] = optionIndex;
}

// Quiz interaction: toggle checkbox option (multiple selection)
function toggleQuizCheckbox(element, questionIndex, optionIndex) {
    const quizViewer = element.closest('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    // Toggle selection
    element.classList.toggle('selected');

    // Initialize array if needed
    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};
    if (!Array.isArray(quizAnswers[quizId][questionIndex])) {
        quizAnswers[quizId][questionIndex] = [];
    }

    // Add or remove from selection
    const currentAnswers = quizAnswers[quizId][questionIndex];
    const idx = currentAnswers.indexOf(optionIndex);
    if (idx >= 0) {
        currentAnswers.splice(idx, 1);
    } else {
        currentAnswers.push(optionIndex);
    }
}

// Quiz interaction: update text/numeric answer
function updateQuizAnswer(questionIndex, value) {
    const quizViewer = document.querySelector('.quiz-viewer[data-interactive="true"]');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};

    // Parse numeric values
    const question = quizViewer.querySelector(`[data-question-index="${questionIndex}"]`);
    const qType = question?.dataset.questionType;
    if (qType === 'numeric') {
        quizAnswers[quizId][questionIndex] = value !== '' ? parseFloat(value) : null;
    } else {
        quizAnswers[quizId][questionIndex] = value;
    }
}

// Quiz interaction: select scale option
function selectScaleOption(element, questionIndex, value) {
    const quizViewer = element.closest('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    // Deselect all options in this scale
    const scaleContainer = element.closest('.quiz-scale-options');
    scaleContainer.querySelectorAll('.quiz-scale-option').forEach(opt => opt.classList.remove('selected'));

    // Select this option
    element.classList.add('selected');

    // Store answer
    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};
    quizAnswers[quizId][questionIndex] = value;
}

// Quiz interaction: select grid option
function selectGridOption(element, questionIndex, rowIndex, colIndex) {
    const quizViewer = element.closest('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    // Deselect all options in this row
    const gridRow = element.closest('.quiz-grid-row');
    gridRow.querySelectorAll('.quiz-grid-option').forEach(opt => opt.classList.remove('selected'));

    // Select this option
    element.classList.add('selected');

    // Store answer (as object mapping row -> column)
    if (!quizAnswers[quizId]) quizAnswers[quizId] = {};
    if (!quizAnswers[quizId][questionIndex]) quizAnswers[quizId][questionIndex] = {};
    quizAnswers[quizId][questionIndex][rowIndex] = colIndex;
}

// Quiz interaction: submit quiz
async function submitQuiz(quizId) {
    const answers = quizAnswers[quizId] || {};

    // Find the card
    const card = findCardById(quizId);
    if (!card) {
        showToast('Quiz not found', 'error');
        return;
    }

    // Check if all questions have answers
    const questions = card.questions || [];
    const unanswered = questions.filter((q, i) => answers[i] === undefined || answers[i] === null || answers[i] === '');

    if (unanswered.length > 0) {
        if (!confirm(`You have ${unanswered.length} unanswered question(s). Submit anyway?`)) {
            return;
        }
    }

    // Grade and save the attempt
    const attempt = gradeQuizAttempt(card, answers);
    await saveQuizAttempt(card, attempt);

    // Clear quiz state
    delete quizAnswers[quizId];

    showToast('Quiz submitted!', 'success');
}

// Quiz interaction: retake quiz
function retakeQuiz(quizId) {
    const card = findCardById(quizId);
    if (!card) return;

    // Set retake mode flag and re-open viewer
    card._quizRetakeMode = true;
    quizAnswers[quizId] = {};

    // Re-render the viewer content
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderQuizViewer(card, template);
    }
}

// Grade quiz attempt: auto-grade what we can, mark others as pending
function gradeQuizAttempt(card, answers) {
    const questions = card.questions || [];
    const gradedAnswers = [];
    let correctCount = 0;
    let pendingCount = 0;
    let totalEarned = 0;
    let totalPossible = 0;

    questions.forEach((q, index) => {
        const userAnswer = answers[index];
        const maxPoints = q.points || 1;
        const allowPartial = q.partialCredit !== false; // Default to true for applicable types

        const result = {
            questionIndex: index,
            answer: userAnswer,
            autoGrade: {
                status: 'incorrect',
                score: 0,
                maxScore: maxPoints
            }
        };

        switch (q.type) {
            case 'multiple_choice':
            case 'dropdown':
                // Auto-grade: compare to correct index
                if (q.correct !== undefined) {
                    if (userAnswer === q.correct) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    }
                } else {
                    // No correct answer - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'checkbox':
                // Auto-grade: compare to correct indices
                if (q.correctMultiple && q.correctMultiple.length > 0) {
                    const userArray = Array.isArray(userAnswer) ? userAnswer : [];
                    const correctSet = new Set(q.correctMultiple);

                    // Count correct selections
                    let correctSelections = 0;
                    userArray.forEach(selection => {
                        if (correctSet.has(selection)) {
                            correctSelections++;
                        }
                    });

                    const totalCorrect = correctSet.size;

                    if (correctSelections === totalCorrect && userArray.length === totalCorrect) {
                        // Perfect score: all correct, no extras
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    } else if (allowPartial && correctSelections > 0) {
                        // Partial credit: correct / max(selected, required)
                        // This penalizes over-selection without double-counting
                        const denominator = Math.max(userArray.length, totalCorrect);
                        const partialRatio = correctSelections / denominator;
                        const partialScore = Math.round(maxPoints * partialRatio * 100) / 100;
                        if (partialScore > 0) {
                            result.autoGrade.status = 'partial';
                            result.autoGrade.score = partialScore;
                        }
                    }
                } else {
                    // No correct answer - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'numeric':
                // Auto-grade: check within tolerance
                if (userAnswer !== null && userAnswer !== undefined && q.answer !== undefined) {
                    const expected = q.answer;
                    const tolerance = q.tolerance || 0;
                    const diff = Math.abs(userAnswer - expected);

                    if (diff <= tolerance) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    }
                }
                break;

            case 'scale':
                // Auto-grade if correct value specified
                if (q.correct !== undefined) {
                    if (userAnswer === q.correct) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    }
                } else {
                    // No correct answer - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'grid':
                // Auto-grade if correctAnswers specified (with partial credit per row)
                const gridCorrectAnswers = q.correctAnswers;
                const gridRows = q.rows || [];
                const gridColumns = q.columns || [];

                // Build lookup (normalize both formats to {rowIdx: colIdx})
                const gridCorrectLookup = {};
                if (gridCorrectAnswers) {
                    if (Array.isArray(gridCorrectAnswers)) {
                        // Array format: [[0, 2], [2, 3]]
                        gridCorrectAnswers.forEach(([rowIdx, colIdx]) => {
                            gridCorrectLookup[rowIdx] = colIdx;
                        });
                    } else {
                        // Object format: {"Row Name": "Column Name"}
                        Object.entries(gridCorrectAnswers).forEach(([rowName, colName]) => {
                            const rowIdx = gridRows.indexOf(rowName);
                            const colIdx = gridColumns.indexOf(colName);
                            if (rowIdx !== -1 && colIdx !== -1) {
                                gridCorrectLookup[rowIdx] = colIdx;
                            }
                        });
                    }
                }

                const totalRows = Object.keys(gridCorrectLookup).length;
                if (totalRows > 0) {
                    let correctRows = 0;
                    Object.entries(gridCorrectLookup).forEach(([rowIdx, expectedColIdx]) => {
                        if (userAnswer?.[rowIdx] === expectedColIdx) {
                            correctRows++;
                        }
                    });

                    if (correctRows === totalRows) {
                        result.autoGrade.status = 'correct';
                        result.autoGrade.score = maxPoints;
                        correctCount++;
                    } else if (allowPartial && correctRows > 0) {
                        const partialRatio = correctRows / totalRows;
                        const partialScore = Math.round(maxPoints * partialRatio * 100) / 100;
                        result.autoGrade.status = 'partial';
                        result.autoGrade.score = partialScore;
                    }
                } else {
                    // No correct answers - survey question (just record response)
                    result.autoGrade.status = 'answered';
                    result.autoGrade.score = null;
                    result.autoGrade.maxScore = null;
                }
                break;

            case 'short_answer':
            case 'worked':
                // Cannot auto-grade: mark as pending review
                result.autoGrade.status = 'pending_review';
                result.autoGrade.score = null; // Will be graded by teacher/AI
                pendingCount++;
                break;
        }

        // Accumulate totals (skip survey questions with null scores)
        if (result.autoGrade.maxScore !== null) {
            totalPossible += result.autoGrade.maxScore;
            totalEarned += result.autoGrade.score || 0;
        }

        gradedAnswers.push(result);
    });

    // Calculate percentage (avoid division by zero)
    const percentage = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : null;

    return {
        timestamp: new Date().toISOString(),
        answers: gradedAnswers,
        score: {
            earned: totalEarned,
            possible: totalPossible,
            percentage: percentage,
            correct: correctCount,
            total: questions.length,
            pending_review: pendingCount
        }
    };
}

// Save quiz attempt to card and persist
async function saveQuizAttempt(card, attempt) {
    // Add attempt to card
    if (!card.attempts) card.attempts = [];
    card.attempts.push(attempt);

    // Clear retake mode flag
    delete card._quizRetakeMode;

    // Update modified timestamp
    card.modified = new Date().toISOString();

    // Save to IndexedDB
    await saveData();

    // Save to filesystem - find the section containing this card
    const section = data.sections.find(s => s.items.some(i => i.id === card.id));
    if (section) {
        await saveCardFile(section.id, card);
    }

    // Re-render the viewer to show results
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderQuizViewer(card, template);
    }

    // Re-render main view to update card preview
    render();
}

// Submit a review for a pending_review question
async function submitQuizReview(questionIndex, status) {
    const quizViewer = document.querySelector('.quiz-viewer');
    const quizId = quizViewer?.dataset.quizId;
    if (!quizId) return;

    const card = findCardById(quizId);
    if (!card) return;

    const attempts = card.attempts || [];
    if (attempts.length === 0) return;

    // Get feedback from textarea
    const feedbackEl = document.getElementById(`reviewFeedback_${questionIndex}`);
    const feedback = feedbackEl?.value?.trim() || '';

    // Update the last attempt's answer
    const lastAttempt = attempts[attempts.length - 1];
    const answer = lastAttempt.answers?.find(a => a.questionIndex === questionIndex);
    if (!answer) return;

    // Update status and add review
    answer.status = status;
    answer.review = {
        feedback: feedback || undefined,
        reviewedAt: new Date().toISOString()
    };

    // Recalculate score
    let correctCount = 0;
    let pendingCount = 0;
    lastAttempt.answers.forEach(a => {
        if (a.status === 'correct') correctCount++;
        else if (a.status === 'pending_review') pendingCount++;
    });
    lastAttempt.score.correct = correctCount;
    lastAttempt.score.pending_review = pendingCount;

    // Update modified timestamp
    card.modified = new Date().toISOString();

    // Save to IndexedDB
    await saveData();

    // Save to filesystem - find the section containing this card
    const section = data.sections.find(s => s.items.some(i => i.id === card.id));
    if (section) {
        await saveCardFile(section.id, card);
    }

    // Re-render the viewer
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderQuizViewer(card, template);
    }

    // Re-render main view to update card preview
    render();

    showToast(`Marked as ${status}`, 'success');
}

// ===== Quiz Response Layout (Classroom Grading) =====

// Quiz response card preview: shows student ID, score, and status
function renderQuizResponsePreview(card, template) {
    const placeholder = template.card?.placeholder || '📝';
    const studentId = card.studentId || 'Unknown';
    const answers = card.answers || [];
    const status = card.status || 'pending';

    if (answers.length === 0) {
        return `<div class="preview-placeholder">${placeholder}</div>`;
    }

    // Calculate scores from the grade hierarchy
    const graded = answers.filter(a => getEffectiveGrade(a) !== null);
    const pending = answers.length - graded.length;
    const totalScore = card.totalScore ?? graded.reduce((sum, a) => sum + (getEffectiveGrade(a)?.score || 0), 0);
    const maxScore = card.maxScore ?? answers.reduce((sum, a) => sum + (a.autoGrade?.maxScore || a.claudeGrade?.maxScore || a.teacherGrade?.maxScore || 1), 0);

    // Status class for styling
    let statusClass = 'response-pending';
    let statusBadge = '<span class="response-status-badge pending">Pending</span>';

    if (status === 'exported') {
        statusClass = 'response-exported';
        statusBadge = '<span class="response-status-badge exported">Exported</span>';
    } else if (status === 'reviewed') {
        statusClass = 'response-reviewed';
        statusBadge = '<span class="response-status-badge reviewed">Reviewed</span>';
    } else if (status === 'graded') {
        statusClass = 'response-graded';
        statusBadge = '<span class="response-status-badge graded">Graded</span>';
    } else if (pending > 0) {
        statusBadge = `<span class="response-status-badge pending">${pending} pending</span>`;
    }

    return `
        <div class="quiz-response-preview ${statusClass}">
            <div class="response-student-id">Student ${escapeHtml(studentId)}</div>
            <div class="response-score">${totalScore}/${maxScore}</div>
            ${statusBadge}
        </div>
    `;
}

// Get the effective grade (highest priority in hierarchy: teacher > claude > auto)
function getEffectiveGrade(answer) {
    if (answer.teacherGrade) return answer.teacherGrade;
    if (answer.claudeGrade) return answer.claudeGrade;
    if (answer.autoGrade) return answer.autoGrade;
    return null;
}

// Quiz response viewer: shows all answers with grade hierarchy
function renderQuizResponseViewer(card, template) {
    const answers = card.answers || [];
    const studentId = card.studentId || 'Unknown';
    const quizId = card.quizId;
    const status = card.status || 'pending';

    if (answers.length === 0) {
        return '<div class="viewer-empty">No answers in this response</div>';
    }

    // Try to find the quiz card to get question text
    const quiz = findCardById(quizId);
    const questions = quiz?.questions || [];

    let html = `<div class="quiz-response-viewer" data-response-id="${card.id}">`;

    // Header with student info
    html += `<div class="response-header">
        <span class="response-student-label">Student ${escapeHtml(studentId)}</span>
        <span class="response-quiz-ref">Quiz: ${escapeHtml(quiz?.title || quizId || 'Unknown')}</span>
    </div>`;

    // Score summary
    const graded = answers.filter(a => getEffectiveGrade(a) !== null);
    const totalScore = card.totalScore ?? graded.reduce((sum, a) => sum + (getEffectiveGrade(a)?.score || 0), 0);
    const maxScore = card.maxScore ?? answers.reduce((sum, a) => sum + (a.autoGrade?.maxScore || a.claudeGrade?.maxScore || a.teacherGrade?.maxScore || 1), 0);

    html += `<div class="response-summary">
        <span class="response-total-score">${totalScore}/${maxScore}</span>
        <span class="response-status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
    </div>`;

    // Render each answer
    answers.forEach((answer, index) => {
        const question = questions[answer.questionIndex] || questions[index];
        html += renderResponseAnswer(answer, question, index);
    });

    html += '</div>';
    return html;
}

// Render a single answer with grade hierarchy
function renderResponseAnswer(answer, question, index) {
    const qNum = index + 1;
    const effectiveGrade = getEffectiveGrade(answer);
    const isGraded = effectiveGrade !== null;

    // Determine status class based on grade hierarchy
    let statusClass = 'response-answer-pending';
    let statusBadge = '<span class="response-answer-badge pending">⏳ Pending</span>';

    if (answer.teacherGrade) {
        statusClass = 'response-answer-reviewed';
        statusBadge = '<span class="response-answer-badge reviewed">✓ Reviewed</span>';
    } else if (answer.claudeGrade) {
        statusClass = 'response-answer-ai-graded';
        statusBadge = '<span class="response-answer-badge ai-graded">🤖 AI Graded</span>';
    } else if (answer.autoGrade) {
        const autoStatus = answer.autoGrade.status;
        if (autoStatus === 'correct') {
            statusClass = 'response-answer-correct';
            statusBadge = '<span class="response-answer-badge correct">✓ Correct</span>';
        } else if (autoStatus === 'incorrect') {
            statusClass = 'response-answer-incorrect';
            statusBadge = '<span class="response-answer-badge incorrect">✗ Incorrect</span>';
        } else if (autoStatus === 'partial') {
            statusClass = 'response-answer-partial';
            statusBadge = '<span class="response-answer-badge partial">◐ Partial</span>';
        }
    }

    let html = `<div class="response-answer ${statusClass}">`;

    // Question header
    html += `<div class="response-answer-header">
        <span class="response-question-number">Q${qNum}</span>
        ${statusBadge}
        ${isGraded ? `<span class="response-answer-score">${effectiveGrade.score}/${effectiveGrade.maxScore || 1}</span>` : ''}
    </div>`;

    // Question text (if quiz is found)
    if (question?.question) {
        html += `<div class="response-question-text md-content">${marked.parse(question.question)}</div>`;
    }

    // Student's answer
    html += `<div class="response-student-answer">
        <div class="response-answer-label">Student Answer:</div>
        <div class="response-answer-content">${formatStudentAnswer(answer.answer, question?.type)}</div>
    </div>`;

    // Show grade hierarchy if present
    if (answer.autoGrade) {
        html += renderGradeCard('Auto', answer.autoGrade, 'auto');
    }
    if (answer.claudeGrade) {
        html += renderGradeCard('AI Suggestion', answer.claudeGrade, 'claude');
    }
    if (answer.teacherGrade) {
        html += renderGradeCard('Teacher Review', answer.teacherGrade, 'teacher');
    }

    // If no teacher grade yet, show grading UI
    if (!answer.teacherGrade && (answer.claudeGrade || answer.autoGrade?.status === 'pending' || !answer.autoGrade)) {
        html += renderTeacherGradeUI(index, answer.claudeGrade);
    }

    html += '</div>';
    return html;
}

// Format student answer for display
function formatStudentAnswer(answer, questionType) {
    if (answer === null || answer === undefined) {
        return '<span class="response-no-answer">No answer provided</span>';
    }

    if (Array.isArray(answer)) {
        // Ordering or multi-select
        return `<ol class="response-answer-list">${answer.map(a => `<li>${escapeHtml(String(a))}</li>`).join('')}</ol>`;
    }

    if (typeof answer === 'object') {
        // Matching pairs or other complex answer
        return `<pre class="response-answer-json">${escapeHtml(JSON.stringify(answer, null, 2))}</pre>`;
    }

    if (typeof answer === 'number') {
        return `<span class="response-answer-numeric">${answer}</span>`;
    }

    // Text answer - render as markdown
    return `<div class="md-content">${marked.parse(String(answer))}</div>`;
}

// Render a grade card (for auto/claude/teacher grades)
function renderGradeCard(label, grade, type) {
    let html = `<div class="response-grade-card response-grade-${type}">`;
    html += `<div class="response-grade-header">
        <span class="response-grade-label">${escapeHtml(label)}</span>
        <span class="response-grade-score">${grade.score}/${grade.maxScore || 1}</span>
    </div>`;

    if (grade.feedback) {
        html += `<div class="response-grade-feedback md-content">${marked.parse(grade.feedback)}</div>`;
    }

    if (grade.reviewer) {
        html += `<div class="response-grade-attribution">by ${escapeHtml(grade.reviewer)}</div>`;
    }

    if (grade.reviewedAt || grade.gradedAt) {
        const date = grade.reviewedAt || grade.gradedAt;
        html += `<div class="response-grade-date">${formatDate(date)}</div>`;
    }

    html += '</div>';
    return html;
}

// Render teacher grade UI (similar to quiz review UI)
function renderTeacherGradeUI(answerIndex, claudeGrade) {
    const prefillScore = claudeGrade?.score || '';
    const prefillFeedback = claudeGrade?.feedback || '';
    const maxScore = claudeGrade?.maxScore || 1;

    return `<div class="response-teacher-grade-ui" data-answer-index="${answerIndex}">
        <div class="response-grade-label">Teacher Review:</div>
        <div class="response-grade-inputs">
            <div class="response-score-input">
                <label>Score:</label>
                <input type="number" class="response-score-field" id="teacherScore_${answerIndex}"
                       value="${prefillScore}" min="0" max="${maxScore}" step="0.5">
                <span>/ ${maxScore}</span>
            </div>
            <div class="response-feedback-input">
                <label>Feedback:</label>
                <textarea class="response-feedback-field" id="teacherFeedback_${answerIndex}"
                          placeholder="Optional feedback...">${escapeHtml(prefillFeedback)}</textarea>
            </div>
            <div class="response-grade-actions">
                <button class="response-approve-btn" onclick="submitTeacherGrade(${answerIndex})">
                    Save Grade
                </button>
                ${claudeGrade ? `<button class="response-approve-ai-btn" onclick="approveClaudeGrade(${answerIndex})">
                    Approve AI Grade
                </button>` : ''}
            </div>
        </div>
    </div>`;
}

// Submit a teacher grade for an answer
async function submitTeacherGrade(answerIndex) {
    const card = currentViewingCard;
    if (!card || card.template !== 'quiz-response') {
        showToast('No response card open', 'error');
        return;
    }

    const scoreEl = document.getElementById(`teacherScore_${answerIndex}`);
    const feedbackEl = document.getElementById(`teacherFeedback_${answerIndex}`);

    if (!scoreEl || scoreEl.value === '') {
        showToast('Please enter a score', 'error');
        return;
    }

    const score = parseFloat(scoreEl.value);
    const feedback = feedbackEl?.value || '';

    // Update the answer with teacher grade
    if (!card.answers[answerIndex]) {
        showToast('Answer not found', 'error');
        return;
    }

    card.answers[answerIndex].teacherGrade = {
        score: score,
        maxScore: card.answers[answerIndex].claudeGrade?.maxScore ||
                  card.answers[answerIndex].autoGrade?.maxScore || 1,
        feedback: feedback,
        reviewedAt: new Date().toISOString(),
        reviewer: notebookSettings?.default_author || 'Teacher'
    };

    // Recalculate total score
    recalculateResponseScore(card);

    // Update status if all answers are reviewed
    updateResponseStatus(card);

    card.modified = new Date().toISOString();

    // Save
    const section = findSectionByItem(card);
    if (section) {
        await saveCardFile(section.id, card);
    }

    // Re-render
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderQuizResponseViewer(card, template);
    }

    render();
    showToast('Grade saved', 'success');
}

// Approve Claude's grade as the teacher grade
async function approveClaudeGrade(answerIndex) {
    const card = currentViewingCard;
    if (!card || card.template !== 'quiz-response') {
        showToast('No response card open', 'error');
        return;
    }

    const answer = card.answers[answerIndex];
    if (!answer?.claudeGrade) {
        showToast('No AI grade to approve', 'error');
        return;
    }

    // Copy Claude grade to teacher grade with approval
    answer.teacherGrade = {
        ...answer.claudeGrade,
        reviewedAt: new Date().toISOString(),
        reviewer: notebookSettings?.default_author || 'Teacher'
    };
    delete answer.teacherGrade.gradedAt; // Use reviewedAt instead

    // Recalculate total score
    recalculateResponseScore(card);

    // Update status if all answers are reviewed
    updateResponseStatus(card);

    card.modified = new Date().toISOString();

    // Save
    const section = findSectionByItem(card);
    if (section) {
        await saveCardFile(section.id, card);
    }

    // Re-render
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        const template = templateRegistry[card.template || card.type];
        viewerContent.innerHTML = renderQuizResponseViewer(card, template);
    }

    render();
    showToast('AI grade approved', 'success');
}

// Recalculate total score for a response card
function recalculateResponseScore(card) {
    let totalScore = 0;
    let maxScore = 0;

    for (const answer of card.answers) {
        const grade = getEffectiveGrade(answer);
        if (grade) {
            totalScore += grade.score || 0;
            maxScore += grade.maxScore || 1;
        }
    }

    card.totalScore = totalScore;
    card.maxScore = maxScore;
}

// Update response status based on grading progress
function updateResponseStatus(card) {
    const answers = card.answers || [];
    const allReviewed = answers.every(a => a.teacherGrade);
    const allGraded = answers.every(a => getEffectiveGrade(a) !== null);

    if (card.exportedToForms) {
        card.status = 'exported';
    } else if (allReviewed) {
        card.status = 'reviewed';
    } else if (allGraded) {
        card.status = 'graded';
    } else {
        card.status = 'pending';
    }
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
        html += `<div class="md-content viewer-description">${renderMarkdownWithLinks(content)}</div>`;
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
            html = renderMarkdownWithLinks(content);
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
    actions += `<button class="btn btn-secondary btn-small" onclick="editViewerCard()">✎ Edit</button>`;
    actions += `<button class="btn btn-secondary btn-small" onclick="deleteViewerCard()">× Delete</button>`;

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
    const isSystemNote = sectionId === '_system';
    const templateName = currentViewingCard.template || currentViewingCard.type;
    closeViewer();

    if (isSystemNote) {
        if (!confirm('Delete this system note? The file will be removed from your notebook folder.')) return;

        const note = data.systemNotes?.find(n => n.id === cardId);
        if (note && notebookDirHandle) {
            try {
                await notebookDirHandle.removeEntry(note.filename);
            } catch (e) {
                console.warn('[Filesystem] Could not delete system note file:', e);
            }
        }

        data.systemNotes = data.systemNotes?.filter(n => n.id !== cardId) || [];
        await saveData();
        render();
        showToast('System note deleted');
    } else {
        await confirmDeleteItem(sectionId, cardId, templateName);
    }
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

    // Find and update the actual system note
    const systemNote = data.systemNotes?.find(n => n.id === card.id);
    if (systemNote) {
        Object.assign(systemNote, merged);
        await saveCardFile('_system', systemNote);
        await loadTemplates();
        render();
        openViewer('_system', card.id);
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

    // Find and update the actual system note
    const systemNote = data.systemNotes?.find(n => n.id === card.id);
    if (!systemNote) return;

    if (card.template === 'template') {
        // Template file - replace with default template object
        const defaults = getDefaultTemplates()[card.name];
        const preserved = {
            id: systemNote.id,
            filename: systemNote.filename,
            template: systemNote.template,
            system: systemNote.system,
            title: systemNote.title,
            modified: new Date().toISOString()
        };
        Object.assign(systemNote, defaults, preserved);
        await saveCardFile('_system', systemNote);
        await loadTemplates();
    } else {
        // Markdown file (README.md, CLAUDE.md) - replace content
        systemNote.content = defaultContent;
        systemNote.modified = new Date().toISOString();
        await saveCardFile('_system', systemNote);
    }

    render();
    openViewer('_system', card.id);
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
function openEditor(templateName, sectionId, card = null) {
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

    // Set title
    const buttonLabel = template.ui?.button_label || templateName;
    document.getElementById('editorTitle').textContent = isNew ? `New ${buttonLabel}` : `Edit ${buttonLabel}`;

    // Build form body
    const bodyEl = document.getElementById('editorBody');
    bodyEl.innerHTML = '';

    // Section selector (for regular cards, not system notes)
    if (sectionId !== '_system') {
        const sectionGroup = document.createElement('div');
        sectionGroup.className = 'form-group';
        sectionGroup.innerHTML = `
            <label for="editorSection">Section</label>
            <select id="editorSection">
                ${data.sections.map(s => `
                    <option value="${s.id}" ${s.id === sectionId ? 'selected' : ''}>${escapeHtml(s.name)}</option>
                `).join('')}
            </select>
        `;
        bodyEl.appendChild(sectionGroup);

        // Subdirectory selector (if section has subdirectories)
        const section = data.sections.find(s => s.id === sectionId);
        const subdirs = section ? [...new Set(section.items.map(i => i._subdir).filter(Boolean))].sort() : [];
        if (subdirs.length > 0) {
            const subdirGroup = document.createElement('div');
            subdirGroup.className = 'form-group';
            const currentSubdir = card?._subdir || '';
            subdirGroup.innerHTML = `
                <label for="editorSubdir">Subdirectory</label>
                <select id="editorSubdir">
                    <option value="" ${!currentSubdir ? 'selected' : ''}>(root)</option>
                    ${subdirs.map(sd => `
                        <option value="${escapeHtml(sd)}" ${sd === currentSubdir ? 'selected' : ''}>${escapeHtml(sd)}</option>
                    `).join('')}
                </select>
            `;
            bodyEl.appendChild(subdirGroup);
        }
    } else {
        // System section: show location selector using standard subdirectory UI
        // Get subdirs from existing system notes using getSystemSubdir()
        const systemSubdirs = [...new Set(data.systemNotes.map(n => getSystemSubdir(n)))].sort();
        // Ensure all standard locations are available
        const allLocations = [...new Set(['root', '.notebook', '.notebook/templates', ...systemSubdirs])].sort();
        const currentSubdir = card ? getSystemSubdir(card) : 'root';

        const subdirGroup = document.createElement('div');
        subdirGroup.className = 'form-group';
        subdirGroup.innerHTML = `
            <label for="editorSubdir">Location</label>
            <select id="editorSubdir">
                ${allLocations.map(loc => `
                    <option value="${escapeHtml(loc)}" ${loc === currentSubdir ? 'selected' : ''}>${escapeHtml(loc)}</option>
                `).join('')}
            </select>
        `;
        bodyEl.appendChild(subdirGroup);
    }

    // Render each field from template.editor.fields
    const fields = template.editor?.fields || [];
    for (const fieldConfig of fields) {
        const fieldDef = template.schema[fieldConfig.field];
        const value = card ? card[fieldConfig.field] : (fieldDef?.default || '');
        const fieldEl = renderEditorField(fieldConfig, fieldDef, value);
        bodyEl.appendChild(fieldEl);
    }

    // Universal tags field (for all card types except system cards like settings)
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
    document.getElementById('editorSubmitBtn').textContent = isNew ? `Save ${buttonLabel}` : 'Save Changes';

    // Show modal
    document.getElementById('editorModal').classList.add('active');

    // Focus first input
    const firstInput = bodyEl.querySelector('input, textarea');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }

    // Initialize thumbnail upload if present
    initEditorThumbnailUpload();
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
        inputEl.value = value ? value.split('T')[0] : '';
        div.appendChild(inputEl);
    } else if (type === 'datetime') {
        inputEl = document.createElement('input');
        inputEl.type = 'datetime-local';
        inputEl.id = `editor-${field}`;
        inputEl.value = value ? value.slice(0, 16) : '';
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
            row.remove();
            updateListEditorIndices(field);
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

    // Detect if this is the System section (path includes '.')
    const isSystemSection = sectionPathIncludesRoot(record.path);
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

    const advancedLabel = needsAIGrading
        ? 'Advanced (hint, explanation, model answer, rubric)'
        : 'Advanced (hint, explanation)';

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
            preview.innerHTML = renderMarkdownWithLinks(content);
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

    // Get selected section (may have changed)
    const sectionSelect = document.getElementById('editorSection');
    const newSectionId = sectionSelect ? sectionSelect.value : sectionId;

    // Get selected subdirectory (if any)
    const subdirSelect = document.getElementById('editorSubdir');
    const newSubdir = subdirSelect ? (subdirSelect.value || null) : (card._subdir || null);
    cardData._subdir = newSubdir;

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
        // Handle system notes
        if (sectionId === '_system') {
            cardData.system = true;
            const idx = data.systemNotes.findIndex(n => n.id === card.id);
            if (idx >= 0) {
                // Update existing system note
                cardData.filename = card.filename;
                data.systemNotes[idx] = { ...data.systemNotes[idx], ...cardData };
            } else {
                // Add new system note
                data.systemNotes.push(cardData);
            }
            await saveData();
            await saveCardFile('_system', cardData);
            closeEditor();
            render();
            showToast('System note saved');
            return;
        }

        // Handle section change
        if (!isNew && newSectionId !== sectionId) {
            // Remove from old section
            const oldSection = data.sections.find(s => s.id === sectionId);
            if (oldSection) {
                const idx = oldSection.items.findIndex(i => i.id === card.id);
                if (idx >= 0) {
                    oldSection.items.splice(idx, 1);
                    // Delete old file
                    await deleteItemFile(sectionId, card);
                }
            }
            // Add to new section
            const newSection = data.sections.find(s => s.id === newSectionId);
            if (newSection) {
                newSection.items.push(cardData);
            }
        } else {
            // Same section - update or add
            const section = data.sections.find(s => s.id === newSectionId);
            if (section) {
                if (isNew) {
                    section.items.push(cardData);
                } else {
                    const idx = section.items.findIndex(i => i.id === card.id);
                    if (idx >= 0) {
                        // Handle title change (requires file rename)
                        if (card.title && card.title !== cardData.title) {
                            await deleteItemFile(newSectionId, card);
                        }
                        section.items[idx] = cardData;
                    }
                }
            }
        }

        await saveData();
        await saveCardFile(newSectionId, cardData);

        closeEditor();
        render();
        showToast(isNew ? `${template.ui?.button_label || 'Card'} created` : 'Changes saved');

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

// IndexedDB helper functions
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
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

// Load notebook data from filesystem
async function loadFromFilesystem(dirHandle) {
    console.log('[Filesystem] Loading from directory...');

    // Load settings first (handles migration from legacy format)
    await loadSettings(dirHandle);

    // Load extension registry (uses settings.extensions), templates, and authors
    await loadExtensionRegistry(dirHandle);
    await loadTemplates(dirHandle);
    await loadAuthors(dirHandle);

    // Inject template CSS variables and load user theme
    injectTemplateStyles();
    await loadThemeCss(dirHandle);

    const loadedData = {
        title: notebookSettings?.notebook_title || 'Research Notebook',
        subtitle: notebookSettings?.notebook_subtitle || 'Bookmarks, notes, and connections',
        sections: [],
        systemNotes: []
    };

    try {

        // Read system notes:
        // - Config files from .notebook/ (settings.yaml, theme.css, templates/*.yaml)
        // - User files from root (README.md, CLAUDE.md, etc.)

        const excludedExtensions = ['.json', '.html', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];

        // Load config files from .notebook/ directory
        const configDir = await getNotebookConfigDir(dirHandle, false);
        if (configDir) {
            // Load settings.yaml from .notebook/
            try {
                const settingsHandle = await configDir.getFileHandle('settings.yaml');
                const file = await settingsHandle.getFile();
                loadedData.systemNotes.push({
                    template: 'settings',
                    system: true,
                    id: 'system-settings.yaml',
                    filename: '.notebook/settings.yaml',
                    title: 'Settings',
                    notebook_title: notebookSettings?.notebook_title || 'Research Notebook',
                    notebook_subtitle: notebookSettings?.notebook_subtitle || '',
                    sections: notebookSettings?.sections || [],
                    extensions: notebookSettings?.extensions || getDefaultExtensionRegistry(),
                    theme: notebookSettings?.theme || null,
                    default_author: notebookSettings?.default_author || null,
                    authors: notebookSettings?.authors || [],
                    modified: file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString()
                });
                console.log('[Filesystem] Loaded settings card');
            } catch (e) {
                // settings.yaml not found (new notebook)
            }

            // Load theme.css from .notebook/
            try {
                const themeHandle = await configDir.getFileHandle('theme.css');
                const file = await themeHandle.getFile();
                const content = await file.text();
                loadedData.systemNotes.push({
                    template: 'theme',
                    system: true,
                    id: 'system-theme.css',
                    filename: '.notebook/theme.css',
                    title: 'Theme',
                    content: content,
                    modified: file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString()
                });
                console.log('[Filesystem] Loaded theme card');
            } catch (e) {
                // theme.css not found (optional)
            }

            // Load templates from .notebook/templates/
            const templatesDir = await getNotebookTemplatesDir(dirHandle, false);
            if (templatesDir) {
                for await (const [filename, fileHandle] of templatesDir.entries()) {
                    if (fileHandle.kind !== 'file' || !filename.endsWith('.yaml')) continue;
                    try {
                        const file = await fileHandle.getFile();
                        const content = await file.text();
                        const parsed = jsyaml.load(content);
                        const templateName = filename.replace(/\.yaml$/, '');
                        loadedData.systemNotes.push({
                            template: 'template',
                            system: true,
                            id: 'system-' + templateName + '.template.yaml',
                            filename: `.notebook/templates/${filename}`,
                            title: templateName + ' (template)',
                            name: parsed.name || templateName,
                            description: parsed.description || '',
                            schema: parsed.schema || {},
                            card: parsed.card || {},
                            viewer: parsed.viewer || {},
                            editor: parsed.editor || {},
                            style: parsed.style || {},
                            ui: parsed.ui || {},
                            modified: file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString()
                        });
                        console.log(`[Filesystem] Loaded template: ${templateName}`);
                    } catch (e) {
                        console.error(`[Filesystem] Error parsing template ${filename}:`, e);
                    }
                }
            }
        }

        // Read user files from root directory (README.md, CLAUDE.md, etc.)
        // Config files (settings.yaml, theme.css, *.template.yaml) are only in .notebook/
        for await (const [filename, fileHandle] of dirHandle.entries()) {
            if (fileHandle.kind !== 'file') continue;

            // Skip files with excluded extensions
            if (excludedExtensions.some(ext => filename.endsWith(ext))) continue;

            // Skip all dotfiles (hidden files)
            if (filename.startsWith('.')) continue;

            // Skip config files - they belong in .notebook/ only
            if (filename === 'settings.yaml') continue;
            if (filename === 'theme.css') continue;
            if (filename.endsWith('.template.yaml')) continue;

            try {
                const file = await fileHandle.getFile();
                const content = await file.text();

                // User files at root (README.md, CLAUDE.md, etc.)
                const isMarkdown = filename.endsWith('.md');
                const isYaml = filename.endsWith('.yaml');
                let titleFromFilename = filename;
                if (isMarkdown) titleFromFilename = filename.replace(/\.md$/, '');
                else if (isYaml) titleFromFilename = filename.replace(/\.yaml$/, '');

                let format = 'text';
                if (isMarkdown) format = 'markdown';
                else if (isYaml) format = 'yaml';

                loadedData.systemNotes.push({
                    type: 'note',
                    system: true,
                    id: 'system-' + filename,
                    filename: filename,
                    title: titleFromFilename,
                    content: content,
                    format: format,
                    modified: file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString()
                });
                console.log(`[Filesystem] Loaded system note: ${filename} (${format})`);
            } catch (e) {
                console.error(`[Filesystem] Error reading system note ${filename}:`, e);
            }
        }

        // Helper function to load cards from a section directory
        // subdir parameter is for one-level-deep subdirectory loading
        async function loadSectionItems(sectionHandle, sectionDirName, subdir = null) {
            const items = [];

            // First pass: collect all files, directories, and identify companion files
            const files = {};
            const subdirs = {};
            const companionFiles = {};
            for await (const [name, handle] of sectionHandle.entries()) {
                if (name.startsWith('_') || name.startsWith('.')) continue;  // Skip metadata/hidden files

                if (handle.kind === 'directory') {
                    // Only process subdirectories from root level (one level deep)
                    if (!subdir) {
                        subdirs[name] = handle;
                    }
                    continue;
                }

                if (handle.kind !== 'file') continue;

                // Check if this is a companion file (e.g., .output.html)
                let isCompanion = false;
                for (const ext of Object.keys(extensionRegistry)) {
                    const config = extensionRegistry[ext];
                    if (config.companionFiles) {
                        for (const companion of config.companionFiles) {
                            if (name.endsWith(companion.suffix)) {
                                // Store companion content by base filename
                                const baseFilename = name.slice(0, -companion.suffix.length) + ext;
                                if (!companionFiles[baseFilename]) companionFiles[baseFilename] = {};
                                try {
                                    const file = await handle.getFile();
                                    companionFiles[baseFilename][companion.field] = await file.text();
                                } catch (e) {
                                    console.warn(`[Filesystem] Error reading companion file ${name}:`, e);
                                }
                                isCompanion = true;
                                break;
                            }
                        }
                    }
                    if (isCompanion) break;
                }

                if (!isCompanion) {
                    files[name] = handle;
                }
            }

            // Second pass: load cards with their companion data
            for (const [filename, fileHandle] of Object.entries(files)) {
                try {
                    const file = await fileHandle.getFile();
                    const content = await file.text();

                    // Get companion data for this file
                    const companionData = companionFiles[filename] || {};

                    // Special handling for bookmarks: load thumbnail from assets
                    if (filename.endsWith('.bookmark.json')) {
                        try {
                            const bookmarkData = JSON.parse(content);
                            if (bookmarkData.thumbnail && !bookmarkData.thumbnail.startsWith('data:')) {
                                // It's a file path, need to load the actual image
                                try {
                                    const assetsDir = await dirHandle.getDirectoryHandle('assets');
                                    const thumbsDir = await assetsDir.getDirectoryHandle('thumbnails');
                                    const thumbFilename = bookmarkData.thumbnail.split('/').pop();
                                    const thumbHandle = await thumbsDir.getFileHandle(thumbFilename);
                                    const thumbFile = await thumbHandle.getFile();

                                    const reader = new FileReader();
                                    companionData.thumbnail = await new Promise((resolve, reject) => {
                                        reader.onload = () => resolve(reader.result);
                                        reader.onerror = reject;
                                        reader.readAsDataURL(thumbFile);
                                    });
                                } catch (e) {
                                    console.warn(`[Filesystem] Could not load thumbnail ${bookmarkData.thumbnail}:`, e);
                                }
                            }
                        } catch (e) {
                            // JSON parse error, will be caught below
                        }
                    }

                    // Check for image files (need binary reading, not text)
                    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
                    const isImage = imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));

                    if (isImage) {
                        // Read image as data URL
                        const reader = new FileReader();
                        const dataUrl = await new Promise((resolve, reject) => {
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                        });

                        // Format filesize for display
                        const formatFileSize = (bytes) => {
                            if (bytes < 1024) return bytes + ' B';
                            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                        };

                        // Build relative path: section/subdir/filename or section/filename
                        const relativePath = subdir
                            ? `${sectionDirName}/${subdir}/${filename}`
                            : `${sectionDirName}/${filename}`;

                        // Create image card directly (no frontmatter to parse)
                        const card = {
                            id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            template: 'image',
                            type: 'image',
                            title: filename,  // Full filename with extension
                            path: relativePath,  // Relative path for referencing
                            filesize: formatFileSize(file.size),
                            src: dataUrl,
                            _subdir: subdir,  // Track subdirectory
                            _source: {
                                filename,
                                format: filename.toLowerCase().endsWith('.svg') ? 'text-image' : 'binary-image',
                                section: sectionDirName,
                                subdir: subdir,
                                extension: filename.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
                            },
                            _fileModified: file.lastModified,
                            modified: file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString()
                        };
                        items.push(card);
                        console.log(`[Filesystem] Loaded image: ${subdir ? subdir + '/' : ''}${filename}`);
                        continue;
                    }

                    // Use generic loadCard function
                    const card = loadCard(filename, content, sectionDirName, companionData);
                    if (card) {
                        // Apply thumbnail from companion data if loaded
                        if (companionData.thumbnail) {
                            card.thumbnail = companionData.thumbnail;
                        }
                        // Store subdirectory and file modified time
                        card._subdir = subdir;
                        if (card._source) {
                            card._source.subdir = subdir;
                        }
                        card._fileModified = file.lastModified;
                        items.push(card);
                    }
                } catch (e) {
                    console.error(`[Filesystem] Error reading ${filename}:`, e);
                }
            }

            // Third pass: recursively load from subdirectories (one level only)
            for (const [subdirName, subdirHandle] of Object.entries(subdirs)) {
                const subdirItems = await loadSectionItems(subdirHandle, sectionDirName, subdirName);
                items.push(...subdirItems);
                if (subdirItems.length > 0) {
                    console.log(`[Filesystem] Loaded ${subdirItems.length} items from ${sectionDirName}/${subdirName}/`);
                }
            }

            return items;
        }

        // Discover section directories at root (excluding reserved names)
        const discoveredSections = new Map(); // dirName -> { handle }

        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind !== 'directory') continue;
            if (name.startsWith('.') || name.startsWith('_')) continue;  // Skip dotfiles/dotdirs and underscore-prefixed
            if (RESERVED_DIRECTORIES.has(name)) continue;

            discoveredSections.set(name, { handle });
        }

        console.log(`[Filesystem] Discovered ${discoveredSections.size} section directories`);

        // Load sections and match to settings
        // Filter out System section (path includes '.') and legacy _system - they're virtual, not directories
        const sectionsFromSettings = (notebookSettings?.sections || []).filter(s => {
            if (typeof s === 'string') return !s.startsWith('_');
            if (sectionPathIncludesRoot(s.path)) return false; // System section (root files)
            return s.name && !s.name.startsWith('_');
        });

        // Build lookup maps for matching directories to settings
        const settingsByPath = new Map(); // path -> settings record
        const settingsBySlug = new Map(); // slugified name -> settings record
        sectionsFromSettings.forEach((s, i) => {
            if (typeof s === 'object') {
                // Use explicit path if provided, otherwise slugified name
                const path = s.path || slugify(s.name);
                settingsByPath.set(path, { record: s, index: i });
                settingsBySlug.set(slugify(s.name), { record: s, index: i });
            } else {
                settingsBySlug.set(slugify(s), { record: s, index: i });
            }
        });

        // Track which settings entries we've matched
        const matchedSettings = new Set();

        for (const [dirName, { handle }] of discoveredSections) {
            // Special defaults for known directories
            const knownDirectoryDefaults = {
                'assets': { name: 'Assets', visible: false }
            };
            const defaults = knownDirectoryDefaults[dirName] || { name: dirName, visible: true };

            const section = {
                id: 'section-' + dirName,  // Stable ID based on directory name
                name: defaults.name,  // Default to directory name (or known name)
                items: [],
                visible: defaults.visible,  // Default visible (or known default)
                _dirName: dirName  // Store for filesystem operations
            };

            // Try to match to settings by path first, then by slugified name
            let settingsMatch = settingsByPath.get(dirName);
            if (!settingsMatch) {
                settingsMatch = settingsBySlug.get(slugify(dirName));
            }

            if (settingsMatch) {
                const { record: settingsRecord, index } = settingsMatch;
                matchedSettings.add(settingsRecord);
                if (typeof settingsRecord === 'object') {
                    // Use display name from settings
                    section.name = settingsRecord.name || defaults.name;
                    section.visible = settingsRecord.visible !== false;
                    section._settingsIndex = index;
                }
            }

            // Load items from the section
            section.items = await loadSectionItems(handle, dirName);

            // Sort items by modified date (newest first)
            section.items.sort((a, b) => {
                const aTime = a._fileModified || 0;
                const bTime = b._fileModified || 0;
                return bTime - aTime;
            });

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

            const name = typeof settingsRecord === 'string' ? settingsRecord : settingsRecord.name;
            if (!name) continue;

            // Use explicit path if provided, otherwise slugify name
            const dirName = (typeof settingsRecord === 'object' && settingsRecord.path)
                ? settingsRecord.path
                : slugify(name);
            console.log(`[Filesystem] Section "${name}" in settings has no directory, will create: ${dirName}/`);

            // Create empty section - directory will be created on first save
            const section = {
                id: 'section-' + dirName,  // Stable ID based on directory name
                name: name,
                items: [],
                visible: typeof settingsRecord === 'object' ? settingsRecord.visible !== false : true,
                _dirName: dirName,
                _needsDirectory: true  // Flag to create directory on save
            };
            loadedData.sections.push(section);
        }

        // Update the settings card to reflect discovered sections
        // (The card was created before section discovery, so it may be out of sync)
        const settingsCard = loadedData.systemNotes.find(n => n.template === 'settings');
        if (settingsCard) {
            settingsCard.sections = loadedData.sections.map(s => ({
                name: s.name,
                path: s._dirName || slugify(s.name),
                visible: s.visible !== false
            }));
            // Ensure System section (root files, path includes '.') is included
            if (!settingsCard.sections.some(s => sectionPathIncludesRoot(s.path))) {
                // Check original settings for visibility preference and path
                const originalSystem = notebookSettings?.sections?.find(s =>
                    typeof s === 'object' && sectionPathIncludesRoot(s.path)
                );
                const visible = originalSystem?.visible === true;
                const path = originalSystem?.path || '.';
                settingsCard.sections.push({ name: 'System', path, visible });
            }
        }

        // Create template files for card types that exist but don't have template files
        // This supports customization without auto-creating templates for empty types
        await ensureTemplatesForExistingCards(dirHandle, loadedData);

        return loadedData;

    } catch (error) {
        console.error('[Filesystem] Error loading from filesystem:', error);
        throw error;
    }
}

// Save notebook data to filesystem
async function saveToFilesystem(dirHandle) {
    console.log('[Filesystem] Saving to directory...');

    try {
        // Update and save settings.yaml
        notebookSettings = {
            notebook_title: data.title,
            notebook_subtitle: data.subtitle,
            // Save display names (not slugs) - directory mapping is by slugified name
            sections: data.sections.map(s => ({ name: s.name, visible: s.visible !== false })),
            extensions: notebookSettings?.extensions || getDefaultExtensionRegistry(),
            theme: notebookSettings?.theme || null
        };
        await saveSettings(dirHandle);

        // Note: README.md and CLAUDE.md are not auto-created
        // Users should provide these by forking from a demo notebook

        // Create assets/thumbnails directory
        const assetsDir = await dirHandle.getDirectoryHandle('assets', { create: true });
        await assetsDir.getDirectoryHandle('thumbnails', { create: true });

        // Note: Section directories are created by createSectionDir() after this function
        // Card files are saved incrementally by saveCardFile()

        // Write system notes (text files at root)
        if (data.systemNotes) {
            for (const note of data.systemNotes) {
                // For raw text/yaml notes, preserve original filename
                // For markdown notes, use title + .md
                const newFilename = (note.format === 'text' || note.format === 'yaml') ? note.filename : (note.title + '.md');
                const oldFilename = note.filename;

                // If filename changed (markdown notes only), delete old file
                if (oldFilename && oldFilename !== newFilename) {
                    try {
                        await dirHandle.removeEntry(oldFilename);
                        console.log(`[Filesystem] Deleted old system note: ${oldFilename}`);
                    } catch (e) {
                        // Old file might not exist
                    }
                }

                // Write with filename
                const fileHandle = await dirHandle.getFileHandle(newFilename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(note.content);
                await writable.close();

                // Update filename in note object
                note.filename = newFilename;
                note.id = 'system-' + newFilename;
            }
        }

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
    if (!filesystemLinked || !notebookDirHandle) return;

    // Update notebookSettings with current data, preserving existing settings
    notebookSettings = buildSettingsObject({
        ...notebookSettings,
        notebook_title: data.title,
        notebook_subtitle: data.subtitle,
        // Save display names (not slugs) - directory mapping is by slugified name
        sections: data.sections.map(s => ({ name: s.name, visible: s.visible !== false }))
    });
    await saveSettings(notebookDirHandle);
    recordSave('settings.yaml');
}

// Generic card save function using template system
async function saveCardFile(sectionId, card) {
    if (!filesystemLinked || !notebookDirHandle) return;

    // Settings card is handled specially
    if (card.template === 'settings' || card.filename === 'settings.yaml') {
        // Update notebookSettings from the card fields
        notebookSettings = buildSettingsObject({
            notebook_title: card.notebook_title,
            notebook_subtitle: card.notebook_subtitle,
            sections: card.sections || notebookSettings?.sections,
            default_author: card.default_author,
            authors: card.authors,
            extensions: card.extensions || notebookSettings?.extensions,
            theme: card.theme
        });
        // Also update data.title/subtitle so UI reflects changes
        data.title = notebookSettings.notebook_title;
        data.subtitle = notebookSettings.notebook_subtitle;
        // Update extension registry
        extensionRegistry = notebookSettings.extensions;
        // Reload author registry with new authors
        await loadAuthors(notebookDirHandle);

        // Reorder data.sections to match the new order from settings
        // card.sections is now an array of {name, path, visible} records
        if (card.sections && Array.isArray(card.sections)) {
            const newOrder = [];
            for (const sectionRecord of card.sections) {
                const sectionName = typeof sectionRecord === 'string' ? sectionRecord : sectionRecord.name;
                if (!sectionName) continue;

                // Skip System section (path includes '.') - it's virtual, not a directory
                if (typeof sectionRecord === 'object' && sectionPathIncludesRoot(sectionRecord.path)) continue;

                // Find section by matching path, slug, or name
                const sectionPath = typeof sectionRecord === 'object' ? sectionRecord.path : null;
                const sectionSlug = sectionPath || slugify(sectionName);
                let section = data.sections.find(s =>
                    s._dirName === sectionSlug || slugify(s.name) === sectionSlug
                );

                if (section) {
                    // Apply visibility from settings record
                    if (typeof sectionRecord === 'object') {
                        section.visible = sectionRecord.visible !== false;
                    }
                    // Update display name if changed
                    section.name = sectionName;
                    newOrder.push(section);
                } else {
                    // New section added via settings - create it
                    const newSection = {
                        id: 'section-' + sectionSlug,  // Stable ID based on directory name
                        name: sectionName,
                        items: [],
                        visible: typeof sectionRecord === 'object' ? sectionRecord.visible !== false : true,
                        _dirName: sectionSlug,
                        _needsDirectory: true
                    };
                    // Create directory immediately
                    try {
                        await notebookDirHandle.getDirectoryHandle(sectionSlug, { create: true });
                        newSection._needsDirectory = false;
                        console.log(`[Filesystem] Created section directory: ${sectionSlug}/`);
                    } catch (e) {
                        console.error('[Filesystem] Error creating section directory:', e);
                    }
                    newOrder.push(newSection);
                }
            }
            // Add any sections not in the list (shouldn't happen, but safety)
            for (const section of data.sections) {
                if (!newOrder.includes(section)) {
                    newOrder.push(section);
                }
            }
            data.sections = newOrder;
        }

        await saveSettings(notebookDirHandle);
        // Reload theme in case base theme changed
        await loadThemeCss(notebookDirHandle);
        card.filename = '.notebook/settings.yaml';
        card.id = 'system-settings.yaml';
        recordSave('.notebook/settings.yaml');
        console.log('[Filesystem] Saved .notebook/settings.yaml');
        return;
    }

    // Template cards - save to .notebook/templates/{name}.yaml
    if (card.template === 'template') {
        // Reconstruct the template object from card fields
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

        // Always save to .notebook/templates/
        const templatesDir = await getNotebookTemplatesDir(notebookDirHandle, true);
        const templateFilename = (card.name || 'custom') + '.yaml';
        const fileHandle = await templatesDir.getFileHandle(templateFilename, { create: true });
        const savedPath = `.notebook/templates/${templateFilename}`;

        const writable = await fileHandle.createWritable();
        await writable.write(yamlContent);
        await writable.close();

        card.filename = savedPath;
        card.id = 'system-' + card.name + '.template.yaml';

        // Reload the template into the registry
        templateRegistry[card.name] = templateObj;

        recordSave(savedPath);
        console.log('[Filesystem] Saved template:', savedPath);
        return;
    }

    // Theme card - save to .notebook/theme.css
    if (card.template === 'theme') {
        const configDir = await getNotebookConfigDir(notebookDirHandle, true);
        const fileHandle = await configDir.getFileHandle('theme.css', { create: true });
        const savedPath = '.notebook/theme.css';

        const writable = await fileHandle.createWritable();
        await writable.write(card.content);
        await writable.close();

        card.filename = savedPath;
        card.id = 'system-theme.css';

        // Reload the theme CSS into the page
        await loadThemeCss(notebookDirHandle);

        recordSave(savedPath);
        console.log('[Filesystem] Saved theme');
        return;
    }

    // System notes are handled specially (saved with raw content)
    if (sectionId === '_system' && card.system) {
        const baseFilename = card.filename
            ? card.filename.split('/').pop()  // Get just the filename part if path included
            : (card.title + '.md');

        let targetDir, savedPath;

        // Handle location selection: 'root', '.notebook', '.notebook/templates', or null
        if (card._subdir === '.notebook/templates') {
            // Save to .notebook/templates/ directory
            targetDir = await getNotebookTemplatesDir(notebookDirHandle, true);
            savedPath = `.notebook/templates/${baseFilename}`;
        } else if (card._subdir === '.notebook') {
            // Save to .notebook/ directory
            targetDir = await getNotebookConfigDir(notebookDirHandle, true);
            savedPath = `.notebook/${baseFilename}`;
        } else {
            // Save to root (includes 'root' value and null/undefined)
            targetDir = notebookDirHandle;
            savedPath = baseFilename;
        }

        const fileHandle = await targetDir.getFileHandle(baseFilename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(card.content);
        await writable.close();
        card.filename = savedPath;
        card.id = 'system-' + savedPath.replace('/', '-');
        recordSave(savedPath);
        console.log('[Filesystem] Saved system note:', savedPath);
        return;
    }

    const section = data.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Get or create section directory (new sections go to root, existing preserve location)
    let sectionDir, sectionPath;
    if (section._needsDirectory) {
        // New section - create at root
        const sectionSlug = slugify(section.name);
        sectionDir = await notebookDirHandle.getDirectoryHandle(sectionSlug, { create: true });
        sectionPath = sectionSlug;
        section._dirName = sectionSlug;
        delete section._needsDirectory;
        console.log(`[Filesystem] Created section directory: ${sectionSlug}/`);
    } else {
        // Existing section - use getSectionDirHandle to find it
        const sectionInfo = await getSectionDirHandle(section, { create: true });
        if (!sectionInfo) {
            console.error('[Filesystem] Cannot get section directory for', section.name);
            return;
        }
        sectionDir = sectionInfo.handle;
        sectionPath = sectionInfo.path;
    }

    // Handle subdirectory if specified
    if (card._subdir) {
        sectionDir = await sectionDir.getDirectoryHandle(card._subdir, { create: true });
        sectionPath = `${sectionPath}/${card._subdir}`;
    }

    // Use serializeCard to get the file content and extension
    const { content, extension, format } = serializeCard(card);

    // Preserve original filename if card was loaded from filesystem
    // Otherwise derive from title (for new cards)
    let baseFilename;
    if (card._source?.filename) {
        // Strip extension from original filename to get base
        const origFilename = card._source.filename;
        if (origFilename.endsWith(extension)) {
            baseFilename = origFilename.slice(0, -extension.length);
        } else {
            // Extension changed or doesn't match - use original without any known extension
            baseFilename = origFilename.replace(/\.(md|code\.py|bookmark\.json|card\.yaml)$/, '');
        }
    } else {
        baseFilename = slugify(card.title);
    }

    // Special handling for bookmarks: save thumbnail to assets folder
    if ((card.type === 'bookmark' || card.template === 'bookmark') && card.thumbnail && card.thumbnail.startsWith('data:')) {
        const assetsDir = await notebookDirHandle.getDirectoryHandle('assets', { create: true });
        const thumbsDir = await assetsDir.getDirectoryHandle('thumbnails', { create: true });
        const thumbFilename = `${card.id || baseFilename}.png`;
        // Relative path depends on section location
        const depth = sectionPath.split('/').length;
        const thumbnailPath = '../'.repeat(depth) + `assets/thumbnails/${thumbFilename}`;

        try {
            const response = await fetch(card.thumbnail);
            const blob = await response.blob();
            const thumbHandle = await thumbsDir.getFileHandle(thumbFilename, { create: true });
            const thumbWritable = await thumbHandle.createWritable();
            await thumbWritable.write(blob);
            await thumbWritable.close();
            recordSave(`assets/thumbnails/${thumbFilename}`);

            // Update the serialized content to use path instead of data URL
            const bookmarkJson = JSON.parse(content);
            bookmarkJson.thumbnail = thumbnailPath;
            const updatedContent = JSON.stringify(bookmarkJson, null, 2);

            const filename = `${baseFilename}${extension}`;
            const fileHandle = await sectionDir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(updatedContent);
            await writable.close();
            recordSave(`${sectionPath}/${filename}`);
            return;
        } catch (e) {
            console.error('[Filesystem] Error saving thumbnail:', e);
        }
    }

    // Write main card file
    const filename = `${baseFilename}${extension}`;
    const fileHandle = await sectionDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    recordSave(`${sectionPath}/${filename}`);

    // Handle companion files based on extension registry
    const extConfig = extensionRegistry[extension];
    if (extConfig?.companionFiles) {
        for (const companion of extConfig.companionFiles) {
            const fieldValue = card[companion.field];
            if (fieldValue) {
                const companionFilename = `${baseFilename}${companion.suffix}`;
                const companionHandle = await sectionDir.getFileHandle(companionFilename, { create: true });
                const companionWritable = await companionHandle.createWritable();
                await companionWritable.write(fieldValue);
                await companionWritable.close();
                recordSave(`${sectionPath}/${companionFilename}`);
            }
        }
    }
}

// Get section directory handle at notebook root
// Returns { handle, path } where path is relative to notebook root
async function getSectionDirHandle(sectionOrName, options = {}) {
    if (!filesystemLinked || !notebookDirHandle) return null;

    const section = typeof sectionOrName === 'string'
        ? data.sections.find(s => s.name === sectionOrName || s.id === sectionOrName)
        : sectionOrName;

    // Use stored _dirName if available (from filesystem load), otherwise slugify name
    const sectionSlug = section?._dirName || slugify(section?.name || sectionOrName);

    const handle = await notebookDirHandle.getDirectoryHandle(sectionSlug, options);
    return { handle, path: sectionSlug };
}

// Create a new section directory at notebook root
async function createSectionDir(section) {
    if (!filesystemLinked || !notebookDirHandle) return;

    const sectionSlug = slugify(section.name);
    // Create directory at root (not under sections/)
    await notebookDirHandle.getDirectoryHandle(sectionSlug, { create: true });
    console.log(`[Filesystem] Created section directory: ${sectionSlug}/`);
    recordSave(`${sectionSlug}`);
}

// Delete a section directory at notebook root
async function deleteSectionDir(sectionName) {
    if (!filesystemLinked || !notebookDirHandle) return;

    const sectionSlug = slugify(sectionName);

    try {
        await notebookDirHandle.removeEntry(sectionSlug, { recursive: true });
        recordSave(sectionSlug);
        console.log(`[Filesystem] Deleted section directory: ${sectionSlug}/`);
    } catch (e) {
        console.error('[Filesystem] Error deleting section dir:', e);
    }
}

// Delete a single item file
async function deleteItemFile(sectionId, item) {
    if (!filesystemLinked || !notebookDirHandle) return;

    try {
        const section = data.sections.find(s => s.id === sectionId);
        if (!section) return;

        const sectionInfo = await getSectionDirHandle(section);
        if (!sectionInfo) return;
        const { handle: sectionDir, path: sectionPath } = sectionInfo;

        // Support both legacy type field and new template field (Phase 3)
        const itemType = item.template || item.type;

        // Use stored _filename if available (from filesystem load), otherwise derive from title
        // This handles cases where filename doesn't match slugify(title)
        if (itemType === 'note') {
            const filename = item._filename || `${slugify(item.title)}.md`;
            await sectionDir.removeEntry(filename);
            recordSave(`${sectionPath}/${filename}`);
        } else if (itemType === 'code') {
            const baseFilename = item._filename || slugify(item.title);
            const filename = `${baseFilename}.code.py`;
            await sectionDir.removeEntry(filename);
            recordSave(`${sectionPath}/${filename}`);
            try {
                const outputFilename = `${baseFilename}.output.html`;
                await sectionDir.removeEntry(outputFilename);
                recordSave(`${sectionPath}/${outputFilename}`);
            } catch (e) { /* output might not exist */ }
        } else if (itemType === 'bookmark') {
            const baseFilename = item._filename || slugify(item.title);
            const filename = `${baseFilename}.bookmark.json`;
            await sectionDir.removeEntry(filename);
            recordSave(`${sectionPath}/${filename}`);
        }
    } catch (e) {
        console.error('[Filesystem] Error deleting item file:', e);
    }
}

// Rename a section directory at notebook root
async function renameSectionDir(oldName, newName, section) {
    if (!filesystemLinked || !notebookDirHandle) return;

    const oldSlug = slugify(oldName);
    const newSlug = slugify(newName);
    if (oldSlug === newSlug) return; // No actual rename needed

    try {
        // Find the old directory
        const oldInfo = await getSectionDirHandle(section);
        if (!oldInfo) {
            console.error('[Filesystem] Cannot find section to rename:', oldName);
            return;
        }
        const { handle: oldDir, path: oldPath } = oldInfo;

        // Create new directory
        const newDir = await notebookDirHandle.getDirectoryHandle(newSlug, { create: true });

        // Copy all files from old to new
        for await (const [name, handle] of oldDir.entries()) {
            if (handle.kind === 'file') {
                const file = await handle.getFile();
                const newFile = await newDir.getFileHandle(name, { create: true });
                const writable = await newFile.createWritable();
                await writable.write(await file.arrayBuffer());
                await writable.close();
                recordSave(`${newSlug}/${name}`);
            }
        }

        // Delete old directory
        await notebookDirHandle.removeEntry(oldSlug, { recursive: true });
        recordSave(oldPath);

        // Update section's internal tracking
        section._dirName = newSlug;

        console.log(`[Filesystem] Renamed section: ${oldPath}/ -> ${newSlug}/`);
    } catch (e) {
        console.error('[Filesystem] Error renaming section dir:', e);
    }
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

        // Save handle for persistence
        await saveDirHandle(handle);
        notebookDirHandle = handle;
        filesystemLinked = true;

        // Check if directory has existing content (sections or .notebook/settings.yaml)
        let hasContent = false;
        for await (const [name, entry] of handle.entries()) {
            if (entry.kind === 'directory' &&
                !name.startsWith('.') &&
                !RESERVED_DIRECTORIES.has(name)) {
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
            const fsData = await loadFromFilesystem(handle);
            data = fsData;
            restoreCollapsedSections();
            render();
            showToast(`📁 Linked to folder (loaded ${data.sections.length} sections)`);
        } else {
            // New notebook: start empty, user adds sections via Add Section button
            data.sections = [];
            data.systemNotes = [];  // Clear system notes from previous notebook
            await saveToFilesystem(handle);
            await ensureTemplateFiles(handle);  // Create template files for new notebooks
            // Reload to pick up the newly created system notes
            const fsData = await loadFromFilesystem(handle);
            data = fsData;
            restoreCollapsedSections();
            render();
            showToast('📁 Linked to folder (new notebook created)');
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
            filesystemLinked = true;
            console.log(`[Filesystem] Restored link to folder: ${savedHandle.name}`);

            // Load data from filesystem
            try {
                const fsData = await loadFromFilesystem(savedHandle);
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
    if (!filesystemLinked || !notebookDirHandle) {
        console.log('[Observer] Cannot reload - no folder linked');
        return;
    }

    isReloadingFromFilesystem = true;

    try {
        console.log('[Observer] Reloading from filesystem...');
        const fsData = await loadFromFilesystem(notebookDirHandle);
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
    // Find the settings card in systemNotes
    let settingsCard = data.systemNotes?.find(n => n.template === 'settings' || n.filename === 'settings.yaml');

    // If no settings card exists, create one with current values
    if (!settingsCard) {
        settingsCard = {
            template: 'settings',
            system: true,
            id: 'system-settings.yaml',
            filename: 'settings.yaml',
            title: 'Settings',
            notebook_title: data.title || 'Research Notebook',
            notebook_subtitle: data.subtitle || '',
            sections: data.sections.map(s => ({ name: slugify(s.name), visible: s.visible !== false })),
            extensions: notebookSettings?.extensions || getDefaultExtensionRegistry(),
            theme: notebookSettings?.theme || null,
            modified: new Date().toISOString()
        };
        // Add to systemNotes so it appears in the list
        if (!data.systemNotes) data.systemNotes = [];
        data.systemNotes.unshift(settingsCard);
    }

    // Open the generic editor with the settings card
    openEditor('settings', '_system', settingsCard);
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
    if (!filesystemLinked || !notebookDirHandle) {
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
function renderMarkdownWithLinks(text, containerId = null) {
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
    
    return html;
}

// Render preview for note cards (truncated, with clickable links)
function renderNotePreview(text, format = 'markdown', maxLength = 1200) {
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

    return renderMarkdownWithLinks(truncated);
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
            targetSectionName = section.name ? section.name.toLowerCase() : null;
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

// Toggle section collapsed state
function toggleSection(sectionId) {
    if (collapsedSections.has(sectionId)) {
        collapsedSections.delete(sectionId);
    } else {
        collapsedSections.add(sectionId);
    }
    saveCollapsedSections();
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
function confirmDeleteItem(sectionId, itemId, itemType) {
    if (confirm(`Delete this ${itemType}?`)) {
        deleteItem(sectionId, itemId);
    }
}

// Delete section
async function deleteSection(sectionId) {
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

// Update section name
async function updateSectionName(sectionId, newName) {
    const section = data.sections.find(s => s.id === sectionId);
    if (section && newName.trim()) {
        const oldName = section.name;
        section.name = newName.trim();
        await saveData();
        await saveNotebookMeta();  // Update settings.yaml with new section list
        await renameSectionDir(oldName, newName.trim(), section);  // Rename directory
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
    // Get templates sorted by sort_order
    const templates = Object.values(templateRegistry)
        .filter(t => t.ui?.show_create_button !== false)
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

// Helper: render items grouped by subdirectory with subsection headers
// getSubdir is a function that extracts subdirectory from an item
function renderItemsWithSubsections(items, sectionId, getSubdir = item => item._subdir || null) {
    if (items.length === 0) {
        return '<p style="color: var(--text-muted); grid-column: 1/-1;">No items yet. Add a bookmark, note, or code!</p>';
    }

    // Group items by subdirectory
    const itemsBySubdir = new Map();
    items.forEach(item => {
        const subdir = getSubdir(item);
        if (!itemsBySubdir.has(subdir)) {
            itemsBySubdir.set(subdir, []);
        }
        itemsBySubdir.get(subdir).push(item);
    });

    // Sort items within each group by modified date
    const sortByModified = (a, b) => {
        const aTime = a.modified ? new Date(a.modified).getTime() : 0;
        const bTime = b.modified ? new Date(b.modified).getTime() : 0;
        return bTime - aTime;
    };

    // Build HTML with subsection headers
    let html = '';

    // Render root items first (no subdirectory)
    const rootItems = itemsBySubdir.get(null) || [];
    if (rootItems.length > 0) {
        html += rootItems.sort(sortByModified).map(item => renderCard(sectionId, item)).join('');
    }

    // Render each subdirectory group with a header
    // Sort alphabetically, but put 'root' first (for System section)
    const subdirs = [...itemsBySubdir.keys()].filter(k => k !== null).sort((a, b) => {
        if (a === 'root') return -1;
        if (b === 'root') return 1;
        return a.localeCompare(b);
    });
    for (const subdir of subdirs) {
        const subdirItems = itemsBySubdir.get(subdir);
        if (subdirItems.length > 0) {
            html += `<div class="subsection-header">${escapeHtml(subdir)}</div>`;
            html += subdirItems.sort(sortByModified).map(item => renderCard(sectionId, item)).join('');
        }
    }

    return html;
}

// Helper: derive subdirectory from system note filename
function getSystemSubdir(note) {
    const filename = note.filename || '';
    if (filename.startsWith('.notebook/templates/')) return '.notebook/templates';
    if (filename.startsWith('.notebook/')) return '.notebook';
    return 'root';  // Root files (CLAUDE.md, README.md, etc.)
}

// Render the UI
function render() {
    // Update header and page title with current title and subtitle
    const title = data.title || 'Research Notebook';
    document.getElementById('headerTitle').textContent = title;
    document.getElementById('headerSubtitle').textContent = data.subtitle || 'Bookmarks, notes, and connections';
    document.title = title;

    const content = document.getElementById('content');

    // Filter sections by visibility
    const visibleSections = data.sections.filter(s => s.visible !== false);

    // Check if _system section is visible (from settings)
    const systemSectionVisible = getSystemSectionVisible();
    const hasSystemNotes = systemSectionVisible && data.systemNotes && data.systemNotes.length > 0;

    if (visibleSections.length === 0 && !hasSystemNotes) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <h2>Your research notebook awaits</h2>
                <p>Create a section to start organizing your bookmarks and notes</p>
            </div>
        `;
        return;
    }

    let sectionsHtml = visibleSections.map(section => {
        const isCollapsed = collapsedSections.has(section.id);
        const itemCount = section.items.length;

        return `
        <div class="section" data-section-id="${section.id}">
            ${itemCount === 0 ? `<button class="section-delete" onclick="deleteSection('${section.id}')" title="Delete empty section">×</button>` : ''}
            <div class="section-header">
                <button class="section-toggle ${isCollapsed ? 'collapsed' : ''}" onclick="toggleSection('${section.id}')" title="${isCollapsed ? 'Expand' : 'Collapse'}">▼</button>
                <h2 class="section-title">
                    <input type="text" value="${escapeHtml(section.name)}"
                        onchange="updateSectionName('${section.id}', this.value)"
                        onblur="updateSectionName('${section.id}', this.value)">
                    ${isCollapsed && itemCount > 0 ? `<span class="section-count">(${itemCount})</span>` : ''}
                </h2>
                <div class="section-actions">
                    ${renderTemplateButtons(section.id)}
                </div>
            </div>
            <div class="items-grid ${isCollapsed ? 'collapsed' : ''}">
                ${renderItemsWithSubsections(section.items, section.id)}
            </div>
        </div>
    `}).join('');

    // Add System section if enabled and has notes
    if (hasSystemNotes) {
        const isCollapsed = collapsedSections.has('_system');
        const itemCount = data.systemNotes.length;

        sectionsHtml += `
        <div class="section section-system" data-section-id="_system">
            <div class="section-header">
                <button class="section-toggle ${isCollapsed ? 'collapsed' : ''}" onclick="toggleSection('_system')" title="${isCollapsed ? 'Expand' : 'Collapse'}">▼</button>
                <h2 class="section-title">
                    <span style="color: var(--text-muted);">System</span>
                    ${isCollapsed && itemCount > 0 ? `<span class="section-count">(${itemCount})</span>` : ''}
                </h2>
                <div class="section-actions">
                    <button class="btn btn-note btn-small" onclick="openEditor('note', '_system')">
                        + Note
                    </button>
                </div>
            </div>
            <div class="items-grid ${isCollapsed ? 'collapsed' : ''}">
                ${renderItemsWithSubsections(data.systemNotes, '_system', getSystemSubdir)}
            </div>
        </div>
        `;
    }

    content.innerHTML = sectionsHtml;

    // Apply syntax highlighting only to unhighlighted code blocks
    document.querySelectorAll('pre code:not([data-highlighted])').forEach(block => {
        hljs.highlightElement(block);
    });
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

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSectionModal();
        closeEditor();
        closeViewer();
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

// Initialize
async function init() {
    // Check for file:// protocol - app requires server
    if (window.location.protocol === 'file:') {
        showFileProtocolError();
        return;
    }

    // Fetch default assets from server (templates, theme content, theme registry)
    // These are needed before rendering for modified indicators and theme picker
    await Promise.all([
        fetchDefaultThemeContent(),
        fetchThemeRegistry()
    ]);
    // Note: fetchDefaultTemplates() is called by loadTemplates() during filesystem load

    // Try to restore filesystem link first
    await initFilesystem();

    if (filesystemLinked) {
        // Restore collapsed sections now that we know the notebook name
        restoreCollapsedSections();
        // Filesystem data already loaded in initFilesystem, just render
        render();
    } else {
        // No folder linked - show onboarding
        showOnboarding();
    }
}
init();
