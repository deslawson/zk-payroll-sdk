import type {
  PayrollSimulationConfig,
  PayrollSimulationResult,
  SalaryCommitment,
  SimulatedPaymentOutcome,
  SimulationEmployeeRecord,
} from "./types";
import { generateCommitments } from "./commitmentGenerator";
import { createMockProofGenerator, validateProofConfig } from "./proofSimulator";
import { checkTreasury } from "./treasury";
import { buildSimulatedTransaction, simulatePolling } from "./transactionSimulator";
import { buildReconciliation } from "./reconciliation";

/**
 * End-to-end private payroll execution simulator.
 *
 * Models a complete payroll cycle from employee onboarding through
 * salary commitment generation, proof artifact preparation, transaction
 * submission, confirmation polling, and reconciliation output.
 *
 * Sensitive salary values are never printed in logs, thrown in errors,
 * or included in the returned public result objects.
 *
 * @example
 * ```typescript
 * const simulator = new PayrollSimulator(config);
 * const result = await simulator.run();
 * // result.runId === "sim:acme:2025-Q2-P1"
 * // result.commitments contains no salary amounts
 * // result.reconciliation.totalDisbursed is the internal total (not exposed publicly)
 * ```
 */
export class PayrollSimulator {
  private readonly config: PayrollSimulationConfig;

  constructor(config: PayrollSimulationConfig) {
    this.config = config;
  }

  /**
   * Run the complete end-to-end payroll simulation.
   *
   * Steps:
   * 1. Validate company config and employee records
   * 2. Check treasury solvency
   * 3. Generate deterministic salary commitments
   * 4. For each employee: generate proof, build transaction, submit, poll
   * 5. Build reconciliation summary
   *
   * @returns A complete simulation result with commitments, outcomes, and reconciliation
   * @throws {Error} If the company config or employee records are invalid
   */
  async run(): Promise<PayrollSimulationResult> {
    const startTime = Date.now();
    const runId = `sim:${this.config.company.id}:${this.config.payrollPeriod.periodId}`;

    // 1. Validate inputs
    this.validateConfig();

    // 2. Check proof config
    const proofConfigResult = validateProofConfig(this.config.proof);
    if (!proofConfigResult.valid) {
      throw new Error(`Invalid proof configuration: ${proofConfigResult.errors.join("; ")}`);
    }

    // 3. Check treasury
    const treasuryCheck = checkTreasury(this.config.treasury, this.config.employees);
    if (!treasuryCheck.sufficient) {
      return this.buildInsufficientTreasuryResult(runId, startTime, treasuryCheck.message);
    }

    // 4. Generate salary commitments
    const commitments = generateCommitments(this.config.employees, this.config.payrollPeriod);

    // 5. Process each employee payment
    const outcomes = await this.processAllPayments(commitments);

    // 6. Build reconciliation
    const reconciliation = buildReconciliation(
      outcomes,
      commitments,
      this.config.company,
      this.config.payrollPeriod
    );

    const overallStatus = reconciliation.status;

    return {
      runId,
      status: overallStatus,
      commitments,
      outcomes,
      reconciliation,
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate the simulation configuration.
   * Throws structured errors for invalid inputs.
   */
  private validateConfig(): void {
    const { company, employees, payrollPeriod } = this.config;

    if (!company.id || !company.name || !company.contractId) {
      throw new Error(`Invalid company configuration: id, name, and contractId are required`);
    }

    if (!employees || employees.length === 0) {
      throw new Error("At least one employee record is required for simulation");
    }

    for (const emp of employees) {
      if (!emp.id || !emp.address) {
        throw new Error(`Invalid employee record: id and address are required for all employees`);
      }
      if (emp.salaryAmount <= 0n) {
        throw new Error(
          `Invalid employee record: salaryAmount must be positive for employee ${emp.id}`
        );
      }
    }

    if (!payrollPeriod.periodId || !payrollPeriod.startDate || !payrollPeriod.endDate) {
      throw new Error("Invalid payroll period: periodId, startDate, and endDate are required");
    }
  }

  /**
   * Process payments for all employees.
   */
  private async processAllPayments(
    commitments: SalaryCommitment[]
  ): Promise<SimulatedPaymentOutcome[]> {
    const outcomes: SimulatedPaymentOutcome[] = [];

    for (const employee of this.config.employees) {
      const commitment = commitments.find((c) => c.employeeId === employee.id);
      const outcome = await this.processSinglePayment(employee, commitment!);
      outcomes.push(outcome);
    }

    return outcomes;
  }

  /**
   * Process a single employee payment through the full simulation pipeline.
   */
  private async processSinglePayment(
    employee: SimulationEmployeeRecord,
    commitment: SalaryCommitment
  ): Promise<SimulatedPaymentOutcome> {
    const start = Date.now();

    try {
      // Step A: Generate ZK proof (mock)
      const proofGen = createMockProofGenerator(this.config.proof);
      const witness = {
        recipient: employee.address,
        amount: employee.salaryAmount.toString(),
        asset: employee.asset,
      };
      await proofGen.generateProof(witness);

      // Step B: Build simulated transaction
      const tx = buildSimulatedTransaction(
        employee,
        commitment.commitmentHash,
        this.config.transaction
      );

      // Step C: Simulate polling / confirmation
      const outcome = await simulatePolling(tx, this.config.transaction);
      outcome.durationMs = Date.now() - start;

      return outcome;
    } catch (error) {
      return {
        employeeId: employee.id,
        address: employee.address,
        asset: employee.asset,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown simulation error",
        recoveryHint:
          "An unexpected error occurred during simulation. Check the proof configuration and transaction settings.",
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Build a result for the insufficient treasury scenario.
   */
  private buildInsufficientTreasuryResult(
    runId: string,
    startTime: number,
    _treasuryMessage: string
  ): PayrollSimulationResult {
    const commitments = generateCommitments(this.config.employees, this.config.payrollPeriod);

    const outcomes: SimulatedPaymentOutcome[] = this.config.employees.map((emp) => ({
      employeeId: emp.id,
      address: emp.address,
      asset: emp.asset,
      status: "failed" as const,
      error: "Insufficient treasury balance",
      recoveryHint:
        "Deposit additional funds into the payroll treasury contract before retrying. Calculate the total required amount from the employee records and ensure the treasury balance covers all payments.",
      durationMs: 0,
    }));

    return {
      runId,
      status: "failure",
      commitments,
      outcomes,
      reconciliation: buildReconciliation(
        outcomes,
        commitments,
        this.config.company,
        this.config.payrollPeriod
      ),
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };
  }
}
