/**
 * Integration Test for verify_work_recorded tool
 * Tests the complete workflow of tracking and verifying work
 * 
 * Run: npx tsx tests/verify-work-integration.test.ts
 */

import { PendingMemoryTracker } from "../src/pending-memory-tracker.js";

// Simple test framework
let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (error) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${error instanceof Error ? error.message : error}`);
    failCount++;
  }
}

function assertEqual(actual: any, expected: any, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || "Expected true, got false");
  }
}

// Simulate suggestContextType function
function suggestContextType(summary: string): string {
  const lowerSummary = summary.toLowerCase();
  if (lowerSummary.includes("fix") || lowerSummary.includes("bug")) return "bug_fix";
  if (lowerSummary.includes("feature") || lowerSummary.includes("implement")) return "feature_add";
  if (lowerSummary.includes("refactor")) return "code_refactor";
  if (lowerSummary.includes("test")) return "test";
  if (lowerSummary.includes("doc")) return "documentation";
  return "code_modify";
}

// Simulate verifyWorkRecorded function
function verifyWorkRecorded(
  tracker: PendingMemoryTracker,
  workSummary: string,
  sessionId?: string
): { status: "passed" | "failed"; message: string; unrecordedFiles?: string[] } {
  const unrecordedFiles = tracker.getUnrecorded(sessionId);
  
  if (unrecordedFiles.length > 0) {
    const suggestedType = suggestContextType(workSummary);
    return {
      status: "failed",
      message: `WARNING: ${unrecordedFiles.length} files not recorded. Suggested type: ${suggestedType}`,
      unrecordedFiles,
    };
  }
  
  return {
    status: "passed",
    message: "VERIFICATION PASSED: All work has been recorded.",
  };
}

// Tests
console.log("\n=== Integration Tests: verify_work_recorded Workflow ===\n");

console.log("1. Complete Workflow Simulation:");

test("Workflow: File edit -> verify (fail) -> record -> verify (pass)", () => {
  const tracker = new PendingMemoryTracker();
  
  // Step 1: AI edits files (File Watcher detects and adds to tracker)
  tracker.addPending("src/auth.ts", "modify", "session-1");
  tracker.addPending("src/login.ts", "modify", "session-1");
  
  // Step 2: AI calls verify_work_recorded (should fail)
  const result1 = verifyWorkRecorded(tracker, "Fixed login bug", "session-1");
  assertEqual(result1.status, "failed");
  assertEqual(result1.unrecordedFiles?.length, 2);
  assertTrue(result1.message.includes("bug_fix"));
  
  // Step 3: AI calls record_context (marks files as recorded)
  tracker.markMultipleRecorded(["src/auth.ts", "src/login.ts"]);
  
  // Step 4: AI calls verify_work_recorded again (should pass)
  const result2 = verifyWorkRecorded(tracker, "Fixed login bug", "session-1");
  assertEqual(result2.status, "passed");
  assertEqual(result2.unrecordedFiles, undefined);
  
  tracker.destroy();
});

console.log("\n2. Context Type Suggestion:");

test("should suggest bug_fix for fix-related summaries", () => {
  assertEqual(suggestContextType("Fixed login bug"), "bug_fix");
  assertEqual(suggestContextType("Bug fix in auth module"), "bug_fix");
});

test("should suggest feature_add for feature-related summaries", () => {
  assertEqual(suggestContextType("Implemented user profile"), "feature_add");
  assertEqual(suggestContextType("Added new feature"), "feature_add");
});

test("should suggest code_refactor for refactor summaries", () => {
  assertEqual(suggestContextType("Refactored auth module"), "code_refactor");
});

test("should suggest test for test summaries", () => {
  assertEqual(suggestContextType("Added unit tests"), "test");
});

test("should suggest documentation for doc summaries", () => {
  assertEqual(suggestContextType("Updated documentation"), "documentation");
});

test("should default to code_modify for other summaries", () => {
  assertEqual(suggestContextType("Updated some code"), "code_modify");
  assertEqual(suggestContextType("Changed configuration"), "code_modify");
});

console.log("\n3. Edge Cases:");

test("verify with no pending files should pass immediately", () => {
  const tracker = new PendingMemoryTracker();
  const result = verifyWorkRecorded(tracker, "Some work");
  assertEqual(result.status, "passed");
  tracker.destroy();
});

test("verify should handle empty session", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/a.ts", "modify", "other-session");
  
  // Verify for empty session should pass
  const result = verifyWorkRecorded(tracker, "Some work", "empty-session");
  assertEqual(result.status, "passed");
  tracker.destroy();
});

test("partial recording should still show remaining files", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/a.ts", "modify");
  tracker.addPending("src/b.ts", "modify");
  tracker.addPending("src/c.ts", "modify");
  
  // Record only some files
  tracker.markRecorded("src/a.ts");
  
  const result = verifyWorkRecorded(tracker, "Some work");
  assertEqual(result.status, "failed");
  assertEqual(result.unrecordedFiles?.length, 2);
  assertTrue(result.unrecordedFiles?.includes("src/b.ts") || false);
  assertTrue(result.unrecordedFiles?.includes("src/c.ts") || false);
  tracker.destroy();
});

// Summary
console.log("\n=== Test Summary ===");
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${failCount}`);
console.log(`  Total:  ${passCount + failCount}\n`);

process.exit(failCount > 0 ? 1 : 0);

