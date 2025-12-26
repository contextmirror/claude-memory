# Changelog

All notable changes to this project will be documented in this file.

## [0.4.5] - 2025-12-26

### Changed
- Moved repository to contextmirror organization (contextmirror/claude-memory)

## [0.4.4] - 2025-12-26

### Changed
- Updated repository URLs to GitHub (nayballs/claude-memory)

## [0.4.3] - 2025-12-26

### Added
- Cross-project code search (Pro feature) - search code patterns across all your projects
- README badges (npm version, license, Node.js, Discord)
- Unit tests for license validation, staleness detection, version checking, and code search
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- GitHub issue and PR templates
- `.editorconfig` for consistent code style

### Changed
- CLI version now reads from package.json dynamically (no more version mismatches)
- Centralized constants in `src/constants.ts`
- Improved `.npmignore` to reduce package size

### Fixed
- Removed duplicate `LEMONSQUEEZY_VALIDATE_URL` constant

## [0.4.2] - 2025-12-24

### Added
- Staleness detection for projects
- Quick scan mode (`--quick`) to only rescan stale projects
- Update notifications (checks once per day)
- LemonSqueezy license validation

### Changed
- Improved project scanning performance

## [0.4.1] - 2025-12-22

### Added
- Setup wizard (`claude-memory setup`)
- CLAUDE.md briefing generation
- Project exclusion (`claude-memory exclude/include`)

## [0.4.0] - 2025-12-20

### Added
- Initial public release
- Project scanning and context generation
- MCP server for Claude Code integration
- Basic Pro license support
