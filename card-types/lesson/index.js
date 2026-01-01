// Lesson card type - custom render functions
// Renders lesson cards with materials links, objectives, vocab

export function renderPreview(card, template) {
    const number = card.number || '';
    const status = card.status || 'planned';

    return `
        <div class="lesson-preview">
            ${number ? `<div class="lesson-number">${escapeHtml(number)}</div>` : ''}
            <div class="lesson-status ${status}">${status}</div>
        </div>
    `;
}

export function renderViewer(card, template) {
    const materials = renderMaterials(card);
    const objectives = renderList('Learning Objectives', card.objectives);
    const vocab = renderList('Vocabulary', card.vocab);
    const grammar = card.grammar ? `
        <div class="lesson-grammar">
            <span class="lesson-grammar-label">Grammar: </span>
            <span class="lesson-grammar-value">${escapeHtml(card.grammar)}</span>
        </div>
    ` : '';
    const notes = card.notes ? `
        <div class="lesson-notes">
            <div class="lesson-notes-title">Notes & Reflections</div>
            <div class="md-content">${renderMarkdown(card.notes)}</div>
        </div>
    ` : '';

    return `
        <div class="lesson-viewer">
            ${materials}
            ${objectives}
            ${vocab}
            ${grammar}
            ${notes}
        </div>
    `;
}

function renderMaterials(card) {
    const links = [
        { field: 'teacher_slides', icon: '📊', label: 'Teacher Slides' },
        { field: 'student_slides', icon: '📋', label: 'Student Slides' },
        { field: 'audio', icon: '🔊', label: 'Audio' },
        { field: 'handout', icon: '📄', label: 'Handout' }
    ];

    const hasAnyLink = links.some(l => card[l.field]);
    if (!hasAnyLink) return '';

    const linkHtml = links.map(l => {
        const url = card[l.field];
        if (url) {
            return `
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="lesson-material-link">
                    <span class="icon">${l.icon}</span>
                    <span class="label">${l.label}</span>
                </a>
            `;
        }
        return `
            <div class="lesson-material-link empty">
                <span class="icon">${l.icon}</span>
                <span class="label">${l.label}</span>
            </div>
        `;
    }).join('');

    return `<div class="lesson-materials">${linkHtml}</div>`;
}

function renderList(title, items) {
    if (!items || !items.length) return '';
    const listItems = items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    return `
        <div class="lesson-list">
            <div class="lesson-list-title">${title}</div>
            <ul>${listItems}</ul>
        </div>
    `;
}

// Helper functions - these are available from the framework
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderMarkdown(text) {
    // Use marked if available, otherwise just escape
    if (typeof marked !== 'undefined' && marked.parse) {
        return marked.parse(text);
    }
    return `<p>${escapeHtml(text)}</p>`;
}
