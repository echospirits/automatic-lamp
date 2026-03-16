export type CoverageRow = Record<string, string>;
export type SalesRow = Record<string, string>;
export type AnalysisMode = "annual" | "monthly";

export type CfaoThresholds = {
  cutRetailMax: number;
  cutWholesaleMax: number;
  cutCraftAvgMax: number;
  fixCraftAvgMin: number;
  fixPctOfCraftAvg: number;
  addCraftAvgMin: number;
  outperformRetailMin: number;
};

export type SkuPreset = {
  id?: string;
  slug: string;
  name: string;
  ourSku: string;
  competitorSkus: string[];
  oneToOneMode: boolean;
  mode: AnalysisMode;
  thresholds: CfaoThresholds;
  notes?: string;
};

export type StoreRecord = {
  agencyId: string;
  store: string;
  city: string;
  district: string;
  inventory: number;
  doh: number;
  placed: boolean;
  ourRetail: number;
  ourWholesale: number;
  competitorRetails: number[];
  craftAvg: number;
  oneToOneRetail: number;
  share: number;
  gapToFix?: number;
  segment?: string;
  bucket?: "cut" | "fix" | "add" | "outperform" | "none";
};

export type CfaoResult = {
  cuts: StoreRecord[];
  fixes: StoreRecord[];
  adds: StoreRecord[];
  outperform: StoreRecord[];
  allStores: StoreRecord[];
  thresholds: CfaoThresholds;
  mode: AnalysisMode;
};

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().replace(/^0+/, "") || "0";
}
function toNumber(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
function findColumn(columns: string[], tokens: string[]): string | null {
  const lower = columns.map((c) => c.toLowerCase());
  const idx = lower.findIndex((c) => tokens.every((t) => c.includes(t)));
  return idx >= 0 ? columns[idx] : null;
}

export function defaultThresholds(mode: AnalysisMode): CfaoThresholds {
  if (mode === "monthly") {
    return { cutRetailMax: 0, cutWholesaleMax: 1, cutCraftAvgMax: 2, fixCraftAvgMin: 2, fixPctOfCraftAvg: 0.5, addCraftAvgMin: 2, outperformRetailMin: 2 };
  }
  return { cutRetailMax: 3, cutWholesaleMax: 6, cutCraftAvgMax: 15, fixCraftAvgMin: 20, fixPctOfCraftAvg: 0.5, addCraftAvgMin: 20, outperformRetailMin: 15 };
}

export const DEFAULT_PRESETS: SkuPreset[] = [
  { slug: "2804b-standard-bourbon", name: "2804B Standard Bourbon", ourSku: "2804B", competitorSkus: ["6539B", "6931B", "9520B"], oneToOneMode: false, mode: "annual", thresholds: defaultThresholds("annual") },
  { slug: "3135b-house-vodka", name: "3135B House Vodka", ourSku: "3135B", competitorSkus: ["7698B", "9505B", "6930B", "4166B"], oneToOneMode: false, mode: "annual", thresholds: defaultThresholds("annual") },
  { slug: "5656l-capital-city-vs-vohio", name: "5656L Capital City vs Vohio", ourSku: "5656L", competitorSkus: ["9755L"], oneToOneMode: true, mode: "annual", thresholds: defaultThresholds("annual") }
];

export function buildCoverageMap(rows: CoverageRow[]) {
  if (!rows.length) return new Map<string, { store: string; city: string; inventory: number; doh: number }>();
  const columns = Object.keys(rows[0]);
  const agencyCol = findColumn(columns, ["agency", "id"]);
  const inventoryCol = findColumn(columns, ["inventory"]);
  const dohCol = findColumn(columns, ["days on hand"]);
  const nameCol = columns.find((c) => c.toLowerCase() === "dba") || columns.find((c) => c.toLowerCase().includes("dba"));
  const cityCol = columns.find((c) => c.toLowerCase() === "city");
  const map = new Map<string, { store: string; city: string; inventory: number; doh: number }>();
  rows.forEach((row) => {
    const key = normalizeKey(agencyCol ? row[agencyCol] : "");
    map.set(key, {
      store: nameCol ? String(row[nameCol] ?? "Unknown Store") : "Unknown Store",
      city: cityCol ? String(row[cityCol] ?? "") : "",
      inventory: inventoryCol ? toNumber(row[inventoryCol]) : 0,
      doh: dohCol ? toNumber(row[dohCol]) : 0,
    });
  });
  return map;
}

export function buildSalesRows(rows: SalesRow[]) {
  if (!rows.length) return [];
  const columns = Object.keys(rows[0]);
  const agencyCol = findColumn(columns, ["agency", "id"]);
  const agencyNameCol = columns.find((c) => c.toLowerCase().includes("agency_name")) || columns.find((c) => c.toLowerCase().includes("agency name"));
  const districtCol = columns.find((c) => c.toLowerCase() === "district") || columns.find((c) => c.toLowerCase().includes("district"));
  const brandCol = columns.find((c) => c.toLowerCase() === "brand");
  const retailCol = findColumn(columns, ["retail", "bottles", "sold"]);
  const wholesaleCol = findColumn(columns, ["wholesale", "bottles", "sold"]);
  return rows.map((row) => ({
    agencyId: normalizeKey(agencyCol ? row[agencyCol] : ""),
    agencyName: agencyNameCol ? String(row[agencyNameCol] ?? "Unknown Store") : "Unknown Store",
    district: districtCol ? String(row[districtCol] ?? "") : "",
    itemCode: brandCol ? String(row[brandCol] ?? "").trim() : "",
    retail: retailCol ? toNumber(row[retailCol]) : 0,
    wholesale: wholesaleCol ? toNumber(row[wholesaleCol]) : 0,
  }));
}

export function computeCfao(args: {
  coverageRows: CoverageRow[];
  salesRows: SalesRow[];
  ourSku: string;
  competitorSkus: string[];
  oneToOneMode: boolean;
  mode?: AnalysisMode;
  thresholds?: Partial<CfaoThresholds>;
}): CfaoResult {
  const { coverageRows, salesRows, ourSku, competitorSkus, oneToOneMode, mode = "annual", thresholds: partialThresholds = {} } = args;
  const thresholds = { ...defaultThresholds(mode), ...partialThresholds };
  const coverageMap = buildCoverageMap(coverageRows);
  const sales = buildSalesRows(salesRows);
  const relevant = sales.filter((r) => r.itemCode === ourSku || competitorSkus.includes(r.itemCode));
  const storeMap = new Map<string, StoreRecord>();

  for (const row of relevant) {
    if (!storeMap.has(row.agencyId)) {
      const cov = coverageMap.get(row.agencyId);
      storeMap.set(row.agencyId, {
        agencyId: row.agencyId,
        store: cov?.store || row.agencyName,
        city: cov?.city || "",
        district: row.district,
        inventory: cov?.inventory ?? 0,
        doh: cov?.doh ?? 0,
        placed: (cov?.inventory ?? 0) > 0,
        ourRetail: 0,
        ourWholesale: 0,
        competitorRetails: [],
        craftAvg: 0,
        oneToOneRetail: 0,
        share: 0,
      });
    }
    const target = storeMap.get(row.agencyId)!;
    if (row.itemCode === ourSku) {
      target.ourRetail += row.retail;
      target.ourWholesale += row.wholesale;
    } else if (oneToOneMode) {
      target.oneToOneRetail += row.retail;
    } else if (row.retail > 0) {
      target.competitorRetails.push(row.retail);
    }
  }

  const allStores = Array.from(storeMap.values()).map((s) => {
    const craftAvg = oneToOneMode ? s.oneToOneRetail : (s.competitorRetails.length ? s.competitorRetails.reduce((a,b)=>a+b,0) / s.competitorRetails.length : 0);
    const share = oneToOneMode && (s.ourRetail + s.oneToOneRetail) > 0 ? s.ourRetail / (s.ourRetail + s.oneToOneRetail) : 0;
    return { ...s, craftAvg, share, bucket: "none" as const };
  });

  if (oneToOneMode) {
    const cuts = allStores.filter((s) => s.placed && s.ourRetail <= thresholds.cutRetailMax && s.ourWholesale <= thresholds.cutWholesaleMax && s.oneToOneRetail < thresholds.cutCraftAvgMax).map((s) => ({ ...s, bucket: "cut" as const }));
    const fixes = [
      ...allStores.filter((s) => s.placed && s.oneToOneRetail >= thresholds.fixCraftAvgMin && s.share < 0.10).map((s) => ({ ...s, segment: "Critical Fix", bucket: "fix" as const })),
      ...allStores.filter((s) => s.placed && s.oneToOneRetail >= thresholds.fixCraftAvgMin && s.share >= 0.10 && s.share < 0.25).map((s) => ({ ...s, segment: "Growth Fix", bucket: "fix" as const })),
    ].sort((a,b) => a.share - b.share);
    const adds = allStores.filter((s) => !s.placed && s.oneToOneRetail >= thresholds.addCraftAvgMin).map((s) => ({ ...s, bucket: "add" as const })).sort((a,b) => b.oneToOneRetail - a.oneToOneRetail);
    const outperform = allStores.filter((s) => s.placed && s.ourRetail >= thresholds.outperformRetailMin && s.share >= 0.50).map((s) => ({ ...s, bucket: "outperform" as const })).sort((a,b) => b.ourRetail - a.ourRetail);
    return { cuts, fixes, adds, outperform, allStores, thresholds, mode };
  }

  const cuts = allStores.filter((s) => s.placed && s.ourRetail <= thresholds.cutRetailMax && s.ourWholesale <= thresholds.cutWholesaleMax && s.craftAvg < thresholds.cutCraftAvgMax).map((s) => ({ ...s, bucket: "cut" as const })).sort((a,b) => a.ourRetail - b.ourRetail);
  const fixes = allStores.filter((s) => s.placed && s.craftAvg >= thresholds.fixCraftAvgMin && s.ourRetail < s.craftAvg * thresholds.fixPctOfCraftAvg).map((s) => ({ ...s, gapToFix: s.craftAvg * thresholds.fixPctOfCraftAvg - s.ourRetail, bucket: "fix" as const })).sort((a,b) => (b.gapToFix ?? 0) - (a.gapToFix ?? 0));
  const adds = allStores.filter((s) => !s.placed && s.craftAvg >= thresholds.addCraftAvgMin).map((s) => ({ ...s, bucket: "add" as const })).sort((a,b) => b.craftAvg - a.craftAvg);
  const outperform = allStores.filter((s) => s.placed && s.ourRetail >= thresholds.outperformRetailMin && s.ourRetail >= s.craftAvg).map((s) => ({ ...s, bucket: "outperform" as const })).sort((a,b) => b.ourRetail - a.ourRetail);
  return { cuts, fixes, adds, outperform, allStores, thresholds, mode };
}
