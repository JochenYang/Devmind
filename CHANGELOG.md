# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.18.3] - 2025-10-27

### Enhanced
- **Memory Graph Tooltip Interaction**: Significantly improved tooltip usability
  - Added hover state tracking to prevent accidental tooltip triggers
  - Tooltip only appears when mouse is truly over a node
  - Mouse can smoothly move from node to tooltip for scrolling long content
  - Intelligent positioning to prevent tooltip from going off-screen
  - Added custom scrollbar styling for better visual experience
  - Fixed tooltip disappearing immediately when trying to scroll

### Improved
- **Memory Graph Layout Optimization**: Better handling of large node counts
  - Dynamic link distance based on node importance (80-180px range)
  - Stronger repulsion force for important nodes (-300 to -500)
  - Adaptive label spacing based on node importance
  - Zone attraction strength decreases as node count increases
  - Larger radial distance for zones with many nodes
  - Significantly reduced node overlap in dense graphs

### Fixed
- **Critical**: Fixed JavaScript syntax error in generated HTML
  - Removed duplicate `}, 500);` in setTimeout closure
  - HTML files now load correctly in all browsers
- **Tooltip Interaction**: Fixed tooltip disappearing when mouse moves to it
  - Added `isMouseOverTooltip` flag to track tooltip hover state
  - Tooltip stays visible when mouse transitions from node to tooltip
  - Only hides after mouse leaves both node and tooltip areas

### Technical Details
- Added `currentHoverNode` variable to track active node hover
- Added `isMouseOverTooltip` flag for tooltip interaction state
- Enhanced collision detection with importance-based spacing
- Dynamic force parameters based on zone node density
- Improved tooltip positioning algorithm with boundary detection

## [1.18.2] - 2025-10-27

### Fixed
- Fixed critical bug where undefined arguments caused "Cannot destructure property" errors
- Added safe argument handling for all Tool and Prompt calls
- Improved error messages when required parameters are missing

## [1.18.1] - 2025-10-27

### Improved
- Enhanced tool descriptions for better AI model understanding
- Added comprehensive multi-file context usage examples
- Improved documentation with v1.18.0 feature guidelines
- Optimized tool parameter descriptions for clarity

## [1.18.0] - 2025-10-24

### Added
- **Multi-file Context Support**: Record and track contexts spanning multiple files
  - New `context_files` table for storing file associations
  - Support for tracking change types, line ranges, and diff statistics per file
  - Automatic migration of existing single-file contexts to new system
  - Backward compatible with single `file_path` parameter
- **Enhanced Search Performance**: Multi-dimensional scoring and intelligent caching
  - Hybrid scoring combining semantic similarity (40%), keyword matching (30%), quality (20%), and freshness (10%)
  - LRU cache with 5-minute TTL for repeated searches
  - File-based filtering with new `file_path` parameter in `semantic_search`
  - Search result caching with `use_cache` parameter (default: true)
- **Parallel Embedding Generation**: Significantly faster vector embedding processing
  - Configurable concurrency with `concurrency` parameter (default: 5)
  - Batch processing with automatic error handling
  - Performance statistics including processing speed (embeddings/sec)
  - Up to 5x speed improvement for large context sets
- **Intelligent Language Detection**: Automatic project language detection for localized auto-recording
  - Analyzes code comments to determine project language (Chinese/English)
  - Falls back to README detection if comments are insufficient
  - Daemon auto-recording messages now use detected language
  - Supports bilingual projects with smart detection

### Changed
- `record_context` tool now supports `files_changed` array parameter for multi-file recording
- `semantic_search` tool enhanced with `file_path` and `use_cache` parameters
- `generate_embeddings` tool now supports parallel processing with `concurrency` parameter
- Database schema extended with `context_files` table and indexes
- `DatabaseManager.createContext()` now automatically creates file associations when `file_path` is provided

### Fixed
- Data migration now handles contexts with NULL `file_path` correctly
- File watcher initialization fixed for ES modules (replaced `require` with dynamic `import`)
- CLI and daemon now properly record file associations in `context_files` table
- CLI `extract` command now correctly records line number information for documentation files

