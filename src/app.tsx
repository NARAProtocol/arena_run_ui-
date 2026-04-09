import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { APP_CHAIN_ID, APP_CHAIN_NAME } from "./shared/wallet";
import {
  ACTION_PRESETS,
  ARENA_ADDRESS,
  arenaAbi,
  BOARD_API_URL,
  DEFAULT_SPONSOR_DURATION,
  formatClock,
  formatCountdown,
  formatEntryLabel,
  formatEthValue,
  formatToken,
  parseSponsorAmount,
  parseSponsorDuration,
  parseTargetValue,
  SNAPSHOT_URL,
  sponsorDefaultValue,
} from "./shared/arena";

type SnapshotEntry = {
  player: string;
  burnRank: number;
  lifetimeBurned: string;
  lifetimeWins: string;
  lifetimeEpochTop5: string;
  lifetimeCullSurvivals: string;
};

type SnapshotData = {
  generatedAt: string;
  leaderboards: {
    topLifetimeBurners: SnapshotEntry[];
    topWinners: SnapshotEntry[];
    topTop5: SnapshotEntry[];
    topCullSurvivors: SnapshotEntry[];
  };
};

type BoardClaim = {
  wallet: string;
  slotNum: number;
  tierKey: string;
  alias: string;
};

type BoardResponse = {
  slots: Array<{ claim: BoardClaim | null }>;
};

type FeedItem = { id: string; label: string; meta: string };
type ContractReadResult = { status: string; result?: unknown };

const TRACK_LENGTH = 100;

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

const joinedEvent = parseAbiItem("event Joined(address indexed runner, uint256 entryFeeWei)");
const forwardEvent = parseAbiItem("event Forward(address indexed runner, uint256 naraBurned, uint256 distanceMoved, uint256 newPosition, uint256 heatStreak)");
const sabotageEvent = parseAbiItem("event Sabotage(address indexed attacker, address indexed target, uint256 naraBurned, uint256 distancePushed, uint256 targetNewPosition, uint256 attackerHeatStreak)");
const epochSettledEvent = parseAbiItem("event EpochSettled(uint64 indexed epoch, uint256 distributedEth, uint256 distributedNara, address winner, uint256 winnerAmountEth, uint256 winnerAmountNara, uint256 topFiveAmountEth, uint256 topFiveAmountNara)");

function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "-";
}

function normalizeAddress(value?: string) {
  return value?.toLowerCase();
}

function readSuccessResult(results: readonly ContractReadResult[] | undefined, index: number) {
  const item = results?.[index];
  return item?.status === "success" ? item.result : undefined;
}

function progressPercent(position: bigint) {
  const units = Number(position) / 1e18;
  if (!Number.isFinite(units) || units <= 0) return 0;
  return Math.max(0, Math.min((units / TRACK_LENGTH) * 100, 100));
}

function trackMeter(position: bigint) {
  const units = Number(position) / 1e18;
  if (!Number.isFinite(units) || units <= 0) return "0.0 / 100";
  return `${units.toFixed(1)} / ${TRACK_LENGTH}`;
}

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
  return (
    <section className={`notice-strip ${tone}`}>
      <strong>{title}</strong>
      <span>{body}</span>
    </section>
  );
}

