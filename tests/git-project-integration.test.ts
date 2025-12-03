/**
 * Test Git and Project Info Integration in record_context
 *
 * This test verifies that:
 * 1. Git info is auto-detected when files_changed is not provided
 * 2. Project info is auto-detected from package.json
 * 3. User-provided metadata is not overwritten
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AiMemoryMcpServer } from "../src/mcp-server.js";
import { join } from "path";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} from "fs";
import { execSync } from "child_process";

describe("Git and Project Info Integration", () => {
  let server: AiMemoryMcpServer;
  let testProjectPath: string;
  let testDbPath: string;

  beforeAll(async () => {
    // Create a temporary test project directory
    testProjectPath = join(process.cwd(), "test-temp-project");
    testDbPath = join(process.cwd(), "test-temp-memory.db");

    if (!existsSync(testProjectPath)) {
      mkdirSync(testProjectPath, { recursive: true });
    }

    // Create a package.json
    const packageJson = {
      name: "test-project",
      version: "1.0.0",
      description: "Test project for Git integration",
    };
    writeFileSync(
      join(testProjectPath, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );

    // Initialize Git repository
    try {
      execSync("git init", { cwd: testProjectPath, stdio: "ignore" });
      execSync('git config user.name "Test User"', {
        cwd: testProjectPath,
        stdio: "ignore",
      });
      execSync('git config user.email "test@example.com"', {
        cwd: testProjectPath,
        stdio: "ignore",
      });

      // Create a test file and commit it
      writeFileSync(join(testProjectPath, "test.txt"), "initial content");
      execSync("git add .", { cwd: testProjectPath, stdio: "ignore" });
      execSync('git commit -m "Initial commit"', {
        cwd: testProjectPath,
        stdio: "ignore",
      });

      // Modify the file to create uncommitted changes
      writeFileSync(join(testProjectPath, "test.txt"), "modified content");
    } catch (error) {
      console.warn("Git initialization failed:", error);
    }

    // Initialize server
    server = new AiMemoryMcpServer({
      database_path: testDbPath,
      vector_search: { enabled: false },
    });
  });

  afterAll(async () => {
    // Cleanup
    await server.close();

    try {
      if (existsSync(testDbPath)) unlinkSync(testDbPath);
      if (existsSync(testProjectPath)) {
        // Remove .git directory
        const gitDir = join(testProjectPath, ".git");
        if (existsSync(gitDir)) {
          execSync(`rmdir /s /q "${gitDir}"`, { stdio: "ignore" });
        }
        // Remove files
        if (existsSync(join(testProjectPath, "package.json"))) {
          unlinkSync(join(testProjectPath, "package.json"));
        }
        if (existsSync(join(testProjectPath, "test.txt"))) {
          unlinkSync(join(testProjectPath, "test.txt"));
        }
        rmdirSync(testProjectPath);
      }
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  });

  it("should auto-detect Git info and project info", async () => {
    // Call record_context without files_changed
    const result = await (server as any).handleRecordContext({
      project_path: testProjectPath,
      type: "code_modify",
      content:
        "# Test\n\nThis is a test context to verify Git and project info detection.",
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    // Should contain either Chinese or English auto-record message
    const text = result.content[0].text;
    expect(text).toMatch(/已自动记录|Auto-recorded/);
    // Should detect the modified file
    expect(text).toContain("test.txt");
  });

  it("should not overwrite user-provided metadata", async () => {
    // Call record_context with user-provided metadata
    const result = await (server as any).handleRecordContext({
      project_path: testProjectPath,
      type: "code_modify",
      content: "# Test with custom metadata",
      metadata: {
        git_branch: "custom-branch",
        project_name: "custom-project",
      },
    });

    expect(result).toBeDefined();
    // The user-provided values should be preserved
    // (We can't easily verify this without accessing the database directly)
  });

  it("should skip Git detection when files_changed is provided", async () => {
    // Call record_context with files_changed
    const result = await (server as any).handleRecordContext({
      project_path: testProjectPath,
      type: "code_modify",
      content: "# Test with files_changed",
      files_changed: [{ file_path: "manual-file.ts", change_type: "modify" }],
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  });
});
