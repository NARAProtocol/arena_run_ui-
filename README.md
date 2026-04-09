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
VITE_ARENA_ADDRESS=0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b
```

Optional:

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_ARENA_SNAPSHOT_URL=/arena-leaderboard.snapshot.json
VITE_BOARD_API_URL=https://www.naraprotocol.io/mine/api/board
```

## Vercel Notes

- The app is configured to redirect `/` to `/arena`.
- `vercel.json` must be saved as UTF-8 without BOM. A BOM will cause Vercel to reject the file as invalid.
- If Vercel imported an older broken config, remove the failed import and re-import the repo after pulling the latest commit.

## Arena-Specific Notes

- `join()` reverts with `NoPrizeSeeded` until at least one sponsor position has been deposited on-chain.
- Entry ETH is forwarded to `engine.notifyEthRewards()` and prize value comes from harvested sponsor-position rewards.
- Use the committed `package-lock.json` and stick to `npm`.
- GitHub Actions CI runs `npm test` and `npm run build` on pushes and PRs.