### Technical
- Added `SearchCache` class with LRU eviction and TTL support
- Added `ContextFileManager` for managing file-context relationships
- Added `LanguageDetector` utility for intelligent project language detection
- Implemented multi-dimensional scoring algorithm in `VectorSearchEngine`
- Added parallel embedding generation methods: `batchGenerateEmbeddingsParallel()` and `batchUpdateEmbeddings()`
- Database migration system for seamless upgrade from v1.17.0
- Lazy initialization pattern for `ContextFileManager` to avoid circular dependencies

## [1.17.0] - 2025-10-22

### Added
- **CLI Optimize Command**: Implemented memory optimization to clean up duplicate and low-quality contexts
  - `devmind optimize <project-id>` - Remove duplicates and low-quality contexts
  - `--dry-run` flag to preview changes without applying
  - Automatic detection of duplicate contexts (95%+ similarity)
  - Removal of low-quality contexts (score < 0.3, older than 60 days)
- **CLI Backup/Restore Commands**: Full database backup and restore functionality
  - `devmind maintenance backup` - Export database to JSON
  - `devmind maintenance restore <file>` - Import database from JSON backup
  - `--output` flag to specify custom backup location
  - `--force` flag to skip confirmation prompts
  - Automatic user confirmation before overwriting data
- **Enhanced Git Monitoring**: Improved daemon Git operation tracking
  - Real-time monitoring of `.git/refs/heads` directory
  - Automatic recording of commit messages, hashes, and changed files
  - Records author information and commit metadata
- **Terminal Command Monitoring**: Basic shell history tracking
  - Monitors `.bash_history` and `.zsh_history` files
  - Whitelist filtering (npm, git, node, python, docker, etc.)
  - Automatic sensitive information filtering (passwords, tokens, API keys)
  - `--no-terminal` flag to disable terminal monitoring
  - 5-second polling interval for new commands

### Changed
- Database methods extended with optimization and export capabilities
- Daemon monitoring now includes both Git and terminal activity
- CLI commands now provide more detailed output and statistics

### Technical
- Added `findDuplicateContexts()` method to DatabaseManager
- Added `getLowQualityContexts()` method to DatabaseManager
- Added `deleteContextsBatch()` method for efficient bulk deletion
- Added `getAllProjects/Sessions/Contexts/Relationships()` export methods
- Added `clearAllData()` method for database reset
- Enhanced daemon with configurable monitoring options

## [1.16.2] - 2025-10-21

### Enhanced
- **Memory Graph Type-to-Zone Mapping**: New context types now automatically map to appropriate visualization zones
  - Added `typeToZone` mapping system to categorize 22+ context types into 6 visual regions
  - Code types (`code_create`, `code_modify`, `code_refactor`, etc.) → Blue Code/Test zone
  - Bug types (`bug_fix`, `bug_report`, `bug_analysis`) → Red Error zone
  - Feature types (`feature_add`, `feature_update`, `feature_improvement`) → Green Solution zone
  - Documentation types (`docs_update`) → Purple Documentation zone
  - Configuration types (`dependency_update`) → Pink Configuration zone
  - All 14 new fine-grained types properly cluster in their semantic zones

### Changed
- Node positioning now uses zone mapping instead of direct type matching
- Force simulation updated to pull nodes toward their mapped zone centers
- Maintains visual clarity with 6 base zones while supporting unlimited type expansion

### Technical
- New `typeToZone` object maps all context types to base visualization zones
- Node initialization respects zone mapping for consistent spatial distribution
- Force-directed layout uses zone-based positioning (typeX, typeY, radial forces)
- Each node stores its `zone` property for efficient force calculations

## [1.16.1] - 2025-10-21

### Fixed
- **Critical**: Fixed `export_memory_graph` tool schema error that caused tool registration failure
  - Removed incorrect `required: true` from `project_id` property definition
  - Tool now correctly registers and can be called by AI assistants
