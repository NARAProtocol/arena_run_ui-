import {
  ethToUsd,
  formatEthValue,
  formatToken,
  MAX_SPONSOR_DEPOSIT,
  MIN_SPONSOR_DEPOSIT,
  MIN_SPONSOR_DURATION,
  naraToUsd,
} from "../shared/arena";

type SponsorCardProps = {
  sponsorCount: bigint;
  sponsorTvl: bigint | undefined;
  lockFee: bigint | undefined;
  joinBlockedByPrizeSeed: boolean;
  walletConnected: boolean;
  walletNaraBalance: bigint | undefined;
  sponsorAmountExceedsBalance: boolean;
  sponsorValidationMessage: string | null;
  engineSyncRequired: boolean;
  engineSyncMessage: string | null;
  engineSyncBatchSize: bigint;
  sponsorAmount: string;
  sponsorDuration: string;
  maxSponsorDuration: bigint | undefined;
  maxSponsorAmount: bigint | undefined;
  onAmountChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onSetMaxAmount: () => void;
  onSyncEngine: () => void;
  onSubmit: () => void;
  disabled: boolean;
  syncEngineDisabled: boolean;
  naraPriceUsd: number | null;
  ethPriceUsd: number | null;
};

export function SponsorCard({
  sponsorCount,
  sponsorTvl,
  lockFee,
  joinBlockedByPrizeSeed,
  walletConnected,
  walletNaraBalance,
  sponsorAmountExceedsBalance,
  sponsorValidationMessage,
  engineSyncRequired,
  engineSyncMessage,
  engineSyncBatchSize,
  sponsorAmount,
  sponsorDuration,
  maxSponsorDuration,
  maxSponsorAmount,
  onAmountChange,
  onDurationChange,
  onSetMaxAmount,
  onSyncEngine,
  onSubmit,
  disabled,
  syncEngineDisabled,
  naraPriceUsd,
  ethPriceUsd,
}: SponsorCardProps) {
  const walletBalanceLabel = !walletConnected
    ? "Connect wallet"
    : walletNaraBalance === undefined
      ? "Loading..."
      : `${formatToken(walletNaraBalance)} NARA`;

  const walletBalanceNote = !walletConnected
    ? "Connect wallet to view sponsor balance."
    : walletNaraBalance === undefined
      ? "Reading Base wallet balance..."
      : sponsorAmountExceedsBalance
        ? `Amount exceeds available balance (${formatToken(walletNaraBalance)} NARA).`
        : walletNaraBalance > MAX_SPONSOR_DEPOSIT
          ? `Wallet holds ${formatToken(walletNaraBalance)} NARA. Max fills the single-deposit cap.`
          : `Available to sponsor: ${formatToken(walletNaraBalance)} NARA.`;

  const sponsorLimitNote = `Limits: ${formatToken(MIN_SPONSOR_DEPOSIT)}-${formatToken(MAX_SPONSOR_DEPOSIT)} NARA | ${MIN_SPONSOR_DURATION.toString()}-${maxSponsorDuration?.toString() ?? "..."} epochs.`;
  const syncButtonLabel = `Sync engine (${engineSyncBatchSize.toString()} epoch${engineSyncBatchSize === 1n ? "" : "s"})`;

  return (
    <article className="arena-card sponsor-card">
      <div className="section-head compact-head">
        <div>
          <span>sponsor lane</span>
          <strong>{sponsorCount.toString()} live</strong>
        </div>
      </div>
      <div className="data-list compact-gap">
        <div className="data-row">
          <span>TVL</span>
          <div className="data-value-stack">
            <strong>{formatToken(sponsorTvl)} NARA</strong>
            {sponsorTvl && naraToUsd(sponsorTvl, naraPriceUsd) && (
              <small className="row-usd">{naraToUsd(sponsorTvl, naraPriceUsd)}</small>
            )}
          </div>
        </div>
        <div className="data-row">
          <span>wallet</span>
          <div className="data-value-stack">
            <strong>{walletBalanceLabel}</strong>
            {walletConnected && walletNaraBalance !== undefined && naraToUsd(walletNaraBalance, naraPriceUsd) && (
              <small className="row-usd">{naraToUsd(walletNaraBalance, naraPriceUsd)}</small>
            )}
          </div>
        </div>
        <div className="data-row">
          <span>lock fee</span>
          <div className="data-value-stack">
            <strong>{formatEthValue(lockFee)} ETH</strong>
            {lockFee && ethToUsd(lockFee, ethPriceUsd) && (
              <small className="row-usd">{ethToUsd(lockFee, ethPriceUsd)}</small>
            )}
          </div>
        </div>
        <div className="data-row">
          <span>source</span>
          <strong>{"sponsor lock yield -> prize pool"}</strong>
        </div>
        <div className="data-row">
          <span>entry gate</span>
          <strong>{joinBlockedByPrizeSeed ? "closed" : "open"}</strong>
        </div>
      </div>
      <div className="form-stack compact-form-stack">
        <label className="compact-field">
          <div className="compact-field-head">
            <span>amount</span>
            <button
              type="button"
              className="field-action-button"
              onClick={onSetMaxAmount}
              disabled={engineSyncRequired || maxSponsorAmount === undefined || maxSponsorAmount === 0n}
            >
              Max
            </button>
          </div>
          <input
            className="compact-input"
            value={sponsorAmount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="1000"
            disabled={engineSyncRequired}
          />
        </label>
        <small className={`inline-note${sponsorValidationMessage ? " error" : ""}`}>
          {sponsorValidationMessage ?? walletBalanceNote}
        </small>
        <label className="compact-field">
          <span>duration</span>
          <input
            className="compact-input"
            value={sponsorDuration}
            onChange={(e) => onDurationChange(e.target.value)}
            placeholder="96"
            disabled={engineSyncRequired}
          />
        </label>
        <small className="inline-note">{sponsorLimitNote}</small>
        {engineSyncRequired && (
          <small className="inline-note">
            {engineSyncMessage ?? "Clear the engine backlog first, then fund the sponsor lane."} Repeat sync until this warning clears.
          </small>
        )}
        <div className="button-stack">
          {engineSyncRequired && (
            <button className="ghost-button full-width" disabled={syncEngineDisabled} onClick={onSyncEngine}>
              {syncButtonLabel}
            </button>
          )}
          <button className="secondary-button full-width" disabled={disabled} onClick={onSubmit}>
            Fund sponsor lane
          </button>
        </div>
      </div>
    </article>
  );
}
