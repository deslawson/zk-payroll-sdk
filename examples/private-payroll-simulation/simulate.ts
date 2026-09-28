/* eslint-disable no-console */
/**
 * Private Payroll Simulation — End-to-End Example
 *
 * Demonstrates a complete private payroll cycle locally without requiring
 * real wallet credentials, network access, or live ZK circuit files.
 *
 * This example exercises:
 *   1. Company configuration and employee record setup
 *   2. Mock treasury balance checking
 *   3. Deterministic salary commitment generation
 *   4. Mock ZK proof generation (simulates proof loading and proving)
 *   5. Simulated transaction building, submission, and polling
 *   6. Reconciliation summary output
 *
 * What is mocked vs production:
 * ─────────────────────────────────────────────────────────────────────────────
 * MOCKED (local simulation):
 *   - ZK proof generation — produces structurally valid but empty proofs
 *   - Transaction submission — no XDR is built or signed
 *   - Transaction polling — instant confirmation, no RPC calls
 *   - Treasury state — passed as a config object, not queried from chain
 *
 * MIRRORS PRODUCTION:
 *   - Salary commitment generation — deterministic SHA-256 hashes
 *   - Input validation — same rules as PayrollService
 *   - Progress event reporting — structured events matching the SDK pattern
 *   - Error classification and recovery hints — same shape as production errors
 *   - Reconciliation summary — maps commitments to outcomes without leaking amounts
 *
 * Prerequisites
 * ─────────────
 *   Node.js 18+
 *   npm install  (run from repo root)
 *
 * Run
 * ───
 *   npx tsx examples/private-payroll-simulation/simulate.ts
 *
 * Run failure scenarios
 * ─────────────────────
 *   FAIL_PROOF=1     npx tsx examples/private-payroll-simulation/simulate.ts
 *   FAIL_TREASURY=1  npx tsx examples/private-payroll-simulation/simulate.ts
 *   FAIL_TX=1        npx tsx examples/private-payroll-simulation/simulate.ts
 */

import {
  PayrollSimulator,
  checkTreasury,
  generateCommitments,
} from "../../packages/core/src/simulation";

import type {
  PayrollSimulationConfig,
  SimulationEmployeeRecord,
} from "../../packages/core/src/simulation";

// ── Scenario selection via environment variables ─────────────────────────────

const FAIL_PROOF = process.env.FAIL_PROOF === "1";
const FAIL_TREASURY = process.env.FAIL_TREASURY === "1";
const FAIL_TX = process.env.FAIL_TX === "1";

// ── Employee data (would come from HR/payroll database in production) ────────

const employees: SimulationEmployeeRecord[] = [
  {
    id: "emp-001",
    address: "GBPHKZTKNWWWVFQKKZV3MQSXD5MVVJQXMLSIVWFOFGV5RQXR7JVA6YD",
    salaryAmount: 5_000_000_000n, // 500 XLM
    asset: "native",
    department: "Engineering",
  },
  {
    id: "emp-002",
    address: "GCJLMWCKKEWQW5BSVQJYUBYUFJKXFBMMLRJMJQBHQVSYEOLMCXVS7FD5",
    salaryAmount: 7_500_000_000n, // 750 XLM
    asset: "native",
    department: "Product",
  },
  {
    id: "emp-003",
    address: "GDZQHVCURMZ7O4AHAAXXYXVZQZ5YC4LYHPHPTLYUJNFAJZDLYQPFGPXZ",
    salaryAmount: 3_000_000_000n, // 300 XLM
    asset: "native",
    department: "Design",
  },
  {
    id: "emp-004",
    address: "GDKXN4VYFZQPFWXQMTGF4K5XQ2R7YBNQJG3MJ5R4K6YJ5LMW3N5Q7M3P",
    salaryAmount: 4_200_000_000n, // 420 XLM
    asset: "native",
    department: "Marketing",
  },
];

// ── Build simulation config ─────────────────────────────────────────────────

