# Browser and Server Usage Guide

The ZK Payroll SDK is designed to be flexible enough for both frontend (browser) and backend (server/Node.js) environments. However, due to the sensitive nature of zero-knowledge proofs and payroll data, it is critical to use the appropriate features in the correct environment.

This guide outlines which SDK features are safe in the browser and which should remain on the server to prevent secret leakage and runtime misuse.

## Quick Reference Matrix

| Feature | Browser (Frontend) | Server (Backend) |
|---------|-------------------|------------------|
| **Wallet Connection & Signing** | ✅ Yes (via Wallet Adapters) | ❌ No (use Keypair/KMS) |
| **Proof Generation (snarkjs)** | ✅ Yes (Web Workers recommended) | ✅ Yes (Native/WASM) |
| **Storing Secret Keys (S...)** | ❌ NEVER | ✅ Yes (via Env/Secrets Manager) |
| **Storing Note Nullifiers/Secrets** | ❌ NEVER | ✅ Yes (Database/Secure Store) |
| **Batch Payroll Processing** | ⚠️ Not recommended (blocks UI) | ✅ Yes (Worker Queues) |
| **Fetching Public Ledger Data** | ✅ Yes | ✅ Yes |

## 🌐 Browser Usage (Frontend)

In a browser environment (like a Next.js client component or a React SPA), the primary goal is user interaction, wallet connection, and submitting transactions without exposing sensitive keys.

### Safe Operations
- **Connecting Wallets**: Use `@zk-payroll/sdk` wallet adapters (e.g., `FreighterAdapter`) to request the user's public key and prompt for transaction signatures.
- **Client-Side Proofs**: Generating ZK proofs in the browser is supported, but it is computationally heavy. Always offload this to a Web Worker to keep the UI responsive.
- **Reading Public State**: Querying the registry or payment executor for public commitments.

### 🚫 Anti-Patterns in the Browser
- **Hardcoding Secrets**: Never embed Stellar secret keys (`S...`), note secrets, or nullifiers in frontend code, environment variables shipped to the client (like `NEXT_PUBLIC_*`), or `localStorage`.
- **Heavy Batching**: Do not attempt to process payroll for hundreds of employees in a single browser session. This should be a backend job.

## 🖥️ Server Usage (Backend)

In a server environment (Node.js workers, background jobs, automation), the SDK operates with elevated privileges and handles batch operations.

### Safe Operations
- **Secret Management**: Load signing keys securely from environment variables, AWS KMS, or a secrets manager.
- **Automated Payroll**: Run batch processing for multiple payments at once.
- **Server-Side Proofs**: Generate proofs directly in the Node.js process using native modules or WASM.

### 🚫 Anti-Patterns on the Server
- **Logging Witnesses**: Never log full ZK witnesses, proofs containing private inputs, or secret keys to monitoring tools (e.g., Datadog, Sentry).
- **Importing Browser Wallets**: Do not import or use browser wallet adapters (like `FreighterAdapter`) in server-side code (e.g., Next.js Server Components, API Routes). Use server-held keys instead.
- **Global Key Sharing**: Avoid using a single hot key across multi-tenant applications if possible. Scope keys appropriately.

## Best Practices for Full-Stack Applications (Next.js)

When building a full-stack application with Next.js, strictly separate your SDK imports:
1. **Client Components (`"use client"`)**: Import wallet adapters and UI-specific SDK features.
2. **Server Components/Actions**: Import the core `PayrollService` and configure it with server-side secrets.

For more details, see the [Next.js Integration Guide](./NEXTJS_INTEGRATION.md).
