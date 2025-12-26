# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Do NOT create a public GitHub issue for security vulnerabilities.**

Instead, please report security issues via:

1. **Email**: Contact the maintainer directly through GitHub
2. **Discord DM**: Message a moderator on our [Discord server](https://discord.gg/JBpsSFB7EQ)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

This is a personal open source project maintained in spare time. We'll do our best to:

1. Acknowledge receipt of your report
2. Investigate and validate the issue
3. Work on a fix when possible
4. Credit you in the release notes (unless you prefer anonymity)

**Note**: Response times depend on maintainer availability. There are no guaranteed SLAs for this free, open source project.

## Security Best Practices

### For Users

- Keep claude-memory updated to the latest version
- Don't share your `~/.claude-memory/` directory publicly
- Review any CLAUDE.md files before committing them
- Pro license keys should be kept private

### Data Privacy

claude-memory stores all data locally in `~/.claude-memory/`:
- No data is sent to external servers (except license validation for Pro)
- Project metadata stays on your machine
- You can delete all data by removing the `~/.claude-memory/` directory

## Known Security Considerations

1. **License Validation**: Pro license keys are validated against LemonSqueezy's API. Keys are sent over HTTPS.

2. **File System Access**: The scanner reads project files (package.json, README.md, etc.) to extract metadata. It does not modify your project files unless explicitly requested.

3. **MCP Server**: The MCP server communicates via stdio with Claude Code. No network connections are opened.
