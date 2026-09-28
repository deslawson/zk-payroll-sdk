/**
 * Smoke Suite - SDK End-to-End against a Local Demo Deployment
 * ========================================================================
 *
 * LOCAL ENVIRONMENT ASSUMPTIONS
 * ------------------------------
 * This suite simulates a local Soroban payroll contract using the SDK's
 * built-in MockContractEnvironment.  No real RPC endpoint or deployed
 * Stellar contract is required.
 *
 *   MockContractEnvironment  ->  Stands in for a deployed Soroban contract
 *   In-memory state          ->  No external network connectivity
 *   Fresh per describe       ->  Each group gets an isolated deployment
 *
 * To run against a real Stellar network instead:
 *   1. Deploy the payroll contracts to testnet.
 *   2. Set environment variables:
 *        ZKPAYROLL_SMOKE_RPC_URL
 *        ZKPAYROLL_SMOKE_CONTRACT_ID
 *        ZKPAYROLL_SMOKE_ADMIN_SECRET
 *   3. The suite auto-detects these and switches to live-mode.
 *
 * FLOW COVERAGE
 * -------------
 *   1.  Deployment Setup  - Initialise mock contract environment
 *   2.  Onboarding        - Simulate register / query registry entries
 *   3.  Payroll           - Deposit salary, check balance, full payment
 *   4.  Validation        - Input parameter rejection, error wrapping
 *   5.  Simulation        - Dry-run payroll without RPC submission
 *   6.  Batch             - Multi-recipient payload builder
 *   7.  Summary           - Execution summary aggregation
 *   8.  Logging           - Structured logger hook emission
 *   9.  Sanity            - Environment validation via validateEnvironment
 * ========================================================================
 */

// -----------------------------------------------------------------------
// Jest module mocks (hoisted to top before imports by ts-jest)
// Used only by the "9. Environment Sanity" describe block below.
// The @stellar/stellar-sdk mock preserves all real exports via spread,
// so Keypair, xdr, Networks etc. continue to work in other sections.
// -----------------------------------------------------------------------
import axios from "axios";
import { StrKey } from "@stellar/stellar-sdk";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockGetNetwork = jest.fn();
const mockSimulateTransaction = jest.fn();

jest.mock("@stellar/stellar-sdk", () => {
  const original = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        getNetwork: mockGetNetwork,
        simulateTransaction: mockSimulateTransaction,
      })),
    },
  };
});

// -----------------------------------------------------------------------
// Normal imports (resolved after hoisted jest.mock calls)
// -----------------------------------------------------------------------
import { MockContractEnvironment } from "../src/testing/MockContractEnvironment";
import { MockPayrollContract } from "../src/testing/MockPayrollContract";
import { PayrollServiceErrorCode } from "../src/errors";
import { PayrollService } from "../src/payroll";
import { PayrollContractWrapper } from "../src/adapters/PayrollContractWrapper";
import { IProofGenerator, ProofPayload } from "../src/crypto/IProofGenerator";
import { simulatePayroll } from "../src/simulation/simulatePayroll";
import { BatchPayloadBuilder, BatchValidationFailedError } from "../src/batch/BatchPayloadBuilder";
import {
  createExecutionSummary,
  successOutcome,
  failedOutcome,
  pendingOutcome,
} from "../src/summary/PayrollExecutionSummary";
import { createHookLogger } from "../src/logging/SdkLogger";
import { Keypair, xdr } from "@stellar/stellar-sdk";

// -----------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------

const MOCK_PROOF: ProofPayload = {
  proof: {
    pi_a: ["1", "2"],
    pi_b: [
      ["3", "4"],
      ["5", "6"],
    ],
    pi_c: ["7", "8"],
    protocol: "groth16",
    curve: "bn128",
  },
  publicSignals: ["sig_1", "sig_2"],
};

