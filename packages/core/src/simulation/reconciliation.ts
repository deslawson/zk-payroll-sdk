import type {
  ReconciliationSummary,
  ReconciliationEntry,
  SimulatedPaymentOutcome,
  SalaryCommitment,
  SimulationCompanyConfig,
  PayrollPeriodMetadata,
} from "./types";

/**
 * Build a reconciliation summary that maps employee-level private inputs
 * to public payroll run outcomes.
 *
 * The summary uses commitment hashes (not raw salary values) as the link
 * between private inputs and on-chain outcomes. Raw salary amounts are
 * never included in the returned object.
 *
 * @param outcomes - Per-employee payment outcomes from the simulation
 * @param commitments - Salary commitments generated for the run
 * @param company - Company configuration
 * @param period - Payroll period metadata
 * @returns A reconciliation summary with no sensitive amount data
 *
 * @example
 * ```typescript
 * const summary = buildReconciliation(outcomes, commitments, company, period);
 * console.log(summary.runId);       // "sim:acme:2025-Q2-P1"
 * console.log(summary.status);      // "success" | "partial" | "failure"
 * // summary contains no raw salary values
 * ```
 */
export function buildReconciliation(
  outcomes: SimulatedPaymentOutcome[],
  commitments: SalaryCommitment[],
  company: SimulationCompanyConfig,
  period: PayrollPeriodMetadata
): ReconciliationSummary {
  const runId = `sim:${company.id}:${period.periodId}`;

  const entries: ReconciliationEntry[] = outcomes.map((outcome) => {
    const commitment = commitments.find((c) => c.employeeId === outcome.employeeId);
    return {
      employeeId: outcome.employeeId,
      commitmentHash: commitment?.commitmentHash ?? "unknown",
      txHash: outcome.txHash,
      succeeded: outcome.status === "confirmed",
      errorCode: outcome.error ? deriveErrorCode(outcome) : undefined,
    };
  });

  const successCount = entries.filter((e) => e.succeeded).length;
  const failureCount = entries.filter((e) => !e.succeeded).length;

  let status: "success" | "partial" | "failure";
  if (failureCount === 0) {
    status = "success";
  } else if (successCount === 0) {
    status = "failure";
  } else {
    status = "partial";
  }

  return {
    runId,
    status,
    totalEmployees: outcomes.length,
    successCount,
    failureCount,
    entries,
    estimatedFees: BigInt(outcomes.length) * 100n,
  };
}

function deriveErrorCode(outcome: SimulatedPaymentOutcome): string {
  if (outcome.recoveryHint?.includes("timed out")) return "TRANSACTION_TIMEOUT";
  if (outcome.recoveryHint?.includes("rejected")) return "TRANSACTION_FAILED";
  return "UNKNOWN_ERROR";
}
