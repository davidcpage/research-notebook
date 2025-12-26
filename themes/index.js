/**
 * Theme Registry
 *
 * Lists all available themes for the Research Notebook.
 * Each theme exports: name, description, and default (CSS string).
 *
 * Usage:
 *   import { themes, loadTheme } from './themes/index.js';
 *
 *   // List available themes
 *   themes.forEach(t => console.log(t.id, t.name, t.description));
 *
 *   // Load a theme's CSS
 *   const css = await loadTheme('manuscript');
 */

// Theme metadata - kept separate from CSS to avoid loading all themes upfront
export const themes = [
    {
        id: 'manuscript',
        name: 'Manuscript',
        description: 'Warm, scholarly parchment aesthetic with textured backgrounds'
    },
    {
        id: 'minimal',
        name: 'Minimal',
        description: 'Clean, sparse design with subtle accents and generous whitespace'
    },
    {
        id: 'terminal',
        name: 'Terminal',
        description: 'Dark hacker aesthetic with green-on-black terminal feel'
    },
    {
        id: 'handwritten',
        name: 'Handwritten',
        description: 'Calligraphic style with handwriting fonts for a personal journal feel'
    }
];

/**
 * Dynamically load a theme by ID.
 * Returns the full theme module (name, description, default CSS).
 *
 * @param {string} themeId - The theme identifier (e.g., 'manuscript')
 * @returns {Promise<{name: string, description: string, default: string}>}
 */
export async function loadTheme(themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) {
        throw new Error(`Unknown theme: ${themeId}`);
    }

    // NOTE: Dynamic import does NOT work with file:// protocol (CORS error)
    // This module is currently unused - see multi-file-architecture ADR
    const module = await import(`./${themeId}.js`);
    return module;
}

/**
 * Get just the CSS for a theme.
 *
 * @param {string} themeId - The theme identifier
 * @returns {Promise<string>} The theme's CSS content
 */
export async function getThemeCSS(themeId) {
    const module = await loadTheme(themeId);
    return module.default;
}
