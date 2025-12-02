# DevMind MCP

<div align="center">

[![npm version](https://img.shields.io/npm/v/devmind-mcp.svg)](https://www.npmjs.com/package/devmind-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dm/devmind-mcp.svg)](https://www.npmjs.com/package/devmind-mcp)

**Intelligent context-aware memory system for AI assistants**

[English](README.md) | [中文](docs/zh/README.md) | [📋 Changelog](CHANGELOG.md) | [🚀 Latest Release](https://github.com/JochenYang/Devmind/releases/latest)

</div>

---

## Why DevMind MCP?

- **Pure MCP Tool** - Seamless integration with AI assistants through Model Context Protocol
- **Hybrid Search** - Semantic 40% + Keyword 30% + Quality 20% + Freshness 10%
- **100% Private** - All data stored locally in SQLite, zero cloud transmission
- **14 MCP Tools** - Complete toolkit for memory management and project analysis
- **Cross-Platform** - Works with Claude Desktop, Cursor, and all MCP-compatible clients

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Use Cases](#use-cases)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

### What is DevMind MCP?

DevMind MCP provides **persistent memory capabilities** for AI assistants through the Model Context Protocol (MCP). It enables AI to remember context across conversations, automatically track development activities, and retrieve relevant information intelligently.

### Key Features

#### Core Capabilities

- **Type-Based Auto-Memory** - Simplified intelligent recording based on context type
  - Tier 1: Auto-record technical execution (bug_fix, feature_add, code_modify) - silent
  - Tier 2: Auto-record with notice (solution, design, documentation) - can delete
  - Tier 3: No auto-record (conversation, error) - unless force_remember=true
- **Intelligent Memory** - AI-driven context recording through MCP protocol
- **Semantic Search** - AI-powered vector embedding search for finding related contexts
- **Persistent Storage** - SQLite-based local storage with complete privacy
- **Hybrid Search** - Combines keyword and semantic search for best results
- **Real-time Response** - Records during development, retrieves instantly
- **Cross-tool Support** - Compatible with multiple MCP clients and development environments
- **Professional Documentation** - AI-powered project analysis and DEVMIND.md generation
- **Multi-language Support** - Automatic language detection for Chinese/English documentation
- **Unified Sessions** - One main session per project for consistent context

#### Technical Features

- Full MCP protocol compliance
- Unified session management (one main session per project)
- Automatic session reactivation
- Customizable storage paths and behavior
- Efficient handling of thousands of contexts
- Automatic cleanup and memory optimization
- Robust error handling and recovery

### Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                      AI Assistant                            │
│               (Claude Desktop / Cursor / etc.)               │
└────────────────────────┬─────────────────────────────────────┘
                         │ MCP Protocol (stdio)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   DevMind MCP Server                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────││
│  │  14 MCP Tools   │  │ Type-Based      │  │ Hybrid Search││
│  │                 │  │ Auto-Memory     │  │              ││
│  │ • Session (4)   │  │                 │  │ • Semantic   ││
│  │ • Context (6)   │  │                 │  │ • Keyword    ││
│  │ • Project (2)   │  │ • 3 Tiers      │  │ • Quality    ││
│  │ • Visualize (1) │  │ • Smart Types  │  │ • Freshness  ││
│  │ • Status (1)    │  │ • Lazy Scoring │  │              ││
│  └─────────────────┘  └─────────────────┘  └──────────────││
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                  SQLite Local Storage                        │
│  Projects • Sessions • Contexts • Relationships • Embeddings │
│  + Auto-generated quality scores (lazy update every 24h)     │
└──────────────────────────────────────────────────────────────┘
```

**Key Components:**

- **14 MCP Tools** - Session management (4), context operations (6), project features (2), visualization (1), status (1)
- **Type-Based Auto-Memory** - Simplified 3-tier strategy based on context type
- **Hybrid Search** - Multi-dimensional scoring: Semantic 40% + Keyword 30% + Quality 20% + Freshness 10%
- **Local Storage** - SQLite database with vector embeddings and full-text search indexes

## Project Structure

```
devmind-mcp/
├── src/
│   ├── mcp-server.ts                # MCP protocol server
│   ├── database.ts                  # SQLite storage engine
│   ├── vector-search.ts             # Semantic search with embeddings
│   ├── session-manager.ts           # Session & context management
│   ├── content-extractor.ts         # Code analysis & extraction
│   ├── content-quality-assessor.ts  # Content quality scoring
│   ├── quality-score-calculator.ts  # Multi-dimensional quality scoring
│   ├── auto-record-filter.ts        # Smart deduplication
│   ├── context-file-manager.ts      # File change tracking
│   ├── types.ts                     # Type definitions
│   ├── index.ts                     # Main entry point
│   │
│   ├── memory-graph/                # Memory graph visualization
│   │   ├── index.ts                 # Main graph generator
│   │   ├── types.ts                 # Graph type definitions
│   │   ├── data/
│   │   │   ├── GraphDataExtractor.ts  # Data extraction from database
│   │   │   ├── NodeBuilder.ts         # Node construction & labeling
│   │   │   └── EdgeBuilder.ts         # Edge/relationship building
│   │   └── templates/
│   │       └── HTMLGenerator.ts       # HTML visualization generator
│   │
│   ├── utils/
│   │   ├── file-path-detector.ts    # Intelligent file detection
│   │   ├── git-diff-parser.ts       # Git diff parsing
│   │   ├── path-normalizer.ts       # Cross-platform path handling
│   │   └── query-enhancer.ts        # Search query enhancement
│   │
│   └── project-indexer/
│       ├── index.ts                 # Project analyzer entry
│       ├── core/
│       │   └── ProjectMemoryOptimizer.ts
│       ├── strategies/
│       │   ├── SmartIndexingStrategy.ts
│       │   └── SecurityStrategy.ts
│       ├── tools/
│       │   ├── FileScanner.ts
│       │   ├── ContentExtractor.ts
│       │   └── ProjectAnalyzer.ts
│       └── types/
│           └── IndexingTypes.ts
│
├── dist/                            # Compiled output
├── scripts/                         # Maintenance scripts
└── docs/zh/                         # Chinese documentation
```

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 20.0.0
- **MCP-compatible client** (Claude Desktop, Cursor, etc.)

### Installation

Choose the method that fits your needs:

| Method             | Command                      | Best For                      | Auto-update |
|:-------------------|:-----------------------------|:------------------------------|:-----------:|
| **NPX**            | `npx -y devmind-mcp@latest`  | Quick testing, first-time use |     Yes     |
| **Global Install** | `npm install -g devmind-mcp` | Daily development             |     No      |
| **From Source**    | `git clone + npm install`    | Contributing, customization   |     No      |

### Step-by-Step Setup

#### Step 1: Add to MCP Client

Edit your MCP client configuration file:

**Configuration File Locations:**

- **Windows**: `C:\Users\<YourUsername>\.claude.json` or `%USERPROFILE%\.claude.json`
- **macOS**: `~/.claude.json`
- **Linux**: `~/.claude.json`

**Add this configuration:**

```json
{
  "mcpServers": {
    "devmind": {
      "command": "npx",
      "args": ["-y", "devmind-mcp@latest"]
    }
  }
}
```

**Using Global Install?** Replace with: `{"command": "devmind-mcp"}`

#### Step 2: Restart Your MCP Client

Restart Claude Desktop or your MCP client to load DevMind.

#### Step 3: Try Your First Command

In your AI assistant, try:

> "Use semantic_search to find information about authentication"

**Done!** DevMind is now enhancing your AI with persistent memory.

### Next Steps

- Read [Usage Guide](#usage-guide) for available tools
- Check [Configuration](#configuration) for smart recording rules
- Explore [Use Cases](#use-cases) for inspiration

---

## How AI Should Use DevMind

Follow these steps for each development session:

1. **Session Initialization**
   - Start by calling `get_current_session` or let it auto-create
   - Say "Checking memory..." and call `list_contexts(limit: 5)`

2. **During Development**
   - **CRITICAL**: Call `record_context` IMMEDIATELY after editing files
   - Use type: bug_fix, feature_add, code_modify based on work type
   - Content MUST be in project's language (Chinese/English)

3. **Before Completing Tasks**
   - Record before saying "done" or "complete"
   - Use `files_changed` for multi-file modifications

4. **When User Asks About History**
   - Use `semantic_search` for intelligent queries
   - Use `list_contexts` for chronological browsing
   - Use `get_context` to view full details

---

## Usage Guide

### MCP Tools Quick Reference

DevMind provides **14 powerful tools** and **1 professional prompt** for your AI assistant:

#### Project Analysis

| Tool                        | Purpose                                  | Example Use              |
|-----------------------------|------------------------------------------|--------------------------|
| `project_analysis_engineer` | [PRIMARY] Comprehensive project analysis | Generate DEVMIND.md docs |

*Note: This tool is also available as a Prompt for manual triggering.*

#### Project Management

| Tool            | Purpose                                    | Example Use               |
|-----------------|--------------------------------------------|---------------------------|
| `list_projects` | [RECOMMENDED] List all projects with stats | Overview tracked projects |

#### Session Management

| Tool                  | Purpose                         | Example Use             |
|-----------------------|---------------------------------|-------------------------|
| `create_session`      | Start new development session   | Beginning a new feature |
| `get_current_session` | Get active session info         | Check current context   |
| `end_session`         | End development session         | Finishing work          |
| `delete_session`      | Delete session and all contexts | Clean up old sessions   |

**Note**: DevMind automatically manages one main session per project. Sessions are created automatically when needed and reactivated across conversations.

#### Context Operations

|| Tool             | Purpose                     | Example Use            |
||------------------|-----------------------------|------------------------|
|| `record_context` | Store development context   | Save bug fix solution  |
|| `list_contexts`  | List all contexts           | Review project history |
|| `delete_context` | Delete specific context     | Remove outdated info   |
|| `update_context` | Update context content/tags | Refine documentation   |

#### Search & Discovery

|| Tool              | Purpose                       | Example Use                  |
||-------------------|-------------------------------|------------------------------|
|| `semantic_search` | AI-powered semantic search    | Find related implementations |
|| `get_context`     | Get context(s) by ID(s)       | View full memory content     |

**Note**: Embeddings are auto-generated on record_context. Quality scores auto-update every 24h during searches (lazy loading).

#### Visualization

| Tool                  | Purpose                                   | Example Use                                               |
|-----------------------|-------------------------------------------|-----------------------------------------------------------|
| `export_memory_graph` | Export interactive timeline graph (v1.19) | Visualize memory in vertical timeline with 6 type columns |

**New in v1.19**: Memory graph features a clean vertical timeline layout with fixed node positioning and optimized performance.



### Usage Examples

#### Store Context Information

```typescript
// Store development context
await record_context({
  content: "Implemented user authentication using JWT tokens with refresh token support",
  type: "implementation",
  tags: ["auth", "jwt", "security", "api"]
});
```

#### Search and Retrieve

```typescript
// Find relevant contexts
const results = await semantic_search({
  query: "How did we implement authentication?",
  limit: 10
});
```

#### Update Existing Context

```typescript
// Update context with new information
await update_context(contextId, {
  content: "Updated authentication to support OAuth2 and SAML",
  tags: ["auth", "jwt", "oauth2", "saml", "security"]
});
```

#### Contextual Search

```typescript
// Search within specific timeframe
const results = await semantic_search({
  query: "database optimization",
  timeRange: { days: 7 }
});
```



---

## Professional Documentation Generation

### Overview

DevMind's **Project Analysis Engineer** uses AI to automatically analyze your codebase and generate comprehensive, professional documentation. This powerful prompt-based approach provides deeper insights than traditional static analysis.

### Key Features

- **AI-Powered Analysis** - Deep understanding of code patterns, architecture, and business logic
- **Multi-Language Support** - Automatically detects and generates Chinese or English documentation
- **Professional Quality** - Generates DEVMIND.md format documentation with technical depth
- **Auto-Save to Memory** - Documentation is automatically saved to your project's memory for future reference
- **Customizable Focus** - Target specific areas like architecture, APIs, business logic, or security
- **Multiple Formats** - Supports DEVMIND.md, technical specs, and README formats

### How It Works

```text
Project Scanning → Code Analysis → AI Processing → Professional Docs → Memory Storage
       │                │             │              │                │
   Smart file       Extract tech    Generate deep    Create DEVMIND.md   Auto-save to
   selection        insights        analysis         documentation       searchable DB
```

### Usage

#### Natural Language Generation

**English:**
- "Generate professional DevMind documentation for this project"
- "Create comprehensive technical analysis with DEVMIND.md format"
- "Analyze this codebase and generate professional documentation"

**Chinese:**
- "为这个项目生成专业的DevMind文档"
- "创建全面的技术分析，使用DEVMIND.md格式"
- "分析这个代码库并生成专业文档"

#### Direct Prompt Usage

```typescript
// English documentation
const analysis = await project_analysis_engineer({
  project_path: "./my-project",
  doc_style: "devmind",
  language: "en"
});

// Chinese documentation (auto-detected)
const analysis = await project_analysis_engineer({
  project_path: "./chinese-project",
  doc_style: "devmind",
  language: "zh"
});
```

---

## Configuration

### Basic Configuration

Create `.devmind.json` in your project root:

```json
{
  "database_path": "~/.devmind/memory.db",
  "max_contexts": 1000,
  "search_limit": 20,
  "auto_cleanup": true,
  "vector_dimensions": 1536
}
```

### Configuration Options

| Option              | Type    | Default                | Description                              |
|---------------------|---------|------------------------|------------------------------------------|
| `database_path`     | string  | `~/.devmind/memory.db` | SQLite database file location            |
| `max_contexts`      | number  | `1000`                 | Maximum stored contexts                  |
| `search_limit`      | number  | `20`                   | Default search result limit              |
| `auto_cleanup`      | boolean | `true`                 | Enable automatic cleanup of old contexts |
| `vector_dimensions` | number  | `1536`                 | Vector embedding dimensions              |

### Recommended Memory Strategy

AI assistants should call the `record_context` tool immediately after every code edit to ensure all changes are properly recorded in the project memory.



### Full MCP Configuration Example

**With NPX (Recommended):**

```json
{
  "mcpServers": {
    "devmind": {
      "command": "npx",
      "args": ["-y", "devmind-mcp@latest"]
    }
  }
}
```

**With Global Installation:**

```json
{
  "mcpServers": {
    "devmind": {
      "command": "devmind-mcp"
    }
  }
}
```

> **Important**: Restart your MCP client after configuration changes.

---

## API Reference

### Core Methods

#### `record_context(context: ContextData): Promise<string>`

Store new context information.

**Parameters:**

- `content` (string) - Main content text
- `type` (string) - Content type: `solution`, `code`, `error`, `documentation`, `test`, `configuration`
- `tags` (string[]) - Associated tags
- `metadata` (object) - Additional metadata

**Returns:** Context ID string

**Example:**

```typescript
const id = await record_context({
  content: "Fixed memory leak in WebSocket connection handler",
  type: "solution",
  tags: ["websocket", "memory-leak", "bug-fix"]
});
```

---

#### `project_analysis_engineer(options: AnalysisOptions): Promise<AnalysisPrompt>`

**NEW!** Generate professional project documentation with AI-powered analysis.

**Parameters:**

- `project_path` (string) - Path to project directory
- `analysis_focus` (string) - Focus areas: `architecture,entities,apis,business_logic` 
- `doc_style` (string) - Documentation style: `devmind`, `claude`, `technical`, `readme`
- `language` (string) - Documentation language: `en`, `zh`, `auto` (default: auto-detect)
- `auto_save` (boolean) - Auto-save analysis to memory (default: true)

**Returns:** Analysis prompt for AI to generate comprehensive documentation

**Example:**

```typescript
// English documentation
const analysis = await project_analysis_engineer({
  project_path: "./my-project",
  doc_style: "devmind",
  language: "en"
});

// Chinese documentation (auto-detected or explicit)
const analysis = await project_analysis_engineer({
  project_path: "./my-chinese-project",
  doc_style: "devmind",
  language: "zh"
});
```

**Natural Language Examples:**
- "Generate professional DevMind documentation for this project"
- "为这个项目生成专业的DevMind文档" (Chinese)
- "Create comprehensive technical analysis with DEVMIND.md format"

---

#### `semantic_search(query: SearchQuery): Promise<Context[]>`

Search for relevant contexts using semantic understanding.

**Parameters:**

- `query` (string) - Search query
- `limit` (number) - Maximum results (default: 20)
- `type` (string) - Filter by content type
- `tags` (string[]) - Filter by tags
- `timeRange` (object) - Time range filter: `{ days: 7 }`

**Returns:** Array of matching contexts

**Example:**

```typescript
const results = await semantic_search({
  query: "authentication implementation",
  limit: 10,
  type: "implementation"
});
```

---

#### `retrieve(id: string): Promise<Context | null>`

Retrieve specific context by ID.

---

#### `update_context(id: string, updates: Partial<ContextData>): Promise<boolean>`

Update existing context.

**Example:**

```typescript
await update_context(contextId, {
  tags: ["websocket", "memory-leak", "bug-fix", "resolved"]
});
```

---

#### `delete_context(id: string): Promise<boolean>`

Delete context by ID.

---

### Utility Methods

#### `cleanup(): Promise<void>`
Perform database cleanup and optimization.

#### `stats(): Promise<DatabaseStats>`
Get database statistics and health information.

#### `export(format: 'json' | 'csv'): Promise<string>`
Export all contexts to specified format.

---

## Use Cases

### Software Development
- Track implementation decisions and technical choices
- Maintain context across development sessions
- Store and retrieve code patterns and snippets
- Document architectural decisions with rationale

### Research & Learning
- Accumulate knowledge from multiple sources
- Build connections between related concepts
- Maintain research context over weeks or months
- Create searchable personal knowledge bases

### Project Management
- Track project evolution and key decisions
- Maintain context across team meetings
- Store project-related insights and lessons
- Document post-mortems and retrospectives

### AI Assistant Enhancement
- Provide persistent memory for AI conversations
- Enable context-aware responses based on history
- Maintain user preferences and project specifics
- Support long-term relationship building with AI

---

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/JochenYang/Devmind.git
cd Devmind

# Install dependencies
npm install

# Development mode with watch
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --grep "search functionality"
```

### Building

```bash
# Production build
npm run build

# Development build with watch
npm run build:dev

# Clean build artifacts
npm run clean
```


## Contributing

We welcome contributions to DevMind MCP! Please follow these steps:

### Development Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Code Standards

- Follow TypeScript best practices
- Maintain test coverage above 80%
- Use conventional commit messages
- Document all public APIs
- Add tests for new features

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## 🔗 Support

- **Issues**: [GitHub Issues](https://github.com/JochenYang/Devmind/issues)
- **Discussions**: [GitHub Discussions](https://github.com/JochenYang/Devmind/discussions)
- **NPM Package**: [devmind-mcp](https://www.npmjs.com/package/devmind-mcp)

---

<div align="center">

**DevMind MCP** - Intelligent context-aware memory for AI assistants

Made with ❤️ by [Jochen](https://github.com/JochenYang)

</div>
