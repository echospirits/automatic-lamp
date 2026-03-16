"use client";

type StoreRow = {
  agencyId: string;
  store: string;
  district?: string;
  ourRetail: number;
  craftAvg: number;
  oneToOneRetail: number;
  share: number;
  bucket?: string;
};

type RunLike = {
  id: string;
  label: string;
  month: string;
  oneToOneMode: boolean;
  results: {
    allStores: StoreRow[];
  };
};

function bucketRank(bucket?: string) {
  switch (bucket) {
    case "cut":
      return 1;
    case "fix":
      return 2;
    case "add":
      return 3;
    case "outperform":
      return 4;
    default:
      return 0;
  }
}

function fmtPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function DeltaTables({
  historyRuns,
}: {
  historyRuns: RunLike[];
}) {
  if (historyRuns.length < 2) {
    return (
      <div className="card">
        <h2>Month-over-Month Changes</h2>
        <p className="note">Save at least two runs for this SKU to see deltas and transitions.</p>
      </div>
    );
  }

  const sorted = [...historyRuns].sort((a, b) => a.month.localeCompare(b.month));
  const prior = sorted[sorted.length - 2];
  const current = sorted[sorted.length - 1];

  const priorMap = new Map(prior.results.allStores.map((r) => [r.agencyId, r]));
  const currentMap = new Map(current.results.allStores.map((r) => [r.agencyId, r]));

  const agencyIds = Array.from(
    new Set([...priorMap.keys(), ...currentMap.keys()])
  );

  const deltaRows = agencyIds.map((agencyId) => {
    const p = priorMap.get(agencyId);
    const c = currentMap.get(agencyId);

    const priorRetail = p?.ourRetail ?? 0;
    const currentRetail = c?.ourRetail ?? 0;

    const priorBenchmark = prior.oneToOneMode
      ? p?.oneToOneRetail ?? 0
      : p?.craftAvg ?? 0;

    const currentBenchmark = current.oneToOneMode
      ? c?.oneToOneRetail ?? 0
      : c?.craftAvg ?? 0;

    const priorShare = p?.share ?? 0;
    const currentShare = c?.share ?? 0;

    const priorBucket = p?.bucket ?? "none";
    const currentBucket = c?.bucket ?? "none";

    return {
      agencyId,
      store: c?.store ?? p?.store ?? "",
      district: c?.district ?? p?.district ?? "",
      priorRetail,
      currentRetail,
      retailDelta: currentRetail - priorRetail,
      priorBenchmark,
      currentBenchmark,
      benchmarkDelta: currentBenchmark - priorBenchmark,
      priorShare,
      currentShare,
      shareDelta: currentShare - priorShare,
      priorBucket,
      currentBucket,
      bucketChanged: priorBucket !== currentBucket,
      movementScore: bucketRank(currentBucket) - bucketRank(priorBucket),
    };
  });

  const biggestRetailChanges = [...deltaRows]
    .sort((a, b) => Math.abs(b.retailDelta) - Math.abs(a.retailDelta))
    .slice(0, 25);

  const transitions = deltaRows
    .filter((r) => r.bucketChanged)
    .sort((a, b) => Math.abs(b.movementScore) - Math.abs(a.movementScore));

  return (
    <div className="two-col" style={{ marginTop: 16 }}>
      <div className="card">
        <h2>Month-over-Month Delta</h2>
        <p className="small">
          Comparing <strong>{prior.month}</strong> → <strong>{current.month}</strong>
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agency ID</th>
                <th>Store</th>
                <th>Prior Retail</th>
                <th>Current Retail</th>
                <th>Retail Δ</th>
                <th>Benchmark Δ</th>
                <th>Share Δ</th>
              </tr>
            </thead>
            <tbody>
              {biggestRetailChanges.map((r) => (
                <tr key={r.agencyId}>
                  <td>{r.agencyId}</td>
                  <td>{r.store}</td>
                  <td>{Math.round(r.priorRetail)}</td>
                  <td>{Math.round(r.currentRetail)}</td>
                  <td>{r.retailDelta > 0 ? "+" : ""}{Math.round(r.retailDelta)}</td>
                  <td>{r.benchmarkDelta > 0 ? "+" : ""}{Math.round(r.benchmarkDelta)}</td>
                  <td>{r.shareDelta > 0 ? "+" : ""}{fmtPct(r.shareDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Status Transitions</h2>
        <p className="small">
          Stores whose CFAO bucket changed from <strong>{prior.month}</strong> to <strong>{current.month}</strong>
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agency ID</th>
                <th>Store</th>
                <th>Prior Bucket</th>
                <th>Current Bucket</th>
                <th>Retail Δ</th>
              </tr>
            </thead>
            <tbody>
              {transitions.map((r) => (
                <tr key={r.agencyId}>
                  <td>{r.agencyId}</td>
                  <td>{r.store}</td>
                  <td>{r.priorBucket}</td>
                  <td>{r.currentBucket}</td>
                  <td>{r.retailDelta > 0 ? "+" : ""}{Math.round(r.retailDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!transitions.length && (
            <p className="small">No bucket transitions between the latest two runs.</p>
          )}
        </div>
      </div>
    </div>
  );
}