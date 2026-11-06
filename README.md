# Mini DeFi Vault

A full-stack decentralized application for saving Sepolia ETH. A user connects MetaMask,
deposits ETH into their own vault balance, and withdraws it back.

- **Smart contract:** Solidity + Foundry (`contracts/`)
- **Frontend:** Next.js (App Router, TypeScript, Tailwind CSS) + ethers.js v6
- **Wallet:** MetaMask
- **Network:** Ethereum Sepolia testnet (chain id `11155111`)

```
mini-defi-vault/
├── app/                 # Next.js pages (page.tsx = the vault UI)
├── hooks/useVault.ts    # wallet + contract state, deposit/withdraw actions
├── lib/web3.ts          # MetaMask provider, signer, connect + switch to Sepolia
├── lib/contract.ts      # Vault ABI + contract factory
└── contracts/           # Foundry project
    ├── src/Vault.sol
    ├── test/Vault.t.sol
    └── script/Deploy.s.sol
```

## The contract

| Function | What it does |
|---|---|
| `deposit()` payable | Adds `msg.value` to the caller's balance. Reverts `"Send ETH"` on 0. Emits `Deposited`. |
| `withdraw()` | Sends the caller's **entire** balance back. Reverts `"Nothing to withdraw"` on 0. Emits `Withdrawn`. |
| `getBalance(address)` | A user's vault balance. |
| `contractBalance()` | Total ETH held by the vault. |

`withdraw()` follows checks-effects-interactions: the balance is set to 0 **before** ETH is sent
with `call` (not `transfer`, which forwards a fixed 2300 gas and can break with smart-contract wallets).
The test suite includes a re-entrancy attacker that proves another user's funds cannot be drained.

## Prerequisites

- Node.js 20+ (`nvm use 22`)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `anvil`, `cast`)
- MetaMask with some Sepolia ETH (from a faucet, e.g. Google Cloud Web3 or Alchemy Sepolia faucet)

## 1. Contract: build and test

```bash
cd contracts
forge build
forge test -vvv
```

17 tests: deployment, deposits (single, multiple, multi-user, zero, event), withdrawals
(full, without deposit, twice, balance reset, event, rejecting recipient, re-entrancy),
contract balance, and a fuzz test.

## 2. Contract: deploy to Sepolia

Create `contracts/.env` (it is git-ignored — **never commit it**). Use a throwaway dev wallet
that only ever holds test ETH:

```
PRIVATE_KEY=0xyour_dev_wallet_private_key
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
ETHERSCAN_API_KEY=optional_for_verification
```

Then:

```bash
cd contracts
source .env
forge script script/Deploy.s.sol:DeployVault --rpc-url $SEPOLIA_RPC_URL --broadcast
# optional: add  --verify --etherscan-api-key $ETHERSCAN_API_KEY
```

Copy the `Vault deployed at: 0x…` address from the output.

## 3. Frontend

Create `.env.local` in the project root:

```
NEXT_PUBLIC_VAULT_ADDRESS=0xYourDeployedVaultAddress
NEXT_PUBLIC_CHAIN_ID=11155111
```

```bash
npm install
npm run dev
```

Open http://localhost:3000, click **Connect Wallet**, approve in MetaMask (the app asks
MetaMask to switch to Sepolia if needed), then deposit and withdraw.

## Run everything locally (no testnet ETH needed)

```bash
anvil                                   # terminal 1: local chain on :8545
cd contracts && PRIVATE_KEY=<anvil account 0 key> \
  forge script script/Deploy.s.sol:DeployVault --rpc-url http://127.0.0.1:8545 --broadcast
```

`.env.local`:

```
NEXT_PUBLIC_VAULT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
```

Import one of anvil's printed test keys into MetaMask and add the network
(RPC `http://127.0.0.1:8545`, chain id `31337`).

## Contributing (team Git flow)

- `main` — production. `develop` — integration. `feature/<name>` — new work.

```bash
git clone <repo-url> && cd mini-defi-vault && npm install
git checkout develop && git pull origin develop
git checkout -b feature/<your-feature>
# ...work, commit...
git push -u origin feature/<your-feature>
```

Open a pull request **into `develop`** (not `main`), share the PR link with your team for review,
and merge after approval. The team lead merges `develop` → `main`, then everyone runs
`git pull origin main` / `git pull origin develop` before branching again.

After your PR is merged, delete the feature branch:

```bash
git checkout develop
git branch -D feature/<your-feature>
git push origin --delete feature/<your-feature>
```
