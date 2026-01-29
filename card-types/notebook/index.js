/**
 * Jupyter Notebook card type module.
 *
 * Renders .ipynb files using notebook.js library with our existing
 * marked.js, highlight.js, and KaTeX integrations.
 *
 * Note: The JSON parser spreads notebook fields directly onto the card object.
 * The card will have: cells, metadata, nbformat, nbformat_minor, etc.
 */

import { escapeHtml, hljs, renderMarkdown } from '/js/framework.js';

// Configure notebook.js to use our libraries
function configureNotebookJs() {
    if (typeof nb === 'undefined') {
        console.warn('[Notebook] notebook.js not loaded');
        return false;
    }

    // Use our markdown renderer (includes KaTeX math support)
    nb.markdown = function(text) {
        return renderMarkdown(text);
    };

    // Use highlight.js for syntax highlighting
    nb.highlighter = function(code, pre, codeEl, lang) {
        // Detect language from notebook metadata or cell
        const language = lang || 'python';
        try {
            if (hljs.getLanguage(language)) {
                return hljs.highlight(code, { language }).value;
            }
            return hljs.highlightAuto(code).value;
        } catch (e) {
            return escapeHtml(code);
        }
    };

    // Enable ANSI color rendering for terminal output
    if (typeof ansi_up !== 'undefined') {
        nb.ansi = function(text) {
            const ansi = new ansi_up.default();
            return ansi.ansi_to_html(text);
        };
    }

    return true;
}

/**
 * Extract notebook data from card (handles both direct fields and nested structure).
 * The JSON parser spreads notebook fields onto the card.
 */
function getNotebookData(card) {
    // The notebook fields are spread directly on the card
    return {
        cells: card.cells || [],
        metadata: card.metadata || {},
        nbformat: card.nbformat || 4,
        nbformat_minor: card.nbformat_minor || 0
    };
}

/**
 * Get the language from notebook metadata.
 */
function getNotebookLanguage(card) {
    const metadata = card.metadata || {};
    const kernelspec = metadata.kernelspec || {};
    const languageInfo = metadata.language_info || {};
    return kernelspec.language || languageInfo.name || 'python';
}

/**
 * Render a simple markdown preview (handles headers, strips other syntax).
 */
function renderMarkdownPreview(text) {
    const firstLine = text.split('\n')[0].substring(0, 100);

    // Check for headers
    const h1Match = firstLine.match(/^#\s+(.+)/);
    if (h1Match) {
        return `<span class="nb-md-h1">${escapeHtml(h1Match[1])}</span>`;
    }
    const h2Match = firstLine.match(/^##\s+(.+)/);
    if (h2Match) {
        return `<span class="nb-md-h2">${escapeHtml(h2Match[1])}</span>`;
    }
    const h3Match = firstLine.match(/^###\s+(.+)/);
    if (h3Match) {
        return `<span class="nb-md-h3">${escapeHtml(h3Match[1])}</span>`;
    }

    // Strip markdown syntax for plain text preview
    let plain = firstLine
        .replace(/^#+\s*/, '')  // Headers
        .replace(/\*\*(.+?)\*\*/g, '$1')  // Bold
        .replace(/\*(.+?)\*/g, '$1')  // Italic
        .replace(/`(.+?)`/g, '$1')  // Inline code
        .replace(/\[(.+?)\]\(.+?\)/g, '$1');  // Links

    return escapeHtml(plain);
}

/**
 * Get a preview summary of notebook cells for card display.
 */
function getNotebookPreview(card, maxCells = 3) {
    const cells = card.cells || [];
    const preview = [];
    let shown = 0;

    for (const cell of cells) {
        if (shown >= maxCells) break;

        const source = Array.isArray(cell.source)
            ? cell.source.join('')
            : (cell.source || '');

        if (!source.trim()) continue;

        if (cell.cell_type === 'markdown') {
            preview.push({
                type: 'markdown',
                preview: renderMarkdownPreview(source)
            });
        } else if (cell.cell_type === 'code') {
            // Show first few lines of code with syntax highlighting
            const lines = source.split('\n').slice(0, 3);
            const code = lines.join('\n').substring(0, 200);
            let highlighted;
            try {
                highlighted = hljs.highlight(code, { language: 'python' }).value;
            } catch (e) {
                highlighted = escapeHtml(code);
            }
            preview.push({
                type: 'code',
                preview: highlighted,
                isHighlighted: true
            });
        }
        shown++;
    }

    return preview;
}

/**
 * Custom card preview renderer.
 * Named 'renderPreview' for card type module registration.
 */
export function renderPreview(card, template) {
    const preview = getNotebookPreview(card);
    const cells = card.cells || [];

    if (preview.length === 0) {
        return `
            <div class="preview-frame notebook-preview">
                <div class="notebook-empty">Empty notebook</div>
            </div>
        `;
    }

    const cellsHtml = preview.map(cell => {
        if (cell.type === 'markdown') {
            // Markdown preview is already escaped/rendered
            return `<div class="nb-preview-cell nb-preview-md">${cell.preview}</div>`;
        } else {
            // Code preview is already highlighted HTML
            return `<div class="nb-preview-cell nb-preview-code"><code>${cell.preview}</code></div>`;
        }
    }).join('');

    const cellCount = cells.length;
    const language = getNotebookLanguage(card);

    return `
        <div class="preview-frame notebook-preview">
            <div class="nb-preview-cells">${cellsHtml}</div>
            <div class="nb-preview-meta">
                <span class="nb-cell-count">${cellCount} cells</span>
                <span class="nb-language">${escapeHtml(language)}</span>
            </div>
        </div>
    `;
}

/**
 * Custom viewer content renderer.
 * Named 'renderViewer' for card type module registration.
 */
export function renderViewer(card, template) {
    if (!configureNotebookJs()) {
        return `<div class="notebook-error">notebook.js library not loaded</div>`;
    }

    try {
        // Reconstruct notebook JSON structure for notebook.js
        const notebookJson = getNotebookData(card);
        const notebook = nb.parse(notebookJson);
        const rendered = notebook.render();

        // Convert DOM element to HTML string
        const container = document.createElement('div');
        container.className = 'nb-notebook';
        container.appendChild(rendered);

        return container.outerHTML;
    } catch (e) {
        console.error('[Notebook] Render error:', e);
        return `<div class="notebook-error">Failed to render notebook: ${escapeHtml(e.message)}</div>`;
    }
}
