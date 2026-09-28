import { FeeEstimate, FeeEstimationOperation, FeeEstimationOptions } from "./types";

/**
 * Base fee per operation in stroops (Stellar network default).
 */
const DEFAULT_BASE_FEE = 100n;

/**
 * Computational fee multipliers per operation type.
 * These represent estimated resource costs for each Soroban operation.
 */
const COMPUTATIONAL_COSTS: Record<FeeEstimationOperation, bigint> = {
  payroll_submission: 400n,
  audit_grant: 200n,
  treasury_update: 300n,
};

/**
 * Number of Soroban operations per SDK operation.
 */
const OPS_PER_OPERATION: Record<FeeEstimationOperation, number> = {
  payroll_submission: 2,
  audit_grant: 1,
  treasury_update: 2,
};

/**
 * Estimates the transaction fee for a given SDK operation.
 *
 * Provides fee visibility before signing payroll actions so users
 * can review costs before committing to a transaction.
 *
 * @param operation - The type of operation to estimate fees for
 * @param options - Optional overrides for batch size and base fee
 * @returns A detailed fee estimate with breakdown
 *
 * @example
 * ```typescript
 * const estimate = estimateFee("payroll_submission", { batchSize: 5 });
 * console.log(`Total fee: ${estimate.totalFee} stroops`);
 * console.log(estimate.breakdown);
 * // "Base: 500, Computational: 2000, Total: 2500 stroops"
 * ```
 */
export function estimateFee(
  operation: FeeEstimationOperation,
  options: FeeEstimationOptions = {}
): FeeEstimate {
  const baseFee = options.baseFeeOverride ?? DEFAULT_BASE_FEE;
  const computationalCost = COMPUTATIONAL_COSTS[operation];

  let operationCount: number;
  let multiplier: bigint;

  switch (operation) {
    case "payroll_submission": {
      const batchSize = options.batchSize ?? 1;
      operationCount = OPS_PER_OPERATION.payroll_submission * batchSize;
      multiplier = BigInt(batchSize);
      break;
    }
    case "audit_grant": {
      const grantCount = options.grantCount ?? 1;
      operationCount = OPS_PER_OPERATION.audit_grant * grantCount;
      multiplier = BigInt(grantCount);
      break;
    }
    case "treasury_update": {
      const updateCount = options.updateCount ?? 1;
      operationCount = OPS_PER_OPERATION.treasury_update * updateCount;
      multiplier = BigInt(updateCount);
      break;
    }
  }

  const baseTotal = baseFee * BigInt(operationCount);
  const compTotal = computationalCost * multiplier;
  const totalFee = baseTotal + compTotal;

  const breakdown = formatBreakdown(operation, baseTotal, compTotal, totalFee);

  return {
    operation,
    baseFee: baseTotal,
    computationalFee: compTotal,
    totalFee,
    operationCount,
    exact: true,
    breakdown,
  };
}

/**
 * Estimates fees for multiple operations in a single batch.
 *
 * @param operations - List of operations to estimate
 * @param options - Optional overrides
 * @returns Array of fee estimates, one per operation
 */
export function estimateBatchFees(
  operations: FeeEstimationOperation[],
  options: FeeEstimationOptions = {}
): FeeEstimate[] {
  return operations.map((op) => estimateFee(op, options));
}

/**
 * Calculates the total fee across multiple operation estimates.
 *
 * @param estimates - Array of fee estimates from estimateBatchFees
 * @returns Total fee in stroops across all estimates
 */
export function totalBatchFee(estimates: FeeEstimate[]): bigint {
  return estimates.reduce((sum, e) => sum + e.totalFee, 0n);
}

function formatBreakdown(
  operation: FeeEstimationOperation,
  baseFee: bigint,
  computationalFee: bigint,
  totalFee: bigint
): string {
  const opLabel = operation
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return `${opLabel} — Base: ${baseFee}, Computational: ${computationalFee}, Total: ${totalFee} stroops`;
}
