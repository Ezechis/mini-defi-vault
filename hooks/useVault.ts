"use client";

import { formatEther, parseEther } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";
import { getVaultContract, isVaultConfigured } from "@/lib/contract";
import {
  CHAIN_ID,
  connectWallet,
  ensureCorrectChain,
  getProvider,
  getSigner,
  readableError,
} from "@/lib/web3";

export type TxStatus =
  | { kind: "idle" }
  | { kind: "pending"; message: string; txHash?: string }
  | { kind: "success"; message: string; txHash?: string }
  | { kind: "error"; message: string };

export type VaultState = {
  hasWallet: boolean;
  account: string | null;
  onCorrectChain: boolean;
  walletBalance: string | null;
  vaultBalance: string | null;
  totalLocked: string | null;
  status: TxStatus;
  busy: boolean;
};

const INITIAL: VaultState = {
  hasWallet: false,
  account: null,
  onCorrectChain: true,
  walletBalance: null,
  vaultBalance: null,
  totalLocked: null,
  status: { kind: "idle" },
  busy: false,
};

/** Validate a user-typed ETH amount. Returns wei, or an error message. */
export function parseDepositAmount(
  input: string,
  walletBalanceEth: string | null,
): { wei: bigint } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Enter an amount to deposit." };
  if (!/^\d*\.?\d+$/.test(trimmed)) return { error: "Amount must be a positive number." };

  let wei: bigint;
  try {
    wei = parseEther(trimmed);
  } catch {
    return { error: "Amount has too many decimal places (max 18)." };
  }
  if (wei <= BigInt(0)) return { error: "Amount must be greater than 0." };
  if (walletBalanceEth !== null && wei > parseEther(walletBalanceEth)) {
    return { error: "Amount is more than your wallet balance." };
  }
  return { wei };
}

export function useVault() {
  const [state, setState] = useState<VaultState>(INITIAL);
  const accountRef = useRef<string | null>(null);
  useEffect(() => {
    accountRef.current = state.account;
  }, [state.account]);

  const patch = useCallback(
    (next: Partial<VaultState>) => setState((prev) => ({ ...prev, ...next })),
    [],
  );

  const refresh = useCallback(
    async (account: string | null) => {
      if (!account) return;
      try {
        const provider = getProvider();
        const network = await provider.getNetwork();
        const onCorrectChain = Number(network.chainId) === CHAIN_ID;
        const walletWei = await provider.getBalance(account);

        if (!onCorrectChain || !isVaultConfigured()) {
          patch({
            onCorrectChain,
            walletBalance: formatEther(walletWei),
            vaultBalance: null,
            totalLocked: null,
          });
          return;
        }

        const vault = getVaultContract(provider);
        const [mine, total] = await Promise.all([
          vault.getBalance(account) as Promise<bigint>,
          vault.contractBalance() as Promise<bigint>,
        ]);
        patch({
          onCorrectChain,
          walletBalance: formatEther(walletWei),
          vaultBalance: formatEther(mine),
          totalLocked: formatEther(total),
        });
      } catch (err) {
        patch({ status: { kind: "error", message: readableError(err) } });
      }
    },
    [patch],
  );

  // Silent reconnect + wallet event listeners.
  useEffect(() => {
    const wallet = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!wallet) return;
    patch({ hasWallet: true });

    wallet
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const first = (accounts as string[])[0] ?? null;
        patch({ account: first });
        return refresh(first);
      })
      .catch(() => undefined);

    const onAccounts = (...args: unknown[]) => {
      const first = (args[0] as string[])[0] ?? null;
      setState((prev) => ({
        ...prev,
        account: first,
        vaultBalance: null,
        walletBalance: null,
        status: { kind: "idle" },
      }));
      void refresh(first);
    };
    const onChain = () => {
      void refresh(accountRef.current);
    };

    wallet.on?.("accountsChanged", onAccounts);
    wallet.on?.("chainChanged", onChain);
    return () => {
      wallet.removeListener?.("accountsChanged", onAccounts);
      wallet.removeListener?.("chainChanged", onChain);
    };
  }, [patch, refresh]);

  const connect = useCallback(async () => {
    patch({ busy: true, status: { kind: "pending", message: "Waiting for MetaMask…" } });
    try {
      const account = await connectWallet();
      patch({ account, hasWallet: true, status: { kind: "idle" } });
      await refresh(account);
    } catch (err) {
      patch({ status: { kind: "error", message: readableError(err) } });
    } finally {
      patch({ busy: false });
    }
  }, [patch, refresh]);

  const switchChain = useCallback(async () => {
    try {
      await ensureCorrectChain();
      await refresh(state.account);
    } catch (err) {
      patch({ status: { kind: "error", message: readableError(err) } });
    }
  }, [patch, refresh, state.account]);

  const runTx = useCallback(
    async (label: string, send: () => Promise<{ hash: string; wait: () => Promise<unknown> }>) => {
      patch({ busy: true, status: { kind: "pending", message: "Confirm in MetaMask…" } });
      try {
        const tx = await send();
        patch({ status: { kind: "pending", message: `${label} submitted. Waiting for confirmation…`, txHash: tx.hash } });
        await tx.wait();
        patch({ status: { kind: "success", message: `${label} confirmed.`, txHash: tx.hash } });
        await refresh(state.account);
        return true;
      } catch (err) {
        patch({ status: { kind: "error", message: readableError(err) } });
        return false;
      } finally {
        patch({ busy: false });
      }
    },
    [patch, refresh, state.account],
  );

  const deposit = useCallback(
    async (amount: string): Promise<boolean> => {
      const parsed = parseDepositAmount(amount, state.walletBalance);
      if ("error" in parsed) {
        patch({ status: { kind: "error", message: parsed.error } });
        return false;
      }
      return runTx(`Deposit of ${amount.trim()} ETH`, async () => {
        const vault = getVaultContract(await getSigner());
        return vault.deposit({ value: parsed.wei });
      });
    },
    [patch, runTx, state.walletBalance],
  );

  const withdraw = useCallback(async (): Promise<boolean> => {
    if (!state.vaultBalance || parseEther(state.vaultBalance) === BigInt(0)) {
      patch({ status: { kind: "error", message: "Nothing to withdraw." } });
      return false;
    }
    return runTx(`Withdrawal of ${state.vaultBalance} ETH`, async () => {
      const vault = getVaultContract(await getSigner());
      return vault.withdraw();
    });
  }, [patch, runTx, state.vaultBalance]);

  const disconnect = useCallback(() => {
    // MetaMask has no programmatic disconnect; forget the account locally.
    setState((prev) => ({ ...INITIAL, hasWallet: prev.hasWallet }));
  }, []);

  return { ...state, connect, switchChain, deposit, withdraw, disconnect };
}
