# Claude Memory Roadmap

## Vision

**The unified memory layer for Claude across all platforms.**

Claude Code, Claude in Chrome, Claude Desktop - all sharing context. No more cold starts. No more re-explaining. One memory, everywhere.

---

## Current State (v0.2.1) ✅

- [x] Project scanner (detects all projects in a directory)
- [x] CLAUDE.md generator (briefing command)
- [x] MCP server for Claude Code integration
- [x] Setup wizard with auto-configuration
- [x] New project auto-detection
- [x] Published on npm: `@contextmirror/claude-memory`

---

## Phase 1: Monetization Foundation (Week 1)

**Goal:** Get the Pro tier live and generating revenue

- [ ] LemonSqueezy approval (waiting)
- [ ] Create "claude-memory Pro" product ($8/mo)
- [ ] License key validation in CLI
- [ ] Deploy landing page to `claudememory.contextmirror.com`
- [ ] Publish v0.3.0 with license gating

**Pro Features (Phase 1):**
- AI-enhanced briefings (calls Claude API for smarter analysis)
- Priority support

---

## Phase 2: Chrome Extension Sync (Week 2-3) 🔥 FIRST MOVER

**Goal:** Bi-directional context sync between Claude Code and Claude in Chrome

**The Chrome extension released Dec 21, 2024. Nobody has built this yet.**

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code (Terminal)                  │
│  - Working on project                                       │
│  - Full conversation context                                │
│  - Saves session state via claude-memory                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (writes to disk)
┌─────────────────────────────────────────────────────────────┐
│                 ~/.claude-memory/                           │
│  - sessions/current.json     (active session context)       │
│  - sessions/history/         (past session summaries)       │
│  - sync/outbox/              (commands for Chrome Claude)   │
│  - sync/inbox/               (results from Chrome Claude)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (Native Messaging reads)
┌─────────────────────────────────────────────────────────────┐
│              Claude Memory Chrome Extension                 │
│  - Reads session context from disk                          │
│  - Injects into Claude.ai chat as context                   │
│  - Monitors for task handoffs                               │
│  - Writes results back to inbox                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (injected context)
┌─────────────────────────────────────────────────────────────┐
│                  Claude in Chrome (Browser)                 │
│  - Receives context: "You're working on claude-memory..."   │
│  - Knows the project, stack, what was discussed             │
│  - Can work on web tasks with full awareness                │
│  - Saves summary when done                                  │
└─────────────────────────────────────────────────────────────┘
```

### Tasks

- [ ] Design session state format (JSON schema)
- [ ] Add session export command to CLI: `claude-memory export-session`
- [ ] Build Chrome extension scaffold
- [ ] Implement Native Messaging host for file access
- [ ] Content script to detect claude.ai
- [ ] Context injection into chat input
- [ ] Task handoff protocol (Code → Chrome)
- [ ] Result sync protocol (Chrome → Code)
- [ ] Publish to Chrome Web Store

### User Flow

```
Terminal (Claude Code):
> "Go to Chrome Claude and build a landing page for this project"

Claude Code:
1. Saves session context to ~/.claude-memory/sync/outbox/task_001.json
2. Opens Chrome or signals extension
3. "I've handed off to Chrome Claude. It has full context."

Chrome (claude.ai):
1. Extension detects new task in outbox
2. Injects context: "Session handoff from Claude Code..."
3. User sees pre-filled context in chat
4. Works on the task
5. Saves result to inbox

Terminal (Claude Code):
> (detects inbox update)
> "Chrome Claude finished. Here's the summary: [landing page created at...]"
```

---

## Phase 3: Claude Desktop Sync (Week 4)

**Goal:** Extend sync to Claude Desktop app

- [ ] Research Claude Desktop extension/plugin system
- [ ] Desktop Extensions (.mcpb format) investigation
- [ ] Implement desktop sync if feasible
- [ ] Three-way sync: Code ↔ Chrome ↔ Desktop

---

## Phase 4: Advanced Features (Month 2+)

### Semantic Search
- [ ] Embed project summaries with local model
- [ ] "Which of my projects uses Redis?" → instant answer
- [ ] Cross-project pattern detection

### Auto-Sync
- [ ] File watcher for real-time updates
- [ ] Git hook integration (update memory on commit)
- [ ] Background daemon option

### Team Features
- [ ] Shared team memory (hosted)
- [ ] Onboarding docs for new team members
- [ ] Project handoff summaries

### IDE Integrations
- [ ] VS Code extension (sidebar showing project memory)
- [ ] JetBrains plugin
- [ ] Neovim integration

---

## Pricing Evolution

| Phase | Free | Pro ($8/mo) | Team ($20/seat) |
|-------|------|-------------|-----------------|
| 1 | Basic memory, MCP | AI briefings | - |
| 2 | Basic memory, MCP | + Chrome sync | - |
| 3 | Basic memory, MCP | + Desktop sync | - |
| 4 | Basic memory, MCP | Full sync + search | Shared memory |

---

## Competitive Moat

1. **First to market** on Chrome extension sync (extension is 2 days old)
2. **MCP-native** - built on the protocol Claude uses
3. **Local-first** - your data stays on your machine
4. **Cross-platform** - not locked to one Claude interface

---

## Success Metrics

- [ ] 100 npm installs (Week 1)
- [ ] 10 Pro subscribers (Week 2)
- [ ] Chrome extension published (Week 3)
- [ ] 50 Pro subscribers (Month 1)
- [ ] $400 MRR (Month 2)

---

## Links

- npm: https://www.npmjs.com/package/@contextmirror/claude-memory
- Store: https://contextmirror.lemonsqueezy.com (pending approval)
- Chrome Extension: (pending)

---

*Last updated: Dec 23, 2024*
