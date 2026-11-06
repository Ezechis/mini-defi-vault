"use client";

import { BrowserProvider, JsonRpcSigner } from "ethers";

/**
 * Chain the dApp talks to. Defaults to Sepolia (11155111).
 * Set NEXT_PUBLIC_CHAIN_ID=31337 and NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
 * to run against a local Anvil node instead.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
export const IS_SEPOLIA = CHAIN_ID === 11155111;
export const CHAIN_NAME = IS_SEPOLIA ? "Sepolia" : `Local chain ${CHAIN_ID}`;
export const EXPLORER_URL = IS_SEPOLIA ? "https://sepolia.etherscan.io" : null;

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (IS_SEPOLIA ? "https://rpc.sepolia.org" : "http://127.0.0.1:8545");

// MetaMask error code for "this chain has not been added to the wallet".
const UNRECOGNIZED_CHAIN = 4902;

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/** The injected wallet (MetaMask). Throws a readable error if it is missing. */
export function getInjectedWallet(): Eip1193Provider {
  if (typeof window === "undefined") {
    throw new Error("Window is not available");
  }
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Install it from metamask.io and reload.");
  }
  return window.ethereum;
}

export function getProvider(): BrowserProvider {
  return new BrowserProvider(getInjectedWallet());
}

/** Make sure the wallet is on the vault's chain, adding the chain if needed. */
export async function ensureCorrectChain(): Promise<void> {
  const wallet = getInjectedWallet();
  const current = (await wallet.request({ method: "eth_chainId" })) as string;
  if (parseInt(current, 16) === CHAIN_ID) return;

  try {
    await wallet.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err) {
    if ((err as { code?: number }).code !== UNRECOGNIZED_CHAIN) throw err;
    await wallet.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_ID_HEX,
          chainName: CHAIN_NAME,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: EXPLORER_URL ? [EXPLORER_URL] : [],
        },
      ],
    });
  }
}

/** Prompt MetaMask, switch to the right chain, and return the connected address. */
export async function connectWallet(): Promise<string> {
  const wallet = getInjectedWallet();
  const accounts = (await wallet.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error("Wallet not connected");
  }
  await ensureCorrectChain();
  return accounts[0];
}

export async function getSigner(): Promise<JsonRpcSigner> {
  const provider = getProvider();
  const accounts = (await provider.send("eth_accounts", [])) as string[];
  if (accounts.length === 0) {
    throw new Error("Wallet not connected");
  }
  return provider.getSigner();
}

/** Turn wallet/ethers errors into one short sentence for the UI. */
export function readableError(err: unknown): string {
  const e = err as {
    code?: number | string;
    shortMessage?: string;
    reason?: string;
    message?: string;
  };
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED") {
    return "You rejected the request in your wallet.";
  }
  if (e?.reason) return e.reason;
  if (e?.shortMessage) return e.shortMessage;
  return e?.message ?? "Something went wrong.";
}
