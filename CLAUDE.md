# Claude Memory

Cross-project memory for Claude Code. Know about ALL your projects, not just the one you're in.

## What This Does

Solves the "cold start" problem: every Claude Code session starts fresh, unaware of your other projects. Claude Memory:

1. **Scans** your projects directory
2. **Extracts** key info (name, description, tech stack, recent activity)
3. **Generates** a global context file
4. **Exposes** it via MCP so Claude Code can query it

## Quick Start

```bash
# Install
npm install -g claude-memory

# Scan your projects
claude-memory scan ~/Projects

# Check what was found
claude-memory list

# Start MCP server (for Claude Code integration)
claude-memory mcp
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `scan [directory]` | Scan projects and update global context |
| `list` | List known projects |
| `show <project>` | Show details for a project |
| `exclude <project>` | Exclude a project from future scans |
| `include <project>` | Remove a project from exclusion list |
| `excluded` | List excluded projects |
| `briefing [directory]` | Generate a detailed CLAUDE.md for a project |
| `init` | Generate CLAUDE.md for current project (alias for briefing) |
| `mcp` | Start MCP server for Claude Code integration |
| `setup` | Run the interactive setup wizard |
| `activate <key>` | Activate a Pro license key |
| `status` | Show license status |
| `deactivate` | Remove Pro license |

## MCP Tools

When connected to Claude Code, these tools become available:

| Tool | Purpose |
|------|---------|
| `get_global_context` | Overview of all your projects |
| `get_project_summary` | Details about a specific project |
| `search_projects` | Search across all projects |
| `record_insight` | Save cross-project patterns |
| `get_project_analysis` | Deep analysis for CLAUDE.md generation |
| `search_code` | **[PRO]** Search code patterns across all projects |

## Project Structure

```
claude-memory/
├── src/
│   ├── cli.ts                 # CLI entry point
│   ├── constants.ts           # Centralized constants
│   ├── scanner/
│   │   ├── projectScanner.ts  # Finds and analyzes projects
│   │   ├── contextGenerator.ts # Generates markdown context
│   │   └── stalenessDetector.ts # Detects stale project data
│   ├── mcp/
│   │   └── server.ts          # MCP server for Claude Code
│   ├── license/
│   │   ├── index.ts           # License management
│   │   └── types.ts           # License types
│   ├── briefing/
│   │   └── briefingGenerator.ts # CLAUDE.md generation
│   ├── setup/
│   │   └── setupWizard.ts     # Interactive setup
│   ├── utils/
│   │   ├── codeSearch.ts      # Cross-project code search (Pro)
│   │   └── updateChecker.ts   # Version update checker
│   ├── types/
│   │   └── index.ts           # TypeScript types
│   └── __tests__/             # Unit tests
├── .github/
│   ├── ISSUE_TEMPLATE/        # Bug report & feature request templates
│   └── PULL_REQUEST_TEMPLATE.md
├── landing/
│   └── index.html             # Landing page
├── package.json
├── tsconfig.json
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── SECURITY.md
```

## How It Works

1. **Scan phase** (`claude-memory scan`):
   - Walks through ~/Projects (or specified directory)
   - Identifies project roots (package.json, Cargo.toml, etc.)
   - Extracts: name, description, tech stack, git info
   - Writes to `~/.claude-memory/context.json`

2. **Query phase** (MCP server):
   - Claude Code connects via MCP
   - Can query global context, project details, or search
   - Context informs Claude about your development environment

## Data Storage

```
~/.claude-memory/
├── context.json        # Machine-readable project data (schema v1)
├── context.json.bak    # Backup of previous context
├── global-context.md   # Human-readable overview
├── config.json         # User configuration
└── license.json        # Pro license (if activated)
```

## Reliability Features

- **Atomic writes**: Uses temp file + rename to prevent corruption
- **Write verification**: Verifies JSON can be parsed after write
- **Automatic backup**: Creates `.bak` file before overwriting
- **Schema versioning**: Automatic migration when format changes
- **Insight preservation**: User insights preserved across rescans
- **Git timeout**: 10s timeout prevents hanging on slow repos
- **Stale data warning**: MCP warns if data is >24 hours old

## Pro Features

Activate with `claude-memory activate <key>`. Get a license at https://contextmirror.lemonsqueezy.com

| Feature | Description |
|---------|-------------|
| Cross-project code search | Search code patterns across all your projects |
| Semantic search | Search by meaning, not just keywords (coming soon) |
| Custom templates | Per-language CLAUDE.md templates (coming soon) |

**Pricing**: $5/month via LemonSqueezy

**License validation**: LemonSqueezy UUID keys are validated against their API. Legacy `CM-XXXX-XXXX-XXXX` keys are also supported for backwards compatibility.

## Community

- **Discord**: https://discord.gg/JBpsSFB7EQ
- **npm**: https://www.npmjs.com/package/@contextmirror/claude-memory
- **GitHub**: https://github.com/contextmirror/claude-memory

## Development

```bash
# Build
npm run build

# Run tests
npm test

# Test CLI
node dist/cli.js --help

# Run MCP server
node dist/cli.js mcp
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Setting up the development environment
- Running tests
- Submitting pull requests

## Testing

Unit tests are in `src/__tests__/`. Run with:

```bash
npm test        # Watch mode
npm test -- --run  # Single run
```

Current test coverage:
- License key validation
- Staleness detection
- Version comparison
- Code search formatting
