import { CacheNamespace, CacheEntry } from "./types";

/**
 * Server-side cache adapter contract for distributed payroll services.
 *
 * ## Motivation
 *
 * In-memory caching (e.g. {@link MemoryCacheProvider}) is not sufficient
 * for backend services that run across multiple instances.  Distributed
 * services that handle ZK proof generation, transaction submission, and
 * draft persistence need a shared, consistent cache backend that all
 * instances can read from and write to.
 *
 * This interface defines a **pluggable contract** that can be implemented
 * against any distributed store — Redis, Memcached, DynamoDB, TiKV, etc.
 *
 * ---
 *
 * ## Namespaces
 *
 * Every operation requires a {@link CacheNamespace} so that entries for
 * different concerns (artifacts, status, drafts, proofs, idempotency) are
 * automatically isolated.  Implementations **should** map namespaces to
 * logical partitions in the underlying store (e.g. Redis key prefixes,
 * DynamoDB partition keys, or separate tables).
 *
 * ---
 *
 * ## Consistency expectations
 *
 * Implementations **must** document their behaviour with respect to:
 *
 * | Property          | Expectation                                                    |
 * |-------------------|----------------------------------------------------------------|
 * | **Atomicity**     | Individual `get`, `set`, `del` calls are atomic.  Bulk methods  |
 * |                   | (`clearNamespace`, `clearAll`) are best-effort and may be      |
 * |                   | non-atomic.                                                     |
 * | **Consistency**   | Eventual consistency is acceptable for all operations.  Strong  |
 * |                   | consistency is **not required** unless otherwise documented.   |
 * | **Isolation**     | Namespaces are logically isolated.  Operations on one namespace |
 * |                   | must not affect entries in another namespace.                   |
 * | **Durability**    | Persistence is implementation-defined.  In-memory / LRU backends|
 * |                   | may lose data on restart.  Redis / DynamoDB backends persist   |
 * |                   | according to their own durability guarantees.                   |
 * | **Concurrency**   | Concurrent `set` / `del` on the same key follows last-writer-  |
 * |                   | wins semantics unless the implementation documents a different |
 * |                   | policy.                                                         |
 * | **TTL semantics** | TTL is measured from the `set` call.  Expired entries are       |
 * |                   | treated as absent (`get` returns `null`; `has` returns `false`).|
 * |                   | An implementation **may** purge expired entries lazily.         |
 *
 * ---
 *
 * ## Caching use cases
 *
 * ### Artifact caching ({@link CacheNamespace.ARTIFACT})
 *
 * ZK proof generation requires downloading circuit artifacts (`.wasm` and
 * `.zkey` files).  A shared server-side cache avoids redundant downloads
 * across service instances.
 *
 * ### Status caching ({@link CacheNamespace.STATUS})
 *
 * Transaction and execution status records (typed as {@link StatusCacheValue})
 * can be cached so that downstream consumers can poll a local cache instead
 * of hitting the blockchain RPC for every check.
 *
 * ### Draft caching ({@link CacheNamespace.DRAFT})
 *
 * Serialised {@link PayrollDraft} payloads can be cached to support
 * collaborative editing and resume workflows across sessions and instances.
 *
 * ---
 *
 * ## Usage example
 *
 * ```typescript
 * import { ServerCacheAdapter, CacheNamespace } from "@zk-payroll/core";
 *
 * class MyRedisAdapter implements ServerCacheAdapter<string> {
 *   // ... implement all methods against a Redis client
 * }
 *
 * const cache = new MyRedisAdapter();
 *
 * // Cache a proof artifact key
 * await cache.set(CacheNamespace.ARTIFACT, "circuit:v1", wasmBase64);
 *
 * // Check if a transaction status exists
 * if (await cache.has(CacheNamespace.STATUS, "tx:abc123")) {
 *   const status = await cache.get(CacheNamespace.STATUS, "tx:abc123");
 * }
 *
 * // Invalidate all draft entries
 * await cache.clearNamespace(CacheNamespace.DRAFT);
 * ```
 *
 * @template T The type of values stored in the cache (defaults to `string`).
 *   Implementations should serialise/deserialise non-string types (e.g. JSON).
 *
 * @see CacheNamespace For the list of supported namespaces.
 * @see CacheEntry For the shape of entry metadata returned by scan operations.
 * @see StatusCacheValue For the typed shape of status cache entries.
 */
