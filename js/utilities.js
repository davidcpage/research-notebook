// ========== MODULE: utilities.js ==========
// Pure utility functions with no dependencies
// Loaded as regular script (not ES module) for file:// compatibility

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
