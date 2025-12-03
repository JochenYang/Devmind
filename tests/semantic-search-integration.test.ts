/**
 * Integration test for semantic_search with hybrid scoring
 *
 * This test verifies that:
 * 1. Metadata scores are calculated for search results
 * 2. Vector and metadata scores are combined correctly
 * 3. Results are re-sorted by final score
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AiMemoryMcpServer } from "../src/mcp-server.js";
import { join } from "path";
import { existsSync, unlinkSync } from "fs";

describe("Semantic Search with Hybrid Scoring", () => {
  let server: AiMemoryMcpServer;
  let testDbPath: string;
  let sessionId: string;
  let contextIds: string[] = [];

  beforeAll(async () => {
    testDbPath = join(process.cwd(), "test-semantic-search.db");

    // Remove existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // Initialize server with vector search enabled
    server = new AiMemoryMcpServer({
      database_path: testDbPath,
      vector_search: {
        enabled: true,
        model_name: "Xenova/all-MiniLM-L6-v2",
        dimensions: 384,
        similarity_threshold: 0.3,
        hybrid_weight: 0.7,
      },
    });

    // Create a test session
    const sessionResult = await (server as any).handleCreateSession({
      project_path: "/test/project",
      tool_used: "test",
      name: "Test Session",
    });

    sessionId = sessionResult._meta.session_id;

    // Record some test contexts with different characteristics
    const contexts = [
      {
        content:
          "# Bug Fix in Authentication\n\nFixed login issue in src/auth/login.ts",
        type: "bug_fix",
        file_path: "src/auth/login.ts",
        tags: ["auth", "bug"],
        created_at: new Date().toISOString(), // Recent
      },
      {
        content:
          "# Feature: User Profile\n\nImplemented user profile page in src/profile/index.ts",
        type: "feature_add",
        file_path: "src/profile/index.ts",
        tags: ["feature", "profile"],
        created_at: new Date(
          Date.now() - 5 * 24 * 60 * 60 * 1000
        ).toISOString(), // 5 days ago
      },
      {
        content:
          "# Documentation Update\n\nUpdated README with installation instructions",
        type: "documentation",
        file_path: "README.md",
        tags: ["docs"],
        created_at: new Date(
          Date.now() - 10 * 24 * 60 * 60 * 1000
        ).toISOString(), // 10 days ago
      },
    ];

    for (const ctx of contexts) {
      const result = await (server as any).handleRecordContext({
        session_id: sessionId,
        ...ctx,
      });
      // Extract context ID from result
      const match = result.content[0].text.match(/ID: (\d+)/);
      if (match) {
        contextIds.push(match[1]);
      }
    }

    // Wait for embeddings to be generated
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    await server.close();

    // Cleanup
    try {
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  });

  it("should calculate metadata scores for search results", async () => {
    // Search for authentication-related content
    const result = await (server as any).handleSemanticSearch({
      query: "authentication bug in src/auth/login.ts",
      project_path: "/test/project",
      limit: 10,
    });

    expect(result).toBeDefined();
    expect(result._meta).toBeDefined();
    expect(result._meta.results).toBeDefined();
    expect(result._meta.results.length).toBeGreaterThan(0);

    // Check that metadata scores are present
    const firstResult = result._meta.results[0];
    expect(firstResult.metadata_score).toBeDefined();
    expect(firstResult.metadata_score.fileMatch).toBeDefined();
    expect(firstResult.metadata_score.projectMatch).toBeDefined();
    expect(firstResult.metadata_score.tagMatch).toBeDefined();
    expect(firstResult.metadata_score.timeWeight).toBeDefined();
    expect(firstResult.metadata_score.total).toBeDefined();
  });

  it("should combine vector and metadata scores", async () => {
    const result = await (server as any).handleSemanticSearch({
      query: "authentication",
      project_path: "/test/project",
      limit: 10,
    });

    expect(result._meta.results.length).toBeGreaterThan(0);

    // Check that final scores are calculated
    const firstResult = result._meta.results[0];
    expect(firstResult.final_score).toBeDefined();
    expect(firstResult.vector_score).toBeDefined();

    // Final score should be a weighted combination
    // final_score = vector_score * 0.7 + (metadata_score / 20) * 0.3
    const expectedScore =
      firstResult.vector_score * 0.7 +
      (firstResult.metadata_score.total / 20) * 0.3;
    expect(firstResult.final_score).toBeCloseTo(expectedScore, 5);
  });

  it("should re-sort results by final score", async () => {
    const result = await (server as any).handleSemanticSearch({
      query: "src/auth/login.ts authentication",
      project_path: "/test/project",
      limit: 10,
    });

    expect(result._meta.results.length).toBeGreaterThan(0);

    // Check that results are sorted by final_score in descending order
    for (let i = 0; i < result._meta.results.length - 1; i++) {
      expect(result._meta.results[i].final_score).toBeGreaterThanOrEqual(
        result._meta.results[i + 1].final_score
      );
    }
  });

  it("should boost recent contexts with time weight", async () => {
    const result = await (server as any).handleSemanticSearch({
      query: "bug fix",
      project_path: "/test/project",
      limit: 10,
    });

    expect(result._meta.results.length).toBeGreaterThan(0);

    // Find the recent bug fix context
    const recentContext = result._meta.results.find((r: any) =>
      r.content_preview.includes("Authentication")
    );

    if (recentContext) {
      // Recent context should have higher time weight
      expect(recentContext.metadata_score.timeWeight).toBeGreaterThan(5);
    }
  });

  it("should boost file matches", async () => {
    const result = await (server as any).handleSemanticSearch({
      query: "check src/auth/login.ts",
      project_path: "/test/project",
      limit: 10,
    });

    expect(result._meta.results.length).toBeGreaterThan(0);

    // Find the context with matching file
    const matchingContext = result._meta.results.find(
      (r: any) => r.file_path === "src/auth/login.ts"
    );

    if (matchingContext) {
      // Should have file match score
      expect(matchingContext.metadata_score.fileMatch).toBe(5);
    }
  });
});
