# NARA Arena

Arena UI for the live `BurnRunArenaV2` contract on Base.

## Local

Requires Node `20.19.0+`.

```bash
npm install
npm test
npm run build
npm run dev
```

## Identity

- App slug: `nara-arena`
- Route: `/arena`
- Deploy target: `vercel`
- GitHub repo: `https://github.com/NARAProtocol/arena_run_ui-.git`
- Live contract: `0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b`

## Environment Variables

Required:

```bash
VITE_RAINBOW_PROJECT_ID=your_project_id
```

Recommended override:

```bash
VITE_ARENA_ADDRESS=0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b
```

Optional:

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_ARENA_SNAPSHOT_URL=/arena-leaderboard.snapshot.json
VITE_BOARD_API_URL=https://www.naraprotocol.io/mine/api/board
```

## Address Fallback

- If `VITE_ARENA_ADDRESS` is missing at build time, the app now falls back to the live Base arena address `0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b`.
- Keep the Vercel env set anyway. The fallback exists to stop production builds from silently shipping a disabled sponsor and join surface.

## Vercel Notes

- The app is configured to redirect `/` to `/arena`.
- `vercel.json` must be saved as UTF-8 without BOM. A BOM will cause Vercel to reject the file as invalid.
- If Vercel imported an older broken config, remove the failed import and re-import the repo after pulling the latest commit.

## Permanent Vercel Deploy Path

Do not rely on Vercel's default Git auto-deploy for this repo while it is private and the Vercel workspace stays on Hobby.
That setup can block production deploys based on commit author.

The permanent deploy path is GitHub Actions using the Vercel project owner's token.

Workflow file:

- `.github/workflows/deploy-vercel-production.yml`

Required GitHub repository secrets in `NARAProtocol/arena_run_ui-`:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

One-time setup:

1. In the Vercel dashboard, open the arena project.
2. Copy the `Project ID` and `Team ID` or `Org ID` from project settings.
3. In GitHub `NARAProtocol/arena_run_ui-`, add the three secrets above.
4. Keep the Vercel project env vars set in Vercel as usual.
5. Push to `main` or run the `Deploy Arena To Vercel` workflow manually.

Recommended Vercel setting:

- Disable automatic Git deployments for this project, or ignore blocked Git deployment entries and treat the GitHub Action deployment as the production source of truth.

## Why The Git Deploy Gets Blocked

If a private GitHub repo is connected to a Hobby Vercel workspace, Vercel can block Git-triggered deploys with this message:

- `The Deployment was blocked because the commit author does not have contributing access to the project on Vercel.`

This is not an app code issue.
It is a Vercel collaboration limit.

## Arena-Specific Notes

- `join()` reverts with `NoPrizeSeeded` until at least one sponsor position has been deposited on-chain.
- Entry ETH is forwarded to `engine.notifyEthRewards()` and prize value comes from harvested sponsor-position rewards.
- Use the committed `package-lock.json` and stick to `npm`.
- GitHub Actions CI runs `npm test` and `npm run build` on pushes and PRs.