- **UI Cleanup**: Removed emoji decorators from tool descriptions
  - `update_quality_scores`: Removed 🚀 [NEW] prefix
  - `export_memory_graph`: Removed 📊 [NEW] prefix
  - Improves consistency and reduces visual clutter in tool listings

### Technical
- JSON Schema compliance: `required` field now only at `inputSchema` level
- Tool descriptions now follow consistent plain-text format

## [1.16.0] - 2025-10-21

### Added
- **14 New Context Types**:
  - Code: `code_create`, `code_modify`, `code_delete`, `code_refactor`, `code_optimize`
  - Bug: `bug_fix`, `bug_report`
  - Feature: `feature_add`, `feature_update`, `feature_remove`
  - Debug: `debug_session`, `test_add`, `test_fix`
  - Docs: `docs_update`
  
- **Enhanced Metadata Fields**:
  - Change tracking: `change_type`, `change_reason`, `impact_level`
  - Code analysis: `affected_functions`, `affected_classes` (auto-extracted)
  - Relations: `related_files`, `related_issues`, `related_prs`
  - Business: `business_domain`, `priority`
  - Stats: `diff_stats`, `files_changed` array

- **Auto-Extraction**:
  - Detects change types from code comments
  - Extracts function/class names (8 languages supported)
  - Assesses impact levels automatically
  - Parses issue/PR numbers from comments

### Changed
- Memory graph now includes all 22 context types in filter dropdown
- Type filter organized into 6 groups: Core Types, Code Changes, Bug Related, Features, Debug & Test, Documentation
- Added Chinese translations for all new types
- Color mapping: new types inherit base type colors (blue/red/green/purple)

### Fixed
- **Multi-file Context Storage**: Fixed `file_path` field incorrectly storing single file path for multi-file changes
  - When using `files_changed` array, `file_path`, `line_start`, and `line_end` are now correctly set to `null`
  - Actual file information properly stored in `metadata.files_changed`
  - Enhanced response message now shows all files in multi-file changes with individual diff stats
  - Fixes issue where multi-file commits appeared to only touch one file

### Technical
- New `EnhancedContextMetadata` interface
- Enhanced `ContentExtractor` module with 7 analysis methods
- Zero schema changes (backward compatible)
- Multi-file tracking via `files_changed` array
- Auto-aggregation of diff stats across all files
- Auto-population of `related_files` from `files_changed`

## [1.15.2] - 2025-10-20

### Enhanced
- **🎨 Memory Graph Visualization Improvements**:
  - **Simplified Export**: Removed mermaid and json formats, kept HTML-only to reduce AI confusion
  - **Complete Node Type Legend**:
    - Added all 6 node types with bilingual support (Chinese/English)
    - Color-coded: Conversation (Yellow), Documentation (Purple), Solution (Green), Code/Test (Blue), Error (Red), Config/Commit (Pink)
  - **Type-Based Zone Clustering**:
    - Visual zone backgrounds with colored circles
    - Zone labels showing type names (dynamically sized)
    - Hexagonal layout with nodes grouped by type
    - Dynamic zone sizing based on node count
  - **Advanced Collision Detection**:
    - Collision radius includes label space (35px buffer)
    - Prevents node label overlap
    - Stronger collision forces (strength 0.9)
  - **Dynamic Zone Spacing**:
    - Automatic spacing: maxRadius × 2.8 + 120px
    - Zones adjust positions based on content volume
    - Prevents zone overlap when nodes are numerous
  - **Fixed Double-Click Toggle**:
    - Added `locked` flag to distinguish manual lock from drag
    - Yellow border (4px) indicates locked state
    - Properly toggles lock/unlock on double-click
    - Drag-end only clears fx/fy for unlocked nodes
  - **Improved Drag Responsiveness**:
    - Increased alphaTarget to 0.5 during drag
    - Better follow-through when dragging nodes

### Technical Details
- Zone radius formula: `baseRadius + √(nodeCount) × 15`
- Safe distance: `maxRadius × 2.8 + 120px`
- Collision radius: node radius + 35px label space
- Click delay: 250ms to prevent single-click interference
- Force parameters: charge -400, type attraction 0.5

