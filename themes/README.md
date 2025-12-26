# Research Notebook Themes

A collection of themes for the Research Notebook application.

## How to Use

### In the App (Future)

The app will provide a theme picker UI to browse and apply themes. Selected themes are copied to your notebook's `.notebook/theme.css`.

### Manual Copy (Current)

To apply a theme manually:

```bash
cp themes/manuscript.css my-notebook/.notebook/theme.css
```

Then refresh the notebook in your browser.

## Available Themes

| Theme | File | Description |
|-------|------|-------------|
| Manuscript | `manuscript.css` | Warm, scholarly parchment aesthetic with textured backgrounds |
| Minimal | `minimal.css` | Clean, sparse design with subtle accents |
| Terminal | `terminal.css` | Dark hacker aesthetic with green-on-black terminal feel |
| Handwritten | `handwritten.css` | Calligraphic style using handwriting fonts |

## Theme Registry

The `index.json` file provides a registry of available themes:

```json
{
  "themes": [
    {
      "id": "manuscript",
      "name": "Manuscript",
      "description": "Warm, scholarly parchment aesthetic with textured backgrounds"
    }
  ]
}
```

The app loads this registry to populate the theme picker. Each theme's CSS is loaded from `/themes/{id}.css`.

## Creating Your Own Theme

Themes use CSS custom properties and `[data-template="..."]` selectors. See [theme-reference.css](/theme-reference.css) in the repo root for all customizable selectors.

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
3. Import Google Fonts with `@import` at the top of your CSS
4. Test both light and dark card types (notes vs code)

### Adding a New Theme

1. Create `themes/your-theme.css` with your styles
2. Add an entry to `themes/index.json` with id, name, and description
