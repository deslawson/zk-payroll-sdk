import type { MockTreasuryState, SimulationEmployeeRecord } from "./types";

/**
 * Result of a treasury solvency check.
 */
export interface TreasuryCheckResult {
  /** Whether the treasury has sufficient balance */
  sufficient: boolean;
  /** Total amount required in stroops */
  requiredAmount: bigint;
  /** Current treasury balance in stroops */
  availableBalance: bigint;
  /** Shortfall amount (zero if sufficient) */
  shortfall: bigint;
  /** Human-readable diagnostic message */
  message: string;
}

/**
 * Checks whether the mock treasury has sufficient funds to cover
 * all employee payments in the simulation.
 *
 * @param treasury - Current mock treasury state
 * @param employees - Employee records whose salaries must be paid
 * @returns A structured result indicating solvency and any shortfall
 *
 * @example
 * ```typescript
 * const result = checkTreasury(treasury, employees);
 * if (!result.sufficient) {
 *   console.error(result.message);
 * }
 * ```
 */
export function checkTreasury(
  treasury: MockTreasuryState,
  employees: SimulationEmployeeRecord[]
): TreasuryCheckResult {
  const totalRequired = employees.reduce((sum, emp) => sum + emp.salaryAmount, 0n);

  const sufficient = treasury.balance >= totalRequired;
  const shortfall = sufficient ? 0n : totalRequired - treasury.balance;

  return {
    sufficient,
    requiredAmount: totalRequired,
    availableBalance: treasury.balance,
    shortfall,
    message: sufficient
      ? `Treasury has sufficient balance (${treasury.balance} stroops) for ${employees.length} payments (total: ${totalRequired} stroops)`
      : `Insufficient treasury: need ${totalRequired} stroops but only ${treasury.balance} stroops available (shortfall: ${shortfall} stroops)`,
  };
}

/**
 * Checks whether a single employee payment can be covered by the treasury.
 * Useful for per-employee failure reporting in the simulation.
 */
export function checkSinglePayment(
  treasury: MockTreasuryState,
  employee: SimulationEmployeeRecord
): TreasuryCheckResult {
  const sufficient = treasury.balance >= employee.salaryAmount;
  const shortfall = sufficient ? 0n : employee.salaryAmount - treasury.balance;

  return {
    sufficient,
    requiredAmount: employee.salaryAmount,
    availableBalance: treasury.balance,
    shortfall,
    message: sufficient
      ? `Payment of ${employee.salaryAmount} stroops can be covered`
      : `Insufficient balance: need ${employee.salaryAmount} stroops but only ${treasury.balance} available`,
  };
}
