export const APP_CHAIN_ID = 8453;
export const APP_CHAIN_NAME = "Base";

const ZERO_PROJECT_ID = "00000000000000000000000000000000";
const rawWalletProjectId = (
  import.meta.env.VITE_RAINBOW_PROJECT_ID ||
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  ""
).trim();

export const WALLET_PROJECT_ID =
  !rawWalletProjectId ||
  rawWalletProjectId === ZERO_PROJECT_ID ||
  rawWalletProjectId === "your_project_id"
    ? ""
    : rawWalletProjectId;

export const WALLETCONNECT_CONFIGURED = WALLET_PROJECT_ID.length > 0;
