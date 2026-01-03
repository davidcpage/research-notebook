---
id: dev-card-ordering
title: Card Ordering - number Field
author: Claude
created: 2025-01-03T12:00:00Z
modified: 2025-01-03T12:00:00Z
tags: [completed, sorting]
---

# Card Ordering: `number` Field

Add explicit ordering support for cards within sections/subdirectories using the `number` field.

## Problem

Currently cards sort by:
1. Hardcoded template priority (quiz → summary → others)
2. Subdirectory path (legacy, now redundant with tree rendering)
3. `number` field (lesson-specific)
4. Modified date

Users need a general way to order cards manually. The lesson `number` field works but was previously lesson-specific.

## Solution

### 1. Generalize `number` field (optional, all cards)

Supports semantic versioning style: `1`, `1.1`, `1.10`, `2.0`

```yaml
# In frontmatter
number: 1.2
```

Lessons already have this field. Other card types can now use it too for explicit ordering. To interleave a note between lessons 1.2 and 2.1, give the note `number: 1.5`.

## Sort Logic

```javascript
section.items.sort((a, b) => {
    // 1. Number field (supports "1.1" versioning)
    if (a.number != null && b.number != null) {
        const cmp = compareVersionNumbers(a.number, b.number);
        if (cmp !== 0) return cmp;
    } else if (a.number != null) return -1;
    else if (b.number != null) return 1;

    // 2. Modified date (newest first)
    return (b._fileModified || 0) - (a._fileModified || 0);
});
```

## Removed

- Subdirectory path sorting (now handled by tree grouping in `buildSubdirTree()`)
- `responseFolder` special case for quiz-response-summary

## Implementation

1. **Extract sort function**: `sortSectionItems(section)` helper
2. **Add helper**: `compareVersionNumbers(a, b)` - semantic version comparison
3. **Editor**: Add universal `number` field (skipped for templates that define their own)
4. **Re-sort on save**: Call `sortSectionItems()` after saving a card
5. **Fix**: Updated `serializeCard()` to exclude all underscore-prefixed internal fields

## Files Changed

- `js/app.js`:
  - `compareVersionNumbers()`, `sortSectionItems()` helpers
  - Editor: universal number field (skipped if template defines `number`)
  - Save: parse number field, re-sort section after save
  - Fix: `serializeCard()` excludes all `_`-prefixed fields
- `CLAUDE.md`: Document number field for ordering
