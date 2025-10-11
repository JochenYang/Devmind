#!/usr/bin/env node

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), '.devmind', 'memory.db');

console.log('DevMind MCP Test Data Cleanup');
console.log('=============================\n');

async function cleanupTestData() {
    try {
        const db = new Database(dbPath);
        
        console.log('🧹 Cleaning up test data...\n');
        
        // Remove test contexts
        const testContextsRemoved = db.prepare(`
            DELETE FROM contexts 
            WHERE id LIKE 'test_context_%' OR id LIKE 'context_%'
        `).run();
        
        console.log(`✅ Removed ${testContextsRemoved.changes} test contexts`);
        
        // Remove test sessions
        const testSessionsRemoved = db.prepare(`
            DELETE FROM sessions 
            WHERE id LIKE 'test_%' OR id LIKE 'session_%'
        `).run();
        
        console.log(`✅ Removed ${testSessionsRemoved.changes} test sessions`);
        
        // Show current statistics
        const stats = {
            sessions: db.prepare('SELECT COUNT(*) as count FROM sessions').get().count,
            contexts: db.prepare('SELECT COUNT(*) as count FROM contexts').get().count
        };
        
        console.log(`\n📊 Remaining data:`);
        console.log(`   Sessions: ${stats.sessions}`);
        console.log(`   Contexts: ${stats.contexts}`);
        
        db.close();
        console.log('\n✨ Test cleanup completed!');
        
        return true;
        
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        return false;
    }
}

cleanupTestData().then(success => {
    process.exit(success ? 0 : 1);
});