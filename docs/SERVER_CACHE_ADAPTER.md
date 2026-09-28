# Server Cache Adapter

## Overview

The `ServerCacheAdapter` interface provides a **pluggable cache contract**
for distributed payroll backend services.  While the SDK ships with two
client-side cache providers (`MemoryCacheProvider` and
`LocalStorageCacheProvider`), these are not suitable for multi-instance
backends that share proof artifacts, transaction status, and draft data
across processes.

```typescript
import { ServerCacheAdapter, CacheNamespace } from "@zk-payroll/core";
```

---

## Namespaces

All cache operations require a `CacheNamespace` to scope the entry:

| Namespace       | Purpose                                                     |
|-----------------|-------------------------------------------------------------|
| `ARTIFACT`      | ZK circuit artifacts (`.wasm` binaries, `.zkey` proving keys) |
| `STATUS`        | Transaction / execution status records                       |
| `DRAFT`         | Serialised payroll draft payloads                            |
| `PROOF`         | Cached ZK proof outputs                                     |
| `IDEMPOTENCY`   | Idempotency keys and associated operation results            |

Namespaces are **logically isolated**: operations on one namespace must
not affect entries in another.

---

## Interface Methods

### Core CRUD

| Method                                    | Description                              |
|-------------------------------------------|------------------------------------------|
| `get(namespace, key)`                     | Retrieve a value. Returns `null` on miss.|
| `set(namespace, key, value, ttlSeconds?)` | Store a value with optional TTL.         |
| `has(namespace, key)`                     | Check existence without retrieving value.|
| `del(namespace, key)`                     | Delete a single entry. No-op if missing. |

### Namespace Management

| Method                | Description                                    |
|-----------------------|------------------------------------------------|
| `clearNamespace(ns)`  | Delete **all** entries in a namespace.         |
| `clearAll()`          | Delete **all** entries across every namespace. |

### Entry Inspection

| Method                         | Description                                        |
|--------------------------------|----------------------------------------------------|
| `getRemainingTtl(ns, key)`     | Remaining TTL in seconds, or `null`.               |
| `keys(ns)`                     | List all entries in a namespace with metadata.     |
| `size(ns)`                     | Count non-expired entries in a namespace.          |

---

## Consistency Expectations

Implementations **must** document their behaviour for each property.

### Atomicity

- Individual `get`, `set`, `del` calls are **atomic**.
- Bulk methods (`clearNamespace`, `clearAll`) are **best-effort** and may
  be non-atomic in the underlying store.

### Consistency

- **Eventual consistency** is acceptable for all operations.
- Strong consistency is **not required** unless the implementation
  explicitly documents it.

### Isolation

- Namespaces are **logically isolated**.  Operations on one namespace
  must not affect entries in another.
- Implementations should map namespaces to physical partitions in the
  underlying store (e.g. Redis key prefixes, DynamoDB partition keys).

### Durability

- **Persistence is implementation-defined.**
- In-memory or LRU backends may lose data on restart.
- Redis, DynamoDB, or other persistent stores follow their own durability
  guarantees.

### Concurrency

- Concurrent `set` / `del` on the same key follows **last-writer-wins**
  semantics unless a different policy is documented.

### TTL Semantics

- TTL is measured from the `set` call.
- Expired entries are treated as absent (`get` returns `null`; `has`
  returns `false`).
- Implementations **may** purge expired entries lazily (on read or via
  a background eviction cycle).

---

## Caching Use Cases

### 1. Artifact Caching (`CacheNamespace.ARTIFACT`)

ZK proof generation requires downloading circuit artifacts.  A shared
cache avoids redundant downloads across service instances:

```typescript
async function getCircuitArtifact(
  url: string,
  cache: ServerCacheAdapter<ArrayBuffer>,
): Promise<ArrayBuffer> {
  const cacheKey = `circuit:${hashUrl(url)}`;
  const cached = await cache.get(CacheNamespace.ARTIFACT, cacheKey);
  if (cached) return cached;

  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  // Cache for 1 hour
  await cache.set(CacheNamespace.ARTIFACT, cacheKey, buffer, 3600);
  return buffer;
}
```

### 2. Status Caching (`CacheNamespace.STATUS`)

