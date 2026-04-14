import { ethToUsd, formatEthValue, formatToken, naraToUsd } from "../shared/arena";

type SponsorCardProps = {
  sponsorCount: bigint;
  sponsorTvl: bigint | undefined;
  lockFee: bigint | undefined;
  joinBlockedByPrizeSeed: boolean;
  sponsorAmount: string;
  sponsorDuration: string;
  onAmountChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  naraPriceUsd: number | null;
  ethPriceUsd: number | null;
};

export function SponsorCard({
  sponsorCount,
  sponsorTvl,
  lockFee,
  joinBlockedByPrizeSeed,
  sponsorAmount,
  sponsorDuration,
  onAmountChange,
  onDurationChange,
  onSubmit,
  disabled,
  naraPriceUsd,
  ethPriceUsd,
}: SponsorCardProps) {
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
          <strong>engine clone rewards</strong>
        </div>
        <div className="data-row">
          <span>entry gate</span>
          <strong>{joinBlockedByPrizeSeed ? "closed" : "open"}</strong>
        </div>
      </div>
      <div className="form-stack compact-form-stack">
        <label className="compact-field">
          <span>amount</span>
          <input
            className="compact-input"
            value={sponsorAmount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="1000"
          />
        </label>
        <label className="compact-field">
          <span>duration</span>
          <input
            className="compact-input"
            value={sponsorDuration}
            onChange={(e) => onDurationChange(e.target.value)}
            placeholder="96"
          />
        </label>
        <button className="secondary-button full-width" disabled={disabled} onClick={onSubmit}>
          Fund sponsor lane
        </button>
      </div>
    </article>
  );
}
