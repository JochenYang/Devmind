# DevMind MCP

<div align="center">

[![npm version](https://img.shields.io/npm/v/devmind-mcp.svg)](https://www.npmjs.com/package/devmind-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dm/devmind-mcp.svg)](https://www.npmjs.com/package/devmind-mcp)

**Intelligent context-aware memory system for AI assistants**

[English](README.md) | [中文](docs/zh/README.md) | [📋 Changelog](CHANGELOG.md) | [🚀 Latest Release](https://github.com/JochenYang/Devmind/releases/latest)

</div>

---

## Why DevMind MCP?

**Auto-Memory** - Monitors file changes & Git operations automatically
**Smart Search** - Vector-based semantic search that understands code meaning
**100% Private** - All data stored locally in SQLite, no cloud transmission
**Real-time** - Instant context retrieval during AI conversations
**Cross-tool** - Works seamlessly with Claude Desktop, Cursor, and more
**Project Intelligence** - Comprehensive project documentation & intelligent indexing

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Quick Start](#-quick-start)
- [Usage Guide](#-usage-guide)
- [Smart Project Indexing](#-smart-project-indexing)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [Use Cases](#-use-cases)
- [Development](#-development)
- [Contributing](#-contributing)
- [Changelog](#-changelog)
- [License](#-license)
- [Support](#-support)

---

## 🎯 Overview

### What is DevMind MCP?

DevMind MCP provides **persistent memory capabilities** for AI assistants through the Model Context Protocol (MCP). It enables AI to remember context across conversations, automatically track development activities, and retrieve relevant information intelligently.

### Key Features

#### Core Capabilities

- **Automatic Memory** - Background monitoring of file changes, Git operations, and error logs
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
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Assistant  │────│   DevMind MCP   │────│  SQLite Storage │
│   (MCP Client)  │    │     Server      │    │   (Local DB)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
    MCP Protocol          Context Processing        Persistent Data
    Communications        & Vector Search            Management
```

**Components:**

- **MCP Server** - Protocol handling, request routing, session management
- **Context Engine** - Content analysis, vector embeddings, relevance scoring
- **Storage Layer** - SQLite database with optimized schema and vector indexing
- **Project Analyzer** - Intelligent project analysis and memory optimization

## Project Structure

```
Devmind/
├── src/
│   ├── mcp-server.ts              # MCP protocol server - Core server implementation
│   ├── database.ts                # SQLite database layer - Persistent storage
│   ├── vector-search.ts           # Vector search engine - Semantic search
│   ├── types.ts                   # TypeScript type definitions
│   ├── index.ts                   # Main entry point
│   │
│   ├── 🧠 Session & Content Management
│   ├── session-manager.ts         # Session manager - Cross-conversation context
│   ├── content-extractor.ts       # Content extractor - Code analysis
│   ├── content-quality-assessor.ts # Quality assessor - Content scoring
│   ├── auto-record-filter.ts      # Auto-record filter - Intelligent deduplication
│   │
│   ├── 🛠️ System Tools
│   ├── daemon.ts                  # Daemon process - Background monitoring
│   ├── cli.ts                     # CLI tool entry
│   ├── smart-confirmation-system.ts # Smart confirmation system
│   ├── performance-optimizer.ts   # Performance optimizer
│   │
│   ├── 🔧 Utilities
│   ├── utils/
│   │   ├── file-path-detector.ts  # File path detection utilities
│   │   ├── git-diff-parser.ts     # Git diff parsing
│   │   └── path-normalizer.ts     # Path normalization
│   │
│   └── 📂 project-indexer/        # Smart project analysis module
│       ├── index.ts               # Indexer entry point
│       ├── core/
│       │   └── ProjectMemoryOptimizer.ts # Memory optimization engine
│       ├── strategies/
│       │   ├── SmartIndexingStrategy.ts  # Smart indexing strategy
│       │   └── SecurityStrategy.ts       # Security scanning strategy
│       ├── tools/
│       │   ├── FileScanner.ts     # Intelligent file scanner
│       │   ├── ContentExtractor.ts # Content extraction tool
│       │   └── ProjectAnalyzer.ts  # Project structure analyzer
│       └── types/
│           └── IndexingTypes.ts   # Indexing type definitions
│
├── dist/                          # Compiled JavaScript output
├── docs/                          # Project documentation
│   └── zh/                        # Chinese documentation
├── scripts/                       # Utility scripts
│   ├── cleanup-test-data.js       # Database cleanup
│   ├── fix-duplicate-projects.js  # Fix project duplicates
│   └── reset-database.js          # Database reset
└── Configuration Files
    ├── package.json               # Node.js package configuration
    ├── tsconfig.json              # TypeScript configuration
    ├── .devmind.json              # DevMind configuration
    └── mcp-config-example.json    # MCP configuration example
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **MCP-compatible client** (Claude Desktop, Cursor, etc.)

### Installation

Choose the method that fits your needs:

| Method             | Command                      | Best For                      | Auto-update |
|:-------------------|:-----------------------------|:------------------------------|:-----------:|
| **NPX** ⭐          | `npx -y devmind-mcp@latest`  | Quick testing, first-time use |      ✅      |
| **Global Install** | `npm install -g devmind-mcp` | Daily development             |      ❌      |
| **From Source**    | `git clone + npm install`    | Contributing, customization   |      ❌      |

### Step-by-Step Setup

#### 1️⃣ Add to MCP Client

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

#### 2️⃣ Restart Your MCP Client

Restart Claude Desktop or your MCP client to load DevMind.

#### 3️⃣ Initialize DevMind (Optional for CLI)

If you want to use CLI features:

```bash
# Install globally first
npm install -g devmind-mcp

# Initialize in your project
devmind init

# Start monitoring daemon
devmind start
```

#### 4️⃣ Try Your First Command

In your AI assistant, try:

> "Use semantic_search to find information about authentication"

**Done!** DevMind is now enhancing your AI with persistent memory.

### Next Steps

- 📖 Read [Usage Guide](#-usage-guide) for available tools
- ⚙️ Check [Configuration](#%EF%B8%8F-configuration) for smart recording rules
- 🎨 Explore [Use Cases](#-use-cases) for inspiration

---

## 💡 Usage Guide

### MCP Tools Quick Reference

DevMind provides **13 powerful tools and 4 prompts** for your AI assistant:

#### Professional Documentation

**Use the `project_analysis_engineer` prompt for all professional documentation needs:**

| Prompt                      | Purpose                     | Example Use                |
|-----------------------------|-----------------------------|----------------------------|
| `project_analysis_engineer` | Generate comprehensive docs | Create DEVMIND.md analysis |

*Note: Previous project analysis tools have been consolidated into this powerful prompt-based approach.*

#### Session Management

| Tool                  | Purpose                         | Example Use             |
|-----------------------|---------------------------------|-------------------------|
| `create_session`      | Start new development session   | Beginning a new feature |
| `get_current_session` | Get active session info         | Check current context   |
| `end_session`         | End development session         | Finishing work          |
| `delete_session` ⚠️   | Delete session and all contexts | Clean up old sessions   |

**Note**: DevMind automatically manages one main session per project. Sessions are created automatically when needed and reactivated across conversations.

#### Context Operations

| Tool                   | Purpose                     | Example Use            |
|------------------------|-----------------------------|------------------------|
| `record_context`       | Store development context   | Save bug fix solution  |
| `list_contexts`        | List all contexts           | Review project history |
| `delete_context`       | Delete specific context     | Remove outdated info   |
| `update_context`       | Update context content/tags | Refine documentation   |
| `extract_file_context` | Extract context from files  | Analyze code structure |

#### Search & Discovery

| Tool                   | Purpose                    | Example Use                  |
|------------------------|----------------------------|------------------------------|
| `semantic_search`      | AI-powered semantic search | Find related implementations |
| `get_related_contexts` | Find related contexts      | Explore connections          |
| `generate_embeddings`  | Generate vector embeddings | Index new content            |

#### Memory Optimization

| Tool                      | Purpose                                 | Example Use                         |
|---------------------------|-----------------------------------------|-------------------------------------|
| `optimize_project_memory` | Optimize memory storage and performance | Cleanup, compression, deduplication |

*Note: All project analysis features have been unified under the `project_analysis_engineer` prompt for a better user experience.*

#### Intelligent Prompts

| Prompt                      | Purpose                          | Example Use                 |
|-----------------------------|----------------------------------|-----------------------------|
| `project_analysis_engineer` | Generate professional docs       | Create DEVMIND.md analysis  |
| `context_summary`           | Summarize project context        | Get project overview        |
| `code_explanation`          | Explain code context             | Understand complex code     |
| `solution_recommendation`   | Get solution recommendations     | Find fixes for errors       |

*Prompts provide AI-powered intelligent assistance beyond simple tool execution.*

### CLI Commands

**Project Management:**

```bash
# Initialize DevMind in current project
devmind init

# Start monitoring daemon
devmind start

# Check daemon status
devmind status

# Stop monitoring
devmind stop
```

**Search & Retrieval:**

```bash
# Search contexts
devmind search "authentication implementation"

# Search with filters
devmind search "database" --project myproject --limit 5
```

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

## 🚀 Professional Documentation Generation

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

## ⚡ Configuration

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

### Recommended System Prompt

Add this concise rule to your MCP client's system prompt:

```
DevMind Memory Rules:

1. Search first: Use semantic_search before answering technical questions
2. Record immediately (no ask):
   - User says "remember this"
   - Completed bug fixes → type="solution"
3. Suggest recording (ask first):
   - New features → type="code"
   - Architecture decisions → type="documentation"
   - Complex solutions → type="solution"
4. Format: Include file_path, line_ranges [[start,end],...], and tags
5. Session: Auto-creates/reuses one session per project
6. New project: Use project_analysis_engineer prompt for comprehensive docs

Note: NPX has no auto-monitoring. AI must record important contexts.
```

#### Auto-Recording Triggers

| Priority      | When to Record | Example Scenarios                                                      |
|---------------|----------------|------------------------------------------------------------------------|
| 🔴 **High**   | Must record    | User says "remember", bug fixes, new features, architectural decisions |
| 🟡 **Medium** | Should record  | Code reviews, optimizations, config changes, best practices            |
| 🟢 **Low**    | Optional       | General discussions, simple explanations, repetitive content           |

#### Recording Format Best Practice

```typescript
{
  content: "Specific technical content including background and solution",
  type: "solution|code|error|documentation|test|configuration",
  tags: ["tech-stack", "module", "importance", "status"],
  session_id: "current-session-id"
}
```

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

> ⚠️ **Important**: Restart your MCP client after configuration changes.

---

## 📚 API Reference

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

## 🎨 Use Cases

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

## 🛠️ Development

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

---

## 📋 Changelog

### Latest Release: v1.10.0 (2025-10-14)

**🚀 Semantic Search Enhancement**

- **Query Enhancement**: Automatic synonym expansion (+15% recall)
  - Chinese-English synonym mapping (认证↔auth, 数据库↔database, etc.)
  - Code keyword extraction (React, Vue, Express, Jest)
  - Query intent recognition (6 types)
- **File Type Weighting**: Context-aware result ranking (+10% accuracy)
  - Documentation queries prioritize `.md` files (+30% weight)
  - Test queries prioritize `.test.ts` files (+50% weight)
  - Config queries prioritize `.json`, `.yaml` files (+40% weight)

**Full changelog**: [📄 CHANGELOG.md](CHANGELOG.md)

**All releases**: [📚 GitHub Releases](https://github.com/JochenYang/Devmind/releases)

---

## 🤝 Contributing

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

Made with ❤️ by [Rhys](https://github.com/JochenYang)

</div>
