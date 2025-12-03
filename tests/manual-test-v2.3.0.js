/**
 * Manual Test Script for v2.3.0 Features
 * Tests: Git detection, Project detection, Hybrid scoring
 */

import { DatabaseManager } from "../dist/database.js";
import { SessionManager } from "../dist/session-manager.js";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectPath = path.resolve(__dirname, "..");

const dbPath = path.join(os.homedir(), ".devmind", "memory.db");
const db = new DatabaseManager(dbPath);
const sessionManager = new SessionManager(db, {});

console.log("=== DevMind v2.3.0 Manual Test ===\n");

// Test 1: Git Detection
console.log("📋 Test 1: Git Detection");
console.log("Testing detectGitInfo functionality...");
console.log("Expected: Should detect changed files, branch, author");
console.log("Action: Make some changes to files and run this test\n");

// Test 2: Project Detection
console.log("📋 Test 2: Project Detection");
console.log("Testing detectProjectInfo functionality...");
console.log(`Project Path: ${projectPath}`);
console.log("Expected: Should read package.json and extract name, version");
console.log("Action: Check if package.json exists and is readable\n");

// Test 3: Record Context with Auto-detection
console.log("📋 Test 3: Record Context with Auto-detection");
console.log("Testing record_context with Git auto-detection...");
console.log(
  "Expected: Should auto-detect changed files if files_changed not provided"
);
console.log("Action: Call record_context without files_changed parameter\n");

// Test 4: Semantic Search with Hybrid Scoring
console.log("📋 Test 4: Semantic Search with Hybrid Scoring");
console.log("Testing semantic_search with metadata scoring...");
console.log("Expected: Results should include metadata_score and final_score");
console.log("Action: Call semantic_search and check result structure\n");

// Test 5: Metadata in Database
console.log("📋 Test 5: Metadata Storage");
console.log("Testing if Git and Project info stored in metadata...");
console.log(
  "Expected: metadata should contain git_branch, git_author, project_name"
);
console.log("Action: Query recent contexts and check metadata field\n");

console.log("=== Manual Test Instructions ===");
console.log("1. Make some file changes (don't commit yet)");
console.log("2. Call record_context via MCP without files_changed");
console.log("3. Check if files were auto-detected");
console.log("4. Call semantic_search and verify hybrid scoring");
console.log("5. Query the context and check metadata fields\n");

console.log("=== Quick Test Commands (via MCP) ===");
console.log("# Test Git detection:");
console.log("git status  # Should show modified files");
console.log("");
console.log("# Test record_context with auto-detection:");
console.log(
  `record_context({ content: "Test Git auto-detection", type: "test", project_path: "${projectPath}" })`
);
console.log("");
console.log("# Test semantic_search with hybrid scoring:");
console.log(
  `semantic_search({ query: "test auto-detection", project_path: "${projectPath}", limit: 5 })`
);
console.log("");
console.log("# Check metadata:");
console.log(`list_contexts({ project_path: "${projectPath}", limit: 1 })`);
console.log("");

db.close();
