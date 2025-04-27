// src/lib/state/threads.svelte.ts

/**
 * ThreadStateStore manages the state of threads, their history, and status information.
 * It provides a central cache for thread data and methods to update it.
 */
class ThreadStateStore {
  /**
   * Central cache holding the latest known state and status for each thread.
   * Keyed by threadId. NOT persisted.
   */
  threadCacheStore = $state<Record<string, ThreadCacheData>>({});

  /**
   * Status tracking for load operations
   * Helps prevent duplicate loading operations for the same thread
   */
  private loadingThreadIds = $state<Record<string, boolean>>({});

  /**
   * Returns a thread cache entry, or null if it doesn't exist.
   * @param threadId The thread ID to retrieve
   */
  getEntry(threadId: string): ThreadCacheData | null {
    return this.threadCacheStore[threadId] || null;
  }

  /**
   * Checks if a thread has an entry in the cache
   * @param threadId The thread ID to check
   */
  hasEntry(threadId: string): boolean {
    return !!this.threadCacheStore[threadId];
  }

  /**
   * Checks if a thread is currently being loaded
   * @param threadId The thread ID to check
   */
  isLoading(threadId: string): boolean {
    return !!this.loadingThreadIds[threadId];
  }

  /**
   * Marks a thread as loading
   * @param threadId The thread ID to mark as loading
   */
  setLoading(threadId: string, isLoading: boolean): void {
    if (isLoading) {
      this.loadingThreadIds[threadId] = true;
    } else {
      delete this.loadingThreadIds[threadId];
    }
  }

  /**
   * Replaces the entire thread cache with the result of the updater function.
   * Use with caution, prefer updateEntry for targeted changes.
   * @param updater Function that takes the current cache and returns a new one
   */
  update(updater: (currentCache: Record<string, ThreadCacheData>) => Record<string, ThreadCacheData>): void {
    try {
      this.threadCacheStore = updater(this.threadCacheStore);
    } catch (error) {
      console.error('[ThreadStateStore] Error in update function:', error);
      // Don't update state on error to prevent corrupting the cache
    }
  }

  /**
   * Sets or replaces a specific entry in the thread cache.
   * @param threadId The thread ID to update
   * @param entryData The complete cache entry data
   */
  setEntry(threadId: string, entryData: ThreadCacheData): void {
    if (!threadId) {
      console.error('[ThreadStateStore] Attempted to set entry with invalid threadId');
      return;
    }

    this.threadCacheStore = { 
      ...this.threadCacheStore, 
      [threadId]: entryData 
    };
  }

  /**
   * Merges partial updates into an existing thread cache entry.
   * If the entry doesn't exist, it initializes it with default values.
   * @param threadId The thread ID to update
   * @param updates Partial data to merge into the cache entry
   */
  updateEntry(threadId: string, updates: Partial<ThreadCacheData>): void {
    if (!threadId) {
      console.error('[ThreadStateStore] Attempted to update entry with invalid threadId');
      return;
    }

    if (this.threadCacheStore[threadId]) {
      this.threadCacheStore = {
        ...this.threadCacheStore,
        [threadId]: { 
          ...this.threadCacheStore[threadId], 
          ...updates 
        }
      };
    } else {
      // Initialize if missing, but log a warning as it might indicate an unexpected sequence
      console.warn(`[ThreadStateStore] Initializing non-existent thread cache entry during update: ${threadId}`);
      
      // Create with default structure
      this.threadCacheStore = {
        ...this.threadCacheStore,
        [threadId]: { 
          history: null, 
          status: 'idle', 
          error: null, 
          ...updates 
        } as ThreadCacheData
      };
    }
  }

  /**
   * Removes a thread from the cache.
   * @param threadId The thread ID to remove
   * @returns true if removed, false if it didn't exist
   */
  removeEntry(threadId: string): boolean {
    if (!this.threadCacheStore[threadId]) {
      return false;
    }

    const updatedCache = { ...this.threadCacheStore };
    delete updatedCache[threadId];
    this.threadCacheStore = updatedCache;
    
    // Also remove from loading status tracking
    if (this.loadingThreadIds[threadId]) {
      const updatedLoading = { ...this.loadingThreadIds };
      delete updatedLoading[threadId];
      this.loadingThreadIds = updatedLoading;
    }
    
    return true;
  }

  /**
   * Sets an error state for a specific thread.
   * @param threadId The thread ID to update
   * @param error The error message
   */
  setError(threadId: string, error: string): void {
    this.updateEntry(threadId, { 
      status: 'error', 
      error 
    });
  }

  /**
   * Clears the error state for a specific thread.
   * @param threadId The thread ID to update
   */
  clearError(threadId: string): void {
    this.updateEntry(threadId, { 
      error: null 
    });
  }

  /**
   * Clear the entire thread cache.
   * Useful for logout or session reset.
   */
  clearAllThreads(): void {
    this.threadCacheStore = {};
    this.loadingThreadIds = {};
  }
}

export const threadStore = new ThreadStateStore();