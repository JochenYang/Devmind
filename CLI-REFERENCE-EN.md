# DevMind CLI Complete Reference

## Table of Contents
- [Project Management](#project-management)
- [Daemon Management](#daemon-management)
- [Session Management](#session-management)
- [Search & Query](#search--query)
- [Content Extraction](#content-extraction)
- [Optimization & Maintenance](#optimization--maintenance)
- [Visualization](#visualization)

---

## Project Management

### `devmind init`
Initialize DevMind configuration file

```bash
devmind init [options]
```

**Options**:
- `--config-path <path>` - Configuration file path (default: `.devmind.json`)

**Examples**:
```bash
# Initialize in current directory
devmind init

# Specify config file path
devmind init --config-path ./config/devmind.json
```

### `devmind project <action>`
Manage projects

```bash
devmind project <action> [path] [options]
```

**Actions**:
- `list` - List all projects
- `create` - Create new project
- `info` - View project information

**Options**:
- `--config <path>` - Configuration file path

**Examples**:
```bash
# List all projects
devmind project list

# Create new project
devmind project create /path/to/project

# View project info
devmind project info /path/to/project
```

### `devmind stats`
Show database statistics

```bash
devmind stats [options]
```

**Options**:
- `--config <path>` - Configuration file path

**Examples**:
```bash
devmind stats
```

---

## Daemon Management

### `devmind start`
Start file monitoring daemon

```bash
devmind start [options]
```

**Options**:
- `--no-terminal` - Disable terminal command monitoring
- `--project <path>` - Project path (default: current directory)

**Features**:
- Auto-monitor file changes
- Record Git commits
- Monitor terminal commands (optional)
- Run in background

**Examples**:
```bash
# Start daemon (full monitoring)
devmind start

# Start without terminal monitoring
devmind start --no-terminal

# Specify project path
devmind start --project /path/to/project
```

**Output Example**:
```
🚀 Starting DevMind daemon...

✅ Daemon started successfully
   PID: 12345
   Project: /path/to/project

   Use 'devmind status' to check status
   Use 'devmind stop' to stop daemon
```

### `devmind stop`
Stop daemon

```bash
devmind stop [options]
```

**Options**:
- `--project <path>` - Project path (default: current directory)

**Examples**:
```bash
# Stop daemon for current project
devmind stop

# Stop daemon for specific project
devmind stop --project /path/to/project
```

### `devmind status`
Check daemon status

```bash
devmind status [options]
```

**Options**:
- `--project <path>` - Project path (default: current directory)

**Examples**:
```bash
devmind status
```

**Output Example**:
```
📊 DevMind Daemon Status

   Project: /path/to/project
   Status: ✅ Running
   PID: 12345
   Uptime: 2h 15m
   Started: 2025-10-27T01:23:45.678Z
```

---

## Session Management

### `devmind session <action>`
Manage development sessions

```bash
devmind session <action> [path_or_id] [options]
```

**Actions**:
- `create` - Create new session
- `end` - End session
- `list` - List sessions
- `info` - View session info

**Options**:
- `--config <path>` - Configuration file path
- `--name <name>` - Session name
- `--tool <tool>` - Tool name

**Examples**:
```bash
# Create new session
devmind session create /path/to/project --name "Feature Development"

# List all sessions
devmind session list

# View session info
devmind session info <session-id>

# End session
devmind session end <session-id>
```

---

## Search & Query

### `devmind search <query>`
Semantic search contexts

```bash
devmind search <query> [options]
```

**Options**:
- `--config <path>` - Configuration file path
- `--project <id>` - Project ID
- `--session <id>` - Session ID
- `--limit <number>` - Result limit (default: 10)
- `--threshold <number>` - Similarity threshold (0-1, default: 0.5)

**Examples**:
```bash
# Basic search
devmind search "authentication implementation"

# Limit results
devmind search "error handling" --limit 5

# Search in specific project
devmind search "database query" --project <project-id>

# Set similarity threshold
devmind search "API design" --threshold 0.7
```

---

## Content Extraction

### `devmind extract <file>`
Extract structured context from file

```bash
devmind extract <file> [options]
```

**Options**:
- `--config <path>` - Configuration file path
- `--session <id>` - Session ID
- `--record` - Record to database

**Features**:
- Extract functions, classes, imports
- Detect programming language
- Analyze code structure
- Optional database recording

**Examples**:
```bash
# Extract file content
devmind extract src/app.ts

# Extract and record to database
devmind extract src/app.ts --record --session <session-id>
```

---

## Optimization & Maintenance

### `devmind optimize <project-id>`
Optimize project memory storage

```bash
devmind optimize <project-id> [options]
```

**Options**:
- `--config <path>` - Configuration file path
- `--strategies <list>` - Optimization strategies (comma-separated)
- `--dry-run` - Preview mode, don't execute

**Optimization Strategies**:
- `clustering` - Cluster similar contexts
- `compression` - Compress content
- `deduplication` - Remove duplicates
- `summarization` - Summarize content
- `ranking` - Quality ranking
- `archiving` - Archive old data

**Examples**:
```bash
# Optimize with all strategies
devmind optimize <project-id>

# Use specific strategies
devmind optimize <project-id> --strategies deduplication,compression

# Preview optimization
devmind optimize <project-id> --dry-run
```

### `devmind quality`
Update context quality scores

```bash
devmind quality [options]
```

**Options**:
- `--config <path>` - Configuration file path
- `--project <id>` - Project ID
- `--limit <number>` - Processing limit
- `--force-all` - Force update all contexts

**Examples**:
```bash
# Update quality scores
devmind quality

# Update specific project
devmind quality --project <project-id>

# Force update all
devmind quality --force-all
```

### `devmind maintenance <action>`
Database maintenance operations

```bash
devmind maintenance <action> [backup-file] [options]
```

**Actions**:
- `vacuum` - Compact database
- `backup` - Create backup
- `restore` - Restore backup

**Options**:
- `--config <path>` - Configuration file path
- `--output <path>` - Backup output path
- `--force` - Force execution (skip confirmation)

**Examples**:
```bash
# Compact database
devmind maintenance vacuum

# Create backup
devmind maintenance backup --output ./backups/

# Restore backup
devmind maintenance restore ./backups/backup-2025-10-27.json

# Force restore (no confirmation)
devmind maintenance restore ./backups/backup.json --force
```

---

## Visualization

### `devmind graph <project-id>`
Export interactive memory graph

```bash
devmind graph <project-id> [options]
```

**Options**:
- `--config <path>` - Configuration file path
- `--output <path>` - Output file path
- `--max-nodes <number>` - Maximum nodes (0 = all)
- `--focus-type <type>` - Focus type

**Focus Types**:
- `all` - All types
- `solution` - Solutions
- `error` - Errors
- `code` - Code
- `documentation` - Documentation
- `conversation` - Conversations

**Examples**:
```bash
# Export full graph
devmind graph <project-id>

# Limit nodes
devmind graph <project-id> --max-nodes 100

# Show only solutions and errors
devmind graph <project-id> --focus-type solution

# Specify output path
devmind graph <project-id> --output ./visualizations/memory-graph.html
```

---

## Global Options

All commands support these global options:

- `-V, --version` - Show version number
- `-h, --help` - Show help information

**Examples**:
```bash
# Check version
devmind --version

# Show help
devmind --help

# Show command-specific help
devmind start --help
```

---

## Configuration File

DevMind uses `.devmind.json` configuration file:

```json
{
  "database_path": "~/.devmind/memory.db",
  "max_contexts_per_session": 1000,
  "quality_threshold": 0.3,
  "ignored_patterns": [
    "node_modules/**",
    ".git/**",
    "dist/**"
  ],
  "included_extensions": [
    ".js", ".ts", ".py", ".go"
  ]
}
```

---

## Common Workflows

### Starting New Project
```bash
# 1. Initialize configuration
devmind init

# 2. Start daemon
devmind start

# 3. Check status
devmind status
```

### Search and Query
```bash
# Search related code
devmind search "authentication logic"

# View project stats
devmind stats

# List sessions
devmind session list
```

### Maintenance and Optimization
```bash
# Optimize storage
devmind optimize <project-id>

# Update quality scores
devmind quality

# Create backup
devmind maintenance backup

# Compact database
devmind maintenance vacuum
```

### Stop Monitoring
```bash
# Stop daemon
devmind stop

# Confirm stopped
devmind status
```

---

## Troubleshooting

### Daemon Won't Start
```bash
# Check if already running
devmind status

# If shows running but not actually running, clean up manually
rm .devmind/daemon.pid

# Restart
devmind start
```

### Database Issues
```bash
# Compact database
devmind maintenance vacuum

# Create backup
devmind maintenance backup

# Restore if needed
devmind maintenance restore <backup-file>
```

### Inaccurate Search Results
```bash
# Update quality scores
devmind quality --force-all

# Optimize storage
devmind optimize <project-id>
```

---

## Environment Variables

- `DEVMIND_DB_PATH` - Override database path
- `DEVMIND_CONFIG_PATH` - Override config file path

**Examples**:
```bash
export DEVMIND_DB_PATH=/custom/path/memory.db
devmind start
```
