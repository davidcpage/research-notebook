// Paper card type - custom render and arxiv metadata fetching
import { escapeHtml, renderMarkdown } from '/js/framework.js';

// Render card preview: miniature arxiv abstract page
export function renderPreview(card, template) {
    const hasMetadata = card.title || (Array.isArray(card.authors) && card.authors.length > 0) || card.abstract;
    if (!hasMetadata) {
        return `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:3rem;opacity:0.3;">📄</div>`;
    }

    const authors = Array.isArray(card.authors) ? card.authors : [];
    const authorsStr = authors.length > 0 ? escapeHtml(authors.join(', ')) : '';
    const yearStr = card.year ? `[${escapeHtml(String(card.year))}]` : '';

    return `<div class="preview-page paper-preview"><div class="paper-arxiv-banner"></div><div class="preview-scaler">
        <div class="paper-arxiv-title">${escapeHtml(card.title || '')}</div>
        ${authorsStr ? `<div class="paper-arxiv-authors">${authorsStr}</div>` : ''}
        ${card.abstract ? `<div class="paper-arxiv-abstract-box"><div class="paper-arxiv-abstract">${escapeHtml(card.abstract)}</div></div>` : ''}
    </div></div>`;
}

// Render viewer: arxiv-style layout matching card preview, plus notes
export function renderViewer(card, template) {
    const authors = Array.isArray(card.authors) ? card.authors : [];
    const authorsStr = authors.length > 0 ? escapeHtml(authors.join(', ')) : '';

    const urlHtml = card.url
        ? `<div class="paper-viewer-url"><a href="${escapeHtml(card.url)}" target="_blank" rel="noopener">${escapeHtml(card.url)}</a></div>`
        : '';

    const abstractHtml = card.abstract
        ? `<div class="paper-arxiv-abstract-box"><div class="paper-arxiv-abstract md-content viewer-markdown">${renderMarkdown(card.abstract)}</div></div>`
        : '';

    const contentHtml = card.content
        ? `<div class="paper-viewer-notes"><div class="paper-viewer-section-label">Notes</div><div class="md-content viewer-markdown">${renderMarkdown(card.content)}</div></div>`
        : '';

    return `
        <div class="paper-viewer">
            ${authorsStr ? `<div class="paper-arxiv-authors">${authorsStr}</div>` : ''}
            ${urlHtml}
            ${abstractHtml}
            ${contentHtml}
        </div>
    `;
}

// Normalize various arxiv URL/ID formats to canonical abs URL
function normalizeArxivInput(raw) {
    if (!raw) return null;
    raw = raw.trim();

    // Bare arxiv ID: 2401.12345 or 2401.12345v2
    const bareIdMatch = raw.match(/^(\d{4}\.\d{4,5})(v\d+)?$/);
    if (bareIdMatch) {
        return { url: `https://arxiv.org/abs/${bareIdMatch[1]}${bareIdMatch[2] || ''}`, id: bareIdMatch[1] };
    }

    // arxiv URL variants: abs, pdf, html
    const arxivUrlMatch = raw.match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(v\d+)?/);
    if (arxivUrlMatch) {
        return { url: `https://arxiv.org/abs/${arxivUrlMatch[1]}${arxivUrlMatch[2] || ''}`, id: arxivUrlMatch[1] };
    }

    return null;
}

// Fetch metadata from arxiv API via server proxy. Returns populated fields or null for non-arxiv URLs.
export async function fetchMetadata(url) {
    const arxiv = normalizeArxivInput(url);
    if (!arxiv) return null;

    try {
        // Use server proxy to avoid CORS (arxiv API doesn't set Access-Control-Allow-Origin)
        const response = await fetch(`/api/arxiv?id=${arxiv.id}`);
        if (!response.ok) return null;

        const xml = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');

        const entry = doc.querySelector('entry');
        if (!entry) return null;

        // Check for error (arxiv returns an entry with 'Error' id for invalid IDs)
        const idEl = entry.querySelector('id');
        if (idEl && idEl.textContent.includes('Error')) return null;

        const title = entry.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const authors = Array.from(entry.querySelectorAll('author > name')).map(n => n.textContent.trim());
        const published = entry.querySelector('published')?.textContent || '';
        const year = published ? new Date(published).getFullYear().toString() : '';
        const abstract = entry.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';

        return {
            url: arxiv.url,
            title,
            authors,
            year,
            abstract
        };
    } catch (e) {
        console.warn('[Paper] arxiv fetch failed:', e);
        return null;
    }
}
