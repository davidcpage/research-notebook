/**
 * Framework utilities for card type modules.
 *
 * Card type modules import from this file:
 *   import { escapeHtml, findCardById, marked } from '/js/framework.js';
 *
 * This module provides:
 * - Pure utility functions (escapeHtml, truncateText, formatDate, etc.)
 * - Data model helpers that access the global notebook state
 * - Re-exports of external libraries (marked, hljs, jsyaml)
 * - Framework actions for card types to interact with the core app
 */

// ========== PURE UTILITIES ==========
// These are standalone functions with no state dependencies

/**
 * Escape HTML to prevent XSS attacks.
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML-safe string
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape a string for use in JavaScript within an HTML attribute.
 * e.g., onclick="func('${escapeJsAttr(value)}')"
 * @param {string} text - Text to escape
 * @returns {string} Escaped string safe for JS in HTML attributes
 */
export function escapeJsAttr(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

/**
 * Truncate text with ellipsis.
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length including ellipsis
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format a date string for display.
 * Shows month and day, includes year only if different from current year.
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date (e.g., "Jan 15" or "Jan 15, 2023")
 */
export function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
}

/**
 * Get plain text preview from markdown (strip syntax).
 * @param {string} markdown - Markdown text
 * @param {number} maxLength - Maximum preview length
 * @returns {string} Plain text preview
 */
