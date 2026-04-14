import { ethToUsd, formatClock, formatEthValue, formatToken, formatUsd, naraToUsd } from "../shared/arena";
import { LiveCountdown } from "./LiveCountdown";

type PrizeClockProps = {
  harvestedEth: bigint;
  harvestedNara: bigint;
  unharvestedEth: bigint;
  unharvestedNara: bigint;
  prizePoolEth: bigint;
  prizePoolNara: bigint;
  sponsorCount: bigint;
  nextCull: bigint | undefined;
  nextEpoch: bigint | undefined;
  overdriveWindow: readonly bigint[] | undefined;
  totalBurned: bigint;
  naraPriceUsd: number | null;
  ethPriceUsd: number | null;
};

export function PrizeClock({
  harvestedEth,
  harvestedNara,
  unharvestedEth,
  unharvestedNara,
  prizePoolEth,
  prizePoolNara,
  sponsorCount,
  nextCull,
  nextEpoch,
  overdriveWindow,
  totalBurned,
  naraPriceUsd,
  ethPriceUsd,
}: PrizeClockProps) {
  const combinedUsd = (eth: bigint, nara: bigint) => {
    if (ethPriceUsd == null && naraPriceUsd == null) return null;
    return formatUsd(
      (Number(eth) / 1e18) * (ethPriceUsd ?? 0) +
      (Number(nara) / 1e18) * (naraPriceUsd ?? 0)
    );
  };

  return (
    <article className="arena-card info-card">
      <div className="section-head compact-head">
        <div>
          <span>prize + clock</span>
          <strong>live totals</strong>
        </div>
      </div>
      <div className="data-grid two-col compact-data-grid">
        <div className="data-list">
          <div className="data-row">
            <span>harvested</span>
            <div className="data-value-stack">
              <strong>{formatEthValue(harvestedEth)} ETH / {formatToken(harvestedNara)} NARA</strong>
              {combinedUsd(harvestedEth, harvestedNara) && (
                <small className="row-usd">{combinedUsd(harvestedEth, harvestedNara)}</small>
              )}
            </div>
          </div>
          <div className="data-row">
            <span>accruing</span>
            <div className="data-value-stack">
              <strong>{formatEthValue(unharvestedEth)} ETH / {formatToken(unharvestedNara)} NARA</strong>
              {combinedUsd(unharvestedEth, unharvestedNara) && (
                <small className="row-usd">{combinedUsd(unharvestedEth, unharvestedNara)}</small>
              )}
            </div>
          </div>
          <div className="data-row">
            <span>pool live</span>
            <div className="data-value-stack">
              <strong>{formatEthValue(prizePoolEth)} ETH / {formatToken(prizePoolNara)} NARA</strong>
              {combinedUsd(prizePoolEth, prizePoolNara) && (
                <small className="row-usd">{combinedUsd(prizePoolEth, prizePoolNara)}</small>
              )}
            </div>
          </div>
          <div className="data-row">
            <span>sponsors</span>
            <strong>{sponsorCount.toString()}</strong>
          </div>
        </div>
        <div className="data-list">
          <div className="data-row">
            <span>next cull</span>
            <strong><LiveCountdown value={nextCull} /></strong>
          </div>
          <div className="data-row">
            <span>next epoch</span>
            <strong><LiveCountdown value={nextEpoch} /></strong>
          </div>
          <div className="data-row">
            <span>overdrive</span>
            <strong>
              {overdriveWindow
                ? `${formatClock(overdriveWindow[0])} - ${formatClock(overdriveWindow[1])}`
                : "-"}
            </strong>
          </div>
          <div className="data-row">
            <span>total burn</span>
            <div className="data-value-stack">
              <strong>{formatToken(totalBurned)} NARA</strong>
              {naraToUsd(totalBurned, naraPriceUsd) && (
                <small className="row-usd">{naraToUsd(totalBurned, naraPriceUsd)}</small>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
