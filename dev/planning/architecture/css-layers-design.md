# CSS Architecture: Cascade Layers for Robust Theming

**Date:** 2025-12-15
**Branch:** `css-layers-refactor`
**Status:** Design

## Issues

| Issue | Phase | Description |
|-------|-------|-------------|
| 012 | 1 | Layer infrastructure - inline hljs CSS, remove `!important` |
| 013 | 2 | Organize existing CSS into layers |
| 014 | 3 | Consolidate shared patterns (.md-content) |
| 011 | - | Parent issue (blocked by 012, 013, 014) |

## Problem

The current CSS architecture has precedence issues that make theme.css overrides difficult:

1. **Highlight.js conflicts**: The app loads atom-one-dark theme from CDN, then overrides it with `!important` at lines 1174-1179 and 1494-1499
2. **Cascading `!important`**: Users must also use `!important` in theme.css to override our overrides
3. **Scattered overrides**: hljs overrides split across multiple locations
4. **Duplication**: Markdown typography repeated in `.preview-content`, `.viewer-markdown`, `.viewer-description`

### Current CSS Load Order

```
1. highlight.js CDN <link>     → atom-one-dark.min.css
2. Main <style> block          → 2200+ lines of app CSS
3. Template styles (dynamic)   → #template-styles element
4. Theme.css (dynamic)         → #theme-css element
```

The problem: hljs CDN styles often have equal or higher specificity than our overrides, forcing `!important`.

## Solution: CSS Cascade Layers

CSS `@layer` provides explicit cascade control independent of specificity or source order.

### Layer Order

```css
@layer reset, vendors, base, components, templates;
```

| Layer | Purpose | Example Contents |
|-------|---------|------------------|
| `reset` | Normalizations | `* { box-sizing: border-box }` |
| `vendors` | Third-party | Highlight.js atom-one-dark theme |
| `base` | Foundation | `:root` variables, typography |
| `components` | UI elements | Cards, modals, buttons, forms |
| `templates` | Card types | Note, code, bookmark styling |
| *(unlayered)* | **User theme** | theme.css - always wins |

**Key insight**: Unlayered styles always beat layered styles, regardless of specificity. This means theme.css automatically has highest precedence.

### Why This Works

```css
/* In @layer vendors */
.hljs { background: #282c34; }

/* In @layer base - wins over vendors, no !important */
.md-content .hljs { background: transparent; }

/* In theme.css (unlayered) - wins over everything */
.md-content .hljs { background: #f0f0f0; }
```

## Implementation Plan

### Phase 1: Layer Infrastructure (Primary goal)

**Changes:**
1. Add layer order declaration at top of CSS
2. Inline atom-one-dark.min.css (~100 lines) in `@layer vendors`
3. Remove CDN `<link>` tag (keep hljs JS library)
4. Remove all `!important` from hljs override rules

**Result:** Theme.css authors can override any style without `!important`.

### Phase 2: Organize CSS into Layers

Wrap existing CSS sections in appropriate layers:

```css
@layer reset {
  * { margin: 0; padding: 0; box-sizing: border-box; }
}

@layer base {
  :root { --bg-primary: #f8f6f3; ... }
  body { font-family: 'Source Sans 3', sans-serif; ... }
}

@layer components {
  .card { ... }
  .modal { ... }
}

@layer templates {
  .card[data-template="note"] { ... }
}
```

**Result:** Clear mental model of where styles belong.

### Phase 3: Consolidate Shared Patterns

Create shared base classes to eliminate duplication:

```css
/* Single source of truth for markdown typography */
.md-content {
  line-height: 1.7;
  font-size: 0.925rem;
}
.md-content h1, .md-content h2, .md-content h3 {
  font-family: 'Playfair Display', serif;
}
/* ... all typography rules */
```

Update render functions to apply `.md-content` class, then remove duplicated rules from `.preview-content`, `.viewer-markdown`, `.viewer-description`.

**Result:** Single place to update markdown styling.

## Browser Support

CSS Layers require:
- Chrome 99+ (March 2022)
- Edge 99+
- Firefox 97+
- Safari 15.4+

The app requires File System Access API (Chrome/Edge only), so layer support is guaranteed.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Layer syntax errors | Test in browser immediately after each change |
| Visual regressions | Compare before/after screenshots |
| Highlight.js update breaks inlined CSS | Version-pin the inlined theme (document source) |

**Rollback**: If issues arise, remove layer declarations and restore CDN link.

## Validation Checklist

After implementation:
- [ ] Syntax highlighting works in note card code blocks
- [ ] Syntax highlighting works in code card split-pane
- [ ] Syntax highlighting works in viewer modal
- [ ] Theme.css can override `.hljs` background without `!important`
- [ ] Theme.css can override markdown heading colors without `!important`
- [ ] No visual regressions in default theme

## References

- [MDN: CSS Cascade Layers](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Cascade_layers)
- [CSS-Tricks: Cascade Layers Explainer](https://css-tricks.com/css-cascade-layers/)
- Highlight.js atom-one-dark source: `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css`
