---
id: dev-session-card-type
title: Claude Code Session Card Type
author: Claude
created: 2024-12-13T10:00:00Z
modified: 2024-12-13T10:00:00Z
tags: [future]
---

# Claude Code Session Card Type

A new card type for displaying Claude Code conversation transcripts with a TUI aesthetic, collapsible detail levels, and drill-down navigation.

## Goals

1. **Preserve conversation history** - Import Claude Code sessions into the notebook
2. **Beautiful presentation** - TUI aesthetic matching Claude Code's terminal style
3. **Multi-level detail** - Collapse/expand to show summaries, messages, or full tool output
4. **Searchable archive** - Tag, organize, and search past sessions

## Session File Format Analysis

Claude Code stores sessions in `~/.claude/projects/{project-path}/{session-id}.jsonl`.

### JSONL Structure

Each line is a JSON object with a `type` field:

```
Line 0: { "type": "summary", "summary": "Fix duplicate cards...", "leafUuid": "..." }
Line 1: { "type": "file-history-snapshot", ... }
Line 2: { "type": "user", "message": { "role": "user", "content": "..." }, ... }
Line 3: { "type": "assistant", "message": { "content": [...] }, ... }
...
```

### Message Types

| Type | Description |
|------|-------------|
| `summary` | Session summary (auto-generated, first line) |
| `file-history-snapshot` | File state at session start |
| `user` | User messages (prompts and tool results) |
| `assistant` | Claude responses (text and tool calls) |

### User Message Structure

```json
{
  "type": "user",
  "uuid": "7beb6f58-...",
  "parentUuid": null,
  "timestamp": "2024-12-04T20:24:18.979Z",
  "cwd": "/Users/.../research-notebook",
  "sessionId": "fd286cbe-...",
  "version": "2.0.58",
  "gitBranch": "main",
  "message": {
    "role": "user",
    "content": "User's prompt text here..."
  }
}
```

**Tool result variant** (when content is array):
```json
{
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_01A7...",
        "content": "grep output here..."
      }
    ]
  }
}
```

### Assistant Message Structure

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-4-...",
    "content": [
      { "type": "text", "text": "Let me look at..." },
      {
        "type": "tool_use",
        "id": "toolu_01A7...",
        "name": "Grep",
        "input": { "pattern": "...", "path": "..." }
      }
    ],
    "stop_reason": "tool_use",
    "usage": { "input_tokens": 1234, "output_tokens": 567 }
  }
}
```

---

## Template Design

### Schema

```yaml
name: session
description: "Claude Code conversation transcript"

schema:
  title:
    type: text
    required: true
  summary:
    type: text
  session_id:
    type: text
  project:
    type: text
  started:
    type: datetime
  ended:
    type: datetime
  git_branch:
    type: text
  claude_version:
    type: text
  model:
    type: text
  total_tokens:
    type: number
  transcript:
    type: json  # Array of parsed messages
  tags:
    type: list
    item_type: text
```

### Card Layout

```yaml
card:
  layout: session  # New layout type
  preview_field: summary
  placeholder: "💬"
  # Show: summary, message count, date, token count
```

**Card preview mockup:**
```
┌─────────────────────────────────────────┐
│ 💬 Fix duplicate cards from title rename │
│                                         │
│ 15 messages · 12,453 tokens             │
│ Dec 4, 2024 · main branch               │
└─────────────────────────────────────────┘
```

### Viewer Layout

```yaml
viewer:
  layout: session  # New layout type
  # Hierarchical message display with expand/collapse
```

---

## UI Design: Message Display

### Detail Levels

**Level 1: Summary View**
```
┌─ Session ──────────────────────────────────────────────┐
│ Fix duplicate cards from title rename                  │
│ Dec 4, 2024 20:24 · 15 messages · 12,453 tokens       │
│                                                        │
│ ▶ User: There is a small bug in the UI...             │
│ ▶ Claude: [Grep, Read, Edit] Fixed footer positioning │
│ ▶ User: Great, that works now                         │
└────────────────────────────────────────────────────────┘
```

**Level 2: Message View** (expand a message)
```
┌─ User ─────────────────────────────────────────────────┐
│ There is a small bug in the UI for note cards (and    │
│ maybe other sorts) in preview mode, if they are too   │
│ long to fit in the window and so scrollable, when     │
│ you scroll to the bottom the footer containing edit   │
│ and delete buttons comes away from the bottom...      │
└────────────────────────────────────────────────────────┘

