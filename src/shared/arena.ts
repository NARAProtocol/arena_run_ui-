import { formatEther, formatUnits, isAddress, parseEther, parseUnits } from "viem";

export const LIVE_ARENA_ADDRESS = "0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b" as const;
export const NARA_TOKEN_ADDRESS = "0xE444de61752bD13D1D37Ee59c31ef4e489bd727C" as const;

export const naraTokenAbi = [
  { type: "function", stateMutability: "view", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

export const ARENA_ADDRESS = import.meta.env.VITE_ARENA_ADDRESS && isAddress(import.meta.env.VITE_ARENA_ADDRESS)
  ? import.meta.env.VITE_ARENA_ADDRESS
  : LIVE_ARENA_ADDRESS;

const rawSnapshotUrl = import.meta.env.VITE_ARENA_SNAPSHOT_URL?.trim();
const defaultSnapshotUrl = `${import.meta.env.BASE_URL}arena-leaderboard.snapshot.json`;

export const SNAPSHOT_URL = !rawSnapshotUrl || rawSnapshotUrl === "/arena-leaderboard.snapshot.json"
  ? defaultSnapshotUrl
  : rawSnapshotUrl;
export const BOARD_API_URL = import.meta.env.VITE_BOARD_API_URL || "https://www.naraprotocol.io/mine/api/board";

export const MIN_MOVE_BURN = parseUnits("2", 18);
export const MAX_MOVE_BURN = parseUnits("30", 18);
export const MIN_SABOTAGE_BURN = parseUnits("10", 18);
export const MAX_SABOTAGE_BURN = parseUnits("30", 18);
export const MIN_SPONSOR_DEPOSIT = parseUnits("1000", 18);
export const MAX_SPONSOR_DEPOSIT = parseUnits("10000", 18);
export const MIN_SPONSOR_DURATION = 96n;

export const ACTION_PRESETS = {
  move: [
    { label: "Dash", amount: MIN_MOVE_BURN },
    { label: "Charge", amount: parseUnits("10", 18) },
    { label: "All-In", amount: MAX_MOVE_BURN },
  ],
  sabotage: [
    { label: "Shove", amount: MIN_SABOTAGE_BURN },
    { label: "Wreck", amount: MAX_SABOTAGE_BURN },
  ],
};

export const DEFAULT_SPONSOR_AMOUNT = MIN_SPONSOR_DEPOSIT;
export const DEFAULT_SPONSOR_DURATION = MIN_SPONSOR_DURATION;

export const arenaAbi = [
  { type: "function", name: "currentEntryFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "previewPrizeTotals", stateMutability: "view", inputs: [], outputs: [{ type: "uint256", name: "harvestedEth" }, { type: "uint256", name: "harvestedNara" }, { type: "uint256", name: "unharvestedEth" }, { type: "uint256", name: "unharvestedNara" }, { type: "uint256", name: "headlineEth" }, { type: "uint256", name: "headlineNara" }, { type: "uint256", name: "harvestableSponsors" }] },
  { type: "function", name: "pendingRewardEth", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sponsorCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "activeRunnerCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentOverdriveWindow", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }, { type: "uint64" }] },
  { type: "function", name: "nextCullTime", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "nextEpochTime", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "lockAccountImplementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalSponsorPrincipalLocked", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "burnRank", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint8" }] },
  { type: "function", name: "runners", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256", name: "positionWad" }, { type: "uint64", name: "joinedAt" }, { type: "uint64", name: "lastActionTime" }, { type: "uint64", name: "lastAttackTime" }, { type: "uint32", name: "recentAttacks" }, { type: "uint32", name: "heatStreak" }, { type: "uint256", name: "totalNaraBurned" }, { type: "uint256", name: "pendingEth" }, { type: "uint256", name: "pendingNara" }, { type: "bool", name: "active" }, { type: "uint32", name: "indexPlusOne" }] },
  { type: "function", name: "arena", stateMutability: "view", inputs: [], outputs: [{ type: "uint64", name: "genesisTime" }, { type: "uint64", name: "lastCullTime" }, { type: "uint64", name: "epochStartTime" }, { type: "uint64", name: "currentEpoch" }, { type: "uint256", name: "prizePoolEth" }, { type: "uint256", name: "prizePoolNara" }, { type: "uint256", name: "totalNaraBurned" }, { type: "uint256", name: "totalEntriesWei" }, { type: "uint256", name: "totalRewardsForwardedEth" }, { type: "uint256", name: "totalPrizesAllocatedEth" }, { type: "uint256", name: "totalPrizesAllocatedNara" }, { type: "uint256", name: "totalClaimedEth" }, { type: "uint256", name: "totalClaimedNara" }] },
  { type: "function", name: "engine", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "join", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "move", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "naraToBurn" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sabotage", stateMutability: "nonpayable", inputs: [{ type: "address", name: "target" }, { type: "uint256", name: "naraToBurn" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "sponsorDeposit", stateMutability: "payable", inputs: [{ type: "uint256", name: "amount" }, { type: "uint64", name: "durationEpochs" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "flushRewardEth", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "event", name: "Joined", inputs: [{ indexed: true, name: "runner", type: "address" }, { indexed: false, name: "entryFeeWei", type: "uint256" }], anonymous: false },
  { type: "event", name: "Forward", inputs: [{ indexed: true, name: "runner", type: "address" }, { indexed: false, name: "naraBurned", type: "uint256" }, { indexed: false, name: "distanceMoved", type: "uint256" }, { indexed: false, name: "newPosition", type: "uint256" }, { indexed: false, name: "heatStreak", type: "uint256" }], anonymous: false },
  { type: "event", name: "Sabotage", inputs: [{ indexed: true, name: "attacker", type: "address" }, { indexed: true, name: "target", type: "address" }, { indexed: false, name: "naraBurned", type: "uint256" }, { indexed: false, name: "distancePushed", type: "uint256" }, { indexed: false, name: "targetNewPosition", type: "uint256" }, { indexed: false, name: "attackerHeatStreak", type: "uint256" }], anonymous: false },
  { type: "event", name: "Culled", inputs: [{ indexed: true, name: "epoch", type: "uint64" }, { indexed: true, name: "runner", type: "address" }, { indexed: false, name: "positionAtCull", type: "uint256" }], anonymous: false },
  { type: "event", name: "EpochSettled", inputs: [{ indexed: true, name: "epoch", type: "uint64" }, { indexed: false, name: "distributedEth", type: "uint256" }, { indexed: false, name: "distributedNara", type: "uint256" }, { indexed: false, name: "winner", type: "address" }, { indexed: false, name: "winnerAmountEth", type: "uint256" }, { indexed: false, name: "winnerAmountNara", type: "uint256" }, { indexed: false, name: "topFiveAmountEth", type: "uint256" }, { indexed: false, name: "topFiveAmountNara", type: "uint256" }], anonymous: false },
] as const;

export type FeedItem = {
  id: string;
  label: string;
  meta: string;
  type: "join" | "move" | "sabotage" | "epoch";
};

export type SnapshotEntry = {
  player: string;
  burnRank: number;
  lifetimeBurned: string;
  lifetimeWins: string;
  lifetimeEpochTop5: string;
  lifetimeCullSurvivals: string;
};

export type SnapshotData = {
  generatedAt: string;
  leaderboards: {
    topLifetimeBurners: SnapshotEntry[];
    topWinners: SnapshotEntry[];
    topTop5: SnapshotEntry[];
    topCullSurvivors: SnapshotEntry[];
  };
};

export const TRACK_LENGTH = 100;

export function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "-";
}

export function progressPercent(position: bigint) {
  const units = Number(position) / 1e18;
  if (!Number.isFinite(units) || units <= 0) return 0;
  return Math.max(0, Math.min((units / TRACK_LENGTH) * 100, 100));
}

export function trackMeter(position: bigint) {
  const units = Number(position) / 1e18;
  if (!Number.isFinite(units) || units <= 0) return "0.0 / 100";
  return `${units.toFixed(1)} / ${TRACK_LENGTH}`;
}

export function formatToken(value?: bigint | null, digits = 2) {
  if (value === undefined || value === null) return "-";
  return Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(formatUnits(value, 18)));
}

export function formatTokenInputValue(value?: bigint | null) {
  if (value === undefined || value === null) return "";
  return formatUnits(value, 18);
}

export function formatEthValue(value?: bigint | null, digits = 4) {
  if (value === undefined || value === null) return "-";
  return Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(formatEther(value)));
}

export function formatClock(unixSeconds?: bigint | number | null) {
  if (!unixSeconds) return "-";
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
}

export function formatCountdown(unixSeconds?: bigint | number | null) {
  if (!unixSeconds) return "-";
  const delta = Number(unixSeconds) * 1000 - Date.now();
  if (delta <= 0) return "ready";
  const totalSeconds = Math.floor(delta / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatUsd(usd: number | null): string | null {
  if (usd == null || !Number.isFinite(usd)) return null;
  const abs = Math.abs(usd);
  const maximumFractionDigits = abs === 0 ? 2 : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 2 : 3;
  const minimumFractionDigits = Math.min(2, maximumFractionDigits);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(usd);
}

export function naraToUsd(amount: bigint, priceUsd: number | null): string | null {
  if (priceUsd == null) return null;
  return formatUsd((Number(amount) / 1e18) * priceUsd);
}

export function ethToUsd(amount: bigint, priceUsd: number | null): string | null {
  if (priceUsd == null) return null;
  return formatUsd((Number(amount) / 1e18) * priceUsd);
}

export function parseSponsorAmount(value: string) {
  return parseUnits((value || "0").trim(), 18);
}

export function parseTargetValue(value: string) {
  return isAddress(value) ? value : undefined;
}

export function formatUsdishLabel(value: bigint | undefined, symbol: string) {
  return `${symbol} ${symbol === "ETH" ? formatEthValue(value) : formatToken(value)}`;
}

export function formatEntryLabel(value: bigint | undefined) {
  return value ? `${formatEthValue(value)} ETH` : "-";
}

export function formatSponsorDuration(value: bigint) {
  return `${value.toString()} epochs`;
}

export function zeroAddressFallback(value?: string) {
  return value && isAddress(value) ? value : undefined;
}

export function parseSponsorDuration(value: string) {
  const trimmed = value.trim();
  return BigInt(trimmed || DEFAULT_SPONSOR_DURATION.toString());
}

export function sponsorDefaultValue() {
  return formatUnits(DEFAULT_SPONSOR_AMOUNT, 18);
}

export function sponsorLockValue() {
  return parseEther("0");
}
