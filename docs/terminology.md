# Terminology Guide

Canonical reference for names used across zkPayroll contracts, SDK, and dashboard.
Use this guide when naming new APIs, UI labels, database fields, or documentation sections to keep language consistent across repos.

---

## Payroll Run

A **payroll run** (also called a **batch**) is a single execution cycle in which an employer disburses salaries to multiple employees.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| Contracts | `private_pay` | `send_salary`, `disburse` |
| SDK method | `processBatchPayments` | `runPayroll`, `executeBatch` |
| Dashboard UI | **Payroll run** | Batch job, salary run, disbursement |
| Database | `payroll_run` | `batch`, `job` |

A payroll run may contain one or more **entries**. Each entry is a single payment to one recipient.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK type | `PayrollRequestEntry` | `PaymentItem`, `SalaryLine` |
| Dashboard UI | **Payment entry** | Row, line item, record |

---

## Commitment

A **commitment** is a cryptographic hash (typically Poseidon) that locks an employer's salary promise for a given pay cycle without revealing the amount on-chain.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| Contracts | `commit`, `get_commitment`, `batch_commit` | `lock`, `store_hash` |
| SDK client | `SalaryCommitmentClient` | `CommitmentStore`, `HashRegistry` |
| SDK type | `CommitmentEntry` | `LockedSalary`, `HashedPay` |
| Dashboard UI | **Salary commitment** | Locked pay, hidden salary |
| Event | `committed` | `hash_stored`, `salary_locked` |

Key commitment fields:

| Field | Definition |
|-------|-----------|
| `commitmentHash` | Poseidon hash of (recipient, amount, secret) — deterministic and private |
| `cycleId` | The pay cycle this commitment belongs to (u64) |
| `revealed` | Whether the salary has been revealed on-chain |

**Reveal** is the act of publishing the actual salary amount after the commitment period ends:

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| Contracts | `reveal_salary` | `unseal`, `publish_amount` |
| Event | `salary_revealed` | `amount_disclosed`, `pay_revealed` |

---

## Proof / ZK Proof

A **ZK proof** (zero-knowledge proof) is a cryptographic attestation that the prover knows a valid witness (salary, secret, recipient) without disclosing it.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK class | `SnarkjsProofGenerator` | `ZkProver`, `ProofEngine` |
| SDK type | `ProofPayload` | `ZkOutput`, `ProofResult` |
| Contract client | `ProofVerifierClient` | `ProofChecker`, `VerifierService` |
| Dashboard UI | **Proof** | Attestation, certificate, evidence |

Proof components:

| Component | Definition |
|-----------|-----------|
| `pi_a`, `pi_b`, `pi_c` | Groth16 pairing points on the BN128 curve |
| `publicSignals` | Array of signals exposed for on-chain verification |
| `protocol` | Proving system identifier (`"groth16"`) |
| `curve` | Elliptic curve (`"bn128"`) |

### Witness

A **witness** is the set of private inputs fed to the ZK circuit to produce a proof.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK type | `ProofWitness` | `CircuitInput`, `ProverInput` |
| Parameter name | `witness` | `input`, `args`, `privateData` |

Key witness fields:

| Field | Role |
|-------|------|
| `recipient` | Stellar public key of the employee |
| `amount` | Payment amount in stroops |
| `secret` | Random private value combined with nullifier |
| `nullifier` | Prevents double-spending per commitment |

### Circuit Artifacts

| Term | Definition |
|------|-----------|
| **WASM** (`wasmUrl`) | Compiled Circom circuit as a WebAssembly binary |
| **ZKey** (`zkeyUrl`) | Proving key generated during circuit trusted setup |
| **artifact** | Generic term for either WASM or ZKey file |
| **artifact cache** | In-memory or persistent store for downloaded artifacts |

---

## Treasury

The **treasury** holds the employer's token balance used to fund payroll payments. The SDK validates treasury solvency before executing a payroll run.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK type | `MockTreasuryState` | `FundingSource`, `WalletBalance` |
| SDK function | `checkTreasury` | `verifyFunds`, `checkBalance` |
| Result type | `TreasuryCheckResult` | `BalanceCheck`, `FundValidation` |
| Dashboard UI | **Treasury** | Wallet, account, fund pool |
| Error code | `INSUFFICIENT_TREASURY` | `NO_FUNDS`, `BALANCE_LOW` |

---

## Audit / View Key

An **audit view key** (or **view key**) is a scoped token that grants an external auditor read access to decrypted payroll data without exposing raw salaries.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK type | `ViewKey` | `AuditKey`, `AccessToken` |
| SDK helper | `createViewKeyRequest` | `generateAuditToken` |
| Contract method | `grant_view_key` | `issue_audit_key`, `create_access` |
| Dashboard UI | **View key** | Audit token, access grant, key |
| Scope values | `read-only`, `full-audit` | `basic`, `admin` |

Key view-key fields:

