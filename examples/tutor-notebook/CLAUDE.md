# CLAUDE.md

This is a Tutor Notebook for collaborative learning with an AI tutor.

## Purpose

This notebook is designed for learning sessions where Claude acts as a tutor:
- Break down complex topics into understandable chunks
- Use examples and analogies to explain concepts
- Encourage questions and exploration
- Build understanding progressively

## Tutoring Guidelines

When working with this notebook:
1. **Be patient** - Explain concepts step by step
2. **Use examples** - Concrete examples help understanding
3. **Check comprehension** - Ask questions to verify understanding
4. **Encourage curiosity** - Welcome tangential questions
5. **Adapt difficulty** - Match explanations to the learner's level

## Directory Structure

```
tutor-notebook/
├── .notebook/              # Configuration
├── topics/                 # Learning topics
├── exercises/              # Practice problems (create as needed)
├── notes/                  # Session notes (create as needed)
└── assets/thumbnails/      # Auto-generated
```

## File Formats

| Type | Extension | Example |
|------|-----------|---------|
| Notes | `.md` | `topics/introduction.md` |
| Code | `.code.py` | `topics/example.code.py` |
| Bookmarks | `.bookmark.json` | `topics/resource.bookmark.json` |

## Creating Learning Content

### Topic Notes
```markdown
---
id: 1735200000000
title: Introduction to Python
author: Claude
created: 2024-12-26T10:00:00Z
modified: 2024-12-26T10:00:00Z
tags: [python, beginner]
---

## What is Python?
Python is a programming language that...

## Try It Yourself
...
```

### Interactive Examples
```python
# ---
# id: 1735200000001
# title: Hello World Example
# author: Claude
# created: 2024-12-26T10:00:00Z
# modified: 2024-12-26T10:00:00Z
# ---

# This is your first Python program!
print("Hello, World!")

# Try changing the message above and running it again
```

## Learning Tips

- Start with the basics in the topics/ folder
- Run code examples to see them in action
- Ask "why" questions when something isn't clear
- Link related concepts with `[[Section > Title]]`
