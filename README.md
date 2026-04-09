# NARA Arena

Reusable wallet-enabled game app scaffold.

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
- GitHub repo: `https://github.com/NARAProtocol/nara-arena`

## Wallet Env

```bash
VITE_RAINBOW_PROJECT_ID=your_project_id
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

## Notes

- This starter is pinned to a working RainbowKit + wagmi stack.
- Use the committed `package-lock.json` and stick to `npm`.
- Commit `package-lock.json` with every dependency change.
- GitHub Actions CI runs `npm test` and `npm run build` on pushes and PRs.