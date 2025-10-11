#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), '.devmind', 'memory.db');
const backupPath = path.join(os.homedir(), '.devmind', `memory-backup-${Date.now()}.db`);

console.log('DevMind Database Reset Script');
console.log('============================');

async function resetDatabase() {
    try {
        // Check if database exists
        if (fs.existsSync(dbPath)) {
            console.log(`Found existing database: ${dbPath}`);
            
            // Create backup
            console.log(`Creating backup: ${backupPath}`);
            fs.copyFileSync(dbPath, backupPath);
            
            // Remove original database
            console.log('Removing original database...');
            try {
                fs.unlinkSync(dbPath);
                console.log('✅ Database file deleted successfully');
            } catch (error) {
                if (error.code === 'EBUSY' || error.code === 'EPERM') {
                    console.log('⚠️  Database file is locked by another process');
                    console.log('Please ensure all MCP clients and servers are closed, then run this script again.');
                    return false;
                } else {
                    throw error;
                }
            }
        } else {
            console.log('No existing database found');
        }
        
        // Test if we can create a new database
        console.log('Testing database creation...');
        const { default: Database } = await import('better-sqlite3');
        const testDb = new Database(dbPath);
        testDb.close();
        
        console.log('✅ Database reset completed successfully');
        console.log(`Backup saved to: ${backupPath}`);
        console.log('The new database will be automatically initialized when the MCP server starts.');
        
        return true;
        
    } catch (error) {
        console.error('❌ Error during database reset:', error.message);
        return false;
    }
}

// Run the reset
resetDatabase().then(success => {
    process.exit(success ? 0 : 1);
});