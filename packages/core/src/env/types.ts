/**
 * Environment capability detection types.
 *
 * Detects browser, web worker, and Node.js backend environments and exposes
 * which SDK operations are safe to call in each one.
 */

export type RuntimeEnvironment = "browser" | "worker" | "node" | "unknown";

export type Capability =
  | "wallet_connection"
  | "proof_generation"
  | "rpc_call"
  | "file_system"
  | "web_worker"
  | "localStorage"
  | "indexedDB"
  | "crypto.getRandomValues"
  | "wasm"
  | "fetch";

export interface EnvironmentCapabilities {
  environment: RuntimeEnvironment;
  /** Set of capabilities available in this environment. */
  capabilities: Set<Capability>;
  /** Whether the environment supports wallet browser extensions. */
  hasWalletSupport: boolean;
  /** Whether WebAssembly is available for ZK proof generation. */
  hasWasm: boolean;
  /** Whether the native crypto API is available. */
  hasCrypto: boolean;
}

export interface SdkOperationCapability {
  /** Human-readable operation name. */
  operation: string;
  /** Required capabilities for this operation to work. */
  requiredCapabilities: Capability[];
  /** Whether this operation requires a secure (backend) context. */
  requiresBackend: boolean;
}
