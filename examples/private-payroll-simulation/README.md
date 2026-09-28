# Private Payroll Simulation Example

End-to-end simulation of a private payroll cycle using the ZK Payroll SDK's
simulation harness. Runs entirely locally without requiring real wallet
credentials, network access, or live ZK circuit files.

## What This Demonstrates

1. **Company configuration** and employee record setup
2. **Treasury solvency checking** before processing payments
3. **Deterministic salary commitment generation** (SHA-256 hashes)
4. **Mock ZK proof generation** (structurally valid proofs without real circuits)
5. **Simulated transaction building**, submission, and polling
6. **Reconciliation summary** mapping commitments to outcomes

## Mocked vs Production

| Component | Simulation | Production |
|---|---|---|
| ZK proof generation | Mock placeholder, no circuits | SnarkjsProofGenerator with real .wasm/.zkey |
| Transaction submission | Deterministic pseudo-hash | XDR encoding, signing, Soroban RPC submission |
| Transaction polling | Instant resolution | pollTransaction() with configurable interval/timeout |
| Treasury state | Config object | On-chain get_balance query |
| Salary commitment | SHA-256 of (id + period + salary) | On-chain commitment via private_pay |
| Input validation | Same rules as PayrollService | Same rules as PayrollService |
| Progress events | Same structured events | Same structured events |
| Error classification | Same error codes and recovery hints | Same error codes and recovery hints |

## Prerequisites

- Node.js 18+
- npm install (run from repo root)

## Run

```bash
# Happy path — all payments succeed
npx tsx examples/private-payroll-simulation/simulate.ts

# Failure scenario: proof generation fails
FAIL_PROOF=1 npx tsx examples/private-payroll-simulation/simulate.ts

# Failure scenario: insufficient treasury balance
FAIL_TREASURY=1 npx tsx examples/private-payroll-simulation/simulate.ts

# Failure scenario: transaction timeout
FAIL_TX=1 npx tsx examples/private-payroll-simulation/simulate.ts
```

## Environment Variables

| Variable | Description |
|---|---|
| `FAIL_PROOF=1` | Simulate a ZK proof generation failure |
| `FAIL_TREASURY=1` | Simulate insufficient treasury balance |
| `FAIL_TX=1` | Simulate a transaction timeout during polling |

## Output

The simulation outputs:

- **Run ID**: Unique identifier for the simulation run
- **Status**: `success`, `partial`, or `failure`
- **Commitments**: Per-employee commitment hashes (no salary data)
- **Payment Outcomes**: Status and tx hash for each employee
- **Reconciliation**: Summary linking commitments to outcomes
- **Sensitivity check**: Verification that no raw salary data leaks into output
