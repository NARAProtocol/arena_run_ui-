import { ethToUsd, formatEthValue, formatToken, naraToUsd } from "../shared/arena";

type IdentityCardProps = {
  burnRank: number;
  boardAlias: string;
  boardStatus: string;
  userActive: boolean;
  userBurned: bigint;
  totalEntries: bigint;
  totalRewardsForwarded: bigint;
  pendingRewardEth: bigint;
  onFlush: () => void;
  flushDisabled: boolean;
  naraPriceUsd: number | null;
  ethPriceUsd: number | null;
};

export function IdentityCard({
  burnRank,
  boardAlias,
  boardStatus,
  userActive,
  userBurned,
  totalEntries,
  totalRewardsForwarded,
  pendingRewardEth,
  onFlush,
  flushDisabled,
  naraPriceUsd,
  ethPriceUsd,
}: IdentityCardProps) {
  return (
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
        <div className="data-row">
          <span>your burn</span>
          <div className="data-value-stack">
            <strong>{formatToken(userBurned)} NARA</strong>
            {naraToUsd(userBurned, naraPriceUsd) && (
              <small className="row-usd">{naraToUsd(userBurned, naraPriceUsd)}</small>
            )}
          </div>
        </div>
        <div className="data-row">
          <span>entries</span>
          <div className="data-value-stack">
            <strong>{formatEthValue(totalEntries)} ETH</strong>
            {ethToUsd(totalEntries, ethPriceUsd) && (
              <small className="row-usd">{ethToUsd(totalEntries, ethPriceUsd)}</small>
            )}
          </div>
        </div>
        <div className="data-row">
          <span>locker benefit</span>
          <div className="data-value-stack">
            <strong>{formatEthValue(totalRewardsForwarded)} ETH</strong>
            {ethToUsd(totalRewardsForwarded, ethPriceUsd) && (
              <small className="row-usd">{ethToUsd(totalRewardsForwarded, ethPriceUsd)}</small>
            )}
          </div>
        </div>
      </div>
      <button className="ghost-button full-width" disabled={flushDisabled} onClick={onFlush}>
        Flush queued reward ETH
      </button>
    </article>
  );
}
