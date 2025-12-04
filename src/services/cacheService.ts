/**
 * Cache Service for VS Code Extension
 * 
 * Manages response caching with TTL-based expiration and LRU eviction.
 * Supports separate TTLs for success and error responses.
 */

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export class CacheService {
    private cache: Map<string, CacheEntry<any>>;
    private readonly maxSize: number;
    private cleanupInterval: NodeJS.Timeout | undefined;

    constructor(maxSize: number = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.startPeriodicCleanup();
    }

    /**
     * Gets cached value if not expired
     * @param key Cache key
     * @returns Cached value or undefined if not found or expired
     */
    get<T>(key: string): T | undefined {
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.value as T;
    }

    /**
     * Sets cached value with TTL
     * @param key Cache key
     * @param value Value to cache
     * @param ttl Time to live in milliseconds
     */
    set<T>(key: string, value: T, ttl: number): void {
        // Implement LRU eviction if cache is full
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictOldest();
        }

        const expiresAt = Date.now() + ttl;
        this.cache.set(key, { value, expiresAt });
    }

    /**
     * Clears all cached values
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Removes expired entries
     */
    cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.cache.delete(key);
        }
    }

    /**
     * Gets current cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Disposes the cache service and stops cleanup
     */
    dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        this.clear();
    }

    /**
     * Evicts the oldest entry (LRU)
     */
    private evictOldest(): void {
        // Map maintains insertion order, so first entry is oldest
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
            this.cache.delete(firstKey);
        }
    }

    /**
     * Starts periodic cleanup of expired entries
     */
    private startPeriodicCleanup(): void {
        // Run cleanup every 60 seconds
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }
}
