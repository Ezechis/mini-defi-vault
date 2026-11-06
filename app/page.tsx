"use client";

import { useState } from "react";
import { TxStatus, useVault } from "@/hooks/useVault";
import { VAULT_ADDRESS, isVaultConfigured } from "@/lib/contract";
import { CHAIN_NAME, EXPLORER_URL } from "@/lib/web3";

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatEth(value: string | null) {
  if (value === null) return "—";
  const n = Number(value);
  return n === 0 ? "0" : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function Stat({ label, value, testId }: { label: string; value: string | null; testId: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-1 font-mono text-2xl text-zinc-50" data-testid={testId}>
        {formatEth(value)} <span className="text-sm text-zinc-400">ETH</span>
      </p>
    </div>
  );
}

function StatusBanner({ status }: { status: TxStatus }) {
  if (status.kind === "idle") return null;
  const tone = {
    pending: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    error: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  }[status.kind];
  const txHash = "txHash" in status ? status.txHash : undefined;

  return (
    <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${tone}`} data-testid="status">
      <p>{status.message}</p>
      {txHash && (
        <p className="mt-1 break-all font-mono text-xs opacity-80">
          {EXPLORER_URL ? (
            <a className="underline" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
              View on Etherscan: {shorten(txHash)}
            </a>
          ) : (
            <>Tx: {txHash}</>
          )}
        </p>
      )}
    </div>
  );
}

const button =
  "rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

export default function Home() {
  const vault = useVault();
  const [amount, setAmount] = useState("");

  const ready = Boolean(vault.account) && vault.onCorrectChain && isVaultConfigured();

  async function onDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (await vault.deposit(amount)) setAmount("");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="w-full max-w-lg space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mini DeFi Vault</h1>
            <p className="text-sm text-zinc-400">Save and withdraw {CHAIN_NAME} ETH.</p>
          </div>
          {vault.account ? (
            <button
              onClick={vault.disconnect}
              className={`${button} border border-white/15 font-mono text-zinc-200 hover:bg-white/5`}
              title="Forget this account in the app"
              data-testid="account"
            >
              {shorten(vault.account)}
            </button>
          ) : (
            <button
              onClick={vault.connect}
              disabled={vault.busy}
              className={`${button} bg-indigo-500 text-white hover:bg-indigo-400`}
            >
              Connect Wallet
            </button>
          )}
        </header>

        {!isVaultConfigured() && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            No vault address configured. Set <code>NEXT_PUBLIC_VAULT_ADDRESS</code> in{" "}
            <code>.env.local</code> and restart <code>npm run dev</code>.
          </p>
        )}

        {vault.account && !vault.onCorrectChain && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            <span>Your wallet is on the wrong network.</span>
            <button onClick={vault.switchChain} className={`${button} bg-amber-400 text-zinc-950 hover:bg-amber-300`}>
              Switch to {CHAIN_NAME}
            </button>
          </div>
        )}

        {!vault.account ? (
          <section className="rounded-2xl border border-white/10 bg-zinc-900 p-8 text-center">
            <p className="text-zinc-300">Connect MetaMask to see your vault.</p>
            {!vault.hasWallet && (
              <p className="mt-2 text-sm text-zinc-500">
                No wallet detected —{" "}
                <a className="underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                  install MetaMask
                </a>
                .
              </p>
            )}
          </section>
        ) : (
          <section className="space-y-5 rounded-2xl border border-white/10 bg-zinc-900 p-6">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Your vault balance" value={vault.vaultBalance} testId="vault-balance" />
              <Stat label="Wallet balance" value={vault.walletBalance} testId="wallet-balance" />
            </div>

            <form onSubmit={onDeposit} className="space-y-2">
              <label htmlFor="amount" className="text-sm text-zinc-400">
                Deposit amount
              </label>
              <div className="flex gap-2">
                <input
                  id="amount"
                  inputMode="decimal"
                  placeholder="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!ready || vault.busy}
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-zinc-950 px-3 py-2.5 font-mono text-zinc-50 outline-none focus:border-indigo-400"
                />
                <button
                  type="submit"
                  disabled={!ready || vault.busy}
                  className={`${button} bg-indigo-500 text-white hover:bg-indigo-400`}
                >
                  Deposit
                </button>
              </div>
            </form>

            <button
              onClick={vault.withdraw}
              disabled={!ready || vault.busy || !vault.vaultBalance || Number(vault.vaultBalance) === 0}
              className={`${button} w-full border border-white/15 text-zinc-100 hover:bg-white/5`}
            >
              Withdraw all ({formatEth(vault.vaultBalance)} ETH)
            </button>
          </section>
        )}

        <StatusBanner status={vault.status} />

        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>
            Total in vault:{" "}
            <span className="font-mono text-zinc-300" data-testid="total-locked">
              {formatEth(vault.totalLocked)} ETH
            </span>
          </span>
          {isVaultConfigured() &&
            (EXPLORER_URL ? (
              <a className="font-mono underline" href={`${EXPLORER_URL}/address/${VAULT_ADDRESS}`} target="_blank" rel="noreferrer">
                Contract {shorten(VAULT_ADDRESS)}
              </a>
            ) : (
              <span className="font-mono">Contract {shorten(VAULT_ADDRESS)}</span>
            ))}
        </footer>
      </div>
    </main>
  );
}
