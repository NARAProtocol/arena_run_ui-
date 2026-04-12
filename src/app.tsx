import { ConnectButton } from "@rainbow-me/rainbowkit";
import { type ReactNode, useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { FeedCard } from "./components/FeedCard";
import { IdentityCard } from "./components/IdentityCard";
import { LeaderboardCard } from "./components/LeaderboardCard";
import { LiveCountdown } from "./components/LiveCountdown";
import { PlayControls } from "./components/PlayControls";
import { PrizeClock } from "./components/PrizeClock";
import { RaceTrack } from "./components/RaceTrack";
import { SponsorCard } from "./components/SponsorCard";
import { APP_CHAIN_ID, APP_CHAIN_NAME } from "./shared/wallet";
import {
  ARENA_ADDRESS,
  arenaAbi,
  BOARD_API_URL,
  DEFAULT_SPONSOR_DURATION,
  ethToUsd,
  formatEntryLabel,
  formatEthValue,
  formatToken,
  formatUsd,
  naraToUsd,
  naraTokenAbi,
  NARA_TOKEN_ADDRESS,
  parseSponsorAmount,
  parseSponsorDuration,
  parseTargetValue,
  progressPercent,
  shortAddress,
  SNAPSHOT_URL,
  sponsorDefaultValue,
  trackMeter,
  type FeedItem,
  type SnapshotData,
} from "./shared/arena";

// ─── Types (local to data-fetching layer) ────────────────────────────────────

type BoardClaim = {
  wallet: string;
  slotNum: number;
  tierKey: string;
  alias: string;
};

type BoardResponse = {
  slots: Array<{ claim: BoardClaim | null }>;
};

type ContractReadResult = { status: string; result?: unknown };

// ─── Contract read index ─────────────────────────────────────────────────────

const READ_INDEX = {
  entryFee: 0,
  prizeTotals: 1,
  pendingRewardEth: 2,
  sponsorCount: 3,
  activeRunnerCount: 4,
  overdriveWindow: 5,
  nextCull: 6,
  nextEpoch: 7,
  sponsorTvl: 8,
  arenaState: 9,
  engine: 10,
  runner: 11,
  burnRank: 12,
} as const;

// ─── On-chain events ──────────────────────────────────────────────────────────

const joinedEvent = parseAbiItem("event Joined(address indexed runner, uint256 entryFeeWei)");
const forwardEvent = parseAbiItem("event Forward(address indexed runner, uint256 naraBurned, uint256 distanceMoved, uint256 newPosition, uint256 heatStreak)");
const sabotageEvent = parseAbiItem("event Sabotage(address indexed attacker, address indexed target, uint256 naraBurned, uint256 distancePushed, uint256 targetNewPosition, uint256 attackerHeatStreak)");
const epochSettledEvent = parseAbiItem("event EpochSettled(uint64 indexed epoch, uint256 distributedEth, uint256 distributedNara, address winner, uint256 winnerAmountEth, uint256 winnerAmountNara, uint256 topFiveAmountEth, uint256 topFiveAmountNara)");

// ─── Market prices hook ───────────────────────────────────────────────────────

const NARA_ADDR = "0xe444de61752bd13d1d37ee59c31ef4e489bd727c";
const WETH_ADDR = "0x4200000000000000000000000000000000000006";
const GECKO_TOKEN = (addr: string) => `https://api.geckoterminal.com/api/v2/networks/base/tokens/${addr}`;
const GECKO_POOLS  = (addr: string) => `https://api.geckoterminal.com/api/v2/networks/base/tokens/${addr}/pools?page=1`;

function useMarketPrices(): { nara: number | null; eth: number | null } {
  const [prices, setPrices] = useState<{ nara: number | null; eth: number | null }>({ nara: null, eth: null });
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        // ETH price: token endpoint is reliable for WETH
        const ethData = await fetch(GECKO_TOKEN(WETH_ADDR)).then((r) => r.json());
        const eth = parseFloat(ethData?.data?.attributes?.price_usd);

        // NARA price: token endpoint returns null (thin liquidity) — use pools instead
        // Pick the pool with highest reserve to get the most accurate price
        let nara: number | null = null;
        const poolData = await fetch(GECKO_POOLS(NARA_ADDR)).then((r) => r.json());
        const pools: Array<{ attributes: { base_token_price_usd: string; quote_token_price_usd: string; reserve_in_usd: string }; relationships: { base_token: { data: { id: string } } } }> = poolData?.data ?? [];
        // Sort by reserve descending, take the most liquid pool
        const sorted = [...pools].sort((a, b) =>
          parseFloat(b.attributes?.reserve_in_usd ?? "0") - parseFloat(a.attributes?.reserve_in_usd ?? "0")
        );
        for (const pool of sorted) {
          const isBase = pool.relationships?.base_token?.data?.id?.toLowerCase().includes(NARA_ADDR.toLowerCase());
          const rawPrice = isBase
            ? parseFloat(pool.attributes?.base_token_price_usd)
            : parseFloat(pool.attributes?.quote_token_price_usd);
          if (Number.isFinite(rawPrice) && rawPrice > 0) {
            nara = rawPrice;
            break;
          }
        }

        if (!active) return;
        setPrices({
          nara,
          eth: Number.isFinite(eth) && eth > 0 ? eth : null,
        });
      } catch { /* prices stay null */ }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { active = false; clearInterval(id); };
  }, []);
  return prices;
}

