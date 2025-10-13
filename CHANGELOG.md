# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] - 2025-10-13

### Fixed
- Corrected CHANGELOG release date
- Removed test files from npm package
- Removed unnecessary documentation files

## [1.6.0] - 2025-01-13

### Added
- **Intelligent File Path Detection**: Automatically detect and suggest file paths when recording context
  - Git status analysis: prioritizes staged, modified, and untracked files
  - Content analysis: extracts file paths from code content and comments
  - Context inference: learns from recent file operations
  - Confidence scoring: ranks suggestions by reliability (0-1 scale)
  - New utility module: `src/utils/file-path-detector.ts`
- Added `getProject()` method to DatabaseManager for retrieving projects by ID

### Changed
- Enhanced `record_context` tool to automatically detect file paths when not provided
- Unified CLI commands: both `devmind` and `devmind-mcp` now use the same CLI implementation
- Context metadata now includes path detection information (source, confidence, suggestions)

### Removed
- Removed redundant `cli-new.ts` file
- Cleaned up duplicate CLI implementation

### Fixed
- Improved context recording quality by reducing null file_path records
- Better metadata tracking for auto-detected file paths

## [1.5.2] - 2025-10-13

### Fixed
- **Critical**: Fixed Windows path case sensitivity causing duplicate projects
  - Windows filesystem is case-insensitive but SQLite string comparison is case-sensitive
  - Paths like `D:\codes\project` and `d:\codes\project` were treated as different projects
  - Added path normalization utility to ensure consistency on Windows platform
  - Created database migration script to merge existing duplicate projects
  - All sessions and contexts are preserved during merge
- Fixed incorrect Claude Code configuration file paths in documentation
  - Updated from `%APPDATA%\Claude\claude_desktop_config.json` to `~/.claude.json`

### Added
- Path normalization utility (`src/utils/path-normalizer.ts`)
- Database migration script (`scripts/fix-duplicate-projects.js`)
- Comprehensive fix documentation (`docs/fixes/windows-path-case-fix.md`)

### Changed
- Session manager now uses normalized paths consistently
- All project paths are converted to lowercase on Windows platform

## [1.5.1] - 2025-10-12

### Changed
- Updated README with accurate tool count and enhanced usage guide

## [1.5.0] - 2025-10-11

### Added
- Advanced project memory system
- Comprehensive project documentation generation
- Intelligent project indexing functionality

## [1.4.1] - 2025-10-11

### Fixed
- Resolved CLI issues and improved functionality
- Fixed ES module import path issues in project indexer

## [1.4.0] - 2025-10-11

### Added
- Smart project indexing functionality
- Intelligent project analysis and memory generation

## [1.3.0] - 2025-10-10

### Changed
- Redesigned session management for true cross-tool memory
- Implemented intelligent session reuse to prevent duplicate sessions

### Fixed
- Fixed session duplication issues

---

[1.6.1]: https://github.com/JochenYang/Devmind/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/JochenYang/Devmind/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/JochenYang/Devmind/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/JochenYang/Devmind/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/JochenYang/Devmind/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/JochenYang/Devmind/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/JochenYang/Devmind/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/JochenYang/Devmind/releases/tag/v1.3.0

