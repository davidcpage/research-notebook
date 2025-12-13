---
id: dev-tags-future
title: Tags - Configuration & Cards
author: Claude
created: 2024-12-13T16:00:00Z
modified: 2024-12-13T16:00:00Z
tags: [future, tags]
---

# Tags - Configuration & Cards

Ideas for extending the tag system beyond basic display.

## Tag Configuration

Allow custom tag colors/icons in settings:

```yaml
# In .notebook/settings.yaml
tags:
  completed:
    color: "#8a9a7a"
    icon: "✓"
  blocked:
    color: "#ef4444"
    icon: "⚠"
```

## Tag Cards (TiddlyWiki style)

Each tag could be a card that:
- Defines its appearance (color, icon)
- Contains a description of what the tag means
- Auto-lists all cards with that tag (requires backlink system)

This creates a wiki-like experience where tags are first-class entities.

## Search by Tag

- Filter cards by tag in search
- Tag facets in sidebar
- Keyboard shortcut to filter: `t:ongoing`

## Multi-tag Display

Current UI shows all tags which can get crowded. Options:
- Limit display to N tags with "+X more" overflow
- Show only status tags on cards, all tags in viewer
- Collapsible tag list
