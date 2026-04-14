import type { SnapshotData, SnapshotEntry } from "../shared/arena";
import { shortAddress } from "../shared/arena";

function Leaderboard({
  title,
  entries,
  field,
}: {
  title: string;
  entries?: SnapshotEntry[];
  field: keyof SnapshotEntry;
}) {
  return (
    <section className="leaderboard-module compact-module">
      <header className="leaderboard-head compact-leaderboard-head">
        <span>{title}</span>
      </header>
      <div className="leaderboard-list compact-leaderboard-list">
        {entries && entries.length ? (
          entries.slice(0, 5).map((entry, index) => {
            const raw = entry[field];
            const display =
              typeof raw === "string" && /^\d+$/.test(raw)
                ? Number(raw).toLocaleString()
                : String(raw);
            return (
              <div key={`${title}-${entry.player}`} className="leaderboard-row compact-row">
                <span>{index + 1}</span>
                <strong>{shortAddress(entry.player)}</strong>
                <em>{display}</em>
              </div>
            );
          })
        ) : (
          <div className="empty-slot">Snapshot not available yet.</div>
        )}
      </div>
    </section>
  );
}

export function LeaderboardCard({ snapshot }: { snapshot: SnapshotData | null }) {
  return (
    <article className="arena-card leaderboard-card">
      <div className="section-head compact-head">
        <div>
          <span>snapshot</span>
          <strong>
            {snapshot?.generatedAt
              ? new Date(snapshot.generatedAt).toLocaleString()
              : "No snapshot"}
          </strong>
        </div>
      </div>
      <div className="leaderboard-matrix compact-matrix">
        <Leaderboard title="Burners" entries={snapshot?.leaderboards.topLifetimeBurners} field="lifetimeBurned" />
        <Leaderboard title="Winners" entries={snapshot?.leaderboards.topWinners} field="lifetimeWins" />
        <Leaderboard title="Top 5" entries={snapshot?.leaderboards.topTop5} field="lifetimeEpochTop5" />
        <Leaderboard title="Survivors" entries={snapshot?.leaderboards.topCullSurvivors} field="lifetimeCullSurvivals" />
      </div>
    </article>
  );
}
