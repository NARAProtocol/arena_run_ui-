/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARENA_ADDRESS?: string;
  readonly VITE_ARENA_SNAPSHOT_URL?: string;
  readonly VITE_BASE_RPC_URL?: string;
  readonly VITE_BOARD_API_URL?: string;
  readonly VITE_ETH_PRICE_USD?: string;
  readonly VITE_NARA_PRICE_USD?: string;
  readonly VITE_RAINBOW_PROJECT_ID?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}