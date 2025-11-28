/**
 * Test for PendingMemoryTracker
 * Run: npx ts-node tests/pending-memory-tracker.test.ts
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

function assertFalse(condition: boolean, message?: string) {
  if (condition) {
    throw new Error(message || "Expected false, got true");
  }
}

// Tests
console.log("\n=== PendingMemoryTracker Tests ===\n");

console.log("1. Basic Operations:");
test("should add pending file", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/auth.ts", "modify", "session-1");
  assertTrue(tracker.hasPending());
  assertEqual(tracker.getUnrecordedCount(), 1);
  tracker.destroy();
});

test("should mark file as recorded", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/auth.ts", "modify", "session-1");
  tracker.markRecorded("src/auth.ts");
  assertFalse(tracker.hasPending());
  assertEqual(tracker.getUnrecordedCount(), 0);
  tracker.destroy();
});

test("should get unrecorded files", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/auth.ts", "modify", "session-1");
  tracker.addPending("src/login.ts", "add", "session-1");
  tracker.addPending("src/utils.ts", "modify", "session-1");
  
  const unrecorded = tracker.getUnrecorded();
  assertEqual(unrecorded.length, 3);
  assertTrue(unrecorded.includes("src/auth.ts"));
  assertTrue(unrecorded.includes("src/login.ts"));
  assertTrue(unrecorded.includes("src/utils.ts"));
  tracker.destroy();
});

console.log("\n2. Multi-file Operations:");
test("should mark multiple files as recorded", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/a.ts", "modify");
  tracker.addPending("src/b.ts", "modify");
  tracker.addPending("src/c.ts", "modify");
  
  tracker.markMultipleRecorded(["src/a.ts", "src/b.ts"]);
  
  const unrecorded = tracker.getUnrecorded();
  assertEqual(unrecorded.length, 1);
  assertEqual(unrecorded[0], "src/c.ts");
  tracker.destroy();
});

console.log("\n3. Session Filtering:");
test("should filter by session", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/a.ts", "modify", "session-1");
  tracker.addPending("src/b.ts", "modify", "session-2");
  tracker.addPending("src/c.ts", "modify", "session-1");
  
  const session1Files = tracker.getUnrecorded("session-1");
  assertEqual(session1Files.length, 2);
  assertTrue(session1Files.includes("src/a.ts"));
  assertTrue(session1Files.includes("src/c.ts"));
  
  const session2Files = tracker.getUnrecorded("session-2");
  assertEqual(session2Files.length, 1);
  assertEqual(session2Files[0], "src/b.ts");
  tracker.destroy();
});

test("should clear session", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/a.ts", "modify", "session-1");
  tracker.addPending("src/b.ts", "modify", "session-2");
  
  tracker.clearSession("session-1");
  
  assertEqual(tracker.getUnrecorded("session-1").length, 0);
  assertEqual(tracker.getUnrecorded("session-2").length, 1);
  tracker.destroy();
});

console.log("\n4. Pending Details:");
test("should get pending details", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/auth.ts", "modify", "session-1");
  
  const details = tracker.getPendingDetails();
  assertEqual(details.length, 1);
  assertEqual(details[0].filePath, "src/auth.ts");
  assertEqual(details[0].changeType, "modify");
  assertEqual(details[0].sessionId, "session-1");
  assertTrue(details[0].timestamp > 0);
  assertFalse(details[0].autoRecorded);
  tracker.destroy();
});

console.log("\n5. Clear Operations:");
test("should clear all", () => {
  const tracker = new PendingMemoryTracker();
  tracker.addPending("src/a.ts", "modify");
  tracker.addPending("src/b.ts", "add");
  
  tracker.clear();
  
  assertFalse(tracker.hasPending());
  assertEqual(tracker.getUnrecordedCount(), 0);
  tracker.destroy();
});

// Summary
console.log("\n=== Test Summary ===");
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${failCount}`);
console.log(`  Total:  ${passCount + failCount}\n`);

process.exit(failCount > 0 ? 1 : 0);

