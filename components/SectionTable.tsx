"use client";
import type { StoreRecord } from "@/lib/cfao";

function exportRowsToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SectionTable({ title, rows, oneToOneMode, variant, ourSku }: {
  title: string;
  rows: StoreRecord[];
  oneToOneMode: boolean;
  variant: "cut" | "fix" | "add" | "outperform";
  ourSku: string;
}) {
  const exportRows = rows.map((r) => ({
    AgencyID: r.agencyId, Store: r.store, City: r.city, District: r.district,
    Inventory: r.inventory, DOH: r.doh, OurRetail: r.ourRetail, OurWholesale: r.ourWholesale,
    CraftAvg: r.craftAvg, CompetitorRetail: r.oneToOneRetail, Share: r.share,
    GapToFix: r.gapToFix ?? "", Segment: r.segment ?? ""
  }));

  return (
    <div className="card">
      <div className="section-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3>{title}</h3>
          <span className={`pill tag-${variant === "outperform" ? "out" : variant}`}>{rows.length}</span>
        </div>
        <button className="secondary" onClick={() => exportRowsToCsv(`${ourSku}-${variant}.csv`, exportRows)} disabled={!rows.length}>Export CSV</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Agency ID</th><th>Store</th><th>District</th><th>Retail</th>
              {variant === "cut" && <th>Wholesale</th>}
              <th>{oneToOneMode ? "Competitor Retail" : "Craft Avg"}</th>
              {oneToOneMode && variant !== "add" && variant !== "cut" && <th>Share</th>}
              {!oneToOneMode && variant === "fix" && <th>Gap to Fix</th>}
              {oneToOneMode && variant === "fix" && <th>Segment</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${variant}-${r.agencyId}`}>
                <td>{r.agencyId}</td><td>{r.store}</td><td>{r.district}</td><td>{Math.round(r.ourRetail)}</td>
                {variant === "cut" && <td>{Math.round(r.ourWholesale)}</td>}
                <td>{Math.round(oneToOneMode ? r.oneToOneRetail : r.craftAvg)}</td>
                {oneToOneMode && variant !== "add" && variant !== "cut" && <td>{(r.share * 100).toFixed(1)}%</td>}
                {!oneToOneMode && variant === "fix" && <td>{Math.round(r.gapToFix ?? 0)}</td>}
                {oneToOneMode && variant === "fix" && <td>{r.segment ?? ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="small">No rows match the current rules.</p>}
      </div>
    </div>
  );
}
