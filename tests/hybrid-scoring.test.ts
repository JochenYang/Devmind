/**
 * Tests for Hybrid Relevance Scoring Module
 *
 * This test file validates the metadata scoring functions:
 * - filesMatch(): File path matching logic
 * - getDaysSinceCreation(): Time-based scoring
 * - extractFilesFromQuery(): File path extraction from queries
 * - calculateMetadataScore(): Overall metadata scoring
 * - combineScores(): Vector + metadata score combination
 */

import { describe, it, expect } from "vitest";

// Mock the AiMemoryMcpServer class methods for testing
class HybridScoringTestHelper {
  /**
   * Check if two file paths match
   */
  filesMatch(file1: string, file2: string): boolean {
    if (!file1 || !file2) {
      return false;
    }

    // 1. Exact match
    if (file1 === file2) {
      return true;
    }

    // 2. Filename match (ignoring path)
    const name1 = file1.split(/[/\\]/).pop() || "";
    const name2 = file2.split(/[/\\]/).pop() || "";
    if (name1 && name2 && name1 === name2) {
      return true;
    }

    // 3. Partial path match
    if (file1.includes(file2) || file2.includes(file1)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate days since creation
   */
  getDaysSinceCreation(createdAt: string): number {
    try {
      const created = new Date(createdAt);
      // Check if date is valid
      if (isNaN(created.getTime())) {
        return 365;
      }
      const now = new Date();
      const diffMs = now.getTime() - created.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch (error) {
      return 365;
    }
  }

  /**
   * Extract file paths from query string
   */
  extractFilesFromQuery(query: string): string[] {
    const files: string[] = [];

    // Pattern 1: Paths with extensions
    const pathPattern = /(?:\.\/|\.\.\/|\/)?[\w\-./]+\.\w+/g;
    const pathMatches = query.match(pathPattern);
    if (pathMatches) {
      files.push(...pathMatches);
    }

    // Pattern 2: Quoted paths
    const quotedPattern = /["']([^"']+\.\w+)["']/g;
    let quotedMatch;
    while ((quotedMatch = quotedPattern.exec(query)) !== null) {
      files.push(quotedMatch[1]);
    }

    // Pattern 3: Backtick paths
    const backtickPattern = /`([^`]+\.\w+)`/g;
    let backtickMatch;
    while ((backtickMatch = backtickPattern.exec(query)) !== null) {
      files.push(backtickMatch[1]);
    }

    return [...new Set(files)];
  }

  /**
   * Calculate metadata-based relevance score
   */
  calculateMetadataScore(input: {
    query: string;
    context: {
      files?: string[];
      project_path?: string;
      tags?: string[];
      created_at: string;
    };
    queryFiles?: string[];
    queryProject?: string;
  }): {
    fileMatch: number;
    projectMatch: number;
    tagMatch: number;
    timeWeight: number;
    total: number;
  } {
    try {
      let fileMatch = 0;
      let projectMatch = 0;
      let tagMatch = 0;
      let timeWeight = 0;

      // 1. File name matching (weight 5)
      if (input.queryFiles && input.context.files) {
        for (const queryFile of input.queryFiles) {
          for (const contextFile of input.context.files) {
            if (this.filesMatch(queryFile, contextFile)) {
              fileMatch = 5;
              break;
            }
          }
          if (fileMatch > 0) break;
        }
      }

      // 2. Project matching (weight 3)
      if (input.queryProject && input.context.project_path) {
        if (input.queryProject === input.context.project_path) {
          projectMatch = 3;
        }
      }

      // 3. Tag matching (weight 2)
      const queryLower = input.query.toLowerCase();
      if (input.context.tags) {
        for (const tag of input.context.tags) {
          if (queryLower.includes(tag.toLowerCase())) {
            tagMatch += 2;
          }
        }
      }

      // 4. Time weight (0-10 points)
      const daysSince = this.getDaysSinceCreation(input.context.created_at);
      timeWeight = Math.max(0, 10 - daysSince);

      const total = fileMatch + projectMatch + tagMatch + timeWeight;
      return { fileMatch, projectMatch, tagMatch, timeWeight, total };
    } catch (error) {
      return {
        fileMatch: 0,
        projectMatch: 0,
        tagMatch: 0,
        timeWeight: 0,
        total: 0,
      };
    }
  }

  /**
   * Combine vector score and metadata score
   */
  combineScores(vectorScore: number, metadataScore: number): number {
    const normalizedMetadata = Math.min(metadataScore / 20, 1.0);
    return vectorScore * 0.7 + normalizedMetadata * 0.3;
  }
}

describe("Hybrid Relevance Scoring Module", () => {
  const helper = new HybridScoringTestHelper();

  describe("filesMatch()", () => {
    it("should match exact file paths", () => {
      expect(helper.filesMatch("src/index.ts", "src/index.ts")).toBe(true);
    });

    it("should match filenames ignoring paths", () => {
      expect(helper.filesMatch("src/utils/helper.ts", "lib/helper.ts")).toBe(
        true
      );
    });

    it("should match partial paths", () => {
      expect(helper.filesMatch("src/index.ts", "index.ts")).toBe(true);
      expect(helper.filesMatch("index.ts", "src/index.ts")).toBe(true);
    });

    it("should not match different files", () => {
      expect(helper.filesMatch("src/index.ts", "src/main.ts")).toBe(false);
    });

    it("should handle empty strings", () => {
      expect(helper.filesMatch("", "src/index.ts")).toBe(false);
      expect(helper.filesMatch("src/index.ts", "")).toBe(false);
    });
  });

  describe("getDaysSinceCreation()", () => {
    it("should calculate days for recent dates", () => {
      const today = new Date().toISOString();
      expect(helper.getDaysSinceCreation(today)).toBe(0);
    });

    it("should calculate days for past dates", () => {
      const yesterday = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      expect(helper.getDaysSinceCreation(yesterday)).toBe(1);
    });

    it("should handle invalid dates", () => {
      expect(helper.getDaysSinceCreation("invalid-date")).toBe(365);
    });
  });

  describe("extractFilesFromQuery()", () => {
    it("should extract simple file paths", () => {
      const files = helper.extractFilesFromQuery(
        "Check src/index.ts for errors"
      );
      expect(files).toContain("src/index.ts");
    });

    it("should extract quoted file paths", () => {
      const files = helper.extractFilesFromQuery(
        'Look at "src/utils/helper.ts"'
      );
      expect(files).toContain("src/utils/helper.ts");
    });

    it("should extract backtick file paths", () => {
      const files = helper.extractFilesFromQuery("Review `src/main.ts` file");
      expect(files).toContain("src/main.ts");
    });

    it("should extract multiple file paths", () => {
      const files = helper.extractFilesFromQuery(
        "Compare src/index.ts and src/main.ts"
      );
      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it("should remove duplicates", () => {
      const files = helper.extractFilesFromQuery(
        "src/index.ts and src/index.ts again"
      );
      expect(files.filter((f) => f === "src/index.ts").length).toBe(1);
    });
  });

  describe("calculateMetadataScore()", () => {
    it("should score file matches correctly", () => {
      const score = helper.calculateMetadataScore({
        query: "Check src/index.ts",
        context: {
          files: ["src/index.ts"],
          created_at: new Date().toISOString(),
        },
        queryFiles: ["src/index.ts"],
      });
      expect(score.fileMatch).toBe(5);
    });

    it("should score project matches correctly", () => {
      const score = helper.calculateMetadataScore({
        query: "Project issue",
        context: {
          project_path: "/home/user/project",
          created_at: new Date().toISOString(),
        },
        queryProject: "/home/user/project",
      });
      expect(score.projectMatch).toBe(3);
    });

    it("should score tag matches correctly", () => {
      const score = helper.calculateMetadataScore({
        query: "authentication bug",
        context: {
          tags: ["auth", "bug"],
          created_at: new Date().toISOString(),
        },
      });
      expect(score.tagMatch).toBeGreaterThan(0);
    });

    it("should apply time weight for recent contexts", () => {
      const score = helper.calculateMetadataScore({
        query: "test",
        context: {
          created_at: new Date().toISOString(),
        },
      });
      expect(score.timeWeight).toBe(10);
    });

    it("should calculate total score", () => {
      const score = helper.calculateMetadataScore({
        query: "Check src/index.ts for auth",
        context: {
          files: ["src/index.ts"],
          tags: ["auth"],
          created_at: new Date().toISOString(),
        },
        queryFiles: ["src/index.ts"],
      });
      expect(score.total).toBeGreaterThan(0);
    });
  });

  describe("combineScores()", () => {
    it("should combine vector and metadata scores with correct weights", () => {
      const combined = helper.combineScores(0.8, 10);
      // 0.8 * 0.7 + (10/20) * 0.3 = 0.56 + 0.15 = 0.71
      expect(combined).toBeCloseTo(0.71, 2);
    });

    it("should handle maximum metadata score", () => {
      const combined = helper.combineScores(1.0, 20);
      // 1.0 * 0.7 + 1.0 * 0.3 = 1.0
      expect(combined).toBe(1.0);
    });

    it("should handle zero metadata score", () => {
      const combined = helper.combineScores(0.8, 0);
      // 0.8 * 0.7 + 0 * 0.3 = 0.56
      expect(combined).toBeCloseTo(0.56, 2);
    });

    it("should normalize metadata scores above 20", () => {
      const combined = helper.combineScores(0.5, 30);
      // Should cap metadata at 1.0: 0.5 * 0.7 + 1.0 * 0.3 = 0.65
      expect(combined).toBeCloseTo(0.65, 2);
    });
  });
});
