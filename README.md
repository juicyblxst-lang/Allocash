# Allocash

Allocash is a non-custodial financial self-control system for BSC Testnet. Incoming native BNB is placed into an on-chain protected pre-vault, where each payment becomes its own allocation cycle. Users create immutable allocation presets, explicitly confirm allocations, and authorize every financial action through an ERC-4337 smart account.

## Architecture

- **Smart account:** OpenZeppelin Contracts v5.4 `Account` + `SignerECDSA`, using the canonical ERC-4337 EntryPoint v0.8. The account exposes only a vault execution path; it does not expose arbitrary calls.
- **Vault:** `SelfControlVault` is the financial security authority. It owns payment state, immutable presets, allocation records, locks, temporary lock cycles, and withdrawals.
- **Deterministic logic:** percentages are validated and allocations are calculated with integer arithmetic and deterministic remainder assignment.
- **Database:** application metadata, notification state and indexing state only. No private keys or seed phrases.
- **AI:** suggestion/memory layer only. It cannot sign, execute, change presets, unlock, or withdraw.
- **Frontend:** React + TypeScript + wagmi/viem, with explicit application confirmation before wallet authorization.

## Security model

Locked balances live in the vault, not the application database. The smart account can only invoke the configured vault. The vault checks lock timestamps, payment-cycle state, container ownership and authorization before releasing funds. There is no upgrade mechanism in V1 and no backend/admin withdrawal path.

ERC-4337 provides account-level signature validation and nonce/replay protection. The account implementation is deliberately constrained to vault execution rather than exposing a general-purpose arbitrary-call executor.

## Testnet only

V1 is intentionally limited to BSC Testnet (chain ID 97). Never use production funds. BSC's official documentation lists BSC Testnet as chain 97 and provides official testnet RPC endpoints and a tBNB faucet. Production deployment is not implied by a successful testnet build.

## Temporary lock cycle

A temporary allocation lock lasts one hour on-chain. Once it expires, the payment becomes decision-pending again. The application records reminder events at +5 and +10 minutes. At +15 minutes, anyone may call the permissionless `autoTemporaryRelock` function, which deterministically starts another one-hour temporary lock. This means the safety transition does not depend on the web application remaining open.

## Development

Requirements: Node 22+, Foundry, pnpm.

```bash
pnpm install
pnpm contracts:test
pnpm build
```

Contract dependencies are pinned to OpenZeppelin Contracts v5.4.0 and the ERC-4337 v0.8 EntryPoint is used through OpenZeppelin's canonical account implementation.

## Environment

Copy `.env.example` and supply deployment-specific values only outside Git. Never commit private keys, seed phrases, VAPID private keys, database credentials, or production RPC credentials.

Required values after coding is complete: `VITE_FACTORY_ADDRESS` (deployed factory), `VITE_API_URL`, `VITE_VAPID_PUBLIC_KEY` for browser push, `DATABASE_URL`, `RPC_URL`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. The external relock worker additionally needs `RELOCK_RELAYER_PRIVATE_KEY` and `ALLOCASH_VAULT_ADDRESSES`. The scheduled GitHub Actions relock workflow uses repository secrets `ALLOCASH_RPC_URL`, `ALLOCASH_RELOCK_RELAYER_PRIVATE_KEY`, and `ALLOCASH_VAULT_ADDRESSES`.

## Deployment order

1. Install dependencies and run CI locally/through GitHub Actions.
2. Deploy `SelfControlWalletFactory` to BSC Testnet and record the factory address.
3. Apply the Prisma baseline migration with `prisma migrate deploy` against the target PostgreSQL database.
4. Configure backend RPC/database/Web Push values and start the backend so the on-chain indexer can catch up.
5. Configure the frontend with the factory address and backend URL.
6. Configure the external permissionless relock worker and its narrowly funded relayer account if automatic scheduling is desired. The relayer cannot unlock or withdraw funds; it can only call the permissionless relock function.
7. Deploy the frontend and backend. Do not use production funds; V1 is BSC Testnet only.

## Testing strategy

Contract tests cover preset immutability, percentage invariants, maximum container count, per-payment separation, temporary locks, unlock authorization, locked-fund withdrawal rejection, unauthorized access, replay/nonce behavior at the account layer, and boundary conditions. Frontend tests cover deterministic allocation and validation. CI compiles/tests contracts, type-checks and builds the frontend/backend.

## Known limitations

- V1 supports native BNB on BSC Testnet as the financial asset. ERC-20 support is intentionally not enabled until token-specific accounting and malicious-token handling have been audited.
- Web Push requires browser permission and valid VAPID configuration; in-app notifications remain available when push delivery is unavailable.
- A production deployment requires an independent smart-contract security review and operational hardening. This repository does not claim the contracts are unhackable or 100% secure.
