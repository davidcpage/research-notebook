# Self-Contained Card Type Modules (dp-092)

*Design document for extracting card types into modular folders*

## Goal

Extract card types into self-contained module folders (`template.yaml` + `styles.css` + optional `index.js`) to create a clear framework/extension boundary.

## Motivation

The current architecture has card type logic spread across three locations:
- **Templates**: `defaults/templates/*.yaml`
- **CSS**: `css/app.css` within `@layer templates` blocks (~1900 lines)
- **JS**: `js/app.js` TEMPLATE_SYSTEM section (custom render functions, ~1000+ lines)

This makes it hard to:
- Understand how a single card type works (must read 3 files)
- Add new card types (must modify core files)
- Customize card types in workspace instances
- Ship domain-specific card bundles (e.g., teaching vs research)

## Current Architecture

```
defaults/templates/
├── index.json          # Template manifest
├── note.yaml
├── code.yaml
├── bookmark.yaml
├── quiz.yaml
├── quiz-response.yaml
└── quiz-response-summary.yaml

css/app.css             # All template CSS in @layer templates blocks
js/app.js               # renderQuizPreview(), renderQuizResponseSummaryViewer(), etc.
```

**Dispatch mechanism**: Switch statements in `renderCardPreview()` (line ~1433) and `renderViewerContent()` dispatch by `layout` field.

## Target Architecture

```
card-types/
├── index.json           # Module manifest
├── note/
│   ├── template.yaml    # Schema, layouts, editor config (required)
│   └── styles.css       # Card + viewer CSS (optional)
├── code/
│   ├── template.yaml
│   └── styles.css
├── quiz-response-summary/
│   ├── template.yaml
│   ├── styles.css
│   └── index.js         # Custom render + behavior (optional)
└── ...
```

**Resolution order**: `.notebook/card-types/X/` → `card-types/X/` (instance overrides core)

## Module Contract

### template.yaml
Same as current - no changes needed.

### styles.css
- Extracted from `app.css` `@layer templates` blocks
- Scoped via existing `[data-template="X"]` selectors
- Injected into `@layer templates` at load time

### index.js (ES Module, optional)
```javascript
// Import framework utilities
import { escapeHtml, findCardById, marked } from '/js/framework.js';

export function renderPreview(card, template) {
    // Returns HTML string
    return `<div>${escapeHtml(card.title)}</div>`;
}

export function renderViewer(card, template) {
    // Returns HTML string
}

// Optional: lifecycle hooks
export function onViewerOpen(card, element) { }
export function onSave(card) { }

// Optional: custom actions (exposed to onclick handlers)
export const actions = {
    submitGrade(data) { ... },
    openResponse(id) { ... }
};
```

## Design Decisions

1. **System card types** (settings, template, theme): **Keep in core** - they're meta/config types, not user-facing content

2. **Framework utilities exposure**: **ES module imports** from `/js/framework.js`. Fallback to `window.notebook` if browser compat issues arise.

3. **CSS @layer injection**: Single aggregated `<style>` element for performance

4. **Scope**: Full extraction including complex types (quiz, quiz-response-summary) in first pass

## Files Modified

**New files:**
- `js/framework.js` - ES module exporting utilities for card type modules
- `card-types/index.json` - Module manifest
- `card-types/note/template.yaml`, `styles.css`
- `card-types/code/template.yaml`, `styles.css`
- `card-types/bookmark/template.yaml`, `styles.css`
- `card-types/image/template.yaml`, `styles.css`
- `card-types/quiz/template.yaml`, `styles.css`, `index.js`
- `card-types/quiz-response/template.yaml`, `styles.css`, `index.js`
- `card-types/quiz-response-summary/template.yaml`, `styles.css`, `index.js`

**Modified:**
- `js/app.js` - Add module loader, remove extracted render functions, update dispatch
- `css/app.css` - Remove extracted template CSS (~1900 lines)
- `CLAUDE.md` - Document new card-types/ architecture

**Deleted:**
- `defaults/templates/*.yaml` (moved to card-types/*/template.yaml)
- Keep `defaults/theme.css` (used for new notebook defaults, not a card type)

## Migration Path for Instance Customization

When a user wants to customize a card type:
1. Copy `card-types/X/` to `.notebook/card-types/X/`
2. Edit as needed
3. Instance version auto-detected on next load
4. "Modified" badge shown in system UI (like we do for templates today)

## Related Issues

- dp-092: Parent issue for this work
- dp-088: Teacher workspace example (depends on this)
