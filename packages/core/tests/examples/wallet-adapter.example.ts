/* eslint-disable */
/**
 * Wallet Adapter Usage Examples
 *
 * This file demonstrates how to use the wallet adapter layer
 * to integrate multiple Stellar wallets into your application.
 */

import {
  IWalletAdapter,
  FreighterAdapter,
  AlbedoAdapter,
  WalletNetwork,
  WalletConnectionStatus,
  WalletError,
  WalletErrorCode,
} from "../../src/wallets";

// ── Example 1: Basic Wallet Connection ─────────────────────────────────────

async function connectFreighter() {
  const wallet = new FreighterAdapter();

  if (!wallet.isAvailable()) {
    console.error("Freighter is not installed");
    return;
  }

  try {
    const publicKey = await wallet.connect("testnet");
    console.log("Connected to Freighter:", publicKey);
    console.log("Network:", wallet.getNetwork());
  } catch (error) {
    if (error instanceof WalletError) {
      console.error("Connection failed:", (error as Error).message, (error as WalletError).code);
    }
  }
}

async function connectAlbedo() {
  const wallet = new AlbedoAdapter();

  if (!wallet.isAvailable()) {
    console.error("Albedo is not available");
    return;
  }

  try {
    const publicKey = await wallet.connect("testnet");
    console.log("Connected to Albedo:", publicKey);
    console.log("Network:", wallet.getNetwork());
  } catch (error) {
    if (error instanceof WalletError) {
      console.error("Connection failed:", (error as Error).message, (error as WalletError).code);
    }
  }
}

// ── Example 2: Swapping Wallet Providers ───────────────────────────────────

function getWalletAdapter(walletType: "freighter" | "albedo"): IWalletAdapter {
  switch (walletType) {
    case "freighter":
      return new FreighterAdapter();
    case "albedo":
      return new AlbedoAdapter();
    default:
      throw new Error("Unsupported wallet type");
  }
}

async function useWallet(walletType: "freighter" | "albedo") {
  const wallet = getWalletAdapter(walletType);

  if (!wallet.isAvailable()) {
    console.error(`${walletType} is not available`);
    return;
  }

  // The rest of the code is wallet-agnostic
  await wallet.connect("testnet");
  console.log("Connected with:", wallet.name);
  console.log("Public key:", wallet.publicKey);

  // Disconnect when done
  await wallet.disconnect();
}

// ── Example 3: Signing Transactions ─────────────────────────────────────────

async function signTransactionWithFreighter() {
  const wallet = new FreighterAdapter();
  await wallet.connect("testnet");

  const unsignedXdr = "AAAA..."; // Your unsigned transaction XDR

  try {
    const signedResult = await wallet.signTransaction(unsignedXdr);
    console.log("Signed XDR:", signedResult.signedTxXdr);
    console.log("Signer:", signedResult.publicKey);
  } catch (error) {
    if (error instanceof WalletError) {
      console.error("Signing failed:", (error as Error).message, (error as WalletError).code);
    }
  }
}

async function signTransactionWithAlbedo() {
  const wallet = new AlbedoAdapter();
  await wallet.connect("testnet");

  const unsignedXdr = "AAAA..."; // Your unsigned transaction XDR

  try {
    const signedResult = await wallet.signTransaction(unsignedXdr);
    console.log("Signed XDR:", signedResult.signedTxXdr);
    console.log("Signer:", signedResult.publicKey);
  } catch (error) {
    if (error instanceof WalletError) {
      console.error("Signing failed:", (error as Error).message, (error as WalletError).code);
    }
  }
}

// ── Example 4: Sign and Submit Transactions ─────────────────────────────────

async function signAndSubmitWithFreighter() {
  const wallet = new FreighterAdapter();
  await wallet.connect("testnet");

  const unsignedXdr = "AAAA..."; // Your unsigned transaction XDR

  try {
    const txHash = await wallet.signAndSubmitTransaction(unsignedXdr);
    console.log("Transaction submitted:", txHash);
  } catch (error) {
    if (error instanceof WalletError) {
      console.error("Submission failed:", (error as Error).message, (error as WalletError).code);
    }
  }
}