### User Experience
- Clear visual grouping by node type
- No overlapping labels even with many nodes
- Smooth drag interactions
- Intuitive lock/unlock with visual feedback
- Bilingual zone labels

## [1.15.1] - 2025-10-20

### Enhanced
- **🎨 Memory Graph HTML Visualization Enhancements**:
  - **UI Beautification**:
    - Gradient background (purple-blue gradient)
    - Glassmorphism effects on control panels (backdrop blur + transparency)
    - Custom tooltips with rich metadata display
    - Smooth animations (0.3s transitions on all interactions)
  - **Multi-language Support**:
    - Full Chinese/English language toggle
    - All UI elements support i18n (controls, labels, legends, stats)
    - Language switcher button in control panel
  - **Interactive Features**:
    - Time range filter (All Time, Last 24h, 7d, 30d, 90d)
    - Type filter (All Types, Solution, Error, Code, Documentation, etc.)
    - Search with content matching (searches in labels, content, and tags)
    - Combined filters work together (time + type + search)
  - **Node Interactions**:
    - Click node → Highlight related nodes and connections
    - Double-click node → Fix/unfix position (shows golden border when fixed)
    - Hover node → Show custom tooltip with full details
    - Click background → Clear selection
  - **Layout Optimization**:
    - Importance-based positioning: high-quality nodes naturally gravitate to center
    - Smooth initial animation: nodes spawn from center and spread outward
    - Radial force (0.05 strength) gently pulls important nodes inward
  - **Export Features**:
    - "Reset Layout" button: unlock all nodes and restart simulation
    - "Export JSON" button: download complete graph data
    - Real-time statistics update based on active filters

### Changed
- Simplified layout options: removed complex multi-layout system
  - Kept only force-directed layout (most effective for knowledge graphs)
  - Removed radial, tree, and grid layouts (caused visual clutter)
- Updated node initialization: center-based spawning for better first impression

### Fixed
- Filter combination logic: time + type + search now work correctly together
- Link visibility: connections properly hide when related nodes are filtered out
- Statistics accuracy: node/relationship counts update dynamically with filters

### Technical Details
- Enhanced CSS with glassmorphism and gradients
- Added i18n system with English and Chinese translations
- Implemented multi-dimensional filtering (search, type, time)
- Custom D3.js tooltip replacing native browser tooltips
- Improved force simulation with radial forces for importance-based clustering
- Cache-Control headers to prevent browser caching issues

### User Experience
- Professional, modern UI that matches contemporary design standards
- Intuitive controls with clear labels and visual feedback
- Seamless language switching without page reload
- Powerful filtering for large knowledge graphs (60+ nodes tested)
- Interactive exploration with click/hover/drag interactions

## [1.14.0] - 2025-10-20

### Added
- **🚀 Multi-Dimensional Quality Scoring System**: Advanced context quality evaluation
  - 6-dimensional scoring: relevance, freshness, completeness, accuracy, usefulness, overall
  - Time decay algorithm: 7 days=1.0, 30 days=0.8, 90 days=0.5, 180 days=0.3
  - Usage frequency tracking: reference count and search count
  - Automatic search hit recording during `semantic_search`
  - New tool: `update_quality_scores` - Batch recalculate quality scores for contexts
  - Enhanced search ranking: 50% semantic similarity + 30% relevance + 15% freshness + 5% usefulness

- **📊 Memory Graph Visualization**: Export project memory relationships as interactive graphs
  - 3 export formats:
    - **Mermaid** (default): Instant rendering in Claude Desktop, zero file generation
    - **HTML**: Interactive D3.js visualization with drag, zoom, and search (saved to `./docs/`)
    - **JSON**: Raw graph data for custom analysis and import to other tools
  - Smart node filtering: limit max nodes, filter by context type (solution/error/code/etc.)
  - Node styling: different colors and shapes for different context types
  - Relationship visualization: depends_on, fixes, implements, tests, documents
  - New tool: `export_memory_graph` - Generate memory graph in Mermaid/HTML/JSON formats
  - Cross-platform compatible: Claude, Cursor, Windsurf, and all MCP clients

