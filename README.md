# Research Notebook

A browser-based research management tool that combines bookmarks, markdown notes, and executable Python code with file-based storage. Designed for use alongside Claude Code.

## Features

- **Bookmarks** with auto-generated thumbnails (via microlink API or PDF.js)
- **Markdown notes** with LaTeX math support and wiki-style `[[internal links]]`
- **Executable Python code** cells via Pyodide (numpy, pandas, matplotlib pre-loaded)
- **Syntax-highlighted editor** with CodeMirror 6 (Python, YAML, CSS, Markdown)
- **Bidirectional backlinks** between items
- **File-based storage** using the File System Access API
- **Theme picker** with 5 built-in themes + custom CSS support
- **LLM-friendly** - plain files that Claude Code can read and edit directly

## Getting Started

### Installation

```bash
# Clone the repo
git clone https://github.com/anthropics/research-notebook.git
cd research-notebook

# Install the CLI (one-time)
npm link

# Start the notebook
notebook
```

This starts a local server and opens the app in your browser.

### Creating a New Notebook

1. Click "Select Folder" and choose an empty directory
2. The app creates the notebook structure automatically
3. Start adding notes, bookmarks, and code cells

### Using an Example Template

```bash
# Copy an example as your starting point
cp -r examples/research-notebook ~/my-project
```

Available templates:
- `research-notebook` - Manuscript theme, research-focused
- `dev-notebook` - Terminal theme, code-focused
- `tutor-notebook` - Friendly theme, learning-focused

## Application Structure

```
repo/
├── package.json        # npm package (provides 'notebook' command)
├── cli.js              # Local server
├── index.html          # HTML shell (~210 lines)
├── css/app.css         # Application styles (~2800 lines)
├── js/app.js           # Application logic (~6500 lines)
├── defaults/           # Default templates and theme
├── themes/             # Built-in themes (manuscript, terminal, etc.)
└── examples/           # Example notebooks
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

### Built-in Themes

Open Settings and select a base theme:
- **Manuscript** - Warm, scholarly parchment aesthetic
- **Minimal** - Clean, sparse design
- **Terminal** - Dark hacker aesthetic
- **Friendly** - Accessible, light blue (for learning)
- **Handwritten** - Calligraphic fonts

### Custom Styling

Add customizations in `.notebook/theme.css` - they layer on top of the base theme:

```css
:root {
    --accent: #c45d3a;        /* Change the accent color */
    --bg-primary: #f8f6f3;    /* Change the background */
}
```

See `theme-reference.css` for all customizable CSS variables and selectors.

## Requirements

- **Node.js** (for the `notebook` CLI command)
- **Chrome or Edge** (requires File System Access API)
- **Python 3** (optional, only for `generate_index.py` dev tool)

## License

MIT
