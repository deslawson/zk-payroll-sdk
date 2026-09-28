import type { ProofPayload, IProofGenerator } from "../crypto/IProofGenerator";
import type { PayrollProgressCallback } from "../progress";
import { createPayrollProgressEvent } from "../progress";
import type { ProofSimulationConfig } from "./types";

const MOCK_PROOF: ProofPayload = {
  proof: {
    pi_a: ["simulated_a1", "simulated_a2"],
    pi_b: [
      ["simulated_b1", "simulated_b2"],
      ["simulated_b3", "simulated_b4"],
    ],
    pi_c: ["simulated_c1", "simulated_c2"],
    protocol: "groth16",
    curve: "bn128",
  },
  publicSignals: [],
};

/**
 * Creates a mock proof generator that simulates ZK proof generation
 * without requiring real circuit files or snarkjs.
 *
 * The generator produces structurally valid but cryptographically empty
 * proofs — enough to exercise the full orchestration flow.
 *
 * @param config - Optional simulation configuration for failure modes and latency
 * @returns An IProofGenerator that produces mock proofs
 *
 * @example
 * ```typescript
 * const gen = createMockProofGenerator({ simulatedLatencyMs: 50 });
 * const proof = await gen.generateProof({ recipient: "G...", amount: "1000" });
 * // proof.proof.protocol === "groth16"
 * ```
 */
export function createMockProofGenerator(config?: ProofSimulationConfig): IProofGenerator {
  return {
    async generateProof(
      witness: Record<string, unknown>,
      onProgress?: PayrollProgressCallback
    ): Promise<ProofPayload> {
      if (config?.simulatedLatencyMs) {
        await sleep(config.simulatedLatencyMs);
      }

      onProgress?.(
        createPayrollProgressEvent({
          operation: "proof",
          stage: "proof_loading_wasm",
          message: "mock_proof_loading_wasm",
          progress: 0,
        })
      );

      onProgress?.(
        createPayrollProgressEvent({
          operation: "proof",
          stage: "proof_loading_zkey",
          message: "mock_proof_loading_zkey",
          progress: 33,
        })
      );

      if (config?.shouldFail) {
        throw new Error(config.failureMessage ?? "Simulated proof generation failure");
      }

      onProgress?.(
        createPayrollProgressEvent({
          operation: "proof",
          stage: "proof_generating",
          message: "mock_proof_generating",
          progress: 66,
        })
      );

      const publicSignals = [
        String(witness["recipient"] ?? ""),
        String(witness["amount"] ?? ""),
        String(witness["asset"] ?? ""),
      ];

      onProgress?.(
        createPayrollProgressEvent({
          operation: "proof",
          stage: "proof_done",
          message: "mock_proof_done",
          progress: 100,
        })
      );

      return {
        proof: { ...MOCK_PROOF.proof },
        publicSignals,
      };
    },
  };
}

/**
 * Validates that a proof artifact configuration is structurally valid.
 * Returns structured errors instead of throwing.
 */
export function validateProofConfig(config: ProofSimulationConfig | undefined): {
  valid: boolean;
  errors: string[];
} {
  if (!config) return { valid: true, errors: [] };

  const errors: string[] = [];

  if (config.simulatedLatencyMs !== undefined && config.simulatedLatencyMs < 0) {
    errors.push("simulatedLatencyMs must be non-negative");
  }

  if (config.shouldFail && !config.failureMessage) {
    errors.push("failureMessage is required when shouldFail is true");
  }

  return { valid: errors.length === 0, errors };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