### Changed
- Enhanced `semantic_search` with quality score integration
  - Now considers context relevance (usage frequency) in ranking
  - Prioritizes recently accessed and frequently used contexts
  - Backward compatible: existing searches continue to work

### Technical Details
- New modules:
  - `src/quality-score-calculator.ts` - Multi-dimensional quality evaluation
  - `src/memory-graph-generator.ts` - Graph generation engine
- Database enhancements:
  - `incrementContextReference()` - Track reference counts
  - `recordContextSearch()` - Track search hits
- Vector search improvements:
  - `applyQualityScoreWeighting()` - Multi-dimensional weighted ranking
- New types:
  - `QualityMetrics` interface with 6 dimensions + metadata
  - `GraphNode`, `GraphEdge`, `MemoryGraphData` interfaces
- Tool count increased from 15 to **17 tools**
- Zero breaking changes: fully backward compatible

### Benefits
- 📈 Improved search accuracy: Quality scores help find the most useful contexts
- ⏰ Time-aware memory: Old contexts naturally fade, keeping results relevant
- 📊 Visual understanding: See how contexts relate to each other at a glance
- 🌐 Universal compatibility: HTML export works on all platforms and tools
- 🎯 Smarter ranking: Frequently used contexts rank higher automatically

### Use Cases
- Run `update_quality_scores` periodically (e.g., weekly) to refresh time-decayed scores
- Use `export_memory_graph` in Claude for instant Mermaid rendering
- Generate HTML graphs for team sharing and deep analysis
- Export JSON for custom graph analysis or CI/CD integration
- Quality scores automatically improve search results over time

## [1.13.0] - 2025-10-17

### Changed
- **Smart Session Management**: `record_context` tool now supports automatic session handling
  - `session_id` parameter is now optional when `project_path` is provided
  - Automatically detects and reuses existing active sessions for the same project
  - Creates new session automatically if no active session exists
  - Simplifies AI assistant workflow: no need to call `get_current_session` or `create_session` separately
  - Backward compatible: manual `session_id` still works as before

### Added
- New optional parameter `project_path` for `record_context` tool
- Session auto-detection via `SessionManager.getCurrentSession()`
- Informative feedback in response: indicates whether session was created or reused
- Session metadata tracking in context records for audit purposes

### Technical Details
- Modified `RecordContextParams` interface: `session_id` and `project_path` both optional
- Updated `handleRecordContext()` with automatic session resolution logic
- Enhanced response metadata with `auto_session` and `session_source` fields
- Zero breaking changes: fully backward compatible

### Benefits
- Reduces AI tool calls from 2 steps to 1 step for recording context
- Automatically associates all project contexts to the same session
- Clear user feedback on session creation vs. reuse
- Improved developer experience for memory recording

## [1.12.0] - 2025-10-16

### Added
- **Project Management Tool**: New `list_projects` tool for comprehensive project overview
  - Lists all tracked projects with detailed statistics
  - Shows contexts count, sessions count, and activity status
  - Displays last activity timestamp for each project
  - Includes project metadata (language, framework)
  - Supports optional statistics filtering and result limits
  - Helps users organize and navigate multiple projects efficiently

### Changed
- **Enhanced DEVMIND.md Generation**: Improved documentation template structure
  - Added **"Key Features"** section to documentation template (now 9 sections total)
  - Documentation now includes: Overview → Features → Commands → Architecture → Components → Details → Config → Notes → Tasks
  - More comprehensive project documentation with clear feature highlights
  - Better structure for understanding project capabilities at a glance

### Technical Details
- New database query methods:
  - `getAllProjects(limit?: number)`: Fetch all projects with optional limit
  - `getProjectSessions(projectId: string)`: Get all sessions for a project
  - `getProjectContextsCount(projectId: string)`: Count total contexts per project
- Enhanced mcp-server with project listing capability
- Tool count increased from 14 to **15 tools**
- Zero breaking changes: fully backward compatible

