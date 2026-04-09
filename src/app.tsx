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

function WalletStatus() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, authenticationStatus, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");

        if (!ready) return <button className="app-wallet ghost">Loading...</button>;
        if (!connected) return <button className="app-wallet" onClick={openConnectModal}>Connect Wallet</button>;
        if (chain.unsupported) return <button className="app-wallet" onClick={openChainModal}>{`Switch to ${APP_CHAIN_NAME}`}</button>;
        return <button className="app-wallet" onClick={openAccountModal}>{account.displayName}</button>;
      }}
    </ConnectButton.Custom>
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
  const totalEntries = arenaState?.[7] ?? 0n;
  const totalRewardsForwarded = arenaState?.[8] ?? 0n;
  const userPendingEth = runnerState ? (runnerState[7] as bigint) : 0n;
  const userPendingNara = runnerState ? (runnerState[8] as bigint) : 0n;
  const userPosition = runnerState ? (runnerState[0] as bigint) : 0n;
  const userActive = runnerState ? Boolean(runnerState[9]) : false;
  const boardStatus = boardClaim ? `Slot #${boardClaim.slotNum} · ${boardClaim.tierKey.toUpperCase()}` : "No board claim";
  const boardAlias = boardClaim?.alias?.trim() ? boardClaim.alias : shortAddress(boardClaim?.wallet);
  const joinBlockedByPrizeSeed = sponsorCount === 0n || (headlineEth === 0n && headlineNara === 0n);

  return (
    <main className="arena-shell">
      <header className="arena-hero">
        <div className="hero-copy">
          <p className="arena-kicker">Burn NARA. Race for prize. Feed lockers.</p>
          <h1>NARA Arena</h1>
          <p className="arena-copy">
            Players burn NARA to advance. Every entry fee routes to locker rewards. Sponsors build the prize without taking player odds.
          </p>
        </div>
        <div className="hero-actions">
          <div className="hero-chip">Base Mainnet</div>
          <WalletStatus />
        </div>
      </header>

      {!ARENA_ADDRESS ? (
        <section className="arena-banner warning">
          <strong>App not configured.</strong>
          <span>Set <code>VITE_ARENA_ADDRESS</code> to enable live reads and writes.</span>
        </section>
      ) : null}

      {isWrongNetwork ? (
        <section className="arena-banner warning">
          <strong>Wrong network.</strong>
          <span>Switch your wallet to {APP_CHAIN_NAME} before using the arena.</span>
        </section>
      ) : null}

      {statusText ? (
        <section className="arena-banner info">
          <span>{statusText}</span>
        </section>
      ) : null}

      {joinBlockedByPrizeSeed ? (
        <section className="arena-banner warning">
          <strong>Arena not seeded yet.</strong>
          <span>The sponsor lane must be funded before player entry opens. This prevents paying locker rewards into an empty race.</span>
        </section>
      ) : null}

      <section className="arena-grid top-grid">
        <article className="arena-panel spotlight">
          <div className="panel-head">
            <span>Headline Prize</span>
            <strong>{formatEthValue(headlineEth)} ETH + {formatToken(headlineNara)} NARA</strong>
          </div>
          <div className="metric-row"><span>Harvested</span><strong>{formatEthValue(harvestedEth)} ETH / {formatToken(harvestedNara)} NARA</strong></div>
          <div className="metric-row"><span>Still accruing</span><strong>{formatEthValue(unharvestedEth)} ETH / {formatToken(unharvestedNara)} NARA</strong></div>
          <div className="metric-row"><span>Harvestable sponsors</span><strong>{harvestableSponsors.toString()}</strong></div>
        </article>

        <article className="arena-panel">
          <div className="panel-head">
            <span>Locker Benefit</span>
            <strong>{formatEthValue(totalRewardsForwarded)} ETH routed</strong>
          </div>
          <div className="metric-row"><span>Queued reward ETH</span><strong>{formatEthValue(pendingRewardEth)} ETH</strong></div>
          <div className="metric-row"><span>Total entries</span><strong>{formatEthValue(totalEntries)} ETH</strong></div>
          <p className="panel-note">
            Every player entry fee routes to <code>engine.notifyEthRewards()</code>. Arena players create ETH flow for lockers on every join.
          </p>
          <button
            className="secondary-button"
            disabled={!ARENA_ADDRESS || pendingRewardEth === 0n || isPending || isWrongNetwork}
            onClick={sendFlush}
          >
            Flush queued reward ETH
          </button>
        </article>

        <article className="arena-panel">
          <div className="panel-head">
            <span>Race Clock</span>
            <strong>{overdriveWindow ? formatCountdown(overdriveWindow[1]) : "-"}</strong>
          </div>
          <div className="metric-row"><span>Next cull</span><strong>{formatCountdown(nextCull)}</strong></div>
          <div className="metric-row"><span>Next epoch</span><strong>{formatCountdown(nextEpoch)}</strong></div>
          <div className="metric-row"><span>Overdrive window</span><strong>{overdriveWindow ? `${formatClock(overdriveWindow[0])} -> ${formatClock(overdriveWindow[1])}` : "-"}</strong></div>
          <div className="metric-row"><span>Active runners</span><strong>{activeRunnerCount.toString()}</strong></div>
        </article>
      </section>

      <section className="arena-grid middle-grid">
        <article className="arena-panel control-panel">
          <div className="panel-head">
            <span>Play Arena</span>
            <strong>{formatEntryLabel(entryFee)}</strong>
          </div>
          <p className="panel-note">
            Move burns use <strong>2 / 10 / 30</strong> NARA. Sabotage burns use <strong>10 / 30</strong> NARA. Burning is the gameplay fuel, not a protocol tax.
          </p>
          <button
            className="primary-button"
            disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || !entryFee || joinBlockedByPrizeSeed}
            onClick={sendJoin}
          >
            Join for {formatEntryLabel(entryFee)}
          </button>
          <div className="action-group">
            <label>Move</label>
            <div className="button-row">
              {ACTION_PRESETS.move.map((preset) => (
                <button
                  key={preset.label}
                  className="action-button"
                  disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending}
                  onClick={() => sendMove(preset.amount)}
                >
                  <span>{preset.label}</span>
                  <strong>{formatToken(preset.amount)} NARA</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="action-group">
            <label>Sabotage Target</label>
            <input
              className="arena-input"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="0x... runner address"
            />
            <div className="button-row compact">
              {ACTION_PRESETS.sabotage.map((preset) => (
                <button
                  key={preset.label}
                  className="action-button danger"
                  disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending}
                  onClick={() => sendSabotage(preset.amount)}
                >
                  <span>{preset.label}</span>
                  <strong>{formatToken(preset.amount)} NARA</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="claim-strip">
            <div>
              <span>Your pending</span>
              <strong>{formatEthValue(userPendingEth)} ETH + {formatToken(userPendingNara)} NARA</strong>
            </div>
            <button
              className="secondary-button"
              disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || (userPendingEth === 0n && userPendingNara === 0n)}
              onClick={sendClaim}
            >
              Claim
            </button>
          </div>
        </article>

        <article className="arena-panel sponsor-panel">
          <div className="panel-head">
            <span>Sponsor Lane</span>
            <strong>{sponsorCount.toString()} sponsors</strong>
          </div>
          <div className="metric-row"><span>Sponsor TVL</span><strong>{formatToken(sponsorTvl)} NARA</strong></div>
          <div className="metric-row"><span>Prize source</span><strong>Sponsor clone rewards</strong></div>
          <div className="metric-row"><span>Engine lock fee</span><strong>{formatEthValue(lockFee)} ETH</strong></div>
          <p className="panel-note">
            Sponsors lock NARA through engine clones. Their rewards feed the arena prize. Sponsors never enter winner selection, and the sponsor deposit must send the exact engine lock fee.
          </p>
          <div className="sponsor-form">
            <input className="arena-input" value={sponsorAmount} onChange={(event) => setSponsorAmount(event.target.value)} placeholder="1000 NARA" />
            <input className="arena-input" value={sponsorDuration} onChange={(event) => setSponsorDuration(event.target.value)} placeholder="96 epochs" />
            <button
              className="secondary-button"
              disabled={!ARENA_ADDRESS || !isConnected || isWrongNetwork || isPending || lockFee === undefined}
              onClick={sendSponsorDeposit}
            >
              Sponsor deposit
            </button>
          </div>
        </article>

        <article className="arena-panel identity-panel">
          <div className="panel-head">
            <span>Your Lane</span>
            <strong>{userActive ? "Active" : "Watching"}</strong>
          </div>
          <div className="metric-row"><span>Position</span><strong>{formatToken(userPosition)}</strong></div>
          <div className="metric-row"><span>Burn rank</span><strong>Rank {burnRank}</strong></div>
          <div className="metric-row"><span>Board badge</span><strong>{boardStatus}</strong></div>
          <div className="metric-row"><span>Board alias</span><strong>{boardAlias}</strong></div>
          <p className="panel-note">
            The social stack is board identity plus arena aggression: founder proof on the board, public combat in the arena.
          </p>
        </article>
      </section>

      <section className="arena-grid bottom-grid">
        <article className="arena-panel ledger-panel">
          <div className="panel-head">
            <span>Recent Arena Feed</span>
            <strong>{feed.length}</strong>
          </div>
          <div className="feed-list">
            {feed.length ? feed.map((item) => (
              <div key={item.id} className="feed-item">
                <strong>{item.label}</strong>
                <span>{item.meta}</span>
              </div>
            )) : <div className="empty-state">Recent on-chain feed will appear once the arena address is configured and live events are available.</div>}
          </div>
        </article>

        <article className="arena-panel leaderboard-panel">
          <div className="panel-head">
            <span>Historical Leaderboards</span>
            <strong>{snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : "No snapshot"}</strong>
          </div>
          <div className="leaderboard-grid">
            <Leaderboard title="Lifetime Burners" entries={snapshot?.leaderboards.topLifetimeBurners} field="lifetimeBurned" />
            <Leaderboard title="Winners" entries={snapshot?.leaderboards.topWinners} field="lifetimeWins" />
            <Leaderboard title="Top 5" entries={snapshot?.leaderboards.topTop5} field="lifetimeEpochTop5" />
            <Leaderboard title="Cull Survivors" entries={snapshot?.leaderboards.topCullSurvivors} field="lifetimeCullSurvivals" />
          </div>
        </article>
      </section>
    </main>
  );
}

function Leaderboard({ title, entries, field }: { title: string; entries?: SnapshotEntry[]; field: keyof SnapshotEntry }) {
  return (
    <section className="leaderboard-block">
      <header>
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
        }) : <div className="empty-state">Snapshot not available yet.</div>}
      </div>
    </section>
  );
}