┌─ Claude ───────────────────────────────────────────────┐
│ Let me look at the CSS for the note viewer footer.    │
│                                                        │
│ ▶ Grep: note-viewer footer → 3 files                  │
│ ▶ Read: research_notebook.html:1338-1400              │
│                                                        │
│ I see the issue - the modal footer needs sticky       │
│ positioning. Let me fix that.                         │
│                                                        │
│ ▶ Edit: research_notebook.html (+3 lines)             │
└────────────────────────────────────────────────────────┘
```

**Level 3: Tool Detail** (expand a tool call)
```
┌─ Grep ─────────────────────────────────────────────────┐
│ Pattern: note-viewer.*footer                          │
│ Path: research_notebook.html                          │
│ ──────────────────────────────────────────────────────│
│ 1338: .note-viewer {                                  │
│ 1348: .note-viewer .modal-header {                    │
│ 1365: .note-viewer-content {                          │
│ ...                                                    │
└────────────────────────────────────────────────────────┘
```

### TUI Aesthetic

**Color scheme** (CSS variables):
```css
.session-viewer {
  --session-bg: #1e1e2e;           /* Dark background */
  --session-text: #cdd6f4;          /* Light text */
  --session-border: #45475a;        /* Subtle borders */
  --session-user: #a6e3a1;          /* Green for user */
  --session-claude: #89b4fa;        /* Blue for Claude */
  --session-tool: #f9e2af;          /* Yellow for tools */
  --session-error: #f38ba8;         /* Red for errors */
  --session-dim: #6c7086;           /* Muted text */
}
```

**Typography**:
- Monospace font throughout
- Box-drawing characters for borders (┌ ─ ┐ │ └ ┘)
- Role badges with background colors

---

## Implementation Plan

### Phase 1: Session Parser

**Goal:** Parse JSONL files into structured transcript data.

```javascript
// Parse session JSONL into structured format
function parseSessionFile(jsonlContent) {
  const lines = jsonlContent.trim().split('\n');
  const messages = [];
  let summary = null;
  let metadata = {};

  for (const line of lines) {
    const obj = JSON.parse(line);

    switch (obj.type) {
      case 'summary':
        summary = obj.summary;
        break;
      case 'user':
        messages.push(parseUserMessage(obj));
        break;
      case 'assistant':
        messages.push(parseAssistantMessage(obj));
        break;
    }
  }

  return { summary, messages, metadata };
}
```

### Phase 2: Session Template

**Goal:** Add `session` template with schema and layouts.

Tasks:
- [ ] Add `session` to `getDefaultTemplates()`
- [ ] Add `.session.json` extension mapping
- [ ] Implement `renderSessionPreview()` card layout
- [ ] Implement `renderSessionViewer()` viewer layout

### Phase 3: Message Renderer

**Goal:** Render messages with TUI styling and collapse/expand.

Tasks:
- [ ] `renderUserMessage(msg, collapsed)`
- [ ] `renderAssistantMessage(msg, collapsed)`
- [ ] `renderToolCall(tool, collapsed)`
- [ ] `renderToolResult(result, collapsed)`
- [ ] CSS for TUI aesthetic
- [ ] Click handlers for expand/collapse

### Phase 4: Import Mechanism

**Goal:** Import sessions from `~/.claude/projects/`.

Options:
1. **Manual import** - User selects session file, imports to notebook
2. **Session browser** - Modal showing available sessions to import
3. **Auto-discover** - Show sessions from linked project automatically

Recommended: Start with manual import (simplest), add browser later.

Tasks:
- [ ] "Import Session" button in toolbar or section
- [ ] File picker for `.jsonl` files
- [ ] Parse and save as `.session.json` in section
- [ ] Optional: Session browser modal

### Phase 5: Polish

- [ ] Search within session transcript
- [ ] Filter by tool type
- [ ] Copy code blocks from tool results
- [ ] Export session as markdown
- [ ] Token usage visualization

---

## File Format: .session.json

Imported sessions saved as JSON (not JSONL) for easier editing:

```json
{
  "id": "session-fd286cbe",
  "template": "session",
  "title": "Fix duplicate cards from title rename",
  "summary": "Fixed footer positioning bug in note viewer",
  "session_id": "fd286cbe-e2c7-4fd8-90a2-a76f7520db80",
  "project": "research-notebook",
  "started": "2024-12-04T20:24:18.979Z",
  "ended": "2024-12-04T20:45:32.123Z",
  "git_branch": "main",
  "claude_version": "2.0.58",
  "model": "claude-sonnet-4",
  "total_tokens": 12453,
  "tags": ["bugfix", "css"],
  "transcript": [
    {
      "role": "user",
      "timestamp": "2024-12-04T20:24:18.979Z",
      "content": "There is a small bug in the UI..."
    },
    {
      "role": "assistant",
      "timestamp": "2024-12-04T20:24:25.123Z",
      "content": [
        { "type": "text", "text": "Let me look at the CSS..." },
        { "type": "tool_use", "name": "Grep", "input": {...}, "result": "..." }
      ]
    }
  ]
}
```

---

## Open Questions

1. **Storage size** - Session files can be large (5-10MB). Store full transcript or summarized?
2. **Tool result truncation** - Full tool output can be huge. Truncate or lazy-load?
3. **Thinking blocks** - Include Claude's thinking (when available)?
4. **Editing** - Should sessions be editable, or read-only archives?
5. **Linking** - Link to files mentioned in session? Auto-detect `@file` references?

---

## Success Criteria

- [ ] Can import a Claude Code session file
- [ ] Session displays with summary, messages, tools in TUI style
- [ ] Can expand/collapse to different detail levels
- [ ] Sessions are searchable and taggable
- [ ] Renders well on both light and dark themes

---

*Status: Planning - ready for implementation*
