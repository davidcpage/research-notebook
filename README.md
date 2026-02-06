# Research Notebook

A browser-based research management tool that combines bookmarks, markdown notes, and executable Python code with file-based storage. Designed for use alongside Claude Code.

**[Try it online](https://davidcpage.github.io/research-notebook/)** — no installation required (Chrome/Edge only)

### Example Notebooks

- [Demo Notebook](https://davidcpage.github.io/research-notebook/?github=davidcpage/research-notebook@main/examples/demo-notebook) — showcases all card types and features
- [Research Notebook](https://davidcpage.github.io/research-notebook/?github=davidcpage/research-notebook@main/examples/research-notebook) — manuscript theme, research-focused
- [Dev Notebook](https://davidcpage.github.io/research-notebook/?github=davidcpage/research-notebook@main/examples/dev-notebook) — terminal theme, code-focused
- [Tutor Notebook](https://davidcpage.github.io/research-notebook/?github=davidcpage/research-notebook@main/examples/tutor-notebook) — friendly theme with quizzes for learning

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

### Quick Start (Online)

1. Open the [online app](https://davidcpage.github.io/research-notebook/) (Chrome/Edge required)
2. Click **Link Folder** and select a directory for your notebook
3. Grant file access when prompted
4. Start adding notes, bookmarks, and code cells

Your files stay on your local machine — the browser reads/writes directly via the File System Access API.

### Local Installation (Optional)

For git diff features and the `nb` CLI tool:

```bash
git clone https://github.com/davidcpage/research-notebook.git
cd research-notebook
npm link
notebook
```

### Using an Example Template

Preview the examples online (see links above), then copy one as your starting point:

```bash
cp -r examples/research-notebook ~/my-project
```

Or save directly from the online preview using the "Save to Folder" button.

### Collaborative Editing with Google Drive

You can share a notebook folder with collaborators using Google Drive while preserving local file access for Claude Code:

**Owner setup:**
1. Install [Google Drive for Desktop](https://www.google.com/drive/download/)
2. Create your notebook folder inside `~/Google Drive/My Drive/`
3. Right-click the folder in Google Drive web → Share → Add collaborators as "Editor"

**Collaborator setup:**
1. Install Google Drive for Desktop
2. Open the shared folder in [Google Drive web](https://drive.google.com)
3. Right-click → Organize → **Add shortcut to Drive** (required for local sync)
4. The folder now syncs to your local `~/Google Drive/My Drive/`
5. Open the local folder in the notebook app and Claude Code as usual

**Notes:**
- Only the owner's storage quota is used
- Free tier: 15GB (plenty for text-based notebooks)
- Changes sync automatically between collaborators
- Simultaneous edits to the same file can conflict — works best with turn-taking or editing different files

**Alternatives:** [Dropbox](https://www.dropbox.com) (2GB free) or [Syncthing](https://syncthing.net) (peer-to-peer, no cloud storage) offer similar local-folder sync workflows.

## Card CLI (`nb`)

The `nb` command helps create cards with correct frontmatter:

```bash
# List available card types
nb types

# Show schema and example frontmatter for a type
nb schema note
nb schema code
nb schema bookmark

# Create cards
nb create note "My Research Note" research/
nb create code "Data Analysis" research/experiments/
nb create bookmark "Useful Reference" references/
```

The CLI reads schemas directly from `card-types/{type}/template.yaml`, so it always reflects the current schema.

## Using Notebooks in Other Projects

You can use research notebooks in any project (code repos, documentation, etc.) without polluting your CLAUDE.md with notebook instructions.

### Setup

```bash
# In your project
mkdir -p .claude/skills

# Symlink the notebook skill
ln -s /path/to/research-notebook/.claude/skills/notebook .claude/skills/notebook

# Ensure nb CLI is available (run once in research-notebook repo)
cd /path/to/research-notebook && npm link
```

### Usage

The `/notebook` skill provides Claude with instructions for creating and managing cards. You can:

1. **Invoke directly**: Type `/notebook` to load the skill
2. **Reference in CLAUDE.md**: Add a note like "Use /notebook skill when creating cards"

The skill teaches Claude to use `nb schema <type>` for on-demand schema queries, keeping context lean.

## Application Structure

```
repo/
├── package.json        # npm package (provides 'notebook' and 'nb' commands)
├── cli.js              # Local server
├── nb.js               # Card CLI (types, schema, create)
├── index.html          # HTML shell (~210 lines)
├── css/app.css         # Application styles (~2800 lines)
├── js/app.js           # Application logic (~6500 lines)
├── defaults/           # Default templates and theme
├── themes/             # Built-in themes (manuscript, terminal, etc.)
├── card-types/         # Card type modules (template.yaml, styles.css)
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
