/**
 * Run all tests for the memory improvement features
 * 
 * Run: npx tsx tests/run-all-tests.ts
 */

import { execSync } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";

console.log("=".repeat(60));
console.log("  DevMind MCP - Memory Improvement Tests");
console.log("=".repeat(60));

const testsDir = join(process.cwd(), "tests");
const testFiles = readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.ts") && f !== "run-all-tests.ts");

console.log(`\nFound ${testFiles.length} test files:\n`);
testFiles.forEach((f) => console.log(`  - ${f}`));

let totalPassed = 0;
let totalFailed = 0;
const results: { file: string; passed: boolean; output: string }[] = [];

for (const testFile of testFiles) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Running: ${testFile}`);
  console.log("=".repeat(60));

  try {
    const output = execSync(`npx tsx tests/${testFile}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    console.log(output);
    results.push({ file: testFile, passed: true, output });
    
    // Count passes from output
    const passMatch = output.match(/Passed: (\d+)/);
    const failMatch = output.match(/Failed: (\d+)/);
    if (passMatch) totalPassed += parseInt(passMatch[1], 10);
    if (failMatch) totalFailed += parseInt(failMatch[1], 10);
  } catch (error: any) {
    console.log(error.stdout || error.message);
    results.push({ file: testFile, passed: false, output: error.stdout || error.message });
    
    // Still count from failed output
    const passMatch = (error.stdout || "").match(/Passed: (\d+)/);
    const failMatch = (error.stdout || "").match(/Failed: (\d+)/);
    if (passMatch) totalPassed += parseInt(passMatch[1], 10);
    if (failMatch) totalFailed += parseInt(failMatch[1], 10);
  }
}

// Final Summary
console.log("\n" + "=".repeat(60));
console.log("  FINAL SUMMARY");
console.log("=".repeat(60));
console.log(`\nTest Files: ${testFiles.length}`);
console.log(`  Passed Files: ${results.filter((r) => r.passed).length}`);
console.log(`  Failed Files: ${results.filter((r) => !r.passed).length}`);
console.log(`\nTotal Test Cases:`);
console.log(`  Passed: ${totalPassed}`);
console.log(`  Failed: ${totalFailed}`);
console.log(`  Total:  ${totalPassed + totalFailed}`);
console.log();

// List failed files
const failedFiles = results.filter((r) => !r.passed);
if (failedFiles.length > 0) {
  console.log("Failed Files:");
  failedFiles.forEach((f) => console.log(`  - ${f.file}`));
  console.log();
}

// Exit code
process.exit(totalFailed > 0 ? 1 : 0);

