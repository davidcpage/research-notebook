# Refactoring Notes

Issues and opportunities identified during code organization (December 2024).
Use INDEX.md to navigate to relevant sections.

## Completed Quick Wins

### 1. ✅ Removed `codeDisplayMode` variable
- Was unused global toggle replaced by per-item `showOutput` boolean

### 2. ✅ Moved `currentViewingBookmark` to STATE_AND_CONFIG
- Now grouped with `currentViewingNote` and `currentViewingCode`

### 3. ✅ Removed redundant comments after section markers
- Removed 5 duplicate comments like `// Bookmark Modal` that appeared after section markers

### 4. ✅ Updated INDEX.md to use line counts instead of line numbers
- Prevents cascading updates when editing any section
- Use `grep -n "SECTION:"` for actual line numbers

## Repetitive Patterns

### 2. Modal functions follow identical patterns
- **Locations**: SECTION_MODAL, SETTINGS_MODAL, BOOKMARK_MODAL, NOTE_MODAL, CODE_MODAL
- **Pattern**: Each has `openXxxModal()`, `closeXxxModal()`, `saveXxx()` with similar:
  - Populate section dropdown
  - Set editing state
  - Fill form fields
  - Show modal
  - On save: validate, create/update item, close modal, show toast
- **Opportunity**: Create generic `openModal(config)`, `closeModal(id)`, `saveModal(config)` helpers
- **Complexity**: Medium - modals have slight differences (code has run button, note has preview tabs)

### 3. Viewer functions are repetitive
- **Locations**: NOTE_VIEWER, BOOKMARK_VIEWER, CODE_VIEWER
- **Pattern**: Each has `openXxxViewer()`, `closeXxxViewer()`, `editCurrentXxx()`, `deleteCurrentXxx()` with similar:
  - Find section and item by ID
  - Set `currentViewingXxx` state
  - Populate DOM elements
  - Render backlinks
  - Add 'active' class to modal
- **Opportunity**: Create `openViewer(type, sectionId, itemId)` with type-specific renderers
- **Complexity**: Medium - content rendering differs significantly between types

### 4. Card render functions share structure
- **Location**: RENDER_FUNCTIONS section
- **Functions**: `renderBookmarkCard()`, `renderNoteCard()`, `renderCodeCard()`
- **Pattern**: All generate:
  - Outer card div with click handler
  - Preview frame (180px)
  - Content area with title
  - Meta area with dates
- **Opportunity**: Create `renderCard(type, sectionId, item)` wrapper with type-specific preview renderers
- **Complexity**: Low-Medium - preview content differs but wrapper is identical

## Remaining Opportunities

### Medium effort (consider if time permits):
- Consolidate card render functions (renderBookmarkCard, renderNoteCard, renderCodeCard share structure)
- Extract common viewer logic (openXxxViewer functions are similar)

### Larger refactors (only if adding features):
- Generic modal system (worth it if adding more modal types)
- Component-based architecture (only if app grows significantly)

## Notes for Next Session

- Compare sections side-by-side using INDEX.md section sizes
- Test in browser after each change
- Update INDEX.md section sizes if significantly restructuring a section