const config: PayrollSimulationConfig = {
  company: {
    id: "acme-corp",
    name: "Acme Corporation",
    contractId: "CContractID1234567890123456789012345678901234567890",
  },
  employees,
  payrollPeriod: {
    periodId: "2025-Q2-P1",
    startDate: "2025-04-01",
    endDate: "2025-04-15",
  },
  treasury: {
    balance: FAIL_TREASURY ? 1_000_000_000n : 25_000_000_000n, // 100 or 2500 XLM
    asset: "native",
  },
  network: {
    network: "testnet",
    timeoutMs: 30_000,
    intervalMs: 2_000,
  },
  proof: FAIL_PROOF
    ? {
        shouldFail: true,
        failureMessage: "Simulated ZK circuit mismatch — artifact version outdated",
      }
    : undefined,
  transaction: FAIL_TX
    ? {
        shouldTimeout: true,
      }
    : undefined,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatXlm(stroops: bigint): string {
  return `${(Number(stroops) / 10_000_000).toFixed(2)} XLM`;
}

// ── Main simulation ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("━━━ Private Payroll Simulation ━━━\n");
  console.log(`Company    : ${config.company.name}`);
  console.log(`Period     : ${config.payrollPeriod.periodId}`);
  console.log(`Employees  : ${config.employees.length}`);
  console.log(`Treasury   : ${formatXlm(config.treasury.balance)}`);
  console.log(`Scenario   : ${FAIL_PROOF ? "proof failure" : FAIL_TREASURY ? "insufficient treasury" : FAIL_TX ? "transaction timeout" : "happy path"}`);

  // ── Pre-flight: treasury check ──────────────────────────────────────────

  console.log("\n── Pre-flight: Treasury Check ──");
  const treasuryCheck = checkTreasury(config.treasury, config.employees);
  console.log(`  Status : ${treasuryCheck.sufficient ? "Sufficient" : "Insufficient"}`);
  console.log(`  Required: ${formatXlm(treasuryCheck.requiredAmount)}`);
  console.log(`  Available: ${formatXlm(treasuryCheck.availableBalance)}`);
  if (!treasuryCheck.sufficient) {
    console.log(`  Shortfall: ${formatXlm(treasuryCheck.shortfall)}`);
  }

  // ── Pre-flight: commitment generation ───────────────────────────────────

  console.log("\n── Pre-flight: Salary Commitments ──");
  const commitments = generateCommitments(config.employees, config.payrollPeriod);
  for (const c of commitments) {
    console.log(`  ${c.employeeId}: ${c.commitmentHash}`);
  }

  // ── Full simulation ─────────────────────────────────────────────────────

  console.log("\n── Running Full Simulation ──\n");
  const simulator = new PayrollSimulator(config);
  const result = await simulator.run();

  // ── Output results ──────────────────────────────────────────────────────

  console.log("━━━ Simulation Result ━━━\n");
  console.log(`  Run ID   : ${result.runId}`);
  console.log(`  Status   : ${result.status}`);
  console.log(`  Duration : ${result.durationMs} ms`);
  console.log(`  Completed: ${result.completedAt}`);

  console.log("\n  Commitments:");
  for (const c of result.commitments) {
    console.log(`    ${c.employeeId}: ${c.commitmentHash}`);
  }

  console.log("\n  Payment Outcomes:");
  for (const o of result.outcomes) {
    const icon = o.status === "confirmed" ? "+" : "x";
    console.log(`    [${icon}] ${o.employeeId}: ${o.status} (${o.durationMs} ms)`);
    if (o.txHash) console.log(`        tx: ${o.txHash}`);
    if (o.error) console.log(`        error: ${o.error}`);
    if (o.recoveryHint) console.log(`        recovery: ${o.recoveryHint}`);
  }

  console.log("\n  Reconciliation:");
  console.log(`    Run ID       : ${result.reconciliation.runId}`);
  console.log(`    Status       : ${result.reconciliation.status}`);
  console.log(`    Success      : ${result.reconciliation.successCount}/${result.reconciliation.totalEmployees}`);
  console.log(`    Failed       : ${result.reconciliation.failureCount}/${result.reconciliation.totalEmployees}`);

  // ── Sensitivity check ───────────────────────────────────────────────────

  const serialized = JSON.stringify(result, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
  const leaked = employees.some((e) => serialized.includes(e.salaryAmount.toString()));
  console.log(`\n  Sensitive data leak check: ${leaked ? "LEAK DETECTED" : "CLEAN"}`);

  console.log(
    result.status === "success"
      ? "\n+ Simulation completed successfully.\n"
      : `\n! Simulation completed with status: ${result.status}\n`
  );

  if (result.status !== "success") process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal simulation error:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
