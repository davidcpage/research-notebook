# Research Notebook Themes

A collection of themes for the Research Notebook application, implemented as ES modules for dynamic loading.

## How to Use

### In the App (Future)

The app will provide a theme picker UI to browse and apply themes. Selected themes are copied to your notebook's `.notebook/theme.css`.

### Manual Copy (Current)

Each theme exists as both a `.js` module and a `.css` file. To apply a theme manually:

```bash
# Option 1: Copy the CSS file directly
cp themes/manuscript.css my-notebook/.notebook/theme.css

# Option 2: Extract CSS from the JS module
node -e "import('./themes/manuscript.js').then(m => console.log(m.default))" > my-notebook/.notebook/theme.css
```

Then refresh the notebook in your browser.

## Available Themes

| Theme | File | Description |
|-------|------|-------------|
| Manuscript | `manuscript.js` | Warm, scholarly parchment aesthetic with textured backgrounds |
| Minimal | `minimal.js` | Clean, sparse design with subtle accents |
| Terminal | `terminal.js` | Dark hacker aesthetic with green-on-black terminal feel |
| Handwritten | `handwritten.js` | Calligraphic style using handwriting fonts |

## ES Module Format

Themes are JavaScript ES modules that export CSS as a default string:

```javascript
// themes/manuscript.js
export const name = "Manuscript";
export const description = "Warm, scholarly parchment aesthetic";
export default `
/* CSS content here */
:root {
    --bg-primary: #faf8f3;
    /* ... */
}
`;
```

### Theme Registry

The `index.js` module provides a registry of available themes:

```javascript
import { themes, loadTheme, getThemeCSS } from './themes/index.js';

// List available themes
themes.forEach(t => console.log(t.id, t.name, t.description));

// Load a theme dynamically
const css = await getThemeCSS('manuscript');
```

### Why ES Modules?

ES module `import()` works with the `file://` protocol in modern browsers, allowing the app to dynamically load themes without a server. The `.css` files are kept for backwards compatibility and manual use.

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
2. Use CSS gradients for texture effects (see manuscript.js)
3. Import Google Fonts with `@import` at the top of your CSS
4. Test both light and dark card types (notes vs code)

### Adding a New Theme

1. Create `themes/your-theme.js` following the export format above
2. Add an entry to `themes/index.js` in the `themes` array
3. Optionally create `themes/your-theme.css` for manual use