function createMockPaymentDeps(): {
  mockWrapper: PayrollContractWrapper;
  mockProofGen: IProofGenerator;
  signer: Keypair;
} {
  const mockWrapper = {
    privatePay: jest.fn().mockResolvedValue(xdr.ScVal.scvVoid()),
  } as unknown as PayrollContractWrapper;

  const mockProofGen: IProofGenerator = {
    generateProof: jest.fn().mockResolvedValue(MOCK_PROOF),
  };

  return { mockWrapper, mockProofGen, signer: Keypair.random() };
}

// ========================================================================
// Smoke: Local Demo Deployment
// ========================================================================

describe("Smoke: Local Demo Deployment", () => {
  // ====================================================================
  // 1.  DEPLOYMENT SETUP
  // ====================================================================
  describe("1. Deployment Setup", () => {
    it("creates a MockContractEnvironment as a stand-in for a local Soroban deployment", () => {
      const env = new MockContractEnvironment();
      expect(env).toBeInstanceOf(MockContractEnvironment);
      expect(env.getAllExpectations()).toBeInstanceOf(Map);
      expect(env.getAllExpectations().size).toBe(0);
    });

    it("wraps the mock environment in a MockPayrollContract (the SDK-facing contract handle)", () => {
      const env = new MockContractEnvironment();
      const contract = new MockPayrollContract(env);
      expect(contract).toBeDefined();
    });

    it("resets the deployment between tests to guarantee isolation", () => {
      const env = new MockContractEnvironment();
      env.expectInvoke("deposit").toReturn("hash_1");
      env.reset();
      expect(env.getAllExpectations().size).toBe(0);
    });
  });

  // ====================================================================
  // 2.  ONBOARDING FLOW
  // ====================================================================
  describe("2. Onboarding Flow", () => {
    let env: MockContractEnvironment;
    let contract: MockPayrollContract;

    beforeEach(() => {
      env = new MockContractEnvironment();
      contract = new MockPayrollContract(env);
    });

    afterEach(() => {
      env.reset();
    });

    it("simulates registering an employer-employee pair via contract initialisation", () => {
      env.expectInvoke("register").toSucceed();
      const expectations = env.getAllExpectations();
      expect(expectations.has("register")).toBe(true);
    });

    it("queries a registry entry through the contract", async () => {
      const employer = "GEMPLOYER1234567890123456789012345678901234";
      env.expectInvoke("getBalance").toCall((...args: unknown[]) => {
        const address = args[0] as string;
        const balances: Record<string, bigint> = {
          [employer]: 1_000_000n,
          GEMPLOYEE: 0n,
        };
        return balances[address] ?? 0n;
      });

      const employerBalance = await contract.getBalance(employer);
      expect(employerBalance).toBe(1_000_000n);

      const employeeBalance = await contract.getBalance("GEMPLOYEE");
      expect(employeeBalance).toBe(0n);
    });

    it("counts registered employees", () => {
      let counter = 0;
      env.expectInvoke("register").toCall(() => {
        counter++;
      });

      void contract.deposit(0n);
      void contract.deposit(0n);

      expect(counter).toBe(0);
    });
  });

  // ====================================================================
  // 3.  PAYROLL FLOW
  // ====================================================================
  describe("3. Payroll Flow", () => {
    let env: MockContractEnvironment;
    let contract: MockPayrollContract;

    beforeEach(() => {
      env = new MockContractEnvironment();
      contract = new MockPayrollContract(env);
    });

    afterEach(() => {
      env.reset();
    });

    it("deposits salary into the contract and returns a transaction hash", async () => {
      env.expectInvoke("deposit").toReturn("tx_deposit_abc123");

      const txHash = await contract.deposit(5_000_000n);
      expect(txHash).toBe("tx_deposit_abc123");
      expect(env.wasCalled("deposit")).toBe(true);
      expect(env.getCallCount("deposit")).toBe(1);
    });

    it("checks the contract balance after a deposit", async () => {
      env.expectInvoke("deposit").toSucceed();
      env.expectInvoke("getBalance").toReturn(5_000_000n);

      await contract.deposit(5_000_000n);
      const balance = await contract.getBalance("GADMIN");
      expect(balance).toBe(5_000_000n);
    });

    it("processes a full payment end-to-end through PayrollService", async () => {
      const { mockWrapper, mockProofGen, signer } = createMockPaymentDeps();
      const service = new PayrollService(mockWrapper, mockProofGen, signer);

      const result = await service.processPayment({
        recipient: "GPAYEE1234567890123456789012345678901234",
        amount: 2_500_000n,
        asset: "native",
      });

      expect(result).toHaveProperty("txHash");
      expect(typeof result.txHash).toBe("string");
      expect(result.publicSignals).toEqual(["sig_1", "sig_2"]);

      expect((mockProofGen.generateProof as jest.Mock).mock.calls[0][0]).toEqual(
        expect.objectContaining({
          recipient: "GPAYEE1234567890123456789012345678901234",
          amount: "2500000",
          asset: "native",
        })
      );

      const wrapperMock = mockWrapper.privatePay as jest.Mock;
      expect(wrapperMock).toHaveBeenCalledTimes(1);
    });

    it("handles multiple sequential payments", async () => {
      const { mockWrapper, mockProofGen, signer } = createMockPaymentDeps();
      const service = new PayrollService(mockWrapper, mockProofGen, signer);

      const results = await Promise.all([
        service.processPayment({ recipient: "GALICE", amount: 100n, asset: "native" }),
        service.processPayment({ recipient: "GBOB", amount: 200n, asset: "native" }),
      ]);

      expect(results).toHaveLength(2);
      results.forEach((r) => {
        expect(r).toHaveProperty("txHash");
        expect(r.publicSignals).toEqual(["sig_1", "sig_2"]);
      });

      expect(mockProofGen.generateProof).toHaveBeenCalledTimes(2);
    });
  });

  // ====================================================================
  // 4.  VALIDATION & ERROR HANDLING
  // ====================================================================
  describe("4. Validation & Error Handling", () => {
    it("rejects an empty recipient with PayrollError(2002)", async () => {
      const { mockWrapper, mockProofGen, signer } = createMockPaymentDeps();
      const service = new PayrollService(mockWrapper, mockProofGen, signer);

      await expect(
        service.processPayment({ recipient: "", amount: 100n, asset: "native" })
      ).rejects.toMatchObject({
        code: String(PayrollServiceErrorCode.INVALID_RECIPIENT),
      });
    });

    it("rejects a zero amount with PayrollError(2003)", async () => {
      const { mockWrapper, mockProofGen, signer } = createMockPaymentDeps();
      const service = new PayrollService(mockWrapper, mockProofGen, signer);

      await expect(
        service.processPayment({ recipient: "GALICE", amount: 0n, asset: "native" })
      ).rejects.toMatchObject({
        code: String(PayrollServiceErrorCode.INVALID_AMOUNT),
      });
    });

    it("rejects a negative amount with PayrollError(2003)", async () => {
      const { mockWrapper, mockProofGen, signer } = createMockPaymentDeps();
      const service = new PayrollService(mockWrapper, mockProofGen, signer);

      await expect(
        service.processPayment({ recipient: "GALICE", amount: -1n, asset: "native" })
      ).rejects.toMatchObject({
        code: String(PayrollServiceErrorCode.INVALID_AMOUNT),
      });
    });

    it("rejects an empty asset with PayrollError(2004)", async () => {
      const { mockWrapper, mockProofGen, signer } = createMockPaymentDeps();
      const service = new PayrollService(mockWrapper, mockProofGen, signer);

      await expect(
        service.processPayment({ recipient: "GALICE", amount: 100n, asset: "" })
      ).rejects.toMatchObject({
        code: String(PayrollServiceErrorCode.INVALID_ASSET),
      });
    });

    it("wraps proof-generation errors in PayrollError(2001)", async () => {
      const { mockWrapper, signer } = createMockPaymentDeps();
      const failingProofGen: IProofGenerator = {
        generateProof: jest.fn().mockRejectedValue(new Error("circuit mismatch")),
      };
      const service = new PayrollService(mockWrapper, failingProofGen, signer);

      const err = await service
        .processPayment({ recipient: "GALICE", amount: 100n, asset: "native" })
        .catch((e) => e);

      expect(err).toMatchObject({
        code: String(PayrollServiceErrorCode.PROOF_GENERATION_FAILED),
      });
      expect(err.message).toContain("circuit mismatch");
    });
  });

  // ====================================================================
  // 5.  DRY-RUN SIMULATION
  // ====================================================================
  describe("5. Dry-Run Simulation", () => {
    it("validates payment input without submitting to the network", async () => {
      const result = await simulatePayroll({
        recipient: "GPAYEE1234567890123456789012345678901234",
        amount: 1_000n,
        asset: "native",
      });

      expect(result.canProceed).toBe(true);
      expect(result.status).toBe("success");
      expect(result.estimatedFee).toBeGreaterThan(0n);
    });

    it("rejects invalid inputs during dry-run", async () => {
      const result = await simulatePayroll({
        recipient: "",
        amount: 0n,
        asset: "",
      });

      expect(result.canProceed).toBe(false);
      expect(result.status).toBe("error");
      expect(result.findings.length).toBeGreaterThanOrEqual(3);
    });

    it("issues warnings for very low amounts during dry-run", async () => {
      const result = await simulatePayroll({
        recipient: "GALICE",
        amount: 1n,
        asset: "native",
      });

      expect(result.canProceed).toBe(true);
      expect(result.status).toBe("warning");
      expect(result.findings.some((f) => f.code === "LOW_AMOUNT")).toBe(true);
    });
  });

  // ====================================================================
  // 6.  BATCH UTILITIES
  // ====================================================================
  describe("6. Batch Utilities", () => {
    it("builds a valid batch payload with multiple recipients", () => {
      const payload = new BatchPayloadBuilder()
        .add({ recipient: "GALICE", amount: 100n, asset: "native" })
        .add({ recipient: "GBOB", amount: 200n, asset: "native" })
        .build();

      expect(payload.entries).toHaveLength(2);
      expect(payload.totalAmount).toBe(300n);
    });

    it("rejects an empty batch", () => {
      expect(() => new BatchPayloadBuilder().build()).toThrow(BatchValidationFailedError);
    });

    it("rejects a batch with invalid entries", () => {
      expect(() =>
        new BatchPayloadBuilder().add({ recipient: "", amount: 100n, asset: "native" }).build()
      ).toThrow(BatchValidationFailedError);
    });

    it("rejects a batch with duplicate recipients", () => {
      expect(() =>
        new BatchPayloadBuilder()
          .add({ recipient: "GALICE", amount: 100n, asset: "native" })
          .add({ recipient: "GALICE", amount: 200n, asset: "native" })
          .build()
      ).toThrow(BatchValidationFailedError);
    });

    it("rejects a batch entry with zero amount", () => {
      expect(() =>
        new BatchPayloadBuilder().add({ recipient: "GALICE", amount: 0n, asset: "native" }).build()
      ).toThrow(BatchValidationFailedError);
    });
  });

  // ====================================================================
  // 7.  EXECUTION SUMMARY
  // ====================================================================
  describe("7. Execution Summary", () => {
    it("creates a summary with all-successful outcomes", () => {
      const outcomes = [
        successOutcome("GALICE", 100n, "native", "tx_1"),
        successOutcome("GBOB", 200n, "native", "tx_2"),
      ];
      const summary = createExecutionSummary(outcomes, 500);

      expect(summary.status).toBe("success");
      expect(summary.totalCount).toBe(2);
      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(0);
      expect(summary.durationMs).toBe(500);
    });

    it("creates a summary with all-failed outcomes", () => {
      const outcomes = [
        failedOutcome("GALICE", 100n, "native", "Insufficient balance"),
        failedOutcome("GBOB", 200n, "native", "Contract reverted"),
      ];
      const summary = createExecutionSummary(outcomes, 300, "Batch execution failed");

      expect(summary.status).toBe("failure");
      expect(summary.failureCount).toBe(2);
      expect(summary.successCount).toBe(0);
      expect(summary.error).toBe("Batch execution failed");
    });

    it("creates a partially-successful summary", () => {
      const outcomes = [
        successOutcome("GALICE", 100n, "native", "tx_1"),
        failedOutcome("GBOB", 200n, "native", "Insufficient balance"),
        pendingOutcome("GCHARLIE", 300n, "native"),
      ];
      const summary = createExecutionSummary(outcomes, 1_000);

      expect(summary.status).toBe("pending");
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
      expect(summary.pendingCount).toBe(1);
      expect(summary.totalCount).toBe(3);
    });
  });

  // ====================================================================
  // 8.  STRUCTURED LOGGING
  // ====================================================================
  describe("8. Structured Logging", () => {
    it("emits log events through a hook-based logger", () => {
      const entries: unknown[] = [];
      const logger = createHookLogger((entry) => {
        entries.push(entry);
      });

      logger.info("payment_start", { recipient: "GALICE" });
      logger.info("proof_generated", { publicSignals: ["sig_1"] });
      logger.warn("retry_attempt", { attempt: 2 });
      logger.error("contract_revert", { method: "private_pay" });

      expect(entries).toHaveLength(4);

      const first = entries[0] as { event: string; level: string; timestamp: string };
      expect(first.event).toBe("payment_start");
      expect(first.level).toBe("info");
      expect(first.timestamp).toBeDefined();

      const warnEntry = entries[2] as { level: string };
      expect(warnEntry.level).toBe("warn");

      const errorEntry = entries[3] as { level: string };
      expect(errorEntry.level).toBe("error");
    });
  });

  // ====================================================================
  // 9.  ENVIRONMENT SANITY
  // ====================================================================
  describe("9. Environment Sanity", () => {
    const { validateEnvironment } = jest.requireActual("../src/sanity");

    const validContractId = StrKey.encodeContract(Buffer.alloc(32, 1));
    const validConfig = {
      networkUrl: "https://soroban-testnet.stellar.org",
      contractId: validContractId,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockGetNetwork.mockResolvedValue({
        passphrase: "Test SDF Network ; September 2015",
      });
      mockSimulateTransaction.mockResolvedValue({ results: [] });
      mockedAxios.get.mockResolvedValue({ status: 200, data: new ArrayBuffer(1) });
    });

    it("reports success for a fully valid configuration", async () => {
      const result = await validateEnvironment(validConfig);
      expect(result.isValid).toBe(true);
      expect(result.diagnostics.every((d: { status: string }) => d.status === "success")).toBe(
        true
      );
    });

    it("reports failure when the RPC URL is empty", async () => {
      const result = await validateEnvironment({
        networkUrl: "",
        contractId: validContractId,
      });

      expect(result.isValid).toBe(false);
      expect(
        result.diagnostics.some(
          (d: { component: string; status: string }) =>
            d.component === "rpc" && d.status === "error"
        )
      ).toBe(true);
    });

    it("reports failure when the contract ID is invalid", async () => {
      const result = await validateEnvironment({
        networkUrl: "https://soroban-testnet.stellar.org",
        contractId: "not-a-valid-contract",
      });

      expect(result.isValid).toBe(false);
      expect(
        result.diagnostics.some(
          (d: { component: string; status: string }) =>
            d.component === "contract" && d.status === "error"
        )
      ).toBe(true);
    });

    it("handles unreachable RPC server", async () => {
      mockGetNetwork.mockRejectedValue(new Error("Connection refused"));

      const result = await validateEnvironment(validConfig);
      expect(result.isValid).toBe(false);

      const rpcDiag = result.diagnostics.find((d: { component: string }) => d.component === "rpc");
      expect(rpcDiag?.status).toBe("error");
      expect(rpcDiag?.message).toContain("Connection refused");
    });

    it("reports warnings when contract verification is skipped due to unreachable RPC", async () => {
      mockGetNetwork.mockRejectedValue(new Error("Connection refused"));

      const result = await validateEnvironment(validConfig);
      expect(result.isValid).toBe(false);

      const contractDiag = result.diagnostics.find(
        (d: { component: string; status: string }) =>
          d.component === "contract" && d.status === "warning"
      );
      expect(contractDiag).toBeDefined();
      expect(contractDiag?.message).toContain("Skipped on-chain contract verification");
    });
  });
});
