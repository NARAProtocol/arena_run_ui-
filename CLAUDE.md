# NARA Arena AI Context

Last updated: 2026-04-09.
This folder is the active frontend app for `/arena`.

## Project Identity

- App slug: `nara-arena`
- Visible app name: `NARA Arena`
- Deploy target: `vercel`
- Public route: `/arena`
- GitHub repo: `https://github.com/NARAProtocol/arena_run_ui-.git`

## Runtime Baseline

- Node `20.19.0+`
- `npm` with committed `package-lock.json`

## Wallet Stack

- `@rainbow-me/rainbowkit@2.2.10`
- `wagmi@2.19.5`
- `@wagmi/core@2.22.1`
- `@wagmi/connectors@6.2.0`
- `viem@2.47.6`
- `react@19.2.4`
- `vite@5.4.21`

## Guardrails

- Do not upgrade `wagmi` or `RainbowKit` casually. Verify peer compatibility first.
- Keep `package-lock.json` committed after every dependency change.
- Keep wallet connect generic and reusable. App-specific contract logic belongs in `src/shared/` or feature modules.
- If MetaMask fails, first compare `package.json`, `package-lock.json`, and the `main.tsx` wallet bootstrap against this starter.
- If the app depends on NARA engine epochs, always read both `currentEpoch` and `epochState` before enabling join or lock actions.
- Compute backlog as `max(0, currentEpoch - epochState.epoch)` and show a sync CTA when backlog is above zero.
- Do not rely on the wallet warning to discover stale epoch reverts. Block the action in the UI first.
- Map `epochstale`, `failed_would_revert`, and `would revert` to explicit sync copy.

## Release Checklist

- local or CI Node version is `20.19.0+`
- `.env` has a valid WalletConnect project ID
- `README.md` matches the real route and repo
- `index.html`, `robots.txt`, and `sitemap.xml` match the production URL
- contract addresses and chain IDs are correct
- for epoch-based contracts, `currentEpoch` vs `epochState` backlog handling exists
- stale actions are blocked while engine backlog is above zero
- sync and retry copy exists for stale epoch errors
- `npm test` passes
- `npm run build` passes


## Vercel Deploy Rule

- If Vercel Git deploys are blocked on the private Hobby workspace, use the documented owner-token deploy path instead of debugging app code first.
- The permanent production path is GitHub Actions with `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.
- Treat blocked Vercel Git deployments as a workspace permission issue, not a frontend regression.