Transaction and execution status records allow consumers to poll a local
cache instead of hitting the blockchain RPC:

```typescript
import type { StatusCacheValue } from "@zk-payroll/core";

async function updateTxStatus(
  cache: ServerCacheAdapter<string>,
  executionId: string,
  status: StatusCacheValue,
): Promise<void> {
  await cache.set(
    CacheNamespace.STATUS,
    `exec:${executionId}`,
    JSON.stringify(status),
    120, // 2-minute TTL
  );
}

async function getTxStatus(
  cache: ServerCacheAdapter<string>,
  executionId: string,
): Promise<StatusCacheValue | null> {
  const raw = await cache.get(CacheNamespace.STATUS, `exec:${executionId}`);
  return raw ? (JSON.parse(raw) as StatusCacheValue) : null;
}
```

### 3. Draft Caching (`CacheNamespace.DRAFT`)

Serialised payroll drafts support collaborative editing and resume
workflows:

```typescript
interface DraftPayload {
  version: number;
  label?: string;
  entries: Array<{ recipientId: string; amount: string; asset: string }>;
}

async function saveDraft(
  cache: ServerCacheAdapter<string>,
  draftId: string,
  draft: DraftPayload,
): Promise<void> {
  await cache.set(CacheNamespace.DRAFT, draftId, JSON.stringify(draft));
}

async function loadDraft(
  cache: ServerCacheAdapter<string>,
  draftId: string,
): Promise<DraftPayload | null> {
  const raw = await cache.get(CacheNamespace.DRAFT, draftId);
  return raw ? (JSON.parse(raw) as DraftPayload) : null;
}
```

### 4. Proof Caching (`CacheNamespace.PROOF`)

Generated ZK proofs can be cached to avoid redundant proof generation:

```typescript
async function getCachedProof(
  cache: ServerCacheAdapter<string>,
  witnessKey: string,
): Promise<string | null> {
  return cache.get(CacheNamespace.PROOF, witnessKey);
}

async function storeProof(
  cache: ServerCacheAdapter<string>,
  witnessKey: string,
  proofPayload: string,
): Promise<void> {
  // Proof results are typically cached for the duration of a session
  await cache.set(CacheNamespace.PROOF, witnessKey, proofPayload, 3600);
}
```

### 5. Idempotency Caching (`CacheNamespace.IDEMPOTENCY`)

Safe retry requires caching idempotency outcomes:

```typescript
async function getIdempotencyResult(
  cache: ServerCacheAdapter<string>,
  key: string,
): Promise<string | null> {
  return cache.get(CacheNamespace.IDEMPOTENCY, key);
}

async function setIdempotencyResult(
  cache: ServerCacheAdapter<string>,
  key: string,
  result: string,
  ttlSeconds = 300,
): Promise<void> {
  await cache.set(CacheNamespace.IDEMPOTENCY, key, result, ttlSeconds);
}
```

---

## Implementing a Custom Adapter

Backend services can implement `ServerCacheAdapter` against any
distributed store.  Here is a structural outline:

```typescript
import {
  ServerCacheAdapter,
  CacheNamespace,
  CacheEntry,
} from "@zk-payroll/core";

class MyRedisAdapter implements ServerCacheAdapter<string> {
  constructor(private redisClient: Redis) {}

  async get(namespace: CacheNamespace, key: string): Promise<string | null> {
    return this.redisClient.get(`${namespace}:${key}`);
  }

  async set(
    namespace: CacheNamespace,
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    const fullKey = `${namespace}:${key}`;
    if (ttlSeconds !== undefined) {
      await this.redisClient.setex(fullKey, ttlSeconds, value);
    } else {
      await this.redisClient.set(fullKey, value);
    }
  }

  // ... implement remaining methods
}
```

---

## Testing an Adapter Implementation

The conformance tests in `packages/core/tests/cache.test.ts` (see the
`ServerCacheAdapter conformance` suite) validate the full contract:

```bash
# Run only the conformance tests
npx jest --config jest.node.config.js --testNamePattern="ServerCacheAdapter conformance" -t
```

Each method — `get`, `set`, `has`, `del`, `clearNamespace`, `clearAll`,
`getRemainingTtl`, `keys`, `size` — is tested for correct behaviour,
namespace isolation, and TTL semantics.
