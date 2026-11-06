"use client";

import { Contract, ContractRunner, isAddress } from "ethers";

/** Address printed by `forge script script/Deploy.s.sol ... --broadcast`. */
export const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "";

/** Human-readable ABI for contracts/src/Vault.sol. Keep in sync with the contract. */
export const VAULT_ABI = [
  "function deposit() payable",
  "function withdraw()",
  "function getBalance(address user) view returns (uint256)",
  "function contractBalance() view returns (uint256)",
  "function balances(address) view returns (uint256)",
  "event Deposited(address indexed user, uint256 amount)",
  "event Withdrawn(address indexed user, uint256 amount)",
] as const;

export function isVaultConfigured(): boolean {
  return isAddress(VAULT_ADDRESS);
}

export function getVaultContract(runner: ContractRunner): Contract {
  if (!isVaultConfigured()) {
    throw new Error(
      "Vault address is not set. Put NEXT_PUBLIC_VAULT_ADDRESS in .env.local and restart the dev server.",
    );
  }
  return new Contract(VAULT_ADDRESS, VAULT_ABI, runner);
}
