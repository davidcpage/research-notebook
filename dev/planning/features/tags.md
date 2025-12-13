---
id: dev-tags-v1
title: Tags - Basic Display
author: Claude
created: 2024-12-13T14:00:00Z
modified: 2024-12-13T16:00:00Z
tags: [completed, tags]
---

# Tags: Basic Display

Added tags as an optional field on all card types, with visual display and status-based colors.

## What's Implemented

- **Display**: Tags show as small badges below card titles and in viewer title bar
- **Status colors**: `completed` (sage), `ongoing` (terracotta), `future` (blue)
- **Editor**: Simple comma-separated text input
- **Storage**: Tags saved as array in frontmatter

## Key Functions

- `normalizeTags(tags)` - handles array, string, or YAML-style `[a, b]` formats
- `renderTagBadges(card, containerClass, noWrapper)` - renders tag badges HTML

## CSS Variables (customizable in theme.css)

```css
--tag-default-bg: #6b7280;
--tag-completed-bg: #8a9a7a;
--tag-ongoing-bg: #c4956a;
--tag-future-bg: #6a9db8;
```
