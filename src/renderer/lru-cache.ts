export interface LruCache<K, V> {
  readonly capacity: number;
  readonly size: number;
  clear(): void;
  get(key: K): V | undefined;
  set(key: K, value: V): void;
}

export interface LruCacheStats {
  capacity: number;
  evictions: number;
  hits: number;
  misses: number;
  size: number;
}

export interface StatsLruCache<K, V> extends LruCache<K, V> {
  getOrBuild(key: K, build: () => V): V;
  reset(): void;
  stats(): LruCacheStats;
}

export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  return new BoundedLruCache<K, V>(capacity);
}

export function createStatsLruCache<K, V>(capacity: number): StatsLruCache<K, V> {
  return new StatsBoundedLruCache<K, V>(capacity);
}

class BoundedLruCache<K, V> implements LruCache<K, V> {
  protected readonly entries = new Map<K, V>();
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined && !this.entries.has(key)) return undefined;
    this.touch(key, value as V);
    return value;
  }

  set(key: K, value: V): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, value);
    this.evictOverflow();
  }

  protected touch(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
  }

  protected evictOverflow(): number {
    let evicted = 0;
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
      evicted += 1;
    }
    return evicted;
  }
}

class StatsBoundedLruCache<K, V> extends BoundedLruCache<K, V> implements StatsLruCache<K, V> {
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  override clear(): void {
    this.entries.clear();
  }

  override get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined && !this.entries.has(key)) {
      this.missCount += 1;
      return undefined;
    }
    this.hitCount += 1;
    this.touch(key, value as V);
    return value;
  }

  getOrBuild(key: K, build: () => V): V {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = build();
    this.set(key, value);
    return value;
  }

  override set(key: K, value: V): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, value);
    this.evictionCount += this.evictOverflow();
  }

  reset(): void {
    this.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }

  stats(): LruCacheStats {
    return {
      capacity: this.capacity,
      evictions: this.evictionCount,
      hits: this.hitCount,
      misses: this.missCount,
      size: this.size,
    };
  }
}