| Field | Definition |
|-------|-----------|
| `keyId` | Shareable token (e.g. `"vk_a3f9bc12de45"`) passed to the contract |
| `scope` | `read-only` (summaries) or `full-audit` (summaries + departmental breakdowns) |
| `grantedBy` | Stellar public key of the admin who issued the key |
| `isActive` | `false` after revocation |

---

## Reconciliation

**Reconciliation** maps private payroll inputs to public transaction outcomes, confirming which payments succeeded or failed without exposing salary amounts.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK type | `ReconciliationEntry` | `PaymentAudit`, `TxRecord` |
| SDK type | `ReconciliationSummary` | `RunReport`, `ExecutionLog` |
| SDK function | `buildReconciliation` | `generateReport`, `auditRun` |
| Dashboard UI | **Reconciliation** | Audit log, payment report, tx history |

---

## Payroll Registry

The **registry** tracks employer-employee relationships, salary amounts (on-chain), and payment tokens.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| Contracts | `register`, `get_registry`, `update_registry`, `deactivate_registry` | `addEmployee`, `saveProfile` |
| SDK client | `PayrollRegistryClient` | `EmployeeRegistry`, `RelationshipStore` |
| SDK type | `RegistryEntry` | `EmploymentRecord`, `PayrollProfile` |
| Event | `registered`, `registry_updated`, `registry_deactivated` | `employee_added`, `profile_changed` |

---

## Payment Executor

The **executor** handles immediate and scheduled payment submission on-chain.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| Contracts | `execute`, `schedule`, `cancel` | `send`, `queue`, `abort` |
| SDK client | `PaymentExecutorClient` | `PaymentSender`, `TransferService` |
| SDK type | `ScheduledPayment` | `PendingTransfer`, `QueuedPayment` |
| Event | `payment_executed`, `payment_scheduled`, `payment_cancelled` | `tx_sent`, `transfer_queued` |

---

## Wallet / Signer

A **wallet** is a browser extension or service that holds private keys and signs transactions. A **signer** is the SDK abstraction over wallet or keypair signing.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK interface | `IWalletAdapter` | `WalletProvider`, `KeyStore` |
| SDK class | `FreighterAdapter`, `AlbedoAdapter` | `FreighterWallet`, `AlbedoProvider` |
| SDK interface | `ISigner` | `KeyManager`, `TransactionSigner` |
| SDK class | `KeypairSigner`, `WalletSigner` | `SecretSigner`, `ExtensionSigner` |
| Dashboard UI | **Connect wallet** | Link account, attach signer |

---

## Normalization

**Normalization** converts varied payroll input shapes into a canonical form before validation or submission.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK function | `normalizePayrollPayload` | `cleanInput`, `sanitizePayload` |
| SDK type | `CanonicalPayrollEntry` | `CleanEntry`, `StandardizedRow` |
| SDK type | `NormalizationIssue` | `ValidationError`, `InputWarning` |
| Field | `walletAddress` | `address`, `wallet`, `dest` |
| Field | `employeeId` | `id`, `emp_id`, `recipient_id` |

Canonical field names in `CanonicalPayrollEntry`:

| Canonical name | Accepted aliases |
|---------------|-----------------|
| `employeeId` | `employee_id`, `id`, `recipient` |
| `walletAddress` | `wallet_address`, `wallet`, `address` |
| `asset` | `assetId`, `asset_id`, `token` |
| `amount` | `salaryAmount`, `salary_amount` |
| `period` | `periodId`, `period_id`, `payPeriod` |

---

## Batch Payload

A **batch payload** is a validated array of payment entries ready for submission.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK class | `BatchPayloadBuilder` | `PaymentListBuilder`, `BulkComposer` |
| SDK type | `BatchPaymentEntry` | `BulkItem`, `MassPayment` |
| SDK type | `BatchPayload` | `BulkPayload`, `PaymentBundle` |
| Validation | `validateBatchPayload` | `checkBulk`, `verifyList` |

---

## Configuration

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK type | `ClientConfig` | `SdkSettings`, `RuntimeConfig` |
| SDK class | `ConfigBuilder` | `SettingsBuilder`, `OptionsFactory` |
| SDK object | `ConfigPresets` | `EnvironmentPresets`, `NetworkDefaults` |
| Field | `networkUrl` | `rpcUrl`, `endpoint`, `nodeUrl` |
| Field | `contractId` | `address`, `contractAddress`, `contract_addr` |

---

## Simulation

**Simulation** is a dry-run mode that models a full payroll cycle without submitting live transactions.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK class | `PayrollSimulator` | `DryRunner`, `TestExecutor` |
| SDK function | `simulatePayroll` | `dryRun`, `testRun`, `previewPayroll` |
| SDK type | `SimulationResult` | `DryRunResult`, `PreviewOutput` |
| Dashboard UI | **Simulate** | Test run, dry run, preview |

---

## Idempotency

