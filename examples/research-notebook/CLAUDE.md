# CLAUDE.md

This is a Research Notebook for organizing literature reviews, paper summaries, and research ideas.

## Purpose

Use this notebook to:
- Summarize academic papers and articles
- Track research questions and hypotheses
- Document experimental results and analysis
- Maintain a literature review

## Directory Structure

```
research-notebook/
├── .notebook/              # Configuration
├── research/               # Main research notes
├── papers/                 # Paper summaries (create as needed)
├── experiments/            # Experiment logs (create as needed)
└── assets/thumbnails/      # Auto-generated
```

## File Formats

| Type | Extension | Example |
|------|-----------|---------|
| Notes | `.md` | `research/hypothesis.md` |
| Code | `.code.py` | `research/analysis.code.py` |
| Bookmarks | `.bookmark.json` | `papers/smith-2024.bookmark.json` |

## Creating Content

### Notes
```markdown
---
id: 1735200000000
title: Paper Summary - Smith 2024
author: Your Name
created: 2024-12-26T10:00:00Z
modified: 2024-12-26T10:00:00Z
tags: [paper, machine-learning]
---

## Key Findings
...
```

### Code Analysis
```python
# ---
# id: 1735200000001
# title: Data Analysis
# author: Your Name
# created: 2024-12-26T10:00:00Z
# modified: 2024-12-26T10:00:00Z
# ---

import pandas as pd
import matplotlib.pyplot as plt
# Analysis code...
```

## Tips for Research

- Use `[[Section > Title]]` to link related notes
- Tag papers with topics for easy filtering
- Run code cells to generate visualizations
- Search with `grep -r "keyword" --include="*.md"`
