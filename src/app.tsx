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

        if (!ready) return <button className="broadcast-wallet ghost">Loading...</button>;
        if (!connected) return <button className="broadcast-wallet" onClick={openConnectModal}>Connect Wallet</button>;
        if (chain.unsupported) return <button className="broadcast-wallet" onClick={openChainModal}>{`Switch to ${APP_CHAIN_NAME}`}</button>;
        return <button className="broadcast-wallet" onClick={openAccountModal}>{account.displayName}</button>;
      }}
    </ConnectButton.Custom>
  );
}

function StatusStrip({ tone, title, body }: { tone: "warning" | "info" | "success"; title: string; body: string }) {
  return (
    <section className={`status-strip ${tone}`}>
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
    <button className={`action-card ${tone}`} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      <strong>{formatToken(amount)} NARA</strong>
    </button>
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
          label: "Joined Arena",
          meta: `${shortAddress(log.args.runner)} paid ${formatEntryLabel(log.args.entryFeeWei)}`,
        })),
        ...moved.slice(-4).map((log, index) => ({
          id: `f-${index}-${log.transactionHash}`,
          label: "Burn Sprint",
          meta: `${shortAddress(log.args.runner)} burned ${formatToken(log.args.naraBurned)} NARA`,
        })),
        ...sabotaged.slice(-4).map((log, index) => ({
          id: `s-${index}-${log.transactionHash}`,
          label: "Sabotage",
          meta: `${shortAddress(log.args.attacker)} hit ${shortAddress(log.args.target)}`,
        })),
        ...settled.slice(-2).map((log, index) => ({
          id: `e-${index}-${log.transactionHash}`,
          label: "Epoch Settled",
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
  const boardStatus = boardClaim ? `Slot #${boardClaim.slotNum} · ${boardClaim.tierKey.toUpperCase()}` : "No board claim";
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
  const stagePrompt = !isConnected
    ? "Connect a wallet to enter the track."
    : isWrongNetwork
      ? `Switch to ${APP_CHAIN_NAME} before sending arena actions.`
      : joinBlockedByPrizeSeed
        ? "Sponsor capital must seed the purse before player entry goes live."
        : userActive
          ? "You are on the board. Burn NARA to gain distance or hit a rival."
          : `Entry is live at ${formatEntryLabel(entryFee)}. Burn NARA to move. Burn harder to make the board feel you.`;
  const feedHeadline = feed[0]?.label ?? "No live action yet";
  const feedMeta = feed[0]?.meta ?? "Once joins, burns, and settlements land, the arena feed will stream here.";

  return (
    <main className="arena-shell">
      <header className="broadcast-header">
        <div className="broadcast-copy">
          <p className="broadcast-kicker">Live combat layer for NARA lockers</p>
          <h1>NARA Arena</h1>
          <p className="broadcast-copy-text">
            This is not a passive dashboard. It is a live race where players burn NARA for position, sponsors build the purse,
            and every entry sends ETH back to lockers.
          </p>
        </div>
        <div className="broadcast-sidecar">
          <div className="signal-block">
            <span>Network</span>
            <strong>Base Mainnet</strong>
          </div>
          <div className="signal-block accent">
            <span>Stage mode</span>
            <strong>{stageMode}</strong>
          </div>
          <WalletStatus />
        </div>
      </header>

      <section className="ticker-strip">
        <div className="ticker-label">Field report</div>
        <div className="ticker-copy">
          <strong>{feedHeadline}</strong>
          <span>{feedMeta}</span>
        </div>
      </section>

      {!ARENA_ADDRESS ? (
        <StatusStrip tone="warning" title="Arena address missing" body="Set VITE_ARENA_ADDRESS to enable the live race surface." />
      ) : null}
      {isWrongNetwork ? (
        <StatusStrip tone="warning" title="Wrong network" body={`Switch your wallet to ${APP_CHAIN_NAME} before using arena actions.`} />
      ) : null}
      {statusText ? <StatusStrip tone="info" title="Transaction status" body={statusText} /> : null}
      {joinBlockedByPrizeSeed ? (
        <StatusStrip tone="warning" title="Prize lane not seeded" body="The sponsor lane must be funded before the player gate opens. This prevents dead-on-arrival races." />
      ) : null}

      <section className="arena-stage-grid">
        <article className={`stage-panel ${isOverdrive ? "overdrive" : ""}`}>
          <div className="stage-topline">
            <div>
              <span className="micro-label">Combat theater</span>
              <strong>{userActive ? `${boardAlias} is on the track` : "No runner committed yet"}</strong>
            </div>
            <div className="stage-chip-row">
              <div className="stage-chip">Epoch {arenaEpoch.toString()}</div>
              <div className={`stage-chip ${isOverdrive ? "hot" : ""}`}>{isOverdrive ? "Overdrive live" : "Standard burn"}</div>
            </div>
          </div>

          <div className="track-shell">
            <div className="track-ruler">
              {[0, 25, 50, 75, 100].map((mark) => (
                <span key={mark} style={{ left: `${mark}%` }}>{mark}</span>
              ))}
            </div>
            <div className="track-lane">
              <div className="track-grid-lines" />
              <div className="track-finish">Finish</div>
              <div className="track-runner" style={{ left: `calc(${raceProgress}% - 18px)` }}>
                <div className="runner-core" />
                <strong>{userActive ? boardAlias : "You"}</strong>
              </div>
              <div className="track-burst-zone">CULL PRESSURE</div>
            </div>
            <div className="track-readout">
              <div>
                <span className="micro-label">Track position</span>
                <strong>{raceMeter}</strong>
              </div>
              <div>
                <span className="micro-label">Lane slot</span>
                <strong>{runnerLaneIndex > 0 ? runnerLaneIndex.toString() : "watch"}</strong>
              </div>
              <div>
                <span className="micro-label">Heat</span>
                <strong>{userHeat.toString()}</strong>
              </div>
            </div>
          </div>

          <p className="stage-prompt">{stagePrompt}</p>
        </article>

        <aside className="stage-side-column">
          <article className="stage-card prize">
            <div className="panel-header compact">
              <span>Prize board</span>
              <strong>{formatEthValue(headlineEth)} ETH + {formatToken(headlineNara)} NARA</strong>
            </div>
            <div className="stat-line"><span>Harvested</span><strong>{formatEthValue(harvestedEth)} ETH / {formatToken(harvestedNara)} NARA</strong></div>
            <div className="stat-line"><span>Accruing</span><strong>{formatEthValue(unharvestedEth)} ETH / {formatToken(unharvestedNara)} NARA</strong></div>
            <div className="stat-line"><span>Pool live now</span><strong>{formatEthValue(prizePoolEth)} ETH / {formatToken(prizePoolNara)} NARA</strong></div>
            <div className="stat-line"><span>Harvestable sponsors</span><strong>{harvestableSponsors.toString()}</strong></div>
          </article>

          <article className="stage-card clock">
            <div className="panel-header compact">
              <span>Race clock</span>
              <strong>{formatCountdown(nextCull)}</strong>
            </div>
            <div className="stat-line"><span>Next cull</span><strong>{formatCountdown(nextCull)}</strong></div>
            <div className="stat-line"><span>Next epoch</span><strong>{formatCountdown(nextEpoch)}</strong></div>
            <div className="stat-line"><span>Overdrive window</span><strong>{overdriveWindow ? `${formatClock(overdriveWindow[0])} -> ${formatClock(overdriveWindow[1])}` : "-"}</strong></div>
            <div className="stat-line"><span>Active runners</span><strong>{activeRunnerCount.toString()}</strong></div>
          </article>
        </aside>
      </section>

      <section className="arena-command-grid">
        <article className="command-panel play-panel">
          <div className="panel-header">
            <span>Command deck</span>
            <strong>{formatEntryLabel(entryFee)}</strong>
          </div>
          <div className="command-intro">
            <p>
              Enter the arena, then use bigger burns when it matters. Movement is pressure. Sabotage is denial. Both cost real NARA.
            </p>
            <button
              className="primary-cta"
              disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || !entryFee || joinBlockedByPrizeSeed}
              onClick={sendJoin}
            >
              Enter the race for {formatEntryLabel(entryFee)}
            </button>
          </div>

          <div className="command-cluster">
            <div className="cluster-head">
              <span className="micro-label">Forward burns</span>
              <strong>Move</strong>
            </div>
            <div className="action-grid three-up">
              {ACTION_PRESETS.move.map((preset) => (
                <ActionCard
                  key={preset.label}
                  label={preset.label}
                  amount={preset.amount}
                  disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending}
                  onClick={() => sendMove(preset.amount)}
                />
              ))}
            </div>
          </div>

          <div className="command-cluster sabotage-cluster">
            <div className="cluster-head">
              <span className="micro-label">Targeted pressure</span>
              <strong>Sabotage</strong>
            </div>
            <input
              className="command-input"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="0x... runner address"
            />
            <div className="action-grid two-up">
              {ACTION_PRESETS.sabotage.map((preset) => (
                <ActionCard
                  key={preset.label}
                  label={preset.label}
                  amount={preset.amount}
                  tone="danger"
                  disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending}
                  onClick={() => sendSabotage(preset.amount)}
                />
              ))}
            </div>
          </div>

          <div className="claim-bar">
            <div>
              <span className="micro-label">Unclaimed winnings</span>
              <strong>{formatEthValue(userPendingEth)} ETH + {formatToken(userPendingNara)} NARA</strong>
            </div>
            <button
              className="secondary-cta"
              disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || (userPendingEth === 0n && userPendingNara === 0n)}
              onClick={sendClaim}
            >
              Claim winnings
            </button>
          </div>
        </article>

        <article className="command-panel sponsor-panel">
          <div className="panel-header">
            <span>Sponsor lane</span>
            <strong>{sponsorCount.toString()} sponsors</strong>
          </div>
          <p className="panel-copy">
            Sponsors do not race. They lock NARA through engine clones and route the yield into the purse. That keeps the spectacle funded without corrupting player odds.
          </p>
          <div className="stat-stack">
            <div className="stat-line"><span>Sponsor TVL</span><strong>{formatToken(sponsorTvl)} NARA</strong></div>
            <div className="stat-line"><span>Engine lock fee</span><strong>{formatEthValue(lockFee)} ETH</strong></div>
            <div className="stat-line"><span>Prize source</span><strong>Sponsor clone rewards</strong></div>
            <div className="stat-line"><span>Minimum live seed</span><strong>1 sponsor position</strong></div>
          </div>
          <div className="form-stack">
            <label className="field-label">
              <span>Amount</span>
              <input className="command-input" value={sponsorAmount} onChange={(event) => setSponsorAmount(event.target.value)} placeholder="1000 NARA" />
            </label>
            <label className="field-label">
              <span>Duration</span>
              <input className="command-input" value={sponsorDuration} onChange={(event) => setSponsorDuration(event.target.value)} placeholder="96 epochs" />
            </label>
            <button
              className="secondary-cta"
              disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || lockFee === undefined}
              onClick={sendSponsorDeposit}
            >
              Fund sponsor position
            </button>
          </div>
        </article>

        <article className="command-panel identity-panel">
          <div className="panel-header">
            <span>Combat identity</span>
            <strong>{userActive ? "Runner active" : "Spectator mode"}</strong>
          </div>
          <div className="identity-hero">
            <div className="identity-mark">R{burnRank}</div>
            <div>
              <span className="micro-label">Board alias</span>
              <strong>{boardAlias}</strong>
              <p>{boardStatus}</p>
            </div>
          </div>
          <div className="stat-stack">
            <div className="stat-line"><span>Your burn</span><strong>{formatToken(userBurned)} NARA</strong></div>
            <div className="stat-line"><span>Race position</span><strong>{raceMeter}</strong></div>
            <div className="stat-line"><span>Locker benefit</span><strong>{formatEthValue(totalRewardsForwarded)} ETH routed</strong></div>
            <div className="stat-line"><span>Queued reward ETH</span><strong>{formatEthValue(pendingRewardEth)} ETH</strong></div>
            <div className="stat-line"><span>Total arena burn</span><strong>{formatToken(totalBurned)} NARA</strong></div>
            <div className="stat-line"><span>Total entry flow</span><strong>{formatEthValue(totalEntries)} ETH</strong></div>
          </div>
          <button
            className="ghost-cta"
            disabled={!ARENA_ADDRESS || pendingRewardEth === 0n || isPending || isWrongNetwork}
            onClick={sendFlush}
          >
            Flush queued reward ETH
          </button>
        </article>
      </section>

      <section className="arena-intel-grid">
        <article className="intel-panel feed-panel">
          <div className="panel-header">
            <span>Live event tape</span>
            <strong>{feed.length}</strong>
          </div>
          <div className="tape-list">
            {feed.length ? feed.map((item) => (
              <div key={item.id} className="tape-item">
                <strong>{item.label}</strong>
                <span>{item.meta}</span>
              </div>
            )) : <div className="empty-slot">Recent on-chain activity will appear here once joins, burns, and settlements start landing.</div>}
          </div>
        </article>

        <article className="intel-panel leaderboard-panel">
          <div className="panel-header">
            <span>Hall of pressure</span>
            <strong>{snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : "No snapshot"}</strong>
          </div>
          <div className="leaderboard-matrix">
            <Leaderboard title="Lifetime burners" entries={snapshot?.leaderboards.topLifetimeBurners} field="lifetimeBurned" />
            <Leaderboard title="Winners" entries={snapshot?.leaderboards.topWinners} field="lifetimeWins" />
            <Leaderboard title="Top 5" entries={snapshot?.leaderboards.topTop5} field="lifetimeEpochTop5" />
            <Leaderboard title="Cull survivors" entries={snapshot?.leaderboards.topCullSurvivors} field="lifetimeCullSurvivals" />
          </div>
        </article>
      </section>
    </main>
  );
}

function Leaderboard({ title, entries, field }: { title: string; entries?: SnapshotEntry[]; field: keyof SnapshotEntry }) {
  return (
    <section className="leaderboard-module">
      <header className="leaderboard-head">
        <span>{title}</span>
      </header>
      <div className="leaderboard-list">
        {entries && entries.length ? entries.slice(0, 5).map((entry, index) => {
          const raw = entry[field];
          const display = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw).toLocaleString() : String(raw);
          return (
            <div key={`${title}-${entry.player}`} className="leaderboard-row">
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