**Idempotency** prevents duplicate payment submissions when the same request is retried.

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK class | `IdempotencyRegistry` | `DeduplicationCache`, `RepeatGuard` |
| SDK function | `createPaymentIdempotencyKey` | `makeDedupKey`, `generateNonce` |
| Field | `idempotencyKey` | `dedupKey`, `requestId`, `nonce` |

---

## Events

Contract-emitted events use snake_case topic names:

| Event name | When it fires |
|-----------|--------------|
| `registered` | New employer-employee relationship created |
| `registry_updated` | Salary changed for existing relationship |
| `registry_deactivated` | Relationship marked inactive |
| `committed` | Salary commitment hash stored for a cycle |
| `salary_revealed` | Actual salary amount disclosed on-chain |
| `payment_executed` | Immediate payment completed |
| `payment_scheduled` | Future payment queued |
| `payment_cancelled` | Scheduled payment cancelled |

---

## Error Handling

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| Base class | `ZkPayrollError` | `SdkError`, `BaseError` |
| Contract error | `ContractExecutionError` | `TxError`, `BlockchainError` |
| Proof error | `ProofGenerationError` | `ZkError`, `CircuitError` |
| Wallet error | `WalletError` | `SignerError`, `ExtensionError` |
| Validation error | `ValidationError` | `InputError`, `ParamError` |

Error classification uses `TimeoutFailureState`:

| State | Meaning |
|-------|---------|
| `RETRYABLE` | Safe to retry (network blip, fee issue) |
| `EXPIRED` | Transaction timed out; must resubmit |
| `TERMINAL` | On-chain revert; will not succeed on retry |
| `UNKNOWN` | Unclassified; treat as non-retryable |

---

## Multi-Asset

| Layer | Preferred name | Avoid |
|-------|---------------|-------|
| SDK class | `AssetRegistry` | `TokenRegistry`, `CoinStore` |
| SDK type | `AssetMetadata` | `TokenInfo`, `CoinData` |
| Reserved ID | `"native"` | `"XLM"`, `"lumens"` |
| Unit | **stroops** | `units`, `base_amount`, `wei` |

> 1 XLM = 10,000,000 stroops. All `amount` fields use stroops (bigint).

---

## Cross-Repo Quick Reference

Use this table when a concept spans contracts, SDK, and UI:

| Concept | Contracts (snake_case) | SDK (camelCase) | Dashboard UI label |
|---------|----------------------|-----------------|-------------------|
| Employer-employee link | `register` / `get_registry` | `PayrollRegistryClient.register()` | Payroll registry |
| Salary hash lock | `commit` / `batch_commit` | `SalaryCommitmentClient.commit()` | Salary commitment |
| Salary disclosure | `reveal_salary` | `revealSalary()` | Reveal salary |
| Private payment | `private_pay` | `processPayment()` | Process payment |
| Immediate transfer | `execute` | `PaymentExecutorClient.execute()` | Execute payment |
| Scheduled transfer | `schedule` | `PaymentExecutorClient.schedule()` | Schedule payment |
| Cancel transfer | `cancel` | `PaymentExecutorClient.cancel()` | Cancel payment |
| Proof check | `verify` | `ProofVerifierClient.verify()` | Verify proof |
| Audit access | `grant_view_key` | `createViewKeyRequest()` | Grant view key |
| Pay cycle | `cycle_id` | `cycleId` | Pay cycle |
| Double-spend guard | `nullifier` | `nullifier` | (internal) |
| Private random value | `secret` | `secret` | (internal) |

---

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Contract methods | `snake_case` | `private_pay`, `get_registry` |
| TypeScript methods | `camelCase` | `privatePay`, `getRegistry` |
| TypeScript types | `PascalCase` | `PayrollRequestEntry`, `CommitmentEntry` |
| Event topics | `snake_case` | `payment_executed`, `salary_revealed` |
| Error codes | `SCREAMING_SNAKE_CASE` | `SIMULATION_FAILED`, `INSUFFICIENT_TREASURY` |
| Dashboard labels | **Sentence case** | Payroll run, Salary commitment, Verify proof |
| Database columns | `snake_case` | `payroll_run`, `commitment_hash`, `cycle_id` |
| Documentation headings | **Title Case** | Payroll Run, Zero-Knowledge Proof |

---

## Standardization Notes

The following names are candidates for alignment across repos over time:

| Current variation | Preferred (this guide) | Notes |
|-------------------|----------------------|-------|
| `wallet` / `address` / `dest` | `walletAddress` | Canonical SDK field name |
| `id` / `emp_id` / `recipient_id` | `employeeId` | Canonical SDK field name |
| `token` / `assetId` / `asset_id` | `asset` | Canonical SDK field name |
| `rpcUrl` / `endpoint` / `nodeUrl` | `networkUrl` | Canonical config field name |
| `PayrollError` | `ZkPayrollError` | `PayrollError` is deprecated; prefer `ZkPayrollError` |
| `dry run` / `test run` / `preview` | **Simulate** | Preferred UI and docs label |
| `batch job` / `salary run` | **Payroll run** | Preferred UI and docs label |