function ActionCard({
  label,
  amount,
  tone = "default",
  disabled,
  onClick,
}: {
  label: string;
  amount: bigint;
  tone?: "default" | "danger";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`action-chip ${tone}`} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      <strong>{formatToken(amount)} NARA</strong>
    </button>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export default function App() {
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

  const { data: arenaReads, refetch } = useReadContracts({
    allowFailure: true,
    contracts: readContracts,
  });
  const readResults = arenaReads as readonly ContractReadResult[] | undefined;

  const engineAddress = readSuccessResult(readResults, READ_INDEX.engine) as `0x${string}` | undefined;
  const { data: lockFee } = useReadContract({
    address: engineAddress,
    abi: [{ type: "function", name: "lockFeeWei", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const,
    functionName: "lockFeeWei",
    query: { enabled: Boolean(engineAddress) },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

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

  useEffect(() => {
    fetch(SNAPSHOT_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSnapshot(data))
      .catch(() => setSnapshot(null));
  }, []);

  useEffect(() => {
    if (!address) {
      setBoardClaim(null);
      return;
    }
    const lower = normalizeAddress(address);
    fetch(BOARD_API_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: BoardResponse | null) => {
        if (!data || !lower) {
          setBoardClaim(null);
          return;
        }
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
        ...joined.slice(-4).map((log, index) => ({
          id: `j-${index}-${log.transactionHash}`,
          label: "Joined",
          meta: `${shortAddress(log.args.runner)} paid ${formatEntryLabel(log.args.entryFeeWei)}`,
        })),
        ...moved.slice(-4).map((log, index) => ({
          id: `f-${index}-${log.transactionHash}`,
          label: "Move",
          meta: `${shortAddress(log.args.runner)} burned ${formatToken(log.args.naraBurned)} NARA`,
        })),
        ...sabotaged.slice(-4).map((log, index) => ({
          id: `s-${index}-${log.transactionHash}`,
          label: "Sabotage",
          meta: `${shortAddress(log.args.attacker)} hit ${shortAddress(log.args.target)}`,
        })),
        ...settled.slice(-2).map((log, index) => ({
          id: `e-${index}-${log.transactionHash}`,
          label: "Epoch settled",
          meta: `${shortAddress(log.args.winner)} took ${formatEthValue(log.args.winnerAmountEth)} ETH + ${formatToken(log.args.winnerAmountNara)} NARA`,
        })),
      ];
      setFeed(items.reverse().slice(0, 8));
    }

    loadFeed().catch(() => setFeed([]));
    return () => {
      active = false;
    };
  }, [publicClient, isSuccess]);

  useEffect(() => {
    if (isPending) setStatusText("Waiting for wallet confirmation...");
    else if (isConfirming) setStatusText("Transaction submitted. Waiting for Base confirmation...");
    else if (isSuccess) {
      setStatusText("Transaction confirmed.");
      refetch();
    }
  }, [isPending, isConfirming, isSuccess, refetch]);

  function sendJoin() {
    if (!ARENA_ADDRESS || !entryFee) return;
    setStatusText("");
    writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "join", value: entryFee });
  }

  function sendMove(amount: bigint) {
    if (!ARENA_ADDRESS) return;
    setStatusText("");
    writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "move", args: [amount] });
  }

  function sendSabotage(amount: bigint) {
    const parsedTarget = parseTargetValue(target);
    if (!ARENA_ADDRESS || !parsedTarget) {
      setStatusText("Enter a valid target address for sabotage.");
      return;
    }
    setStatusText("");
    writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "sabotage", args: [parsedTarget, amount] });
  }

  function sendClaim() {
    if (!ARENA_ADDRESS) return;
    setStatusText("");
    writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "claim" });
  }

  function sendSponsorDeposit() {
    if (!ARENA_ADDRESS || lockFee === undefined) return;
    try {
      const amount = parseSponsorAmount(sponsorAmount);
      const duration = parseSponsorDuration(sponsorDuration);
      setStatusText("");
      writeContract({
        address: ARENA_ADDRESS,
        abi: arenaAbi,
        functionName: "sponsorDeposit",
        args: [amount, duration],
        value: lockFee,
      });
    } catch {
      setStatusText("Enter a valid sponsor amount and duration.");
    }
  }

  function sendFlush() {
    if (!ARENA_ADDRESS) return;
    setStatusText("");
    writeContract({ address: ARENA_ADDRESS, abi: arenaAbi, functionName: "flushRewardEth" });
  }

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
  const boardStatus = boardClaim ? `slot #${boardClaim.slotNum} · ${boardClaim.tierKey.toUpperCase()}` : "No board claim";
  const boardAlias = boardClaim?.alias?.trim() ? boardClaim.alias : shortAddress(boardClaim?.wallet);
  const joinBlockedByPrizeSeed = sponsorCount === 0n || (headlineEth === 0n && headlineNara === 0n);
  const isOverdrive = Boolean(
    overdriveWindow &&
      Date.now() >= Number(overdriveWindow[0]) * 1000 &&
      Date.now() < Number(overdriveWindow[1]) * 1000,
  );
  const raceProgress = progressPercent(userPosition);
  const raceMeter = trackMeter(userPosition);
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
  const topClockLabel = isOverdrive ? "Overdrive live" : formatCountdown(nextCull);

  return (
    <main className="arena-shell">
      <header className="arena-topbar">
        <div className="arena-brand">
          <p className="eyebrow">NARA / Arena Run</p>
          <h1>NARA Arena</h1>
          <p className="arena-subcopy">Burn NARA to move. Pay ETH to enter. Sponsors seed the purse. Locker rewards route out of every join.</p>
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

      <section className="metric-grid">
        <MetricCard label="Prize" value={`${formatEthValue(headlineEth)} ETH + ${formatToken(headlineNara)} NARA`} hint={`${harvestableSponsors.toString()} harvestable sponsors`} />
        <MetricCard label="Race clock" value={topClockLabel} hint={`epoch ${formatCountdown(nextEpoch)}`} />
        <MetricCard label="Your lane" value={userActive ? raceMeter : "watching"} hint={`heat ${userHeat} · lane ${runnerLaneIndex > 0 ? runnerLaneIndex : 0}`} />
        <MetricCard label="Locker flow" value={`${formatEthValue(totalRewardsForwarded)} ETH`} hint={`${formatEthValue(pendingRewardEth)} ETH queued`} />
      </section>

      <section className="feed-strip">
        <strong>{feedHeadline}</strong>
        <span>{feedMeta}</span>
      </section>

      {!ARENA_ADDRESS ? (
        <StatusStrip tone="warning" title="Arena address missing" body="Set VITE_ARENA_ADDRESS to enable the live contract view." />
      ) : null}
      {isWrongNetwork ? (
        <StatusStrip tone="warning" title="Wrong network" body={`Switch your wallet to ${APP_CHAIN_NAME} before using arena actions.`} />
      ) : null}
      {statusText ? <StatusStrip tone="info" title="Transaction status" body={statusText} /> : null}
      {joinBlockedByPrizeSeed ? (
        <StatusStrip tone="warning" title="Prize not seeded" body="The sponsor lane must be funded before players can join." />
      ) : null}

      <section className="arena-main-grid">
        <section className="arena-column main-column">
          <article className="arena-card race-card">
            <div className="section-head">
              <div>
                <span>race</span>
                <strong>{userActive ? `${boardAlias} on track` : "ready to enter"}</strong>
              </div>
              <div className="pill-row">
                <span className={`state-pill ${isOverdrive ? "hot" : ""}`}>{isOverdrive ? "overdrive" : "standard"}</span>
                <span className="state-pill">{activeRunnerCount.toString()} runners</span>
              </div>
            </div>

            <div className="track-panel">
              <div className="track-scale">
                {[0, 25, 50, 75, 100].map((mark) => (
                  <span key={mark} style={{ left: `${mark}%` }}>{mark}</span>
                ))}
              </div>
              <div className="track-bar">
                <div className="track-fill" style={{ width: `${raceProgress}%` }} />
                <div className="track-marker" style={{ left: `${raceProgress}%` }}>
                  <strong>{userActive ? boardAlias : "YOU"}</strong>
                </div>
              </div>
              <div className="race-stats-row">
                <div><span>position</span><strong>{raceMeter}</strong></div>
                <div><span>burn rank</span><strong>R{burnRank}</strong></div>
                <div><span>board</span><strong>{boardStatus}</strong></div>
              </div>
            </div>

            <div className="play-grid compact">
              <div className="play-block join-block">
                <div className="block-head">
                  <span>enter</span>
                  <strong>{formatEntryLabel(entryFee)}</strong>
                </div>
                <p>Join once, then burn NARA to move or sabotage.</p>
                <button className="primary-button" disabled={joinDisabled} onClick={sendJoin}>
                  Join for {formatEntryLabel(entryFee)}
                </button>
              </div>

              <div className="play-block">
                <div className="block-head">
                  <span>move</span>
                  <strong>small burns</strong>
                </div>
                <div className="chip-grid triple">
                  {ACTION_PRESETS.move.map((preset) => (
                    <ActionCard
                      key={preset.label}
                      label={preset.label}
                      amount={preset.amount}
                      disabled={moveDisabled}
                      onClick={() => sendMove(preset.amount)}
                    />
                  ))}
                </div>
              </div>

              <div className="play-block sabotage-block">
                <div className="block-head">
                  <span>sabotage</span>
                  <strong>targeted burn</strong>
                </div>
                <input
                  className="compact-input"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder="0x... runner address"
                />
                <div className="chip-grid double">
                  {ACTION_PRESETS.sabotage.map((preset) => (
                    <ActionCard
                      key={preset.label}
                      label={preset.label}
                      amount={preset.amount}
                      tone="danger"
                      disabled={moveDisabled}
                      onClick={() => sendSabotage(preset.amount)}
                    />
                  ))}
                </div>
                {target.trim() && sabotageDisabled ? <small className="inline-note">Target set, but only active runners can sabotage.</small> : null}
              </div>
            </div>

            <div className="claim-row">
              <div>
                <span>unclaimed</span>
                <strong>{formatEthValue(userPendingEth)} ETH + {formatToken(userPendingNara)} NARA</strong>
              </div>
              <button className="secondary-button" disabled={claimDisabled} onClick={sendClaim}>Claim</button>
            </div>
          </article>

          <article className="arena-card info-card">
            <div className="section-head compact-head">
              <div>
                <span>prize + clock</span>
                <strong>live totals</strong>
              </div>
            </div>
            <div className="data-grid two-col compact-data-grid">
              <div className="data-list">
                <div className="data-row"><span>harvested</span><strong>{formatEthValue(harvestedEth)} ETH / {formatToken(harvestedNara)} NARA</strong></div>
                <div className="data-row"><span>accruing</span><strong>{formatEthValue(unharvestedEth)} ETH / {formatToken(unharvestedNara)} NARA</strong></div>
                <div className="data-row"><span>pool live</span><strong>{formatEthValue(prizePoolEth)} ETH / {formatToken(prizePoolNara)} NARA</strong></div>
                <div className="data-row"><span>sponsors</span><strong>{sponsorCount.toString()}</strong></div>
              </div>
              <div className="data-list">
                <div className="data-row"><span>next cull</span><strong>{formatCountdown(nextCull)}</strong></div>
                <div className="data-row"><span>next epoch</span><strong>{formatCountdown(nextEpoch)}</strong></div>
                <div className="data-row"><span>overdrive</span><strong>{overdriveWindow ? `${formatClock(overdriveWindow[0])} - ${formatClock(overdriveWindow[1])}` : "-"}</strong></div>
                <div className="data-row"><span>total burn</span><strong>{formatToken(totalBurned)} NARA</strong></div>
              </div>
            </div>
          </article>

          <div className="bottom-grid">
            <article className="arena-card feed-card">
              <div className="section-head compact-head">
                <div>
                  <span>feed</span>
                  <strong>recent actions</strong>
                </div>
              </div>
              <div className="feed-list compact-list">
                {feed.length ? feed.map((item) => (
                  <div key={item.id} className="feed-item">
                    <strong>{item.label}</strong>
                    <span>{item.meta}</span>
                  </div>
                )) : <div className="empty-slot">Recent joins, burns, and settlements will show here.</div>}
              </div>
            </article>

            <article className="arena-card leaderboard-card">
              <div className="section-head compact-head">
                <div>
                  <span>snapshot</span>
                  <strong>{snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : "No snapshot"}</strong>
                </div>
              </div>
              <div className="leaderboard-matrix compact-matrix">
                <Leaderboard title="Burners" entries={snapshot?.leaderboards.topLifetimeBurners} field="lifetimeBurned" />
                <Leaderboard title="Winners" entries={snapshot?.leaderboards.topWinners} field="lifetimeWins" />
                <Leaderboard title="Top 5" entries={snapshot?.leaderboards.topTop5} field="lifetimeEpochTop5" />
                <Leaderboard title="Survivors" entries={snapshot?.leaderboards.topCullSurvivors} field="lifetimeCullSurvivals" />
              </div>
            </article>
          </div>
        </section>

        <aside className="arena-column side-column">
          <article className="arena-card sponsor-card">
            <div className="section-head compact-head">
              <div>
                <span>sponsor lane</span>
                <strong>{sponsorCount.toString()} live</strong>
              </div>
            </div>
            <div className="data-list compact-gap">
              <div className="data-row"><span>TVL</span><strong>{formatToken(sponsorTvl)} NARA</strong></div>
              <div className="data-row"><span>lock fee</span><strong>{formatEthValue(lockFee)} ETH</strong></div>
              <div className="data-row"><span>source</span><strong>engine clone rewards</strong></div>
              <div className="data-row"><span>entry gate</span><strong>{joinBlockedByPrizeSeed ? "closed" : "open"}</strong></div>
            </div>
            <div className="form-stack compact-form-stack">
              <label className="compact-field">
                <span>amount</span>
                <input className="compact-input" value={sponsorAmount} onChange={(event) => setSponsorAmount(event.target.value)} placeholder="1000" />
              </label>
              <label className="compact-field">
                <span>duration</span>
                <input className="compact-input" value={sponsorDuration} onChange={(event) => setSponsorDuration(event.target.value)} placeholder="96" />
              </label>
              <button
                className="secondary-button full-width"
                disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || lockFee === undefined}
                onClick={sendSponsorDeposit}
              >
                Fund sponsor lane
              </button>
            </div>
          </article>

          <article className="arena-card identity-card">
            <div className="section-head compact-head">
              <div>
                <span>identity</span>
                <strong>{userActive ? "runner" : "spectator"}</strong>
              </div>
            </div>
            <div className="identity-panel">
              <div className="identity-mark">R{burnRank}</div>
              <div className="identity-copy">
                <strong>{boardAlias}</strong>
                <span>{boardStatus}</span>
              </div>
            </div>
            <div className="data-list compact-gap">
              <div className="data-row"><span>your burn</span><strong>{formatToken(userBurned)} NARA</strong></div>
              <div className="data-row"><span>entries</span><strong>{formatEthValue(totalEntries)} ETH</strong></div>
              <div className="data-row"><span>locker benefit</span><strong>{formatEthValue(totalRewardsForwarded)} ETH</strong></div>
            </div>
            <button
              className="ghost-button full-width"
              disabled={!ARENA_ADDRESS || pendingRewardEth === 0n || isPending || isWrongNetwork}
              onClick={sendFlush}
            >
              Flush queued reward ETH
            </button>
          </article>
        </aside>
      </section>
    </main>
  );
}

function Leaderboard({ title, entries, field }: { title: string; entries?: SnapshotEntry[]; field: keyof SnapshotEntry }) {
  return (
    <section className="leaderboard-module compact-module">
      <header className="leaderboard-head compact-leaderboard-head">
        <span>{title}</span>
      </header>
      <div className="leaderboard-list compact-leaderboard-list">
        {entries && entries.length ? entries.slice(0, 5).map((entry, index) => {
          const raw = entry[field];
          const display = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw).toLocaleString() : String(raw);
          return (
            <div key={`${title}-${entry.player}`} className="leaderboard-row compact-row">
              <span>{index + 1}</span>
              <strong>{shortAddress(entry.player)}</strong>
              <em>{display}</em>
            </div>
          );
        }) : <div className="empty-slot">Snapshot not available yet.</div>}
      </div>
    </section>
  );
}
