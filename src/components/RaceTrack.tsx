type RaceTrackProps = {
  raceProgress: number;
  raceMeter: string;
  userActive: boolean;
  boardAlias: string;
  burnRank: number;
  boardStatus: string;
  isOverdrive: boolean;
  activeRunnerCount: bigint;
};

export function RaceTrack({
  raceProgress,
  raceMeter,
  userActive,
  boardAlias,
  burnRank,
  boardStatus,
  isOverdrive,
  activeRunnerCount,
}: RaceTrackProps) {
  return (
    <>
      <div className="section-head">
        <div>
          <span>race</span>
          <strong>{userActive ? `${boardAlias} on track` : "ready to enter"}</strong>
        </div>
        <div className="pill-row">
          <span className={`state-pill ${isOverdrive ? "hot" : ""}`}>
            {isOverdrive ? "overdrive" : "standard"}
          </span>
          <span className="state-pill">{activeRunnerCount.toString()} runners</span>
        </div>
      </div>

      <div className="track-panel">
        <div className="track-scale">
          {[0, 25, 50, 75, 100].map((mark) => (
            <span key={mark} style={{ left: `${mark}%` }}>{mark}</span>
          ))}
        </div>
        <div className={`track-bar${raceProgress < 1 && !userActive ? " at-start" : ""}`}>
          <div className="track-fill" style={{ width: `${raceProgress}%` }} />
          <div
            className={`track-marker${userActive ? " is-active" : ""}${raceProgress < 1 ? " at-start" : ""}`}
            style={{ left: `${Math.max(1.5, Math.min(raceProgress, 97))}%` }}
          >
            <strong>{userActive ? boardAlias : raceProgress < 1 ? "START" : "YOU"}</strong>
          </div>
        </div>
        <div className="race-stats-row">
          <div><span>position</span><strong>{raceMeter}</strong></div>
          <div><span>burn rank</span><strong>R{burnRank}</strong></div>
          <div><span>board</span><strong>{boardStatus}</strong></div>
        </div>
      </div>
    </>
  );
}
