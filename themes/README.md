# Research Notebook Themes

A collection of themes for the Research Notebook application.

## How to Use

Copy any theme file to your notebook's `.notebook/theme.css`:

```bash
cp themes/manuscript.css my-notebook/.notebook/theme.css
```

Then refresh the notebook in your browser.

## Available Themes

| Theme | Description |
|-------|-------------|
| `manuscript.css` | Warm, scholarly parchment aesthetic with textured backgrounds |
| `minimal.css` | Clean, sparse design with subtle accents |
| `terminal.css` | Dark hacker aesthetic with green-on-black terminal feel |
| `handwritten.css` | Calligraphic style using handwriting fonts |

## Creating Your Own Theme

Themes use CSS custom properties and `[data-template="..."]` selectors. See the [theme.css reference](/theme.css) in the repo root for all customizable selectors.

### Key Concepts

**Global variables** (in `:root`):
- `--bg-primary`, `--bg-secondary` - page backgrounds
- `--text-primary`, `--text-secondary`, `--text-muted` - text colors
- `--accent`, `--border` - UI accents
- `--link-color`, `--link-hover` - link styling

**Template variables** (scoped to card types):
- `--template-bg`, `--template-border` - card background/border
- `--template-title-text`, `--template-meta-text` - typography
- `--template-code-bg`, `--template-code-text` - code styling

**Selectors**:
- `.card[data-template="note"]` - note cards
- `.modal.viewer[data-template="note"]` - note viewer
- `.card[data-template="code"]` - code cards
- `.card[data-template="bookmark"]` - bookmark cards

### Tips

1. Define template variables on both card and viewer selectors for consistency
2. Use CSS gradients for texture effects (see manuscript.css)
3. Import Google Fonts with `@import` at the top of your theme
4. Test both light and dark card types (notes vs code)
