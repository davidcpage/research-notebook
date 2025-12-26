# Research Notebook

A browser-based research management tool that combines bookmarks, markdown notes, and executable Python code with file-based storage.

## Features

- **Bookmarks** with auto-generated thumbnails (via microlink API or PDF.js)
- **Markdown notes** with LaTeX math support and wiki-style `[[internal links]]`
- **Executable Python code** cells via Pyodide (numpy, pandas, matplotlib pre-loaded)
- **Syntax-highlighted editor** with CodeMirror 6 (Python, YAML, CSS, Markdown) - dark theme for code, light parchment theme for prose
- **Bidirectional backlinks** between items
- **File-based storage** using the File System Access API
- **Customizable themes** via CSS - edit `theme.css` in your notebook folder

## Getting Started

1. Open `index.html` in Chrome or Edge
2. Select a folder to store your notebook
3. Start creating sections, notes, bookmarks, and code cells

## Application Structure

```
repo/
├── index.html          # HTML shell (210 lines)
├── css/app.css         # Application styles (~2800 lines)
├── js/app.js           # Application logic (~6500 lines)
└── examples/           # Example notebooks with different themes
```

## Design Philosophy

### LLM-Friendly Notebook Format

The notebook stores data as plain files in a folder structure designed for easy collaboration with LLMs like Claude:

```
notebook-folder/
├── .notebook/              # Configuration directory
│   ├── settings.yaml       # Notebook settings
│   ├── theme.css           # Custom theme
│   └── templates/          # Card templates
│       ├── note.yaml
│       ├── code.yaml
│       └── bookmark.yaml
├── CLAUDE.md               # For Claude Code
├── README.md               # Notebook readme
├── research/               # Section directories
│   ├── note-title.md
│   ├── code-title.code.py
│   └── bookmark.bookmark.json
└── assets/thumbnails/      # Bookmark thumbnails
```

This means:
- **Claude Code can read and edit your notes directly** as markdown/Python files
- **Git-friendly**: Meaningful diffs, version history per item
- **Portable**: Standard formats editable in any text editor
- **System notes**: Config files appear in the notebook UI

### LLM-Navigable Codebase

The application code (`js/app.js`, ~6500 lines) is structured for LLM navigation:

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

Each notebook includes a `.notebook/theme.css` file you can edit to customize colors and styling:

```css
:root {
    --accent: #c45d3a;        /* Change the accent color */
    --bg-primary: #f8f6f3;    /* Change the background */
    --code-bg: #1a3a52;       /* Change code block colors */
}
```

See `theme.css` in the repo root for a full reference of all customizable CSS variables and selectors. The `examples/demo-notebook/.notebook/theme.css` shows a more elaborate theme with textures.

## Requirements

- **Chrome or Edge** (requires File System Access API)
- **Python 3** (only for generate_index.py, not for running the app)

## License

MIT