export function getPlainTextPreview(markdown, maxLength = 200) {
    if (!markdown) return '';
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

// ========== EXTERNAL LIBRARY RE-EXPORTS ==========
// These reference CDN-loaded globals and re-export for ES module consumers

/** Marked.js markdown parser (from window global) */
export const marked = window.marked;

/** Highlight.js syntax highlighter (from window global) */
export const hljs = window.hljs;

/** js-yaml YAML parser (from window global) */
export const jsyaml = window.jsyaml;

/** KaTeX math renderer (from window global) */
export const katex = window.katex;

/** renderMathInElement from KaTeX auto-render (from window global) */
export const renderMathInElement = window.renderMathInElement;

// ========== DATA MODEL HELPERS ==========
// These access the global notebook state via window.notebook

/**
 * Get the global notebook data object.
 * @returns {Object} The data object containing sections and systemNotes
 */
export function getData() {
    return window.notebook?.data;
}

/**
 * Get the current notebook settings.
 * @returns {Object|null} Notebook settings or null
 */
export function getSettings() {
    return window.notebook?.notebookSettings;
}

/**
 * Get the current notebook roster (for classroom features).
 * @returns {Object|null} Roster data or null
 */
export function getRoster() {
    return window.notebook?.notebookRoster;
}

/**
 * Get the currently viewing card.
 * @returns {Object|null} Current viewing card with sectionId, or null
 */
export function getCurrentViewingCard() {
    return window.notebook?.currentViewingCard;
}

/**
 * Get the template registry.
 * @returns {Object} Template registry object
 */
export function getTemplateRegistry() {
    return window.notebook?.templateRegistry || {};
}

/**
 * Find a card by ID across all sections and systemNotes.
 * @param {string|number} cardId - Card ID to find
 * @returns {Object|null} Card object or null if not found
 */
export function findCardById(cardId) {
    const data = getData();
    if (!data) return null;

    const cardIdStr = String(cardId);
    for (const section of data.sections) {
        const item = section.items.find(i => String(i.id) === cardIdStr);
        if (item) return item;
    }
    const systemNote = data.systemNotes?.find(n => String(n.id) === cardIdStr);
    if (systemNote) return systemNote;
    return null;
}

/**
 * Find the section containing a specific card.
 * @param {Object} card - Card object with id property
 * @returns {Object|null} Section object or null if not found
 */
export function findSectionByItem(card) {
    const data = getData();
    if (!data || !card) return null;

    const cardIdStr = String(card.id);
    return data.sections.find(s => s.items.some(i => String(i.id) === cardIdStr));
}

/**
 * Find all cards of a specific type.
 * @param {string} type - Card type (e.g., 'note', 'quiz')
 * @returns {Array} Array of cards matching the type
 */
export function findCardsByType(type) {
    const data = getData();
    if (!data) return [];

    const cards = [];
    for (const section of data.sections) {
        for (const item of section.items) {
            if (item.type === type) {
                cards.push(item);
            }
        }
    }
    return cards;
}

/**
 * Get a section by name or ID.
 * @param {string} nameOrId - Section name or section ID
 * @returns {Object|null} Section object or null if not found
 */
export function getSection(nameOrId) {
    const data = getData();
    if (!data) return null;

    return data.sections.find(s =>
        s.name === nameOrId || s.id === nameOrId
    );
}

// ========== FRAMEWORK ACTIONS ==========
// These are async operations that card types can call to interact with the core app

/**
 * Save a card to the filesystem and update the UI.
 * @param {Object} card - Card object to save
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveCard(card) {
    if (!window.notebook?.saveCardFile) {
        console.error('[Framework] saveCardFile not available');
        return false;
    }
    return window.notebook.saveCardFile(card);
}

/**
 * Save all data to IndexedDB.
 * @returns {Promise<void>}
 */
export async function saveData() {
    if (window.notebook?.saveData) {
        await window.notebook.saveData();
    }
}

/**
 * Save a card file to the filesystem.
 * @param {string} sectionId - Section ID
 * @param {Object} card - Card object
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveCardFile(sectionId, card) {
    if (!window.notebook?.saveCardFile) {
        console.error('[Framework] saveCardFile not available');
        return false;
    }
    return window.notebook.saveCardFile(sectionId, card);
}

/**
 * Get subdirectory from a card's _path field.
 * @param {string} path - Card's _path (e.g., "section/subdir1/subdir2")
 * @returns {string|null} Subdirectory path within section, or null
 */
export function getSubdirFromPath(path) {
    if (window.notebook?.getSubdirFromPath) {
        return window.notebook.getSubdirFromPath(path);
    }
    // Fallback implementation
    if (!path) return null;
    const parts = path.split('/');
    // First part is section, rest is subdir
    if (parts.length <= 1) return null;
    return parts.slice(1).join('/');
}

/**
 * Refresh the viewer if it's currently open.
 */
export function refreshViewer() {
    if (window.notebook?.refreshOpenViewer) {
        window.notebook.refreshOpenViewer();
    }
}

/**
 * Render markdown with internal links and math support.
 * @param {string} text - Markdown text to render
 * @param {string} containerId - Optional container ID for math rendering
 * @returns {string} Rendered HTML
 */
export function renderMarkdown(text, containerId = null) {
    if (!window.notebook?.renderMarkdownWithLinks) {
        // Fallback to basic marked if full renderer not available
        return marked?.parse?.(text) || text;
    }
    return window.notebook.renderMarkdownWithLinks(text, containerId);
}

/**
 * Open the viewer for a card.
 * @param {string|number|Object} cardOrId - Card object or ID of the card to open
 */
export function openViewer(cardOrId) {
    if (!window.notebook?.openViewer) return;

    // Handle both card objects and card IDs
    let card, cardId;
    if (typeof cardOrId === 'object' && cardOrId !== null) {
        card = cardOrId;
        cardId = card.id;
    } else {
        cardId = cardOrId;
        card = findCardById(cardId);
    }

    if (!card) {
        console.warn('[Framework] openViewer: card not found:', cardId);
        return;
    }

    // Find the section containing this card
    const section = findSectionByItem(card);
    const sectionId = section?.id || '_system';

    window.notebook.openViewer(sectionId, card.id);
}

/**
 * Show a toast notification.
 * @param {string} message - Message to display
 * @param {string} type - Toast type: 'success', 'error', 'info'
 */
export function showToast(message, type = 'info') {
    if (window.notebook?.showToast) {
        window.notebook.showToast(message, type);
    } else {
        console.log(`[Toast ${type}] ${message}`);
    }
}

/**
 * Get a template definition by name.
 * @param {string} templateName - Template name (e.g., 'note', 'quiz')
 * @returns {Object|null} Template definition or null
 */
export function getTemplate(templateName) {
    if (window.notebook?.templateRegistry) {
        return window.notebook.templateRegistry[templateName];
    }
    return null;
}

/**
 * Close the viewer modal.
 */
export function closeViewer() {
    if (window.notebook?.closeViewer) {
        window.notebook.closeViewer();
    }
}

/**
 * Re-render the main UI.
 */
export function render() {
    if (window.notebook?.render) {
        window.notebook.render();
    }
}

/**
 * Get a card type JS module by name.
 * Card type modules can provide custom render functions and actions.
 * @param {string} name - Card type name (e.g., 'quiz', 'quiz-response-summary')
 * @returns {Object|null} Module exports or null if not found
 */
export function getCardTypeModule(name) {
    if (window.notebook?.getCardTypeModule) {
        return window.notebook.getCardTypeModule(name);
    }
    return null;
}

// ========== NOTEBOOK OBJECT REGISTRATION ==========
// Card type modules need window.notebook to exist for framework actions.
// The main app.js should call registerNotebook() during init.

/**
 * Register notebook functions for framework access.
 * Called by app.js during initialization.
 * @param {Object} notebookApi - Object containing functions to expose
 */
export function registerNotebook(notebookApi) {
    window.notebook = { ...window.notebook, ...notebookApi };
}