// ─── Small UI components ──────────────────────────────────────────────────────

function WalletStatus() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, authenticationStatus, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");
        if (!ready) return <button className="arena-wallet ghost">Loading...</button>;
        if (!connected) return <button className="arena-wallet" onClick={openConnectModal}>Connect wallet</button>;
        if (chain.unsupported) return <button className="arena-wallet" onClick={openChainModal}>{`Switch to ${APP_CHAIN_NAME}`}</button>;
        return <button className="arena-wallet" onClick={openAccountModal}>{account.displayName}</button>;
      }}
    </ConnectButton.Custom>
  );
}

function StatusStrip({ tone, title, body }: { tone: "warning" | "info" | "success"; title: string; body: string }) {
  const [isNew, setIsNew] = useState(true);
  useEffect(() => {
    setIsNew(true);
    const t = setTimeout(() => setIsNew(false), 500);
    return () => clearTimeout(t);
  }, [title, body]);
  return (
    <section className={`notice-strip ${tone}${isNew && tone === "warning" ? " is-new" : ""}`}>
      <strong>{title}</strong>
      <span>{body}</span>
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  loading,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <article className={`metric-card${className ? ` ${className}` : ""}`}>
      <span>{label}</span>
      {loading ? <strong><span className="skeleton skeleton-wide">&nbsp;</span></strong> : <strong>{value}</strong>}
      {loading ? <small><span className="skeleton skeleton-line">&nbsp;</span></small> : hint ? <small>{hint}</small> : null}
    </article>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeAddress(value?: string) {
  return value?.toLowerCase();
}

function readSuccessResult(results: readonly ContractReadResult[] | undefined, index: number) {
  const item = results?.[index];
  return item?.status === "success" ? item.result : undefined;
}

// ─── Main App (data + state orchestrator) ─────────────────────────────────────

export default function App() {
  const prices = useMarketPrices();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const isWrongNetwork = Boolean(isConnected && chainId !== APP_CHAIN_ID);

  const [target, setTarget] = useState("");
  const [sponsorAmount, setSponsorAmount] = useState(sponsorDefaultValue());
  const [sponsorDuration, setSponsorDuration] = useState(DEFAULT_SPONSOR_DURATION.toString());
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [boardClaim, setBoardClaim] = useState<BoardClaim | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [feedTick, setFeedTick] = useState(0);

  // ── Contract reads ──────────────────────────────────────────────────────────

  const readContracts = ARENA_ADDRESS
    ? [
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "currentEntryFee" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "previewPrizeTotals" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "pendingRewardEth" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "sponsorCount" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "activeRunnerCount" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "currentOverdriveWindow" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "nextCullTime" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "nextEpochTime" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "totalSponsorPrincipalLocked" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "arena" as const },
        { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "engine" as const },
        ...(address
          ? [
              { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "runners" as const, args: [address] },
              { address: ARENA_ADDRESS, abi: arenaAbi, functionName: "burnRank" as const, args: [address] },
            ]
          : []),
      ]
    : [];

  const { data: arenaReads, refetch } = useReadContracts({ allowFailure: true, contracts: readContracts });
  const readResults = arenaReads as readonly ContractReadResult[] | undefined;

  const engineAddress = readSuccessResult(readResults, READ_INDEX.engine) as `0x${string}` | undefined;
  const { data: lockFee } = useReadContract({
    address: engineAddress,
    abi: [{ type: "function", name: "lockFeeWei", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const,
    functionName: "lockFeeWei",
    query: { enabled: Boolean(engineAddress) },
  });

  const { writeContract, writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // ── Derived contract state ──────────────────────────────────────────────────

  const entryFee = readSuccessResult(readResults, READ_INDEX.entryFee) as bigint | undefined;
  const prize = readSuccessResult(readResults, READ_INDEX.prizeTotals) as readonly bigint[] | undefined;
  const pendingRewardEth = (readSuccessResult(readResults, READ_INDEX.pendingRewardEth) as bigint | undefined) ?? 0n;
  const sponsorCount = (readSuccessResult(readResults, READ_INDEX.sponsorCount) as bigint | undefined) ?? 0n;
  const activeRunnerCount = (readSuccessResult(readResults, READ_INDEX.activeRunnerCount) as bigint | undefined) ?? 0n;
  const overdriveWindow = readSuccessResult(readResults, READ_INDEX.overdriveWindow) as readonly bigint[] | undefined;
  const nextCull = readSuccessResult(readResults, READ_INDEX.nextCull) as bigint | undefined;
  const nextEpoch = readSuccessResult(readResults, READ_INDEX.nextEpoch) as bigint | undefined;
  const sponsorTvl = readSuccessResult(readResults, READ_INDEX.sponsorTvl) as bigint | undefined;
  const arenaState = readSuccessResult(readResults, READ_INDEX.arenaState) as readonly bigint[] | undefined;
  const runnerState = address ? (readSuccessResult(readResults, READ_INDEX.runner) as readonly unknown[] | undefined) : undefined;
  const burnRankValue = address ? readSuccessResult(readResults, READ_INDEX.burnRank) : undefined;
  const burnRank = burnRankValue === undefined ? 0 : Number(burnRankValue);

  const harvestedEth = prize?.[0] ?? 0n;
  const harvestedNara = prize?.[1] ?? 0n;
  const unharvestedEth = prize?.[2] ?? 0n;
  const unharvestedNara = prize?.[3] ?? 0n;
  const headlineEth = prize?.[4] ?? 0n;
  const headlineNara = prize?.[5] ?? 0n;
  const harvestableSponsors = prize?.[6] ?? 0n;
  const prizePoolEth = arenaState?.[4] ?? 0n;
  const prizePoolNara = arenaState?.[5] ?? 0n;
  const totalBurned = arenaState?.[6] ?? 0n;
  const totalEntries = arenaState?.[7] ?? 0n;
  const totalRewardsForwarded = arenaState?.[8] ?? 0n;
  const arenaEpoch = arenaState?.[3] ?? 0n;
  const userHeat = runnerState ? Number(runnerState[5]) : 0;
  const userBurned = runnerState ? (runnerState[6] as bigint) : 0n;
  const userPendingEth = runnerState ? (runnerState[7] as bigint) : 0n;
  const userPendingNara = runnerState ? (runnerState[8] as bigint) : 0n;
  const userPosition = runnerState ? (runnerState[0] as bigint) : 0n;
  const userActive = runnerState ? Boolean(runnerState[9]) : false;
  const runnerLaneIndex = runnerState ? Number(runnerState[10] ?? 0) : 0;

  // ── Derived UI state ────────────────────────────────────────────────────────

  const joinBlockedByPrizeSeed = sponsorCount === 0n || (headlineEth === 0n && headlineNara === 0n);
  const isOverdrive = Boolean(
    overdriveWindow &&
      Date.now() >= Number(overdriveWindow[0]) * 1000 &&
      Date.now() < Number(overdriveWindow[1]) * 1000,
  );
  const raceProgress = progressPercent(userPosition);
  const raceMeter = trackMeter(userPosition);

  const boardClaim_ = boardClaim;
  const boardStatus = boardClaim_ ? `slot #${boardClaim_.slotNum} · ${boardClaim_.tierKey.toUpperCase()}` : "No board claim";
  const boardAlias = boardClaim_?.alias?.trim() ? boardClaim_.alias : shortAddress(boardClaim_?.wallet);

  const stageMode = !ARENA_ADDRESS
    ? "offline"
    : isWrongNetwork
      ? "wrong network"
      : joinBlockedByPrizeSeed
        ? "seed prize"
        : userActive
          ? "runner live"
          : "entry open";

  const feedHeadline = feed[0]?.label ?? "No live actions yet";
  const feedMeta = feed[0]?.meta ?? "The feed will populate once joins, burns, and settlements hit the contract.";

  const moveDisabled = !ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || !userActive;
  const sabotageDisabled = moveDisabled || !target.trim();
  const joinDisabled = !ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || !entryFee || joinBlockedByPrizeSeed || userActive;
  const claimDisabled = !ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || (userPendingEth === 0n && userPendingNara === 0n);
  const sponsorDisabled = !ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || lockFee === undefined;
  const flushDisabled = !ARENA_ADDRESS || pendingRewardEth === 0n || isPending || isWrongNetwork;
  const txBtnClass = isPending ? "is-pending" : isSuccess ? "is-success" : "";

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(SNAPSHOT_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSnapshot(data))
      .catch(() => setSnapshot(null));
  }, []);

  useEffect(() => {
    if (!address) { setBoardClaim(null); return; }
    const lower = normalizeAddress(address);
    fetch(BOARD_API_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BoardResponse | null) => {
        if (!data || !lower) { setBoardClaim(null); return; }
        const claim = data.slots.find((slot) => normalizeAddress(slot.claim?.wallet) === lower)?.claim ?? null;
        setBoardClaim(claim);
      })
      .catch(() => setBoardClaim(null));
  }, [address]);

  useEffect(() => {
    const client = publicClient!;
    if (!ARENA_ADDRESS || !client) return;
    let active = true;
    async function loadFeed() {
      const blockNumber = await client.getBlockNumber();
      const fromBlock = blockNumber > 5000n ? blockNumber - 5000n : 0n;
      const [joined, moved, sabotaged, settled] = await Promise.all([
        client.getLogs({ address: ARENA_ADDRESS, event: joinedEvent, fromBlock }),
        client.getLogs({ address: ARENA_ADDRESS, event: forwardEvent, fromBlock }),
        client.getLogs({ address: ARENA_ADDRESS, event: sabotageEvent, fromBlock }),
        client.getLogs({ address: ARENA_ADDRESS, event: epochSettledEvent, fromBlock }),
      ]);
      if (!active) return;
      const items: FeedItem[] = [
        ...joined.slice(-4).map((log, i) => ({
          id: `j-${i}-${log.transactionHash}`,
          label: "Joined",
          meta: `${shortAddress(log.args.runner)} paid ${formatEntryLabel(log.args.entryFeeWei)}`,
          type: "join" as const,
        })),
        ...moved.slice(-4).map((log, i) => ({
          id: `f-${i}-${log.transactionHash}`,
          label: "Move",
          meta: `${shortAddress(log.args.runner)} burned ${formatToken(log.args.naraBurned)} NARA`,
          type: "move" as const,
        })),
        ...sabotaged.slice(-4).map((log, i) => ({
          id: `s-${i}-${log.transactionHash}`,
          label: "Sabotage",
          meta: `${shortAddress(log.args.attacker)} hit ${shortAddress(log.args.target)}`,
          type: "sabotage" as const,
        })),
        ...settled.slice(-2).map((log, i) => ({
          id: `e-${i}-${log.transactionHash}`,
          label: "Epoch settled",
          meta: `${shortAddress(log.args.winner)} took ${formatEthValue(log.args.winnerAmountEth)} ETH + ${formatToken(log.args.winnerAmountNara)} NARA`,
          type: "epoch" as const,
        })),
      ];
      setFeed(items.reverse().slice(0, 8));
    }
    loadFeed().catch(() => setFeed([]));
    return () => { active = false; };
  }, [publicClient, isSuccess, feedTick]);

  useEffect(() => {
    const id = setInterval(() => setFeedTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isPending) setStatusText("Waiting for wallet confirmation...");
    else if (isConfirming) setStatusText("Transaction submitted. Waiting for Base confirmation...");
    else if (isSuccess) { setStatusText("Transaction confirmed."); refetch(); }
  }, [isPending, isConfirming, isSuccess, refetch]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  function sendJoin() {
    if (!ARENA_ADDRESS || !entryFee) return;
    setStatusText("");
    writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "join", value: entryFee });
  }

  async function ensureNaraAllowance(requiredAmount: bigint) {
    if (!address || !publicClient) return;
    const current = await publicClient.readContract({
      address: NARA_TOKEN_ADDRESS,
      abi: naraTokenAbi,
      functionName: "allowance",
      args: [address, ARENA_ADDRESS],
    });
    if ((current as bigint) >= requiredAmount) return;
    setStatusText("Approving NARA — confirm in wallet...");
    const approveHash = await writeContractAsync({
      address: NARA_TOKEN_ADDRESS,
      abi: naraTokenAbi,
      functionName: "approve",
      args: [ARENA_ADDRESS, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
    });
    setStatusText("Waiting for approval confirmation...");
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    setStatusText("");
  }

  async function sendMove(amount: bigint) {
    if (!ARENA_ADDRESS) return;
    try {
      await ensureNaraAllowance(amount);
      writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "move", args: [amount] });
    } catch {
      setStatusText("Move failed. Check your NARA balance.");
    }
  }

  async function sendSabotage(amount: bigint) {
    const parsedTarget = parseTargetValue(target);
    if (!ARENA_ADDRESS || !parsedTarget) { setStatusText("Enter a valid target address for sabotage."); return; }
    try {
      await ensureNaraAllowance(amount);
      writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "sabotage", args: [parsedTarget, amount] });
    } catch {
      setStatusText("Sabotage failed. Check your NARA balance.");
    }
  }

  function sendClaim() {
    if (!ARENA_ADDRESS) return;
    setStatusText("");
    writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "claim" });
  }

  async function sendSponsorDeposit() {
    if (!ARENA_ADDRESS || lockFee === undefined) return;
    try {
      const amount = parseSponsorAmount(sponsorAmount);
      const duration = parseSponsorDuration(sponsorDuration);
      await ensureNaraAllowance(amount);
      writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "sponsorDeposit", args: [amount, duration], value: lockFee });
    } catch {
      setStatusText("Transaction failed. Check your NARA balance and try again.");
    }
  }

  function sendFlush() {
    if (!ARENA_ADDRESS) return;
    setStatusText("");
    writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "flushRewardEth" });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="arena-shell">
      {/* ── Header ── */}
      <header className="arena-topbar">
        <div className="arena-brand">
          <p className="eyebrow">NARA / Arena Run</p>
          <h1>NARA Arena</h1>
          <p className="arena-subcopy">
            Burn NARA to move. Pay ETH to enter. Sponsors seed the purse. Locker rewards route out of every join.
          </p>
        </div>
        <div className="arena-topbar-side">
          <div className="meta-strip">
            <span>{APP_CHAIN_NAME}</span>
            <span>epoch {arenaEpoch.toString()}</span>
            <span>{stageMode}</span>
          </div>
          <WalletStatus />
        </div>
      </header>

      {/* ── Metric strip ── */}
      <section className="metric-grid">
        <MetricCard
          className="card-prize"
          label="Prize Pool"
          value={
            <>
              <span className="prize-usd-total">
                {formatUsd(
                  (Number(headlineEth) / 1e18) * (prices.eth ?? 0) +
                  (Number(headlineNara) / 1e18) * (prices.nara ?? 0)
                ) ?? "—"}
              </span>
              <span className="prize-token-row">
                <span className="prize-eth">{formatEthValue(headlineEth)}<em>ETH</em></span>
                <span className="prize-plus">+</span>
                <span className="prize-nara">{formatToken(headlineNara)}<em>NARA</em></span>
              </span>
            </>
          }
          hint={`${harvestableSponsors.toString()} harvestable sponsor${harvestableSponsors === 1n ? "" : "s"}`}
          loading={!arenaReads}
        />
        <MetricCard
          className="card-clock"
          label="Race clock"
          value={<LiveCountdown value={nextCull} />}
          hint={<>epoch <LiveCountdown value={nextEpoch} /></>}
          loading={!arenaReads}
        />
        <MetricCard
          label="Your lane"
          value={userActive ? raceMeter : "watching"}
          hint={`heat ${userHeat} · lane ${runnerLaneIndex > 0 ? runnerLaneIndex : 0}`}
          loading={!arenaReads}
        />
        <MetricCard
          label="Locker flow"
          value={`${formatEthValue(totalRewardsForwarded)} ETH`}
          hint={prices.eth
            ? `${formatEthValue(pendingRewardEth)} ETH queued · ${ethToUsd(totalRewardsForwarded, prices.eth) ?? ""}`
            : `${formatEthValue(pendingRewardEth)} ETH queued`}
          loading={!arenaReads}
        />
      </section>

      {/* ── Live feed headline ── */}
      <section className="feed-strip">
        <strong>{feedHeadline}</strong>
        <span>{feedMeta}</span>
      </section>

      {/* ── Status alerts ── */}
      {!ARENA_ADDRESS && (
        <StatusStrip tone="warning" title="Arena address missing" body="Set VITE_ARENA_ADDRESS to enable the live contract view." />
      )}
      {isWrongNetwork && (
        <StatusStrip tone="warning" title="Wrong network" body={`Switch your wallet to ${APP_CHAIN_NAME} before using arena actions.`} />
      )}
      {statusText && <StatusStrip tone="info" title="Transaction status" body={statusText} />}
      {joinBlockedByPrizeSeed && (
        <StatusStrip tone="warning" title="Prize not seeded" body="The sponsor lane must be funded before players can join." />
      )}

      {/* ── Main grid ── */}
      <section className="arena-main-grid">
        <section className="arena-column main-column">

          {/* Race card */}
          <article className="arena-card race-card">
            <RaceTrack
              raceProgress={raceProgress}
              raceMeter={raceMeter}
              userActive={userActive}
              boardAlias={boardAlias}
              burnRank={burnRank}
              boardStatus={boardStatus}
              isOverdrive={isOverdrive}
              activeRunnerCount={activeRunnerCount}
            />
            <PlayControls
              entryFee={entryFee}
              joinDisabled={joinDisabled}
              moveDisabled={moveDisabled}
              sabotageDisabled={sabotageDisabled}
              claimDisabled={claimDisabled}
              target={target}
              onTargetChange={setTarget}
              onJoin={sendJoin}
              onMove={sendMove}
              onSabotage={sendSabotage}
              onClaim={sendClaim}
              txBtnClass={txBtnClass}
              isPending={isPending}
              isConfirming={isConfirming}
              userPendingEth={userPendingEth}
              userPendingNara={userPendingNara}
              naraPriceUsd={prices.nara}
              ethPriceUsd={prices.eth}
            />
          </article>

          <PrizeClock
            harvestedEth={harvestedEth}
            harvestedNara={harvestedNara}
            unharvestedEth={unharvestedEth}
            unharvestedNara={unharvestedNara}
            prizePoolEth={prizePoolEth}
            prizePoolNara={prizePoolNara}
            sponsorCount={sponsorCount}
            nextCull={nextCull}
            nextEpoch={nextEpoch}
            overdriveWindow={overdriveWindow}
            totalBurned={totalBurned}
            naraPriceUsd={prices.nara}
            ethPriceUsd={prices.eth}
          />

          <div className="bottom-grid">
            <FeedCard feed={feed} />
            <LeaderboardCard snapshot={snapshot} />
          </div>
        </section>

        <aside className="arena-column side-column">
          <SponsorCard
            sponsorCount={sponsorCount}
            sponsorTvl={sponsorTvl}
            lockFee={lockFee}
            joinBlockedByPrizeSeed={joinBlockedByPrizeSeed}
            sponsorAmount={sponsorAmount}
            sponsorDuration={sponsorDuration}
            onAmountChange={setSponsorAmount}
            onDurationChange={setSponsorDuration}
            onSubmit={sendSponsorDeposit}
            disabled={sponsorDisabled}
            naraPriceUsd={prices.nara}
            ethPriceUsd={prices.eth}
          />
          <IdentityCard
            burnRank={burnRank}
            boardAlias={boardAlias}
            boardStatus={boardStatus}
            userActive={userActive}
            userBurned={userBurned}
            totalEntries={totalEntries}
            totalRewardsForwarded={totalRewardsForwarded}
            pendingRewardEth={pendingRewardEth}
            onFlush={sendFlush}
            flushDisabled={flushDisabled}
            naraPriceUsd={prices.nara}
            ethPriceUsd={prices.eth}
          />
        </aside>
      </section>

      {/* ── Footer ── */}
      <footer className="arena-footer">
        <div className="arena-trust-bar">
          <a className="arena-trust-item" href="https://basescan.org/token/0xE444de61752bD13D1D37Ee59c31ef4e489bd727C" target="_blank" rel="noopener noreferrer">
            <span className="arena-trust-dot" />
            <span className="arena-trust-label">NARA Token</span>
            <span className="arena-trust-addr">0xE444...727C</span>
          </a>
          <a className="arena-trust-item" href={`https://basescan.org/address/${ARENA_ADDRESS}`} target="_blank" rel="noopener noreferrer">
            <span className="arena-trust-dot" style={{ background: "var(--gold)" }} />
            <span className="arena-trust-label">Arena</span>
            <span className="arena-trust-addr">{`${ARENA_ADDRESS.slice(0, 6)}...${ARENA_ADDRESS.slice(-4)}`}</span>
          </a>
          <a className="arena-trust-item" href="https://basescan.org/token/0xE444de61752bD13D1D37Ee59c31ef4e489bd727C#readContract" target="_blank" rel="noopener noreferrer">
            <span className="arena-trust-dot" />
            <span className="arena-trust-label">Engine</span>
            <span className="arena-trust-addr">profit loop</span>
          </a>
        </div>
        <div className="arena-footer-row">
          <a href="https://x.com/NARA_protocol" target="_blank" rel="noopener noreferrer" className="arena-footer-link">X</a>
          <a href="https://warpcast.com/naraprotocol" target="_blank" rel="noopener noreferrer" className="arena-footer-link">Farcaster</a>
          <a href="https://naraprotocol.io" target="_blank" rel="noopener noreferrer" className="arena-footer-link">naraprotocol.io</a>
          <span className="arena-footer-sep" />
          <a href="https://base.org" target="_blank" rel="noopener noreferrer" className="arena-footer-built">
            Built with <span className="arena-heart">♥</span> on Base
          </a>
          <span className="arena-footer-sep" />
          <span className="arena-footer-copy">
            <span className="arena-copyright-mark" aria-hidden="true">C</span>
            NARA 2026 · made with Claude
          </span>
        </div>
      </footer>
    </main>
  );
}
