/**
 * PendingMemoryTracker - Tracks file changes that haven't been recorded yet
 * 
 * This class maintains a queue of file changes detected by the File Watcher
 * and provides methods to check if there are unrecorded changes.
 */

interface PendingFileChange {
  filePath: string;
  timestamp: number;
  changeType: 'add' | 'modify' | 'delete';
  autoRecorded: boolean;
  sessionId?: string;
}

export class PendingMemoryTracker {
  private queue: Map<string, PendingFileChange> = new Map();
  private readonly CLEANUP_INTERVAL = 3600000; // 1 hour
  private readonly MAX_AGE = 3600000; // 1 hour
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Add a pending file change
   */
  addPending(filePath: string, changeType: 'add' | 'modify' | 'delete', sessionId?: string): void {
    this.queue.set(filePath, {
      filePath,
      timestamp: Date.now(),
      changeType,
      autoRecorded: false,
      sessionId,
    });
  }

  /**
   * Mark a file as recorded
   */
  markRecorded(filePath: string): void {
    const item = this.queue.get(filePath);
    if (item) {
      item.autoRecorded = true;
      // Remove from queue after marking as recorded
      this.queue.delete(filePath);
    }
  }

  /**
   * Mark multiple files as recorded
   */
  markMultipleRecorded(filePaths: string[]): void {
    filePaths.forEach(fp => this.markRecorded(fp));
  }

  /**
   * Get list of unrecorded files
   */
  getUnrecorded(sessionId?: string): string[] {
    const unrecorded: string[] = [];
    
    for (const [_, item] of this.queue.entries()) {
      if (!item.autoRecorded) {
        // If sessionId is provided, only return files from that session
        if (!sessionId || item.sessionId === sessionId) {
          unrecorded.push(item.filePath);
        }
      }
    }
    
    return unrecorded;
  }

  /**
   * Get count of unrecorded files
   */
  getUnrecordedCount(sessionId?: string): number {
    return this.getUnrecorded(sessionId).length;
  }

  /**
   * Check if there are any unrecorded files
   */
  hasPending(sessionId?: string): boolean {
    return this.getUnrecordedCount(sessionId) > 0;
  }

  /**
   * Get pending file details
   */
  getPendingDetails(sessionId?: string): PendingFileChange[] {
    const pending: PendingFileChange[] = [];
    
    for (const [_, item] of this.queue.entries()) {
      if (!item.autoRecorded) {
        if (!sessionId || item.sessionId === sessionId) {
          pending.push({ ...item });
        }
      }
    }
    
    return pending;
  }

  /**
   * Clear all pending records
   */
  clear(): void {
    this.queue.clear();
  }

  /**
   * Clear pending records for a specific session
   */
  clearSession(sessionId: string): void {
    for (const [key, item] of this.queue.entries()) {
      if (item.sessionId === sessionId) {
        this.queue.delete(key);
      }
    }
  }

  /**
   * Cleanup old records
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, value] of this.queue.entries()) {
      if (now - value.timestamp > this.MAX_AGE) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => this.queue.delete(key));
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Stop cleanup timer
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.queue.clear();
  }
}

