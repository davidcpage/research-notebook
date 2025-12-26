// Research Notebook Theme: "Handwritten"
// A warm, personal aesthetic using calligraphic fonts

export const name = "Handwritten";
export const description = "Calligraphic style with handwriting fonts for a personal journal feel";

export default `/*
 * Research Notebook Theme: "Handwritten"
 *
 * A warm, personal aesthetic using calligraphic fonts.
 * Notes feel like entries in a personal journal.
 *
 * Uses Google Fonts:
 * - Tangerine: Elegant script for headings
 * - Caveat: Casual handwriting for body text
 */

@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&family=Tangerine:wght@400;700&display=swap');

/* ========================================
   Global Colors - Warm Cream & Ink
   ======================================== */

:root {
    --bg-primary: #fdfbf7;
    --bg-secondary: #f8f4ec;
    --text-primary: #2c2416;
    --text-secondary: #4a3f2f;
    --text-muted: #8a7d6a;
    --accent: #8b4513;
    --border: #e0d5c5;
    --link-color: #5d4037;
    --link-hover: #8b4513;

    /* Handwriting fonts */
    --font-script: 'Tangerine', cursive;
    --font-handwriting: 'Caveat', cursive;
}

/* ========================================
   Notebook Header - Elegant Script
   ======================================== */

header h1 {
    font-family: var(--font-script);
    font-size: 3.5rem;
    font-weight: 700;
    color: #2c2416;
    letter-spacing: 0.02em;
}

header h2 {
    font-family: var(--font-handwriting);
    font-size: 1.5rem;
    color: var(--text-muted);
    font-style: normal;
}

/* ========================================
   Note Cards - Journal Entry Style
   ======================================== */

.card[data-template="note"],
.modal.viewer[data-template="note"] {
    --template-border: #d5c9b5;
    --template-bg: #faf6ee;
    --template-preview-bg: transparent;
    --template-title-text: #2c2416;
    --template-meta-text: #8a7d6a;
    --template-heading-font: var(--font-script);
}

.card[data-template="note"] {
    /* Cream paper with subtle lines */
    background:
        repeating-linear-gradient(
            transparent,
            transparent 27px,
            #e8dfd0 27px,
            #e8dfd0 28px
        ),
        linear-gradient(135deg, #faf6ee 0%, #f5efe3 100%);

    border: 1px solid var(--template-border);
    border-radius: 2px;
    box-shadow:
        2px 2px 8px rgba(44, 36, 22, 0.08),
        -1px -1px 0 rgba(255, 255, 255, 0.5);

    /* Slight rotation for handmade feel */
    transform: rotate(-0.3deg);
}

.card[data-template="note"]:hover {
    transform: rotate(0deg);
    box-shadow:
        3px 3px 12px rgba(44, 36, 22, 0.12),
        -1px -1px 0 rgba(255, 255, 255, 0.5);
}

.card[data-template="note"] .card-title {
    font-family: var(--font-script);
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--template-title-text);
}

.card[data-template="note"] .preview-content {
    font-family: var(--font-handwriting);
    font-size: 1.25rem;
    line-height: 1.5;
}

.card[data-template="note"] .card-preview {
    border-bottom: 1px dashed #d5c9b5;
}

.card[data-template="note"] .card-meta {
    font-family: var(--font-handwriting);
    font-size: 1.1rem;
}

/* ========================================
   Note Viewer - Full Journal Page
   ======================================== */

.modal.viewer[data-template="note"] .viewer-content {
    font-family: var(--font-handwriting);
    font-size: 1.4rem;
    line-height: 1.8;
    /* Lined paper effect */
    background:
        repeating-linear-gradient(
            transparent,
            transparent 31px,
            #e8dfd0 31px,
            #e8dfd0 32px
        ),
        linear-gradient(180deg, #fdfbf7 0%, #f8f4ec 100%);
    padding-top: 8px; /* Align with lines */
}

.modal.viewer[data-template="note"] h1 {
    font-family: var(--font-script);
    font-size: 3rem;
    font-weight: 700;
    color: var(--template-title-text);
    border-bottom: none;
    margin-bottom: 0.5em;
}

.modal.viewer[data-template="note"] h2 {
    font-family: var(--font-script);
    font-size: 2.2rem;
    font-weight: 700;
    color: #4a3f2f;
    border-bottom: none;
}

.modal.viewer[data-template="note"] h3 {
    font-family: var(--font-handwriting);
    font-size: 1.6rem;
    font-weight: 600;
    color: #4a3f2f;
    text-decoration: underline;
    text-decoration-color: #d5c9b5;
    border-bottom: none;
}

.modal.viewer[data-template="note"] strong {
    font-weight: 600;
}

.modal.viewer[data-template="note"] em {
    font-style: italic;
}

.modal.viewer[data-template="note"] blockquote {
    font-style: italic;
    border-left: 3px solid #c9b896;
    background: rgba(201, 184, 150, 0.1);
}

.modal.viewer[data-template="note"] code {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 0.85em;
    background: #f0e8d8;
    padding: 0.1em 0.3em;
    border-radius: 2px;
}

.modal.viewer[data-template="note"] a {
    color: var(--link-color);
    text-decoration: underline;
    text-decoration-style: wavy;
    text-decoration-color: #c9b896;
}

/* ========================================
   Code Cards - Typewriter Contrast
   ======================================== */

.card[data-template="code"],
.modal.viewer[data-template="code"] {
    --template-border: #3a352f;
    --template-bg: #2a2520;
    --template-output-bg: #322d27;
    --template-code-bg: #2a2520;
    --template-code-text: #e8dfd0;
    --template-title-text: #f0e8d8;
    --template-meta-text: #8a7d6a;
}

.card[data-template="code"] {
    border-radius: 2px;
    transform: rotate(0.2deg);
}

.card[data-template="code"]:hover {
    transform: rotate(0deg);
}

/* ========================================
   Bookmark Cards - Index Card Style
   ======================================== */

.card[data-template="bookmark"] {
    background: #fffef9;
    border: 1px solid #d5c9b5;
    border-radius: 2px;
    transform: rotate(0.5deg);
}

.card[data-template="bookmark"]:hover {
    transform: rotate(0deg);
    border-color: var(--accent);
}

.card[data-template="bookmark"] .card-title {
    font-family: var(--font-handwriting);
    font-size: 1.3rem;
}

/* ========================================
   Section Headers - Underlined Label
   ======================================== */

.section-header h3 {
    font-family: var(--font-script);
    font-size: 1.8rem;
    font-weight: 700;
    text-transform: none;
    letter-spacing: normal;
    color: #4a3f2f;
    border-bottom: 2px solid #c9b896;
}

/* ========================================
   Toolbar - Subtle
   ======================================== */

.toolbar {
    background: linear-gradient(180deg, #fdfbf7 0%, #f8f4ec 100%);
    border-bottom: 1px solid #e0d5c5;
}

.toolbar button {
    font-family: var(--font-handwriting);
    font-size: 1.1rem;
}

/* ========================================
   Scrollbars - Warm Tones
   ======================================== */

::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: #f8f4ec;
}

::-webkit-scrollbar-thumb {
    background: #c9b896;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #b5a580;
}

/* Dark scrollbars for code */
.card[data-template="code"] ::-webkit-scrollbar-track,
.modal.viewer[data-template="code"] ::-webkit-scrollbar-track {
    background: var(--template-code-bg);
}

.card[data-template="code"] ::-webkit-scrollbar-thumb,
.modal.viewer[data-template="code"] ::-webkit-scrollbar-thumb {
    background: #5a5045;
}
`;
