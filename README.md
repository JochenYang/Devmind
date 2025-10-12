# DevMind MCP

<div align="center">

[![npm version](https://img.shields.io/npm/v/devmind-mcp.svg)](https://www.npmjs.com/package/devmind-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dm/devmind-mcp.svg)](https://www.npmjs.com/package/devmind-mcp)

**Intelligent context-aware memory system for AI assistants**

[English](README.md) | [中文](docs/zh/README.md)

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
- **Project Documentation** - Comprehensive project analysis and documentation generation
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
- **Project Indexer** - Intelligent project analysis, file scanning, and memory generation

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

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

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

DevMind provides these tools for your AI assistant:

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

#### Project Intelligence

| Tool                    | Purpose                           | Example Use                     |
|-------------------------|-----------------------------------|---------------------------------|
| `index_project`         | Analyze entire project            | Generate comprehensive insights |
| `analyze_project`       | Get project structure and metrics | Understand project architecture |
| `generate_project_doc`  | Generate project documentation    | Create initial project docs     |

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

## 📂 Smart Project Indexing

### Overview

DevMind's **Smart Project Indexing** automatically analyzes your entire project to generate comprehensive, structured memories. This feature intelligently scans files, extracts meaningful content, and creates searchable project insights.

### Key Features

- **Intelligent Analysis** - Automatically detects project type, tech stack, and architecture
- **Security-First** - Built-in sensitive file detection and content filtering
- **Performance Optimized** - Smart file prioritization and content compression
- **Memory Generation** - Creates structured project memories: overview, tech stack, structure, and features
- **Progress Tracking** - Real-time indexing progress with performance insights
- **Contextual Understanding** - Analyzes project complexity and provides intelligent recommendations

### How It Works

```text
Project Discovery → File Scanning → Content Analysis → Memory Generation
       │                 │                │                │
   Auto-detect      Smart filtering   Extract insights   Structured memories
   project type     & prioritization   & tech features   for AI context
```

### Available Tools

#### Project Indexing Tools

| Tool                   | Purpose                       | Example Use                     |
|------------------------|-------------------------------|---------------------------------|
| `index_project`        | Analyze entire project        | Generate comprehensive insights |
| `get_project_insights` | Retrieve project memories     | Access cached project analysis  |
| `validate_project`     | Check project before indexing | Ensure safe indexing            |
| `get_indexing_status`  | Check indexing progress       | Monitor background analysis     |

### Usage Examples

#### Index Current Project

```typescript
// Start intelligent project indexing
const result = await index_project({
  project_path: "/path/to/project",
  trigger: "manual",
  options: {
    max_files: 50,
    include_code_analysis: true,
    generate_memories: true
  }
});
```

#### Retrieve Project Insights

```typescript
// Get generated project memories
const insights = await get_project_insights({
  project_path: "/path/to/project",
  memory_types: ["overview", "tech_stack", "structure"]
});
```

#### Project Validation

```typescript
// Validate project before indexing
const validation = await validate_project({
  project_path: "/path/to/project"
});

if (validation.is_valid) {
  console.log("Project ready for indexing");
} else {
  console.log("Issues found:", validation.issues);
}
```

### Generated Memory Types

The indexer generates four types of structured memories:

#### 1. Project Overview
- Project type identification (web, mobile, library, etc.)
- Main programming language and framework
- Project complexity assessment
- README and documentation analysis

#### 2. Technical Stack
- Programming languages and frameworks
- Development tools and build systems
- Dependencies and package managers
- Cloud services and databases

#### 3. Project Structure
- File type distribution and organization
- Directory structure and patterns
- Important files identification
- Architecture pattern recognition

#### 4. Key Features
- Main functionality extraction
- Code characteristics analysis
- Build and deployment configurations
- Documentation quality assessment

### Configuration Options

#### Indexing Configuration

```json
{
  "project_indexing": {
    "max_files": 50,
    "max_file_size": "100KB",
    "max_total_size": "5MB",
    "max_depth": 3,
    "enable_security_scan": true,
    "enable_code_extraction": true,
    "enable_content_compression": true
  }
}
```

#### Security & Privacy

- **Automatic sensitive file detection** - Excludes `.env`, keys, credentials
- **Content sanitization** - Removes passwords, tokens, personal paths
- **Local processing only** - No data transmitted to external services
- **Configurable exclusion patterns** - Customize what gets indexed

### CLI Commands

```bash
# Index current project
devmind index

# Index specific project
devmind index /path/to/project

# View project insights
devmind insights

# Validate project for indexing
devmind validate /path/to/project
```

### Best Practices

#### When to Use Project Indexing

- **New project onboarding** - Generate comprehensive project understanding
- **Code reviews** - Get quick project context and structure overview
- **Documentation** - Auto-generate project documentation base
- **Team collaboration** - Share consistent project understanding

#### Optimization Tips

1. **Use `.gitignore` patterns** - Project indexer respects standard exclusions
2. **Configure file limits** - Balance comprehensiveness with performance
3. **Regular re-indexing** - Update insights as project evolves
4. **Combine with manual contexts** - Enhance auto-generated insights with manual notes

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

1. ALWAYS search first: Use semantic_search before answering technical questions
2. Auto-tracking active: File changes and Git operations are recorded automatically
3. One project = One session: Each project maintains a single persistent session
4. Manual recording triggers:
   - User says "remember this" → record_context
   - Bug fixes/solutions → record_context type="solution"
   - Architecture decisions → record_context type="documentation"
   - Important discoveries → record_context with relevant tags
5. Use generate_project_doc for initial project understanding
6. Reference found context IDs when citing past information
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

### Project Structure

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
│   ├── cli-new.ts                 # New CLI implementation
│   ├── smart-confirmation-system.ts # Smart confirmation system
│   ├── performance-optimizer.ts   # Performance optimizer
│   │
│   └── 📂 project-indexer/        # Smart project indexer module
│       ├── index.ts               # Indexer entry point
│       ├── core/
│       │   └── ProjectIndexer.ts  # Core indexing engine
│       ├── strategies/
│       │   ├── SmartIndexingStrategy.ts  # Smart indexing strategy
│       │   └── SecurityStrategy.ts       # Security scanning strategy
│       ├── tools/
│       │   ├── FileScanner.ts     # File scanner
│       │   ├── ContentExtractor.ts # Content extraction tool
│       │   ├── ProjectAnalyzer.ts  # Project analyzer
│       │   ├── MemoryGenerator.ts  # Memory generator
│       │   └── ProgressReporter.ts # Progress reporter
│       └── types/
│           └── IndexingTypes.ts   # Indexing type definitions
│
├── dist/                          # Compiled JavaScript output
├── tests/                         # Test suites
├── docs/                          # Project documentation
│   ├── zh/                        # Chinese documentation
│   └── en/                        # English documentation
└── examples/                      # Usage examples
```

**Key Components:**

- **Core Server** - MCP protocol handling, database layer, vector search
- **Session Management** - Cross-conversation context, session lifecycle, auto-recording
- **Content Processing** - Intelligent extraction, quality assessment, deduplication
- **Project Indexer** - Smart project-wide analysis with automatic feature extraction
- **System Tools** - Background daemon, CLI interface, performance optimization

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
