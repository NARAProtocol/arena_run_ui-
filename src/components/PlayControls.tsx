import { ACTION_PRESETS, ethToUsd, formatEntryLabel, formatEthValue, formatToken, formatUsd, naraToUsd } from "../shared/arena";

type PlayControlsProps = {
  entryFee: bigint | undefined;
  joinDisabled: boolean;
  moveDisabled: boolean;
  sabotageDisabled: boolean;
  claimDisabled: boolean;
  target: string;
  onTargetChange: (value: string) => void;
  onJoin: () => void;
  onMove: (amount: bigint) => void;
  onSabotage: (amount: bigint) => void;
  onClaim: () => void;
  txBtnClass: string;
  isPending: boolean;
  isConfirming: boolean;
  userPendingEth: bigint;
  userPendingNara: bigint;
  walletConnected: boolean;
  walletNaraBalance: bigint | undefined;
  naraPriceUsd: number | null;
  ethPriceUsd: number | null;
};

export function PlayControls({
  entryFee,
  joinDisabled,
  moveDisabled,
  sabotageDisabled,
  claimDisabled,
  target,
  onTargetChange,
  onJoin,
  onMove,
  onSabotage,
  onClaim,
  txBtnClass,
  isPending,
  isConfirming,
  userPendingEth,
  userPendingNara,
  walletConnected,
  walletNaraBalance,
  naraPriceUsd,
  ethPriceUsd,
}: PlayControlsProps) {
  const burnBalanceLabel = !walletConnected
    ? "Connect wallet to read burn balance."
    : walletNaraBalance === undefined
      ? "Reading wallet NARA..."
      : `Wallet burn balance: ${formatToken(walletNaraBalance)} NARA.`;

  const sabotageBalanceLabel = !walletConnected
    ? "Connect wallet to read sabotage balance."
    : walletNaraBalance === undefined
      ? "Reading wallet NARA..."
      : `Sabotage uses the same ${formatToken(walletNaraBalance)} NARA wallet balance.`;

  const canAfford = (amount: bigint) => walletNaraBalance === undefined || amount <= walletNaraBalance;

  return (
    <>
      <div className="play-grid compact">
        <div className="play-block join-block">
          <div className="block-head">
            <span>enter</span>
            <div className="data-value-stack">
              <strong>{formatEntryLabel(entryFee)}</strong>
              {entryFee && ethToUsd(entryFee, ethPriceUsd) && (
                <small className="row-usd">{ethToUsd(entryFee, ethPriceUsd)}</small>
              )}
            </div>
          </div>
          <p>Join once, then burn NARA to move or sabotage.</p>
          <button
            className={`primary-button full-width ${txBtnClass}`}
            disabled={joinDisabled}
            onClick={onJoin}
          >
            {isPending ? "Confirming..." : isConfirming ? "On-chain..." : `Join for ${formatEntryLabel(entryFee)}`}
          </button>
        </div>

        <div className="play-block">
          <div className="block-head">
            <span>move</span>
            <strong>small burns</strong>
          </div>
          <div className="chip-grid triple">
            {ACTION_PRESETS.move.map((preset) => (
              <button
                key={preset.label}
                className="action-chip"
                disabled={moveDisabled || !canAfford(preset.amount)}
                onClick={() => onMove(preset.amount)}
              >
                <span>{preset.label}</span>
                <strong>{formatToken(preset.amount)} NARA</strong>
                {naraToUsd(preset.amount, naraPriceUsd) && (
                  <small className="chip-usd">{naraToUsd(preset.amount, naraPriceUsd)}</small>
                )}
              </button>
            ))}
          </div>
          <small className="inline-note">{burnBalanceLabel}</small>
        </div>

        <div className="play-block sabotage-block">
          <div className="block-head">
            <span>sabotage</span>
            <strong>targeted burn</strong>
          </div>
          <input
            className="compact-input"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            placeholder="0x... runner address"
          />
          <div className="chip-grid double">
            {ACTION_PRESETS.sabotage.map((preset) => (
              <button
                key={preset.label}
                className="action-chip danger"
                disabled={sabotageDisabled || !canAfford(preset.amount)}
                onClick={() => onSabotage(preset.amount)}
              >
                <span>{preset.label}</span>
                <strong>{formatToken(preset.amount)} NARA</strong>
                {naraToUsd(preset.amount, naraPriceUsd) && (
                  <small className="chip-usd">{naraToUsd(preset.amount, naraPriceUsd)}</small>
                )}
              </button>
            ))}
          </div>
          <small className="inline-note">{sabotageBalanceLabel}</small>
          {target.trim() && sabotageDisabled ? (
            <small className="inline-note">Target set, but only active runners can sabotage.</small>
          ) : null}
        </div>
      </div>

      <div className="claim-row">
        <div>
          <span>unclaimed</span>
          <strong>
            {formatEthValue(userPendingEth)} ETH + {formatToken(userPendingNara)} NARA
          </strong>
          {(ethToUsd(userPendingEth, ethPriceUsd) || naraToUsd(userPendingNara, naraPriceUsd)) && (
            <small className="claim-usd">
              ~ {formatUsd(
                (Number(userPendingEth) / 1e18) * (ethPriceUsd ?? 0) +
                (Number(userPendingNara) / 1e18) * (naraPriceUsd ?? 0)
              )}
            </small>
          )}
        </div>
        <button
          className={`secondary-button ${isPending || isConfirming ? "is-pending" : ""}`}
          disabled={claimDisabled}
          onClick={onClaim}
        >
          {isPending || isConfirming ? "Pending..." : "Claim"}
        </button>
      </div>
    </>
  );
}