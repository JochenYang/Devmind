/**
 * Test for Tool Description improvements (Optimized Version)
 * Verifies that the new CONCISE description contains key mandatory language
 *
 * Run: npx tsx tests/tool-description.test.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

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

// Read the mcp-server.ts file
const serverPath = join(process.cwd(), "src", "mcp-server.ts");
const serverContent = readFileSync(serverPath, "utf-8");

// Extract record_context description
const descriptionMatch = serverContent.match(
  /name: "record_context",\s*description:\s*"([^"]+)"/s
);

if (!descriptionMatch) {
  console.error("Could not find record_context description in mcp-server.ts");
  process.exit(1);
}

const description = descriptionMatch[1];

console.log("\n=== Tool Description Tests (Optimized) ===\n");

console.log("1. Mandatory Language (Concise):");

test("should contain MANDATORY", () => {
  assertTrue(description.includes("MANDATORY"));
});

test("should contain IMMEDIATELY", () => {
  assertTrue(description.includes("IMMEDIATELY"));
});

test("should mention INCOMPLETE", () => {
  assertTrue(description.includes("INCOMPLETE"));
});

console.log("\n2. Self-Check Section (Concise):");

test("should have SELF-CHECK", () => {
  assertTrue(description.includes("SELF-CHECK"));
});

test("should have file edit check", () => {
  assertTrue(description.includes("edit files"));
});

test("should have bug fix type", () => {
  assertTrue(description.includes("bug_fix"));
});

test("should have feature type", () => {
  assertTrue(description.includes("feature_add"));
});

console.log("\n3. Warning/Consequences:");

test("should warn about losing context", () => {
  assertTrue(description.includes("loses") && description.includes("context"));
});

test("should have action arrows (-->)", () => {
  assertTrue(description.includes("-->"));
});

console.log("\n4. No Emoji (Token Optimization):");

test("should not contain emoji", () => {
  const emojiPatterns = [
    /[\u{1F300}-\u{1F9FF}]/u,
    /[\u{2600}-\u{26FF}]/u,
    /[\u{2700}-\u{27BF}]/u,
  ];

  for (const pattern of emojiPatterns) {
    assertFalse(pattern.test(description), `Found emoji matching ${pattern}`);
  }
});

console.log("\n5. User Keywords:");

test("should mention user keywords", () => {
  assertTrue(description.includes("remember") || description.includes("save"));
});

test("should mention Chinese keywords", () => {
  assertTrue(description.includes("记住") || description.includes("保存"));
});

console.log("\n6. Token Efficiency:");

test("description should be concise (< 400 chars)", () => {
  assertTrue(description.length < 400, `Length: ${description.length}`);
});

test("should not start with asterisks", () => {
  assertFalse(description.startsWith("**"));
});

// Print description preview
console.log("\n=== Description Preview ===");
console.log(description.replace(/\\n/g, "\n"));
console.log(`\n[Length: ${description.length} chars]\n`);

// Summary
console.log("=== Test Summary ===");
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${failCount}`);
console.log(`  Total:  ${passCount + failCount}\n`);

process.exit(failCount > 0 ? 1 : 0);