### Documentation
- Updated English README: tool count corrected to 15
- Updated Chinese README: synchronized with English version
- Added "Project Management" category to tool reference
- Clarified tool priorities with `[RECOMMENDED]` tag for `list_projects`

### Use Cases
- Quickly overview all projects being tracked by DevMind
- Identify inactive projects that need attention
- Check which projects have the most contexts/activity
- Better organize multi-project development workflows
- Understand memory distribution across projects

## [1.11.0] - 2025-10-15

### Changed
- **Major Tool Architecture Refactoring**: Streamlined and clarified tool responsibilities
  - `extract_file_context` now generates **one complete record per file** (previously: 100 lines per chunk)
    - 88KB file: 25 records → 1 record
    - Cleaner database with no fragmentation
  - Optimized tool descriptions with priority tags:
    - `[PRIMARY]` for main tools (project_analysis_engineer)
    - `[RECOMMENDED]` for frequently used tools (semantic_search)
    - `[LOW-LEVEL]` for advanced/internal tools (extract_file_context)
  - `project_analysis_engineer` now registered as **both Tool and Prompt**
    - AI can call it directly as a tool
    - Users can manually trigger it as a prompt
    - Provides maximum flexibility for project analysis

### Removed
- **Cleaned up redundant Prompts**: Removed 3 incomplete prompt implementations
  - Removed `context_summary` (AI can use semantic_search + list_contexts instead)
  - Removed `code_explanation` (AI can directly explain code without dedicated tool)
  - Removed `solution_recommendation` (AI can use semantic_search for similar errors)
  - Reduced code by ~150 lines while maintaining functionality
  - All features still available through existing tools and AI capabilities

### Fixed
- Enhanced tool descriptions to prevent AI misuse
  - Clear guidance: don't use `extract_file_context` for project analysis
  - Proper tool hierarchy prevents confusion
- Corrected documentation tool count: **14 Tools + 1 Prompt**
- Synchronized English and Chinese README with accurate project structure

### Documentation
- Updated project structure to reflect actual source files
- Removed outdated tool references
- Clarified tool usage priorities and best practices
- Added utils/query-enhancer.ts to structure documentation

### Technical Details
- Total tools: 14 (up from 13 in v1.10.0 due to project_analysis_engineer being counted)
- Tool categories:
  - Session Management: 4 tools
  - Context Operations: 5 tools
  - Search & Discovery: 3 tools
  - Project Analysis: 1 tool (new)
  - Memory Optimization: 1 tool
- Zero breaking changes: fully backward compatible

### Migration Notes
- All existing tools continue to work
- `extract_file_context` behavior improved (one record per file)
- Previous chunked records remain valid in database
- New recordings will use improved single-record approach

## [1.10.0] - 2025-10-14

### Added
- **Semantic Search Enhancement**: Intelligent query enhancement and file type weighting
  - Query Enhancement: Automatic synonym expansion for better recall (+15%)
    - Chinese-English synonym mapping (认证↔auth, 数据库↔database, etc.)
    - Code keyword extraction (React, Vue, Express, Jest frameworks)
    - Query intent recognition (code_search, documentation, test_search, config_search, error_solution)
  - File Type Weighting: Context-aware result ranking (+10% accuracy)
    - Documentation queries prioritize `.md`, `.txt` files (+30% weight)
    - Test queries prioritize `.test.ts`, `.spec.ts` files (+50% weight)
    - Config queries prioritize `.json`, `.yaml`, `.env` files (+40% weight)
    - Error queries prioritize `.log`, solution documents (+20% weight)
  - New utility module: `src/utils/query-enhancer.ts` (256 lines)
  - Complete documentation: `docs/SEMANTIC_SEARCH_ENHANCEMENT.md`

### Changed
- Enhanced `VectorSearchEngine.generateEmbedding()` with query enhancement support
  - New `isQuery` parameter: enhances search queries, preserves stored content
  - Backward compatible: existing embeddings unaffected
- Improved `VectorSearchEngine.hybridSearch()` with intent-based file type weighting
  - Automatic weight adjustment based on detected query intent
  - Re-ranking after hybrid scoring for optimal results

