# DevMind MCP

**Languages:** [English](README.md) | [中文](docs/zh/README.md)

---

**Intelligent context-aware memory for AI assistants through MCP protocol**

DevMind MCP provides persistent memory capabilities for AI assistants through Model Context Protocol (MCP), supporting **automatic development activity monitoring** and **intelligent semantic search**.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### 🚀 Core Capabilities

- **🤖 Automatic Memory** - Background daemon monitors file changes, Git operations, error logs automatically
- **🧠 Smart Search** - Vector embedding-based semantic search that understands code meaning
- **📝 Persistent Storage** - SQLite local storage, completely private, no data transmission
- **🔍 Hybrid Search** - Combines keyword and semantic search for most relevant results
- **⚡ Real-time Response** - Records during development, instant retrieval during AI conversations
- **🛠️ Cross-tool Support** - Supports VS Code, terminal, multiple development environments

### Technical Features

- **MCP Protocol Compliance** - Full Model Context Protocol implementation
- **Flexible Configuration** - Customizable storage paths and behavior
- **Performance Optimized** - Handles thousands of contexts efficiently
- **Memory Management** - Automatic cleanup and optimization
- **Error Resilience** - Robust error handling and recovery

---

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Assistant  │────│   DevMind MCP   │────│  SQLite Storage │
│                 │    │     Server      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    MCP Protocol           Context Processing        Persistent Data
    Communications         & Vector Search           Management
```

### Component Overview

**MCP Server Layer**
- Protocol handling and client communication
- Request routing and response formatting
- Session management and authentication

**Context Processing Engine**
- Content analysis and classification
- Vector embedding generation
- Relevance scoring and ranking

**Storage Layer**
- SQLite database with optimized schema
- Vector storage and indexing
- Transaction management and data integrity

---

## 🚀 Quick Start

### 1. Installation

```bash
# 从NPM安装（推荐）
npm install -g devmind-mcp

# 或者克隆仓库
git clone https://github.com/JochenYang/Devmind.git
cd Devmind
npm install
npm run build
```

### 2. Initialize Project

```bash
# Initialize DevMind in your project root directory
devmind init

# Start automatic monitoring daemon process
devmind start
```

### 3. Configure MCP Client

**Option A: NPX Configuration (Recommended)**

No installation required, directly configure in your MCP client:

**Basic Configuration:**
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

**Note:** For intelligent auto-recording, configure your MCP client's system rules (if supported). See the [Smart Recording Rules Configuration](#-smart-recording-rules-configuration) section for detailed guidance.

**Option B: Global Installation**

```bash
# Install globally first
npm install -g devmind-mcp

# Configure MCP client with: {"command": "devmind-mcp"}
```

For more configuration details, see the [Smart Recording Rules Configuration](#-smart-recording-rules-configuration) section.

---

## Configuration

### Basic Configuration

Create a `.devmind.json` file in your project root:

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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `database_path` | string | `~/.devmind/memory.db` | SQLite database location |
| `max_contexts` | number | `1000` | Maximum stored contexts |
| `search_limit` | number | `20` | Default search result limit |
| `auto_cleanup` | boolean | `true` | Enable automatic cleanup |
| `vector_dimensions` | number | `1536` | Vector embedding dimensions |


---

## Usage

### MCP Integration

Once configured in your MCP client, DevMind will automatically:

1. **Monitor Development Activity** - Track file changes, Git operations, and project context
2. **Intelligent Memory Storage** - Store relevant code snippets, decisions, and discussions
3. **Semantic Search** - Find related contexts using AI-powered vector search
4. **Cross-Session Context** - Maintain knowledge across different development sessions

**Available MCP Tools:**

**Session Management:**
- `create_session` - Create new development session
- `get_current_session` - Get active session info
- `end_session` - End development session  
- `delete_session` - Delete session and all contexts ⚠️

**Context Operations:**
- `record_context` - Store development context and memories
- `list_contexts` - List all contexts in session/project
- `delete_context` - Delete specific context by ID
- `update_context` - Update context content/tags/metadata
- `extract_file_context` - Extract context from files

**Search & Discovery:**
- `semantic_search` - AI-powered semantic search across memories
- `get_related_contexts` - Find related contexts
- `generate_embeddings` - Generate vector embeddings

### CLI Operations

**Project Management:**
```bash
# Initialize DevMind in current project
devmind init

# Start monitoring daemon
devmind start

# Check status
devmind status

# Stop monitoring
devmind stop
```

**Search and Retrieval:**
```bash
# Search contexts
devmind search "authentication implementation"

# Search with filters
devmind search "database" --project myproject --limit 5
```

### Basic Operations

**Store Context Information**
```typescript
// Store development context
await store({
  content: "Implemented user authentication using JWT tokens",
  type: "implementation",
  tags: ["auth", "jwt", "security"]
});
```

**Search and Retrieve**
```typescript
// Find relevant contexts
const results = await search({
  query: "authentication implementation",
  limit: 10
});
```

**Update Existing Context**
```typescript
// Update context with new information
await update(contextId, {
  content: "Updated authentication to support refresh tokens",
  tags: ["auth", "jwt", "security", "refresh-tokens"]
});
```

### Advanced Usage

**Contextual Search**
```typescript
// Search within specific context
const results = await search({
  query: "database optimization",
  context: "performance-improvements",
  timeRange: { days: 7 }
});
```

**Batch Operations**
```typescript
// Process multiple contexts
await batchStore([
  { content: "API endpoint created", type: "development" },
  { content: "Unit tests added", type: "testing" },
  { content: "Documentation updated", type: "docs" }
]);
```

### Integration Examples

**With Development Workflow**
```bash
# Store git commit information
git log --oneline -10 | devmind store --type="git-history"

