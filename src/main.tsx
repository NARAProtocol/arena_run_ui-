import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { base } from "wagmi/chains";

import App from "./app";
import { WALLET_PROJECT_ID, WALLETCONNECT_CONFIGURED } from "./shared/wallet";

import "@rainbow-me/rainbowkit/styles.css";
import "./styles.css";

const baseRpcUrl = import.meta.env.VITE_BASE_RPC_URL || undefined;

const config = WALLETCONNECT_CONFIGURED
  ? getDefaultConfig({
      appName: "NARA Arena",
      projectId: WALLET_PROJECT_ID,
      chains: [base],
      transports: {
        [base.id]: http(baseRpcUrl, { batch: { batchSize: 20, wait: 50 } }),
      },
      pollingInterval: 30_000,
    })
  : createConfig({
      chains: [base],
      connectors: [injected()],
      transports: {
        [base.id]: http(baseRpcUrl, { batch: { batchSize: 20, wait: 50 } }),
      },
      pollingInterval: 30_000,
    });

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);