async function signAndSubmitWithAlbedo() {
  const wallet = new AlbedoAdapter();
  await wallet.connect("testnet");

  const unsignedXdr = "AAAA..."; // Your unsigned transaction XDR

  try {
    const txHash = await wallet.signAndSubmitTransaction(unsignedXdr);
    console.log("Transaction submitted:", txHash);
  } catch (error) {
    if (error instanceof WalletError) {
      console.error("Submission failed:", (error as Error).message, (error as WalletError).code);
    }
  }
}

// ── Example 5: Event Listeners ─────────────────────────────────────────────

async function setupEventListeners() {
  const wallet = new FreighterAdapter();

  // Listen for connection changes
  const unsubscribeConnection = wallet.onConnectionChange((status: WalletConnectionStatus) => {
    console.log("Connection status:", status);
    if (status === "connected") {
      console.log("Public key:", wallet.publicKey);
    }
  });

  // Listen for network changes
  const unsubscribeNetwork = wallet.onNetworkChange((network: WalletNetwork) => {
    console.log("Network changed to:", network);
  });

  // Listen for account changes
  const unsubscribeAccount = wallet.onAccountChange((publicKey: string) => {
    console.log("Account changed to:", publicKey);
  });

  // Connect to trigger events
  await wallet.connect("testnet");

  // Clean up listeners when done
  // unsubscribeConnection();
  // unsubscribeNetwork();
  // unsubscribeAccount();
}

// ── Example 6: Error Handling ──────────────────────────────────────────────

async function handleWalletErrors() {
  const wallet = new FreighterAdapter();

  try {
    await wallet.connect("testnet");
  } catch (error) {
    if (error instanceof WalletError) {
      switch ((error as WalletError).code) {
        case WalletErrorCode.NOT_INSTALLED:
          console.error("Wallet is not installed");
          // Prompt user to install wallet
          break;
        case WalletErrorCode.CONNECTION_REJECTED:
          console.error("User rejected connection");
          // Show user-friendly message
          break;
        case WalletErrorCode.NOT_CONNECTED:
          console.error("Wallet is not connected");
          // Prompt user to connect
          break;
        case WalletErrorCode.SIGNING_REJECTED:
          console.error("User rejected signing");
          // Show user-friendly message
          break;
        case WalletErrorCode.NETWORK_MISMATCH:
          console.error("Network mismatch");
          // Prompt user to switch networks
          break;
        default:
          console.error("Unknown wallet error:", (error as Error).message);
      }
    }
  }
}

// ── Example 7: Network Selection ───────────────────────────────────────────

async function connectToMainnet() {
  const wallet = new FreighterAdapter();

  // Connect to mainnet (public network)
  await wallet.connect("public");

  const network = wallet.getNetwork();
  console.log("Current network:", network); // "public"
}

async function connectToTestnet() {
  const wallet = new AlbedoAdapter();

  // Connect to testnet
  await wallet.connect("testnet");

  const network = wallet.getNetwork();
  console.log("Current network:", network); // "testnet"
}

// ── Example 8: React Integration Pattern ──────────────────────────────────

/*
 * This example shows how to integrate wallet adapters in a React component.
 * Note: This is a pattern example, not executable code.
 */

/*
import { useState, useEffect } from 'react';
import { FreighterAdapter, IWalletAdapter } from '@zk-payroll/sdk';

function WalletConnect() {
  const [wallet, setWallet] = useState<IWalletAdapter | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    const adapter = new FreighterAdapter();
    setWallet(adapter);

    const unsubscribe = adapter.onConnectionChange((status) => {
      setIsConnected(status === 'connected');
      setPublicKey(adapter.publicKey);
    });

    return () => unsubscribe();
  }, []);

  const handleConnect = async () => {
    if (!wallet) return;
    try {
      await wallet.connect('testnet');
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  const handleDisconnect = async () => {
    if (!wallet) return;
    await wallet.disconnect();
  };

  return (
    <div>
      {isConnected ? (
        <div>
          <p>Connected: {publicKey}</p>
          <button onClick={handleDisconnect}>Disconnect</button>
        </div>
      ) : (
        <button onClick={handleConnect}>Connect Wallet</button>
      )}
    </div>
  );
}
*/