# Search for recent changes
devmind search "recent database changes" --days=7
```

**With AI Assistants**
- Automatic context storage during conversations
- Intelligent retrieval based on current discussion
- Cross-session context continuity

---

## API Reference

### Core Methods

#### `store(context: ContextData): Promise<string>`
Store new context information.

**Parameters:**
- `context.content` - Main content text
- `context.type` - Content type classification
- `context.tags` - Associated tags array
- `context.metadata` - Additional metadata object

**Returns:** Context ID string

#### `search(query: SearchQuery): Promise<Context[]>`
Search for relevant contexts.

**Parameters:**
- `query.query` - Search query string
- `query.limit` - Maximum results (default: 20)
- `query.type` - Filter by content type
- `query.tags` - Filter by tags
- `query.timeRange` - Time range filter

**Returns:** Array of matching contexts

#### `retrieve(id: string): Promise<Context | null>`
Retrieve specific context by ID.

#### `update(id: string, updates: Partial<ContextData>): Promise<boolean>`
Update existing context.

#### `delete(id: string): Promise<boolean>`
Delete context by ID.

### Utility Methods

#### `cleanup(): Promise<void>`
Perform database cleanup and optimization.

#### `stats(): Promise<DatabaseStats>`
Get database statistics and health information.

#### `export(format: 'json' | 'csv'): Promise<string>`
Export all contexts to specified format.

---

## Development

### Development Setup

```bash
# Clone and setup
git clone https://github.com/JochenYang/Devmind.git
cd Devmind
npm install

# Development mode
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
│   ├── mcp-server.ts      # MCP protocol implementation
│   ├── memory-manager.ts  # Core memory operations
│   ├── search-engine.ts   # Search and retrieval logic
│   ├── types.ts          # Type definitions
│   └── utils.ts          # Utility functions
├── dist/                 # Compiled JavaScript
├── tests/               # Test suites
├── docs/               # Documentation
└── examples/           # Usage examples
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

## 🤖 Smart Recording Rules Configuration

To enable the most intelligent auto-recording experience with DevMind MCP, add the following user rules to your MCP client (Claude Desktop, Warp, etc.):

### Recommended System Rules

```
Use DevMind MCP - intelligent development memory with auto file monitoring:

• Before answering technical questions: use semantic_search
• When user says "remember this": use record_context
• For bug fixes/solutions: record_context with type="solution"
• For decisions/configs: record_context with type="documentation"
• DevMind auto-captures file changes, focus manual recording on insights
• Always add relevant tags and appropriate type
```

### MCP Client Configuration

**Step 1: Add DevMind MCP Server**

Add to your MCP client configuration file:

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


**Configuration File Locations:**
- **Claude Desktop (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Desktop (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Linux)**: `~/.config/Claude/claude_desktop_config.json`
- **Other MCP Clients**: Refer to your client's documentation for configuration file location

### Auto-Recording Trigger Scenarios

#### High Priority (Must Record)
- User says "remember this", "this is important"
- Fixed bugs or errors
- Implemented new features
- Made architectural decisions
- Version releases or major updates

#### Medium Priority (Should Record)
- Code reviews and suggestions
- Performance optimization solutions
- Configuration change explanations
- Learning notes and best practices

#### Low Priority (Optional)
- General discussions
- Simple command explanations
- Repetitive content

### Recommended Recording Format

```typescript
// Recommended recording pattern
{
  content: "Specific technical content including background and solutions",
  type: "solution|code|error|documentation|test|configuration",
  tags: ["tech-stack", "module", "importance", "status"],
  session_id: "current-session-id"
}
```

### Usage Examples

**Scenario 1: Bug Fix**
```
User: "How to fix this authentication bug?"
Assistant: [Provides solution] + Auto-calls record_context to record fix process
```

**Scenario 2: Architecture Decision**
```
User: "Which database solution should we choose?"
Assistant: [Analysis and comparison] + Auto-calls record_context to record decision rationale
```

**Scenario 3: Explicit User Marking**
```
User: "Remember this API design pattern, it's important"
Assistant: Immediately calls record_context to save content
```

---

## Use Cases

### Software Development
- Track implementation decisions and technical choices
- Maintain context across development sessions
- Store and retrieve code snippets and patterns
- Document architectural decisions

### Research and Learning
- Accumulate knowledge from multiple sources
- Build connections between related concepts
- Maintain research context over time
- Create searchable knowledge bases

### Project Management
- Track project evolution and decisions
- Maintain context across team meetings
- Store and retrieve project-related information
- Document lessons learned

### AI Assistant Enhancement
- Provide persistent memory for AI conversations
- Enable context-aware responses
- Maintain user preferences and history
- Support long-term relationship building

---

## Contributing

We welcome contributions to DevMind MCP. Please read our contributing guidelines before submitting pull requests.

### Development Process

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Code Standards

- Follow TypeScript best practices
- Maintain test coverage above 80%
- Use conventional commit messages
- Document public APIs thoroughly

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Support

- **Documentation:** [Wiki](https://github.com/JochenYang/Devmind/wiki)
- **Issues:** [GitHub Issues](https://github.com/JochenYang/Devmind/issues)
- **Discussions:** [GitHub Discussions](https://github.com/JochenYang/Devmind/discussions)

---


---

**DevMind MCP** - Intelligent context-aware memory for AI assistants