### Performance
- Search recall improved by ~15% through synonym expansion
- Search accuracy improved by ~10% through file type weighting
- Zero breaking changes: fully backward compatible

### Technical Details
- Query enhancement applies only to search queries, not stored content
- 20+ built-in synonym groups (extensible)
- 6 query intent types with customizable weight rules
- Confidence scoring for enhancement quality (0-1 scale)

## [1.9.0] - 2025-10-14

### Changed
- **Major Architecture Cleanup**: Streamlined project analysis functionality
  - Consolidated all project analysis into unified `project_analysis_engineer` prompt
  - Simplified from complex multi-tool architecture to prompt-based approach
  - Reduced codebase by ~5,700 lines while maintaining full functionality
  - Improved developer experience with cleaner, more focused architecture

### Removed
- Redundant project analysis tools (replaced by `project_analysis_engineer` prompt):
  - `index_project`, `analyze_project`, `generate_project_doc`
  - `query_project_memory`, `get_project_context`
- Cleaned up project-indexer module:
  - Removed unused files: `ProjectIndexer.ts`, `ProjectContextProvider.ts`
  - Removed unused files: `ProjectInitDocGenerator.ts`, `ProjectMemoryQueryEngine.ts`
  - Removed unused files: `MemoryGenerator.ts`, `ProgressReporter.ts`
  - Kept only essential modules: `ProjectMemoryOptimizer`, `FileScanner`, `ProjectAnalyzer`, `ContentExtractor`

### Fixed
- Maintained consistent session management across all tools
- Same project path = same main session ID (no duplicates)
- Preserved auto-save functionality for `project_analysis_engineer` with unique database IDs

### Documentation
- Updated project structure in both English and Chinese README
- Clarified 13 tools and 4 prompts available
- Removed references to deprecated tools

### Migration Guide
- **BREAKING CHANGE**: Legacy project analysis tools have been removed
- Use `project_analysis_engineer` prompt instead for comprehensive project documentation
- All existing project data and sessions remain intact

## [1.8.0] - 2025-10-13

### Added
- **Automatic Line Range Detection**: Daemon now detects exact line changes via Git diff
  - Git diff parser extracts modified line ranges automatically
  - Supports new files, modified files, and deleted files
  - Merges adjacent line changes for cleaner ranges
  - No limit on number of ranges - records all changes accurately
  - Large change detection with informative logging (50+ lines)

### Changed
- Enhanced daemon file monitoring with precise change tracking
- Automatic context recording now includes `line_ranges` parameter
- Graceful fallback when Git is unavailable or repo is not initialized

### Technical Details
- New module: `src/utils/git-diff-parser.ts`
- Parses unified diff format to extract line numbers
- Integrates with daemon's `handleFileChange` method
- Console logging shows range count for tracked changes

## [1.7.0] - 2025-10-13

### Added
- **Multiple Line Ranges Support**: Record context with non-contiguous line changes
  - New `line_ranges` parameter: `[[10,15], [50,60]]` for multiple ranges
  - Backward compatible: `line_start`/`line_end` still supported for single range
  - Stored in metadata for complete change tracking
  - Enables precise multi-location code modification recording

### Changed
- Enhanced `record_context` tool schema with `line_ranges` array parameter
- `line_start` and `line_end` marked as deprecated (use `line_ranges` instead)
- Metadata now includes complete line range information

## [1.6.1] - 2025-10-13

### Fixed
- Corrected CHANGELOG release date
- Removed test files from npm package
- Removed unnecessary documentation files

## [1.6.0] - 2025-10-13

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

[1.10.0]: https://github.com/JochenYang/Devmind/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/JochenYang/Devmind/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/JochenYang/Devmind/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/JochenYang/Devmind/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/JochenYang/Devmind/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/JochenYang/Devmind/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/JochenYang/Devmind/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/JochenYang/Devmind/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/JochenYang/Devmind/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/JochenYang/Devmind/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/JochenYang/Devmind/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/JochenYang/Devmind/releases/tag/v1.3.0

