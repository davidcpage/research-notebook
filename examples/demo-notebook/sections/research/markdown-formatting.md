---
id: note-markdown-formatting
title: Markdown & LaTeX Support
created: 2024-12-08T09:00:00Z
modified: 2024-12-08T09:00:00Z
---

# Writing Notes

Research Notebook supports full **Markdown** formatting with LaTeX math rendering.

## Text Formatting

You can use *italics*, **bold**, `inline code`, and ~~strikethrough~~.

## Lists

- Bullet points work naturally
- Nested items are supported
  - Like this one
  - And this

## Code Blocks

```python
import numpy as np
x = np.linspace(0, 2*np.pi, 100)
```

## Mathematics

Inline math uses single dollars: $E = mc^2$

Display math uses double dollars:

$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$

The quadratic formula: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

## Internal Links

Link to other items using double brackets: [[Research > Research Notebook on GitHub]]

This creates navigable connections between your notes, bookmarks, and code.
