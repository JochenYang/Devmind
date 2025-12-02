/**
 * Test cleanup_empty_projects on REAL database
 *
 * This script safely tests the cleanup functionality on your actual memory.db
 * It only performs dry-run by default to show what would be deleted.
 *
 * Usage:
 *   npx tsx tests/test_cleanup_real_db.ts           # Dry run (safe)
 *   npx tsx tests/test_cleanup_real_db.ts --delete  # Actually delete
 */

import { DatabaseManager } from "../src/database.js";
import { join } from "path";
import { homedir } from "os";

const REAL_DB_PATH = join(homedir(), ".devmind", "memory.db");
const shouldDelete = process.argv.includes("--delete");

console.log("🔍 Testing cleanup_empty_projects on REAL database");
console.log("=".repeat(60));
console.log(`Database: ${REAL_DB_PATH}`);
console.log(`Mode: ${shouldDelete ? "DELETE" : "DRY RUN (safe)"}`);
console.log("=".repeat(60) + "\n");

// Initialize database
const db = new DatabaseManager(REAL_DB_PATH);

// Get all projects first
console.log("📊 Current Database Statistics:");
const allProjects = db.getAllProjects();
console.log(`Total projects: ${allProjects.length}\n`);

// Get empty projects
console.log("🔍 Scanning for empty projects...\n");
const emptyProjects = db.getEmptyProjects();

if (emptyProjects.length === 0) {
  console.log("✅ No empty projects found!");
  console.log("All projects have memory contexts.\n");
  process.exit(0);
}

console.log(`Found ${emptyProjects.length} empty project(s):\n`);

// Display empty projects
emptyProjects.forEach((p, i) => {
  console.log(`${i + 1}. **${p.name}**`);
  console.log(`   - ID: ${p.id}`);
  console.log(`   - Path: ${p.path}`);
  console.log(`   - Sessions: ${p.session_count}`);
  console.log(`   - Language: ${p.language}`);
  console.log(`   - Last accessed: ${p.last_accessed}`);
  console.log();
});

if (!shouldDelete) {
  console.log("=".repeat(60));
  console.log("🛡️  DRY RUN MODE - No changes made");
  console.log("=".repeat(60));
  console.log("\n💡 To actually delete these empty projects, run:");
  console.log("   npx tsx tests/test_cleanup_real_db.ts --delete\n");

  console.log("⚠️  WARNING: Deletion cannot be undone!");
  console.log(
    "   Make sure you want to delete these projects before running.\n"
  );

  process.exit(0);
}

// Actually delete
console.log("=".repeat(60));
console.log("⚠️  DELETING EMPTY PROJECTS");
console.log("=".repeat(60) + "\n");

const projectIds = emptyProjects.map((p) => p.id);
const result = db.deleteProjects(projectIds);

console.log("✅ Deletion completed!\n");
console.log("📊 Deletion Statistics:");
console.log(`- Projects deleted: ${result.deleted_projects}`);
console.log(`- Sessions deleted: ${result.deleted_sessions}`);
console.log(`- Contexts deleted: ${result.deleted_contexts}`);

// Show deleted projects
console.log("\n🗑️  Deleted projects:");
emptyProjects.forEach((p, i) => {
  console.log(`${i + 1}. ${p.name} (${p.path})`);
});

// Final statistics
console.log("\n📊 Final Database Statistics:");
const finalProjects = db.getAllProjects();
const finalEmpty = db.getEmptyProjects();
console.log(`Total projects: ${finalProjects.length}`);
console.log(`Empty projects: ${finalEmpty.length}`);

console.log("\n✅ Cleanup completed successfully!");
console.log("⚠️  This action cannot be undone.\n");
