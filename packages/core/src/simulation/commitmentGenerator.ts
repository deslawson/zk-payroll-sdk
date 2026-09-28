import { createHash } from "crypto";
import type { SimulationEmployeeRecord, PayrollPeriodMetadata, SalaryCommitment } from "./types";

/**
 * Generates deterministic salary commitments from employee records.
 *
 * The commitment hash is derived from employee ID, period ID, and salary
 * amount using SHA-256. The raw salary value is never included in the
 * returned commitment object or any log output.
 *
 * Two calls with the same inputs always produce the same commitment hash,
 * which enables deterministic replay in tests.
 *
 * @example
 * ```typescript
 * const commitments = generateCommitments(employees, period);
 * // commitments[0].commitmentHash === "sha256:..."
 * // commitments[0] contains NO salary field
 * ```
 */
export function generateCommitments(
  employees: SimulationEmployeeRecord[],
  period: PayrollPeriodMetadata
): SalaryCommitment[] {
  return employees.map((emp) => ({
    employeeId: emp.id,
    commitmentHash: computeCommitmentHash(emp, period),
    asset: emp.asset,
  }));
}

/**
 * Compute a deterministic SHA-256 commitment hash for a single employee
 * within a payroll period.
 *
 * The hash binds the employee ID, period ID, and salary amount so that
 * any tampering with the inputs would produce a different commitment.
 * The function is pure — no state is mutated and no salary is leaked.
 */
function computeCommitmentHash(
  employee: SimulationEmployeeRecord,
  period: PayrollPeriodMetadata
): string {
  const payload = [
    "zkpayroll-commitment-v1",
    employee.id,
    employee.address,
    period.periodId,
    employee.salaryAmount.toString(),
    employee.asset,
  ].join("|");

  const digest = createHash("sha256").update(payload).digest("hex");
  return `commit:${digest}`;
}

/**
 * Compute the total salary commitment for a set of employees.
 * Returns the total amount in stroops — intended for treasury checks
 * only and never included in public simulation output.
 */
export function computeTotalCommitment(employees: SimulationEmployeeRecord[]): bigint {
  return employees.reduce((sum, emp) => sum + emp.salaryAmount, 0n);
}
