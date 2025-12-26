---
id: dev-server-architecture-review
title: Server Architecture Review
author: Claude
created: 2025-12-26T19:00:00Z
modified: 2025-12-26T19:00:00Z
tags: [architecture, future]
---

# Server Architecture Review

*Post-refactor review of patterns that were designed around single-file/no-server constraints*

## Context

The app now runs via a Node.js CLI server (`notebook` command). Many architectural decisions were made when we were targeting:
1. Single HTML file distribution
2. Double-click to open (file:// protocol)
3. No ES modules (blocked by file:// in browsers)

This document captures patterns that could be revisited now that we have a server.

---

## 1. ES Module Splitting for app.js

**Current**: Single 6100-line `js/app.js` with section markers
**Alternative**: Split into ES modules (state.js, render.js, editor.js, etc.)

**Why it was rejected** (commit d35f7e4):
> ES modules incompatible with file:// protocol. Regular script splitting provides no encapsulation benefit.

**Now that we have a server**:
- ES modules would work fine via HTTP
- Could enable tree-shaking, better IDE support, cleaner imports
- Section markers + generate_index.py work well enough for navigation

**Recommendation**: Low priority. The single file with sections works, and the module splitting attempt showed marginal benefit. Revisit if the file grows significantly or we add build tooling for other reasons.

---

## 2. File Watching: Browser API vs Server-Side

**Current**: FileSystemObserver API (Chrome 129+, experimental)
**Alternative**: Server-side file watcher with WebSocket push

| Aspect | FileSystemObserver | Server-Side Watcher |
|--------|-------------------|---------------------|
| Browser support | Chrome 129+ only | Any browser |
| Reliability | New API, may change | Mature (chokidar, etc.) |
| Complexity | Zero server code | Adds WebSocket handling |
| Offline | Works | Requires server running |

**Now that we have a server**:
- Server-side watching (chokidar + WebSocket) would work in any browser
- Would be more reliable than the experimental browser API
- But adds significant server complexity (currently server is ~100 lines)

**Recommendation**: Medium priority. Consider if we expand server functionality for other reasons (see #5). The FileSystemObserver works for Chrome users; others can use manual refresh.

---

## 3. File System Access API vs Server File I/O

**Current**: Browser reads/writes files directly via File System Access API
**Alternative**: Server handles file I/O, browser communicates via REST/WebSocket

| Aspect | File System Access API | Server File I/O |
|--------|----------------------|-----------------|
| Browser support | Chrome/Edge only | Any browser |
| Offline editing | Works | No |
| Server complexity | Minimal (static files) | Full file API needed |
| Security | User grants folder access | Server has fs access |

**Now that we have a server**:
- Could enable Firefox/Safari support
- But loses offline capability and adds significant server complexity
- Current model is elegant: server just serves app files, browser handles all notebook I/O

**Recommendation**: Keep current approach. The tradeoff (Chrome-only) is acceptable given the simplicity benefit. File System Access API is the right tool for this job.

---

## 4. CDN Dependencies vs Local Bundling

**Current**: All dependencies from CDNs (jsDelivr, esm.sh, cdnjs)
```
- PDF.js (Mozilla CDN)
- Marked.js (jsDelivr)
- KaTeX (cdnjs)
- Pyodide (jsDelivr)
- Highlight.js (cdnjs)
- CodeMirror 6 (esm.sh via import map)
- js-yaml (esm.sh)
- jsdiff (esm.sh)
```

**Alternative**: Bundle locally or serve from our server

| Aspect | CDN | Local Bundle |
|--------|-----|--------------|
| Offline | No | Yes |
| Load time | Browser-cached across sites | Must download once |
| Maintenance | Auto-updates (risky) | Manual updates (stable) |
| Build step | None | Required |

**Now that we have a server**:
- Could serve dependencies locally for offline support
- Pyodide is 15MB+ so CDN caching is valuable
- Build step would complicate the "no build" philosophy

**Recommendation**: Low priority. CDN approach works well. Could add offline support later via service worker if there's demand, without changing to bundling.

---

## 5. Server Capabilities Expansion

**Current server does**: Static file serving only (~100 lines)

**Potential server features**:
1. **File watching + WebSocket** - Cross-browser change detection
2. **Full-text search** - Index notebook content, grep alternative
3. **Image optimization** - Resize thumbnails server-side
4. **Git integration** - Commit/push from UI
5. **Multi-notebook** - Serve multiple notebooks, switch between them
6. **Collaboration** - Sync between users (complex)

**Tradeoff**: Each feature adds complexity and moves logic from browser to server. Currently the split is clean: server serves files, browser does everything else.

**Recommendation**: Keep server minimal for now. The clean separation is a feature. Consider specific additions only if there's clear user demand.

---

## 6. Global State Management

**Current**: ~15 global `let` variables at top of app.js
```javascript
let data = { ... };
let collapsedSections = new Set();
let pyodide = null;
let notebookDirHandle = null;
let filesystemLinked = false;
// etc.
```

**Alternative**: State management pattern (module, class, or store)

**This isn't really a server constraint issue**, but worth noting:
- Global state works fine for a single-page app of this size
- No framework means no framework's state management
- Adding a store pattern would be over-engineering

**Recommendation**: No change needed. The current approach is appropriate for the app's complexity.

---

## Summary

| Pattern | Priority | Recommendation |
|---------|----------|----------------|
| ES module splitting | Low | Keep single file; revisit if grows significantly |
| Server-side file watching | Medium | Consider if expanding server for other reasons |
| Server file I/O | None | Keep File System Access API |
| Local bundling | Low | Keep CDN; consider service worker for offline |
| Server expansion | Case-by-case | Keep minimal; add features only with clear demand |
| Global state | None | Current approach is appropriate |

**Overall**: The current architecture is sound. The server enables dynamic loading of themes/templates, which was the main goal. Most "now that we have a server" opportunities add complexity without proportional benefit.
