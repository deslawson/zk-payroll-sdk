/**
 * Wallet adapters for Stellar wallets
 *
 * This module provides a unified interface for integrating multiple Stellar wallets
 * (Freighter, Albedo, etc.) into frontend applications.
 */

export {
  IWalletAdapter,
  WalletNetwork,
  WalletConnectionStatus,
  SignedTransaction,
  WalletError,
  WalletErrorCode,
  WalletRejectionError,
} from "./IWalletAdapter";

export { FreighterAdapter } from "./FreighterAdapter";
export { AlbedoAdapter } from "./AlbedoAdapter";
