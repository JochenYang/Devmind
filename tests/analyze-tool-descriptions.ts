/**
 * Analyze Tool Descriptions for optimization
 * Estimates token count and identifies optimization opportunities
 * 
 * Run: npx tsx tests/analyze-tool-descriptions.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

// Rough token estimation (1 token ≈ 4 chars for English, 2 chars for Chinese)
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 2 + otherChars / 4);
}

// Read mcp-server.ts
const serverPath = join(process.cwd(), "src", "mcp-server.ts");
const content = readFileSync(serverPath, "utf-8");

// Extract all tool definitions
const toolPattern = /\{\s*name:\s*"([^"]+)",\s*description:\s*"([^"]*(?:\\.[^"]*)*)",/gs;
const tools: { name: string; description: string; tokens: number; chars: number }[] = [];

let match;
while ((match = toolPattern.exec(content)) !== null) {
  const name = match[1];
  const description = match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  tools.push({
    name,
    description,
    tokens: estimateTokens(description),
    chars: description.length,
  });
}

// Sort by token count (descending)
tools.sort((a, b) => b.tokens - a.tokens);

// Analysis
console.log("=".repeat(70));
console.log("  Tool Description Analysis");
console.log("=".repeat(70));
console.log(`\nFound ${tools.length} tools\n`);

// Total tokens
const totalTokens = tools.reduce((sum, t) => sum + t.tokens, 0);
const totalChars = tools.reduce((sum, t) => sum + t.chars, 0);

console.log(`Total: ~${totalTokens} tokens (${totalChars} chars)\n`);

// Table header
console.log("-".repeat(70));
console.log(
  "Tool Name".padEnd(30) +
    "Tokens".padStart(10) +
    "Chars".padStart(10) +
    "  Status"
);
console.log("-".repeat(70));

// Thresholds
const HIGH_THRESHOLD = 200;  // Tokens > 200 = needs optimization
const MEDIUM_THRESHOLD = 100; // Tokens 100-200 = could be optimized

for (const tool of tools) {
  let status = "OK";
  if (tool.tokens > HIGH_THRESHOLD) {
    status = "[HIGH] Needs optimization";
  } else if (tool.tokens > MEDIUM_THRESHOLD) {
    status = "[MED] Could optimize";
  }
  
  console.log(
    tool.name.padEnd(30) +
      String(tool.tokens).padStart(10) +
      String(tool.chars).padStart(10) +
      "  " +
      status
  );
}

console.log("-".repeat(70));
console.log(
  "TOTAL".padEnd(30) + String(totalTokens).padStart(10) + String(totalChars).padStart(10)
);

// Recommendations
console.log("\n" + "=".repeat(70));
console.log("  Optimization Recommendations");
console.log("=".repeat(70));

const highTokenTools = tools.filter((t) => t.tokens > HIGH_THRESHOLD);
const mediumTokenTools = tools.filter(
  (t) => t.tokens > MEDIUM_THRESHOLD && t.tokens <= HIGH_THRESHOLD
);

if (highTokenTools.length > 0) {
  console.log("\n[HIGH PRIORITY] These tools need optimization:\n");
  for (const tool of highTokenTools) {
    console.log(`  - ${tool.name}: ${tool.tokens} tokens`);
    
    // Analyze content
    const desc = tool.description;
    const hasExamples = desc.includes("Example") || desc.includes("e.g.");
    const hasMultipleSections = (desc.match(/\n\n/g) || []).length > 2;
    const hasLongLists = (desc.match(/\n-/g) || []).length > 5;
    
    if (hasExamples) console.log("    * Has examples - consider moving to separate doc");
    if (hasMultipleSections) console.log("    * Multiple sections - consolidate or simplify");
    if (hasLongLists) console.log("    * Long lists - reduce to essential items");
  }
}

if (mediumTokenTools.length > 0) {
  console.log("\n[MEDIUM PRIORITY] These tools could be optimized:\n");
  for (const tool of mediumTokenTools) {
    console.log(`  - ${tool.name}: ${tool.tokens} tokens`);
  }
}

// Potential savings
const potentialSavings = highTokenTools.reduce(
  (sum, t) => sum + (t.tokens - 100), // Target: ~100 tokens each
  0
);
console.log(`\nPotential savings: ~${potentialSavings} tokens (${Math.round((potentialSavings / totalTokens) * 100)}%)\n`);

