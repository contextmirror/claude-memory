# Contributing to Claude Memory

Thank you for your interest in contributing to claude-memory! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/claude-memory.git`
3. Install dependencies: `npm install`
4. Build the project: `npm run build`

## Development Workflow

### Building

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode for development
```

### Testing

```bash
npm test           # Run tests
```

### Running Locally

```bash
# Test CLI commands
node dist/cli.js --help
node dist/cli.js scan ~/Projects
node dist/cli.js list

# Test MCP server
node dist/cli.js mcp
```

## Code Style

- We use TypeScript with strict mode enabled
- Follow existing code patterns and naming conventions
- Keep functions focused and well-documented
- Add JSDoc comments for public APIs

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, descriptive commits
3. Ensure all tests pass
4. Update documentation if needed
5. Submit a pull request with a clear description

### PR Title Format

Use conventional commit format:
- `feat: Add new feature`
- `fix: Fix bug in scanner`
- `docs: Update README`
- `refactor: Improve code structure`

## Reporting Issues

When reporting bugs, please include:

1. **Version**: Run `claude-memory --version`
2. **OS**: Your operating system and version
3. **Node version**: Run `node --version`
4. **Steps to reproduce**: Clear steps to reproduce the issue
5. **Expected vs actual behavior**
6. **Error messages**: Full error output if applicable

## Feature Requests

We welcome feature requests! Please:

1. Check existing issues to avoid duplicates
2. Clearly describe the use case
3. Explain why this would benefit other users

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Questions?

- Join our [Discord](https://discord.gg/JBpsSFB7EQ) for discussion
- Open an issue for questions about the codebase

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