export interface ServerCacheAdapter<T = string> {
  // ── Core CRUD ──────────────────────────────────────────────────────────────

  /**
   * Retrieve a cached value by namespace and key.
   *
   * @param namespace - The cache namespace to read from.
   * @param key       - The cache key (relative within the namespace).
   * @returns The cached value, or `null` if the key does not exist or has
   *          expired.
   */
  get(namespace: CacheNamespace, key: string): Promise<T | null>;

  /**
   * Store a value under a namespace + key with an optional TTL.
   *
   * @param namespace  - The cache namespace to write to.
   * @param key        - The cache key (relative within the namespace).
   * @param value      - The value to cache.
   * @param ttlSeconds - Optional time-to-live in seconds.  If omitted or
   *                     `undefined`, the entry does not expire (or uses an
   *                     implementation-defined default).
   */
  set(namespace: CacheNamespace, key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Check whether a key exists and has not expired within a namespace.
   *
   * @param namespace - The cache namespace to check.
   * @param key       - The cache key (relative within the namespace).
   * @returns `true` if the key exists and has not expired, `false` otherwise.
   */
  has(namespace: CacheNamespace, key: string): Promise<boolean>;

  /**
   * Delete a single entry by namespace and key.
   *
   * Deleting a key that does not exist is a no-op (not an error).
   *
   * @param namespace - The cache namespace containing the key.
   * @param key       - The cache key to delete.
   */
  del(namespace: CacheNamespace, key: string): Promise<void>;

  // ── Namespace management ───────────────────────────────────────────────────

  /**
   * Delete **all** entries within a given namespace.
   *
   * This is a bulk administrative operation.  Implementations **should**
   * document whether this is atomic or best-effort (see consistency table
   * in the interface documentation).
   *
   * Clearing an empty or non-existent namespace is a no-op.
   *
   * @param namespace - The namespace to clear.
   */
  clearNamespace(namespace: CacheNamespace): Promise<void>;

  /**
   * Delete **all** entries across every namespace.
   *
   * Use with care — this effectively resets the entire cache.
   * Implementations **should** document whether this is atomic or
   * best-effort.
   */
  clearAll(): Promise<void>;

  // ── Entry inspection ───────────────────────────────────────────────────────

  /**
   * Return the remaining TTL in seconds for a specific entry.
   *
   * @param namespace - The namespace the key belongs to.
   * @param key       - The cache key to inspect.
   * @returns The remaining TTL in seconds, or `null` if:
   *   - The key does not exist or has expired,
   *   - The entry has no TTL (i.e. it never expires), or
   *   - The implementation does not support TTL introspection.
   */
  getRemainingTtl(namespace: CacheNamespace, key: string): Promise<number | null>;

  /**
   * Return all keys (with metadata) currently stored in a namespace.
   *
   * Useful for administrative inspection and targeted invalidation.
   *
   * @param namespace - The namespace to list.
   * @returns An array of {@link CacheEntry} objects.  Returns an empty array
   *          if the namespace is empty or does not exist.
   *
   * @remarks Implementations **should** document any pagination limits or
   *          performance characteristics, as scanning a large namespace may
   *          be expensive.
   */
  keys(namespace: CacheNamespace): Promise<CacheEntry<T>[]>;

  /**
   * Return the number of non-expired entries in a namespace.
   *
   * @param namespace - The namespace to count.
   * @returns The entry count, or `0` if the namespace is empty or does not
   *          exist.
   */
  size(namespace: CacheNamespace): Promise<number>;
}
