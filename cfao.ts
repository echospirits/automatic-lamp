export type CoverageRow = Record<string, string>;
export type SalesRow = Record<string, string>;
export type StoreRecord = { agencyId:string; store:string; city:string; district:string; inventory:number; doh:number; placed:boolean; ourRetail:number; ourWholesale:number; craftAvg:number; oneToOneRetail:number; share:number; gapTo50Pct?:number; segment?:string; };

function normalizeKey(value: unknown): string { return String(value ?? "").trim().replace(/^0+/, "") || "0"; }
function toNumber(value: unknown): number { const n = Number(String(value ?? "").replace(/,/g, "").trim()); return Number.isFinite(n) ? n : 0; }
function findColumn(columns: string[], tokens: string[]): string | null { const lower = columns.map((c) => c.toLowerCase()); const idx = lower.findIndex((c) => tokens.every((t) => c.includes(t))); return idx >= 0 ? columns[idx] : null; }

export function buildCoverageMap(rows: CoverageRow[]) {
  if (!rows.length) return new Map<string, {store:string; city:string; inventory:number; doh:number;}>();
  const columns = Object.keys(rows[0]);
  const agencyCol = findColumn(columns, ["agency","id"]);
  const inventoryCol = findColumn(columns, ["inventory"]);
  const dohCol = findColumn(columns, ["days on hand"]);
  const nameCol = columns.find((c) => c.toLowerCase() === "dba") || columns.find((c) => c.toLowerCase().includes("dba"));
  const cityCol = columns.find((c) => c.toLowerCase() === "city");
  const map = new Map<string, {store:string; city:string; inventory:number; doh:number;}>();
  rows.forEach((row) => {
    const key = normalizeKey(agencyCol ? row[agencyCol] : "");
    map.set(key, { store: nameCol ? String(row[nameCol] ?? "Unknown Store") : "Unknown Store", city: cityCol ? String(row[cityCol] ?? "") : "", inventory: inventoryCol ? toNumber(row[inventoryCol]) : 0, doh: dohCol ? toNumber(row[dohCol]) : 0 });
  });
  return map;
}

export function buildSalesRows(rows: SalesRow[]) {
  if (!rows.length) return [];
  const columns = Object.keys(rows[0]);
  const agencyCol = findColumn(columns, ["agency","id"]);
  const agencyNameCol = columns.find((c) => c.toLowerCase().includes("agency_name")) || columns.find((c) => c.toLowerCase().includes("agency name"));
  const districtCol = columns.find((c) => c.toLowerCase() === "district") || columns.find((c) => c.toLowerCase().includes("district"));
  const brandCol = columns.find((c) => c.toLowerCase() === "brand");
  const retailCol = findColumn(columns, ["retail","bottles","sold"]);
  const wholesaleCol = findColumn(columns, ["wholesale","bottles","sold"]);
  return rows.map((row) => ({ agencyId: normalizeKey(agencyCol ? row[agencyCol] : ""), agencyName: agencyNameCol ? String(row[agencyNameCol] ?? "Unknown Store") : "Unknown Store", district: districtCol ? String(row[districtCol] ?? "") : "", itemCode: brandCol ? String(row[brandCol] ?? "").trim() : "", retail: retailCol ? toNumber(row[retailCol]) : 0, wholesale: wholesaleCol ? toNumber(row[wholesaleCol]) : 0 }));
}

export function computeCfao(args: { coverageRows: CoverageRow[]; salesRows: SalesRow[]; ourSku: string; competitorSkus: string[]; oneToOneMode: boolean; }) {
  const { coverageRows, salesRows, ourSku, competitorSkus, oneToOneMode } = args;
  const coverageMap = buildCoverageMap(coverageRows);
  const sales = buildSalesRows(salesRows);
  const relevant = sales.filter((r) => r.itemCode === ourSku || competitorSkus.includes(r.itemCode));
  const storeMap = new Map<string, StoreRecord>();

  for (const row of relevant) {
    if (!storeMap.has(row.agencyId)) {
      const cov = coverageMap.get(row.agencyId);
      storeMap.set(row.agencyId, { agencyId: row.agencyId, store: cov?.store || row.agencyName, city: cov?.city || "", district: row.district, inventory: cov?.inventory ?? 0, doh: cov?.doh ?? 0, placed: (cov?.inventory ?? 0) > 0, ourRetail: 0, ourWholesale: 0, craftAvg: 0, oneToOneRetail: 0, share: 0 });
    }
    const target = storeMap.get(row.agencyId)!;
    if (row.itemCode === ourSku) { target.ourRetail += row.retail; target.ourWholesale += row.wholesale; }
    else if (oneToOneMode) target.oneToOneRetail += row.retail;
    else target.craftAvg += row.retail;
  }

  const allStores = Array.from(storeMap.values()).map((s) => {
    const craftAvg = oneToOneMode ? s.oneToOneRetail : (competitorSkus.length ? s.craftAvg / competitorSkus.length : 0);
    const total = s.ourRetail + s.oneToOneRetail;
    const share = oneToOneMode && total > 0 ? s.ourRetail / total : 0;
    return { ...s, craftAvg, share };
  });

  if (oneToOneMode) {
    const cuts = allStores.filter((s) => s.placed && s.ourRetail <= 3 && s.ourWholesale <= 6 && s.oneToOneRetail < 15);
    const fixes = [
      ...allStores.filter((s) => s.placed && s.oneToOneRetail >= 20 && s.share < 0.10).map((s) => ({ ...s, segment: "Critical Fix" })),
      ...allStores.filter((s) => s.placed && s.oneToOneRetail >= 20 && s.share >= 0.10 && s.share < 0.25).map((s) => ({ ...s, segment: "Growth Fix" })),
    ].sort((a,b) => a.share - b.share);
    const adds = allStores.filter((s) => !s.placed && s.oneToOneRetail >= 20).sort((a,b) => b.oneToOneRetail - a.oneToOneRetail);
    const outperform = allStores.filter((s) => s.placed && s.share >= 0.50 && s.ourRetail >= 15).sort((a,b) => b.ourRetail - a.ourRetail);
    return { cuts, fixes, adds, outperform, allStores };
  }

  const cuts = allStores.filter((s) => s.placed && s.ourRetail <= 3 && s.ourWholesale <= 6 && s.craftAvg < 15).sort((a,b) => a.ourRetail - b.ourRetail);
  const fixes = allStores.filter((s) => s.placed && s.craftAvg >= 20 && s.ourRetail < s.craftAvg * 0.5).map((s) => ({ ...s, gapTo50Pct: s.craftAvg * 0.5 - s.ourRetail })).sort((a,b) => (b.gapTo50Pct ?? 0) - (a.gapTo50Pct ?? 0));
  const adds = allStores.filter((s) => !s.placed && s.craftAvg >= 20).sort((a,b) => b.craftAvg - a.craftAvg);
  const outperform = allStores.filter((s) => s.placed && s.ourRetail >= 15 && s.ourRetail >= s.craftAvg).sort((a,b) => b.ourRetail - a.ourRetail);
  return { cuts, fixes, adds, outperform, allStores };
}
