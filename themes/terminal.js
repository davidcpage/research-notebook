// Research Notebook Theme: "Terminal"
// Dark hacker aesthetic with phosphor green accents

export const name = "Terminal";
export const description = "Dark hacker aesthetic with green-on-black terminal feel";

export default `/*
 * Research Notebook Theme: "Terminal"
 *
 * Dark hacker aesthetic with phosphor green accents.
 * Inspired by classic CRT terminals and retro computing.
 */

/* ========================================
   Global Colors - Dark with Green Accents
   ======================================== */

:root {
    --bg-primary: #0a0a0a;
    --bg-secondary: #111111;
    --text-primary: #00ff00;
    --text-secondary: #00cc00;
    --text-muted: #006600;
    --accent: #00ff00;
    --border: #1a1a1a;
    --link-color: #00ffaa;
    --link-hover: #00ffcc;

    /* Phosphor glow effect */
    --glow: 0 0 10px rgba(0, 255, 0, 0.3);
}

/* ========================================
   Body & Background
   ======================================== */

body {
    background:
        /* Scanline effect */
        repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.1) 2px,
            rgba(0, 0, 0, 0.1) 4px
        ),
        var(--bg-primary);
}

/* ========================================
   Typography - Monospace Everything
   ======================================== */

header h1 {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    text-shadow: var(--glow);
}

header h2 {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    color: var(--text-muted);
    font-size: 0.9rem;
}

/* ========================================
   Note Cards - Dark Terminal
   ======================================== */

.card[data-template="note"],
.modal.viewer[data-template="note"] {
    --template-border: #1a3a1a;
    --template-bg: #0d1a0d;
    --template-preview-bg: #0a140a;
    --template-title-text: #00ff00;
    --template-meta-text: #006600;
    --template-heading-font: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}

.card[data-template="note"] {
    background: var(--template-bg);
    border: 1px solid var(--template-border);
    border-radius: 0;
    box-shadow:
        inset 0 0 30px rgba(0, 255, 0, 0.03),
        0 0 1px rgba(0, 255, 0, 0.5);
}

.card[data-template="note"]:hover {
    box-shadow:
        inset 0 0 30px rgba(0, 255, 0, 0.05),
        0 0 5px rgba(0, 255, 0, 0.3);
}

.card[data-template="note"] .card-title {
    font-family: var(--template-heading-font);
    text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
}

.card[data-template="note"] .card-preview {
    border-bottom: 1px solid var(--template-border);
}

/* Note viewer */
.modal.viewer[data-template="note"] .viewer-content {
    font-family: var(--template-heading-font);
    line-height: 1.6;
    background: var(--template-bg);
    color: #00dd00;
}

.modal.viewer[data-template="note"] h1,
.modal.viewer[data-template="note"] h2,
.modal.viewer[data-template="note"] h3 {
    color: var(--template-title-text);
    text-shadow: var(--glow);
    border-bottom-color: var(--template-border);
}

.modal.viewer[data-template="note"] code {
    background: #001a00;
    color: #00ff88;
}

.modal.viewer[data-template="note"] a {
    color: var(--link-color);
}

/* ========================================
   Code Cards - Matrix Style
   ======================================== */

.card[data-template="code"],
.modal.viewer[data-template="code"] {
    --template-border: #1a1a1a;
    --template-bg: #000000;
    --template-output-bg: #0a0a0a;
    --template-code-bg: #000000;
    --template-code-text: #00ff00;
    --template-title-text: #00ff00;
    --template-meta-text: #006600;
}

.card[data-template="code"] {
    border-radius: 0;
    box-shadow: 0 0 1px rgba(0, 255, 0, 0.5);
}

.card[data-template="code"]:hover {
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.2);
}

/* ========================================
   Bookmark Cards - Dark Links
   ======================================== */

.card[data-template="bookmark"] {
    background: #0a0a0a;
    border: 1px solid #1a1a1a;
    border-radius: 0;
}

.card[data-template="bookmark"]:hover {
    border-color: #00ff00;
    box-shadow: 0 0 5px rgba(0, 255, 0, 0.2);
}

.card[data-template="bookmark"] .card-title {
    color: #00ff00;
}

.card[data-template="bookmark"] .card-meta {
    color: #006600;
}

/* ========================================
   Section Headers - Terminal Prompt
   ======================================== */

.section-header h3 {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    font-size: 0.75rem;
    color: #00aa00;
    border-bottom: 1px solid #1a3a1a;
}

.section-header h3::before {
    content: "> ";
    color: #00ff00;
}

/* ========================================
   Toolbar - Command Line
   ======================================== */

.toolbar {
    background: #050505;
    border-bottom: 1px solid #1a1a1a;
}

.toolbar button {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    border-radius: 0;
}

.toolbar button:hover {
    background: #1a3a1a;
    color: #00ff00;
}

/* ========================================
   Scrollbars - Matrix Green
   ======================================== */

::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: #0a0a0a;
}

::-webkit-scrollbar-thumb {
    background: #003300;
    border-radius: 0;
}

::-webkit-scrollbar-thumb:hover {
    background: #004400;
}

/* ========================================
   Cursor Blink Animation (optional)
   ======================================== */

@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}
`;