// ── Example 9: Auto-Detect Available Wallets ───────────────────────────────

function getAvailableWallets(): IWalletAdapter[] {
  const wallets: IWalletAdapter[] = [];

  const freighter = new FreighterAdapter();
  if (freighter.isAvailable()) {
    wallets.push(freighter);
  }

  const albedo = new AlbedoAdapter();
  if (albedo.isAvailable()) {
    wallets.push(albedo);
  }

  return wallets;
}

async function connectToFirstAvailable() {
  const availableWallets = getAvailableWallets();

  if (availableWallets.length === 0) {
    console.error("No wallets available");
    return;
  }

  // Connect to the first available wallet
  const wallet = availableWallets[0];
  await wallet.connect("testnet");
  console.log("Connected to:", wallet.name);
}

// ── Example 10: Wallet Selection UI ───────────────────────────────────────

/*
 * This example shows how to create a wallet selection UI.
 * Note: This is a pattern example, not executable code.
 */

/*
import { FreighterAdapter, AlbedoAdapter, IWalletAdapter } from '@zk-payroll/sdk';

const WALLET_OPTIONS = [
  { id: 'freighter', name: 'Freighter', adapter: FreighterAdapter },
  { id: 'albedo', name: 'Albedo', adapter: AlbedoAdapter },
];

function WalletSelector() {
  const [selectedWallet, setSelectedWallet] = useState<IWalletAdapter | null>(null);

  const handleSelectWallet = async (walletId: string) => {
    const option = WALLET_OPTIONS.find(opt => opt.id === walletId);
    if (!option) return;

    const wallet = new option.adapter();
    if (!wallet.isAvailable()) {
      alert(`${option.name} is not available`);
      return;
    }

    try {
      await wallet.connect('testnet');
      setSelectedWallet(wallet);
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  return (
    <div>
      <h3>Select a wallet</h3>
      {WALLET_OPTIONS.map(option => (
        <button key={option.id} onClick={() => handleSelectWallet(option.id)}>
          {option.name}
        </button>
      ))}
      {selectedWallet && (
        <p>Connected to: {selectedWallet.name}</p>
      )}
    </div>
  );
}
*/
// ── Example 11: Typed SDK Errors & Diagnostic Context ──────────────────────

import {
  WalletRejectionError,
  RpcTimeoutError,
  InvalidResponseError,
  ZkPayrollError,
  toUserFriendlyError,
} from "../../src/errors";

async function handleTypedErrorsExample() {
  const wallet = new FreighterAdapter();

  try {
    await wallet.connect("testnet");
    await wallet.signTransaction("AAAA...");
  } catch (error) {
    if (error instanceof WalletRejectionError) {
      console.error("User explicitly declined wallet operation.");
      console.error("Wallet ID:", error.walletId);
      console.error("Error code:", error.code); // e.g. WALLET_SIGNING_REJECTED
      console.error("Original cause:", error.cause);
    } else if (error instanceof RpcTimeoutError) {
      console.error("RPC node timed out:", error.message);
      console.error("Request ID for correlation:", error.context?.requestId);
      console.error("Underlying cause:", error.cause);
    } else if (error instanceof InvalidResponseError) {
      console.error("RPC returned malformed response:", error.message);
      console.error("Context:", error.context);
    } else if (error instanceof WalletError) {
      console.error("General wallet error:", error.code, error.message);
    } else if (error instanceof ZkPayrollError) {
      console.error("Base SDK error:", error.code, error.message, error.cause);
    }

    // Human-readable string for UI display:
    const friendly = toUserFriendlyError(error);
    console.log("UI Toast Message:", friendly.friendlyMessage);
    console.log("Error Code:", friendly.code);
    console.log("Context:", friendly.context);
  }
}
