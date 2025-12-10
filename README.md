# Research Notebook

A browser-based research management tool that combines bookmarks, markdown notes, and executable Python code in a single portable HTML file.

## Features

- **Bookmarks** with auto-generated thumbnails (via microlink API or PDF.js)
- **Markdown notes** with LaTeX math support and wiki-style `[[internal links]]`
- **Executable Python code** cells via Pyodide (numpy, pandas, matplotlib pre-loaded)
- **Syntax-highlighted editor** with CodeMirror 6 (Python, YAML, CSS) - line numbers, bracket matching, code folding
- **Bidirectional backlinks** between items
- **File-based storage** using the File System Access API
- **Customizable themes** via CSS - edit `theme.css` in your notebook folder

## Getting Started

1. Open `research_notebook.html` in Chrome or Edge
2. Select a folder to store your notebook
3. Start creating sections, notes, bookmarks, and code cells

## Design Philosophy

### LLM-Friendly Notebook Format

The notebook stores data as plain files in a folder structure designed for easy collaboration with LLMs like Claude:

```
notebook-folder/
├── notebook.json           # Title, subtitle, section order
├── README.md               # Auto-generated, editable
├── CLAUDE.md               # Auto-generated, for Claude Code
├── .gitignore              # Auto-generated
├── sections/
│   └── section-name/
│       ├── note-title.md           # Markdown with YAML frontmatter
│       ├── code-title.code.py      # Python with comment frontmatter
│       └── bookmark.bookmark.json  # Bookmark metadata
└── assets/thumbnails/      # Bookmark thumbnails
```

This means:
- **Claude Code can read and edit your notes directly** as markdown/Python files
- **Git-friendly**: Meaningful diffs, version history per item
- **Portable**: Standard formats editable in any text editor
- **System notes**: Config files like `.gitignore` appear in the notebook UI

### LLM-Navigable Codebase

The single-file application (`research_notebook.html`, ~5000 lines) is structured for LLM navigation:

- **Section markers**: `// ========== SECTION: NAME ==========` divide the code
- **Inline comments**: Each function has a descriptive comment above it
- **`generate_index.py`**: Auto-generates a section/function index:
  ```bash
  python3 generate_index.py              # Full index
  python3 generate_index.py --sections   # Section summary
  python3 generate_index.py --section PYODIDE_RUNTIME  # Single section
  ```
- **`CLAUDE.md`**: Detailed guidance for Claude Code when working on this codebase

## Theming

Each notebook includes a `theme.css` file you can edit to customize colors and styling:

```css
:root {
    --accent: #c45d3a;        /* Change the accent color */
    --bg-primary: #f8f6f3;    /* Change the background */
    --code-bg: #1a3a52;       /* Change code block colors */
}
```

See `theme.css` in the repo root for a full reference of all customizable CSS variables and selectors. The `examples/demo-notebook/theme.css` shows a more elaborate theme with textures.

## Requirements

- **Chrome or Edge** (requires File System Access API)
- **Python 3** (only for generate_index.py, not for running the app)

## License

MIT
