# claude-memory

[![npm version](https://img.shields.io/npm/v/@contextmirror/claude-memory.svg)](https://www.npmjs.com/package/@contextmirror/claude-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Discord](https://img.shields.io/discord/1454173469242822669?color=5865F2&label=Discord&logo=discord&logoColor=white)](https://discord.gg/JBpsSFB7EQ)

Cross-project memory for Claude Code. Give Claude awareness of ALL your projects, not just the one you're in.

## The Problem

Every Claude Code session starts fresh. Switch to a different project folder and Claude has no idea about your other work. You end up re-explaining your codebase, your patterns, your architecture.

**Without claude-memory:**
- "I have an API server in another folder that uses the same auth pattern..."
- "My component library has a Button I want to reuse..."
- "How did I handle this in my other project again?"

Claude doesn't know. It can't see outside the current directory.

## The Solution

```bash
npm install -g @contextmirror/claude-memory
claude-memory setup
```

Now Claude knows about all your projects. Ask "What other projects do I have?" or "How do I handle auth in my API?" and Claude just knows.

## Quick Start

### 1. Install globally

```bash
npm install -g @contextmirror/claude-memory
```

### 2. Run the setup wizard

```bash
claude-memory setup
```

This will:
- Scan your projects directory
- Configure MCP for Claude Code
- Optionally generate CLAUDE.md files

### 3. Restart Claude Code

That's it. Claude now has access to your project memory.

---

**Alternative: Manual setup**

```bash
# Scan your projects
claude-memory scan ~/Projects

# Add MCP to Claude Code (create ~/.mcp.json)
{
  "mcpServers": {
    "claude-memory": {
      "command": "claude-memory",
      "args": ["mcp"]
    }
  }
}
```

## What Can You Ask?

Once set up, try asking Claude:

| Question | What Claude Does |
|----------|------------------|
| "What projects do I have?" | Lists all your projects with tech stacks |
| "Tell me about my API server" | Shows project details, branch, recent activity |
| "Which projects use React?" | Searches across all projects |
| "Generate a CLAUDE.md for this project" | Creates context documentation |
| "Is my project data up to date?" | Checks for stale data |
| "How do I handle auth in my other projects?" | Cross-project pattern lookup |

## Features

| Feature | Description |
|---------|-------------|
| **Cross-project awareness** | Claude knows about all your projects |
| **Staleness detection** | Automatically detects when projects need rescanning |
| **Quick scans** | Only rescan projects that have changed |
| **Update notifications** | Get notified when new versions are available |
| **CLAUDE.md generation** | Auto-generate project documentation |
| **MCP integration** | Works seamlessly with Claude Code |

## Commands

| Command | Description |
|---------|-------------|
| `claude-memory setup` | Interactive setup wizard (recommended) |
| `claude-memory scan [dir]` | Scan directory for projects |
| `claude-memory scan --quick` | Only rescan stale projects |
| `claude-memory scan --check` | Check what's stale without scanning |
| `claude-memory list` | List known projects |
| `claude-memory show <project>` | Show project details |
| `claude-memory briefing [dir]` | Generate CLAUDE.md for a project |
| `claude-memory init` | Generate CLAUDE.md for current project |
| `claude-memory exclude <project>` | Exclude project from future scans |
| `claude-memory include <project>` | Re-include an excluded project |
| `claude-memory mcp` | Start MCP server |

## Staleness Detection

claude-memory tracks when your projects change:

```bash
claude-memory scan --check

# Output:
# 🧠 Claude Memory - Staleness Check
#
# ⚠️  2 project(s) need updating:
#   📝 my-project (New commits since last scan)
#   📄 another-project (Key files modified)
#
# Run `claude-memory scan --quick` to refresh only stale projects.
```

**Detection methods:**
- **Git activity** - New commits since last scan
- **File changes** - package.json, CLAUDE.md, etc. modified
- **Age** - Projects not scanned in 7+ days

## MCP Tools

When connected, Claude Code gets access to these tools:

| Tool | Purpose |
|------|---------|
| `get_global_context` | Overview of all projects + staleness info |
| `get_project_summary` | Details about a specific project |
| `get_project_analysis` | Deep analysis for CLAUDE.md generation |
| `search_projects` | Search across all projects |
| `record_insight` | Save cross-project patterns |
| `search_code` | **[Pro]** Search code across all projects |

### Example Interactions

**Ask about all projects:**
> "What projects do I have?"

Claude uses `get_global_context` and responds:
> "You have 5 projects: dashboard-app (React/Next.js), api-server (Node/Express), component-library (React/Storybook), cli-tool (TypeScript), and landing-site (Vite)."

**Get details about a specific project:**
> "Tell me about the api-server"

Claude uses `get_project_summary` and responds:
> "api-server is a Node.js/Express API with JWT authentication. It's on the `feature/auth` branch with uncommitted changes. Last activity was 2 days ago."

**Search across projects:**
> "Which of my projects use Tailwind?"

Claude uses `search_projects` and responds:
> "2 projects use Tailwind CSS: dashboard-app and landing-site."

**Generate documentation:**
> "Create a CLAUDE.md for this project"

Claude uses `get_project_analysis` to gather deep context, then writes a comprehensive CLAUDE.md file.

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Project A     │     │  Claude Memory  │     │   Claude Code   │
│   (React App)   │────>│   MCP Server    │<────│                 │
├─────────────────┤     │                 │     │  "What projects │
│   Project B     │────>│  ~/.claude-     │     │   use React?"   │
│   (API Server)  │     │  memory/        │     │                 │
├─────────────────┤     │  context.json   │     └─────────────────┘
│   Project C     │────>│                 │
│   (CLI Tool)    │     └─────────────────┘
└─────────────────┘
```

1. **Scan** - Finds projects by looking for package.json, Cargo.toml, pyproject.toml, go.mod, .git
2. **Extract** - Pulls name, description, tech stack, git info, CLAUDE.md content
3. **Store** - Saves to `~/.claude-memory/context.json`
4. **Serve** - MCP server exposes context to Claude Code
5. **Detect** - Monitors for staleness on each session start

## Data Storage

All data stays local on your machine:

```
~/.claude-memory/
├── context.json        # Project metadata (machine-readable)
├── context.json.bak    # Automatic backup
├── global-context.md   # Human-readable overview
├── config.json         # User configuration
├── update-check.json   # Update check cache (1/day)
└── license.json        # Pro license (if activated)
```

## Troubleshooting

### "No projects found"

Make sure you're pointing to the right directory:
```bash
# Check what directory you're scanning
claude-memory scan ~/Projects --check

# Common locations to try:
claude-memory scan ~/Code
claude-memory scan ~/dev
claude-memory scan ~/projects
```

Projects are detected by these files: `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or `.git`

### "MCP tools not showing up in Claude Code"

1. Make sure `.mcp.json` exists in your home directory or project
2. Restart Claude Code completely (not just the conversation)
3. Check the MCP config is valid JSON:
```json
{
  "mcpServers": {
    "claude-memory": {
      "command": "claude-memory",
      "args": ["mcp"]
    }
  }
}
```

### "Data seems outdated"

Run a quick scan to refresh stale projects:
```bash
claude-memory scan --quick
```

Or do a full rescan:
```bash
claude-memory scan ~/Projects
```

### "Git operations are slow"

If you have large repos, git operations may timeout (10s limit). This is normal - the project will still be scanned, just without git info.

### "Want to exclude a project"

```bash
# Exclude a project from future scans
claude-memory exclude my-secret-project

# See what's excluded
claude-memory excluded

# Re-include it later
claude-memory include my-secret-project
```

## Pro Features

Activate with `claude-memory activate <key>`. Get a license at https://claude-memory.dev

| Feature | Description |
|---------|-------------|
| Cross-project code search | Search code patterns across all your projects |
| Semantic search | Search by meaning, not just keywords (coming soon) |

## Update Notifications

claude-memory checks for updates automatically (once per day). When a new version is available:

```
⬆️ Update available: v0.4.0 → v0.5.0

Run to update:
npm update -g @contextmirror/claude-memory
```

## FAQ

**Does this use Claude API tokens?**
No. claude-memory only stores metadata locally. It uses MCP to expose that data to Claude Code - no additional API calls.

**Does it work with Claude Pro/Team?**
Yes. It works with any Claude Code subscription.

**What languages are supported?**
Any language. Tech stack detection works best for: JavaScript/TypeScript, Python, Rust, Go. Others show as "other" but still work.

**How often should I rescan?**
Run `claude-memory scan --quick` when you've made changes to multiple projects. The `--quick` flag only rescans stale projects.

**Is my code uploaded anywhere?**
No. All data stays in `~/.claude-memory/` on your machine. Nothing is sent to any server.

## Community

Join our Discord for feedback, feature requests, and support:

[![Discord](https://img.shields.io/discord/1454173469242822669?color=5865F2&label=Discord&logo=discord&logoColor=white)](https://discord.gg/JBpsSFB7EQ)

## License

MIT

## Author

Nathan (with Claude as co-developer)

---

*[GitHub](https://github.com/contextmirror/claude-memory)*
