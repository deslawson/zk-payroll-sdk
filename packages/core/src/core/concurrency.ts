/**
 * FIFO Semaphore utility for bounding concurrent async work.
 *
 * Use cases in the SDK include capping parallel proof generation in
 * `SnarkjsProofGenerator` (CPU/memory-heavy `groth16.fullProve`), and similar
 * pipelines where unbounded parallelism would exhaust host resources.
 *
 * Acquisitions are fair: callers are granted permits in the order they
 * requested them. Once the permit is released, the longest-waiting caller
 * proceeds.
 *
 * @example
 * ```ts
 * const sem = new Semaphore(2);
 * const release = await sem.acquire();
 * try {
 *   await doWork();
 * } finally {
 *   release();
 * }
 * ```
 *
 * @example
 * ```ts
 * // Bound a generation pipeline
 * const sem = new Semaphore(2);
 * const result = await sem.runExclusive(() => doHeavyWork());
 * ```
 */
export class Semaphore {
  private readonly maxPermits: number;
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  /**
   * @param permits - Maximum number of concurrent holders. Must be ≥ 1.
   */
  constructor(permits: number) {
    if (!Number.isInteger(permits) || permits < 1) {
      throw new Error(`Semaphore permits must be a positive integer (received ${permits})`);
    }
    this.maxPermits = permits;
  }

  /**
   * Resolves once a permit is granted. The returned function releases the
   * permit when called. The same permit may be handed directly to a queued
   * waiter (fairness) rather than going through active/inactive churn.
   */
  async acquire(): Promise<() => void> {
    if (this.active < this.maxPermits) {
      this.active++;
      return () => this.release();
    }

    return new Promise<() => void>((resolve) => {
      this.waiters.push(() => {
        // We do NOT increment `active` here — the slot was held for the
        // previous holder and is now handed straight to us. We DO need to
        // fire the matching decrement when our release runs.
        resolve(() => this.release());
      });
    });
  }

  /**
   * Convenience helper that acquires a permit, runs `fn`, then releases the
   * permit (even if `fn` throws).
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Number of permits currently held. Useful for tests / diagnostics. */
  get activeCount(): number {
    return this.active;
  }

  /** Number of callers waiting for a permit. */
  get waitingCount(): number {
    return this.waiters.length;
  }

  private release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      if (next) {
        next();
      }
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }
}
