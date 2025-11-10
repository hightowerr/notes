import { createHash } from 'crypto';

const EMBEDDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

interface CachedEmbedding {
  embedding: number[];
  expiresAt: number;
}

class EmbeddingCache {
  private cache = new Map<string, CachedEmbedding>();

  /**
   * Generates a cache key for a given task ID and text
   */
  getCacheKey(taskId: string, text: string): string {
    const textHash = this.hashText(text);
    return `${taskId}:${textHash}`;
  }

  /**
   * Hashes text using SHA-256
   */
  hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Retrieves a cached embedding if it exists and hasn't expired
   */
  getCachedEmbedding(taskId: string, text: string): number[] | null {
    const key = this.getCacheKey(taskId, text);
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }
    
    if (cached.expiresAt < Date.now()) {
      this.cache.delete(key); // Remove expired entry
      return null;
    }
    
    // Log cache hit
    console.log(`[EmbeddingCache] Cache hit: ${taskId}`);
    return cached.embedding;
  }

  /**
   * Stores an embedding in the cache with TTL
   */
  setCachedEmbedding(taskId: string, text: string, embedding: number[]): void {
    const key = this.getCacheKey(taskId, text);
    this.cache.set(key, {
      embedding,
      expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS,
    });
    
    // Log cache set
    console.log(`[EmbeddingCache] Cache set: ${taskId}`);
  }

  /**
   * Calculates Levenshtein distance between two strings
   */
  levenshteinDistance(a: string, b: string): number {
    if (a === b) {
      return 0;
    }
    if (a.length === 0) {
      return b.length;
    }
    if (b.length === 0) {
      return a.length;
    }

    const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
      Array.from({ length: b.length + 1 }, () => 0)
    );

    for (let i = 0; i <= a.length; i += 1) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= b.length; j += 1) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + substitutionCost
        );
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Computes the ratio of difference between original and new text
   */
  computeChangeRatio(original: string, next: string): number {
    const maxLength = Math.max(original.length, next.length, 1);
    const distance = this.levenshteinDistance(original, next);
    return distance / maxLength;
  }

  /**
   * Checks if the text change is significant (>10% different)
   */
  isChangeSignificant(original: string, next: string, threshold = 0.1): boolean {
    return this.computeChangeRatio(original, next) > threshold;
  }

  /**
   * Gets current cache statistics
   */
  getStats(): { size: number; entries: number } {
    return {
      size: this.cache.size,
      entries: this.cache.size,
    };
  }

  /**
   * Clears the entire cache
   */
  clear(): void {
    this.cache.clear();
  }
}

// Export a singleton instance
const embeddingCache = new EmbeddingCache();
export default embeddingCache;

// Export types and functions for direct use
export {
  type CachedEmbedding,
  EmbeddingCache,
};