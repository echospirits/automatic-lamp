"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import LineChart from "@/components/LineChart";
import {
  computeCfao,
  defaultThresholds,
  type AnalysisMode,
  type AnalysisResults,
  type CfaoThresholds,
  type CoverageRow,
  type SalesRow,
  type StoreRecord,
} from "@/lib/cfao";
import {
  defaultPresets,
  loadPresets,
  loadRuns,
  savePresets,
  saveRuns,
  type SavedRun,
  type SkuPreset,
} from "@/lib/storage";
import { exportRowsToCsv } from "@/lib/csv";

function parseCsv(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => resolve((results.data as Record<string, string>[]) || []), error: reject });
  });
}
function emptyResults(): AnalysisResults { return { cuts: [], fixes: [], adds: [], outperform: [], allStores: [], thresholds: defaultThresholds("annual"), mode: "annual" }; }
function SectionTable({ title, rows, oneToOneMode, variant, onExport }: { title:string; rows:StoreRecord[]; oneToOneMode:boolean; variant:"cut"|"fix"|"add"|"outperform"; onExport:() => void; }) {
  return <div className="card"><div className="section-title"><h3>{title}</h3><span className="section-pill">{rows.length}</span><div style={{marginLeft:"auto"}}><button className="button" onClick={onExport}>Export CSV</button></div></div><div className="table-wrap"><table><thead><tr><th>Agency ID</th><th>Store</th><th>District</th><th>Our Retail</th>{variant === "cut" && <th>Wholesale</th>}<th>{oneToOneMode ? "Competitor Retail" : "Craft Avg"}</th>{oneToOneMode && variant !== "cut" && variant !== "add" && <th>Share</th>}{!oneToOneMode && variant === "fix" && <th>Gap to Fix</th>}{oneToOneMode && variant === "fix" && <th>Segment</th>}</tr></thead><tbody>{rows.map((row) => <tr key={`${variant}-${row.agencyId}`}><td>{row.agencyId}</td><td>{row.store}</td><td>{row.district}</td><td>{Math.round(row.ourRetail)}</td>{variant === "cut" && <td>{Math.round(row.ourWholesale)}</td>}<td>{Math.round(oneToOneMode ? row.oneToOneRetail : row.craftAvg)}</td>{oneToOneMode && variant !== "cut" && variant !== "add" && <td>{(row.share * 100).toFixed(1)}%</td>}{!oneToOneMode && variant === "fix" && <td>{Math.round(row.gapToFix ?? 0)}</td>}{oneToOneMode && variant === "fix" && <td>{row.segment ?? ""}</td>}</tr>)}</tbody></table>{rows.length === 0 && <p className="small">No rows match the current rules.</p>}</div></div>;
}
function toThresholdInput(value: CfaoThresholds, key: keyof CfaoThresholds, raw: string): CfaoThresholds { const num = Number(raw); if (!Number.isFinite(num)) return value; return { ...value, [key]: num }; }

export default function Page() {
  const [coverageRows, setCoverageRows] = useState<CoverageRow[]>([]);
  const [salesRows, setSalesRows] = useState<SalesRow[]>([]);
  const [coverageName, setCoverageName] = useState("");
  const [salesName, setSalesName] = useState("");
  const [presets, setPresets] = useState<SkuPreset[]>(defaultPresets());
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("2804B");
  const [ourSku, setOurSku] = useState("2804B");
  const [competitorSkus, setCompetitorSkus] = useState("6539B,6931B,9520B");
  const [oneToOneMode, setOneToOneMode] = useState(false);
  const [mode, setMode] = useState<AnalysisMode>("annual");
  const [thresholds, setThresholds] = useState<CfaoThresholds>(defaultThresholds("annual"));
  const [search, setSearch] = useState("");
  const [saveLabel, setSaveLabel] = useState("");
  const [saveMonth, setSaveMonth] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedSkuHistory, setSelectedSkuHistory] = useState("2804B");
  const [tab, setTab] = useState<"analysis" | "history" | "presets">("analysis");

  useEffect(() => { setPresets(loadPresets()); setRuns(loadRuns()); }, []);
  useEffect(() => { savePresets(presets); }, [presets]);
  useEffect(() => { saveRuns(runs); }, [runs]);
  useEffect(() => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    setOurSku(preset.ourSku); setCompetitorSkus(preset.competitorSkus.join(",")); setOneToOneMode(preset.oneToOneMode); setMode(preset.defaultMode); setThresholds(preset.thresholds); setSelectedSkuHistory(preset.ourSku);
  }, [selectedPresetId, presets]);

  const results = useMemo(() => {
    if (!coverageRows.length || !salesRows.length || !ourSku.trim()) return emptyResults();
    return computeCfao({ coverageRows, salesRows, ourSku: ourSku.trim(), competitorSkus: competitorSkus.split(",").map((s) => s.trim()).filter(Boolean), oneToOneMode, mode, thresholds });
  }, [coverageRows, salesRows, ourSku, competitorSkus, oneToOneMode, mode, thresholds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return results;
    const q = search.toLowerCase();
    const filterRows = (rows: StoreRecord[]) => rows.filter((r) => `${r.agencyId} ${r.store} ${r.district} ${r.city}`.toLowerCase().includes(q));
    return { ...results, cuts: filterRows(results.cuts), fixes: filterRows(results.fixes), adds: filterRows(results.adds), outperform: filterRows(results.outperform), allStores: filterRows(results.allStores) };
  }, [results, search]);

  const storeOptions = useMemo(() => {
    const map = new Map<string, string>();
    runs.forEach((run) => run.rows.forEach((row) => { if (!map.has(row.agencyId)) map.set(row.agencyId, `${row.agencyId} — ${row.store}`); }));
    return Array.from(map.entries()).map(([agencyId, label]) => ({ agencyId, label }));
  }, [runs]);

  const storeHistoryPoints = useMemo(() => {
    if (!selectedStore) return [];
    return runs.filter((run) => run.ourSku === selectedSkuHistory).sort((a, b) => a.month.localeCompare(b.month)).map((run) => {
      const row = run.rows.find((r) => r.agencyId === selectedStore);
      return { label: run.month, ourValue: row?.ourRetail ?? 0, compValue: run.oneToOneMode ? row?.oneToOneRetail ?? 0 : row?.craftAvg ?? 0 };
    });
  }, [runs, selectedStore, selectedSkuHistory]);

  const skuHistoryPoints = useMemo(() => {
    return runs.filter((run) => run.ourSku === selectedSkuHistory).sort((a, b) => a.month.localeCompare(b.month)).map((run) => ({
      label: run.month,
      ourValue: run.rows.reduce((sum, row) => sum + row.ourRetail, 0),
      compValue: run.rows.reduce((sum, row) => sum + (run.oneToOneMode ? row.oneToOneRetail : row.craftAvg), 0),
    }));
  }, [runs, selectedSkuHistory]);

  async function handleCoverage(file?: File) { if (!file) return; setCoverageName(file.name); setCoverageRows((await parseCsv(file)) as CoverageRow[]); }
  async function handleSales(file?: File) { if (!file) return; setSalesName(file.name); setSalesRows((await parseCsv(file)) as SalesRow[]); }
  function saveCurrentRun() {
    if (!saveMonth || !saveLabel) return;
    const run: SavedRun = { id: `${Date.now()}`, label: saveLabel, month: saveMonth, presetId: selectedPresetId, ourSku, competitorSkus: competitorSkus.split(",").map((s) => s.trim()).filter(Boolean), oneToOneMode, mode, thresholds, createdAt: new Date().toISOString(), summary: { cuts: results.cuts.length, fixes: results.fixes.length, adds: results.adds.length, outperform: results.outperform.length }, rows: results.allStores };
    setRuns((prev) => [run, ...prev]);
  }
  function savePreset() {
    const id = ourSku.trim();
    const nextPreset: SkuPreset = { id, name: `${ourSku} preset`, ourSku, competitorSkus: competitorSkus.split(",").map((s) => s.trim()).filter(Boolean), oneToOneMode, defaultMode: mode, thresholds };
    setPresets((prev) => { const existing = prev.find((p) => p.id === id); return existing ? prev.map((p) => p.id === id ? nextPreset : p) : [...prev, nextPreset]; });
    setSelectedPresetId(id);
  }
  function exportSection(name: string, rows: StoreRecord[]) {
    exportRowsToCsv(`${ourSku}-${name}.csv`, rows.map((row) => ({ agencyId: row.agencyId, store: row.store, district: row.district, ourRetail: row.ourRetail, ourWholesale: row.ourWholesale, craftAvg: row.craftAvg, oneToOneRetail: row.oneToOneRetail, share: row.share, gapToFix: row.gapToFix ?? "", segment: row.segment ?? "", bucket: row.bucket ?? "" })));
  }

  return <main className="page">
    <div className="hero"><div><h1>CFAO Dashboard v2</h1><p>Corrected CFAO logic, saved monthly runs, editable presets, CSV exports, and history charts.</p></div><span className="badge">Vercel-ready</span></div>
    <div className="tabs"><button className={`tab ${tab === "analysis" ? "active" : ""}`} onClick={() => setTab("analysis")}>Analysis</button><button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>History</button><button className={`tab ${tab === "presets" ? "active" : ""}`} onClick={() => setTab("presets")}>Presets & Thresholds</button></div>

    {tab === "analysis" && <>
      <div className="grid grid-2">
        <div className="card"><h2>Analysis Setup</h2><div className="row-3">
          <div><label className="label">Preset</label><select className="select" value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></div>
          <div><label className="label">Our SKU</label><input className="input" value={ourSku} onChange={(e) => setOurSku(e.target.value)} /></div>
          <div><label className="label">Competitor SKUs</label><input className="input" value={competitorSkus} onChange={(e) => setCompetitorSkus(e.target.value)} /></div>
          <div><label className="label">Mode</label><select className="select" value={mode} onChange={(e) => setMode(e.target.value as AnalysisMode)}><option value="annual">Annual / 12M</option><option value="monthly">Monthly</option></select></div>
          <div><label className="label">Store Filter</label><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Agency ID, store, district..." /></div>
          <div><label className="label">1:1 Competitor Mode</label><div className="mode"><input type="checkbox" checked={oneToOneMode} onChange={(e) => setOneToOneMode(e.target.checked)} /><span className="small">Use share-based logic</span></div></div>
        </div><p className="note">Multi-competitor mode now averages only competitor SKUs with non-zero sales at each store, which matches the manual CFAO work.</p></div>

        <div className="card"><h2>Upload Files</h2><div className="row-2">
          <div><label className="label">Item Coverage CSV</label><input className="file" type="file" accept=".csv" onChange={(e) => handleCoverage(e.target.files?.[0])} />{coverageName && <p className="small">Loaded: {coverageName}</p>}</div>
          <div><label className="label">Annual Sales Summary CSV</label><input className="file" type="file" accept=".csv" onChange={(e) => handleSales(e.target.files?.[0])} />{salesName && <p className="small">Loaded: {salesName}</p>}</div>
        </div><hr /><div className="row-2">
          <div><label className="label">Save Run Label</label><input className="input" value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} placeholder="2026-01 2804B" /></div>
          <div><label className="label">Month</label><input className="input" value={saveMonth} onChange={(e) => setSaveMonth(e.target.value)} placeholder="2026-01" /></div>
        </div><div className="button-group" style={{marginTop:12}}><button className="button primary" onClick={saveCurrentRun}>Save Current Run</button><button className="button" onClick={savePreset}>Save Preset</button></div></div>
      </div>

      <div className="grid grid-4" style={{marginTop:16}}>
        <div className="card kpi"><div><div className="small">Cuts</div><div className="value">{filtered.cuts.length}</div></div></div>
        <div className="card kpi"><div><div className="small">Fixes</div><div className="value">{filtered.fixes.length}</div></div></div>
        <div className="card kpi"><div><div className="small">Adds</div><div className="value">{filtered.adds.length}</div></div></div>
        <div className="card kpi"><div><div className="small">Outperform</div><div className="value">{filtered.outperform.length}</div></div></div>
      </div>

      <div className="grid grid-2" style={{marginTop:16}}>
        <SectionTable title="Cuts" rows={filtered.cuts} oneToOneMode={oneToOneMode} variant="cut" onExport={() => exportSection("cuts", filtered.cuts)} />
        <SectionTable title="Fix" rows={filtered.fixes} oneToOneMode={oneToOneMode} variant="fix" onExport={() => exportSection("fixes", filtered.fixes)} />
        <SectionTable title="Add" rows={filtered.adds} oneToOneMode={oneToOneMode} variant="add" onExport={() => exportSection("adds", filtered.adds)} />
        <SectionTable title="Outperform" rows={filtered.outperform} oneToOneMode={oneToOneMode} variant="outperform" onExport={() => exportSection("outperform", filtered.outperform)} />
      </div>
    </>}

    {tab === "history" && <div className="grid grid-2">
      <div className="card"><h2>Saved Runs</h2><div className="run-list">{runs.map((run) => <div className="run-item" key={run.id}><div><div style={{fontWeight:600}}>{run.label}</div><div className="run-meta">{run.month} · {run.ourSku} · {run.mode} · C:{run.summary.cuts} F:{run.summary.fixes} A:{run.summary.adds} O:{run.summary.outperform}</div></div><button className="button" onClick={() => setSelectedSkuHistory(run.ourSku)}>View SKU</button></div>)}{runs.length === 0 && <p className="small">No saved runs yet.</p>}</div></div>
      <div className="card"><h2>History Controls</h2><div className="row-2"><div><label className="label">SKU for History</label><input className="input" value={selectedSkuHistory} onChange={(e) => setSelectedSkuHistory(e.target.value)} /></div><div><label className="label">Store</label><select className="select" value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)}><option value="">Select a store</option>{storeOptions.map((opt) => <option key={opt.agencyId} value={opt.agencyId}>{opt.label}</option>)}</select></div></div></div>
      <LineChart title={`SKU History — ${selectedSkuHistory}`} points={skuHistoryPoints} ourLabel="Our Retail Total" compLabel="Competitor Benchmark Total" />
      <LineChart title={selectedStore ? `Store History — ${selectedStore}` : "Store History"} points={storeHistoryPoints} ourLabel="Our Retail" compLabel="Competitor Benchmark" />
    </div>}

    {tab === "presets" && <div className="grid grid-2">
      <div className="card"><h2>Editable Thresholds</h2><div className="row-3">
        <div><label className="label">Cut Retail Max</label><input className="input" value={thresholds.cutRetailMax} onChange={(e) => setThresholds(toThresholdInput(thresholds, "cutRetailMax", e.target.value))} /></div>
        <div><label className="label">Cut Wholesale Max</label><input className="input" value={thresholds.cutWholesaleMax} onChange={(e) => setThresholds(toThresholdInput(thresholds, "cutWholesaleMax", e.target.value))} /></div>
        <div><label className="label">Cut Craft Avg Max</label><input className="input" value={thresholds.cutCraftAvgMax} onChange={(e) => setThresholds(toThresholdInput(thresholds, "cutCraftAvgMax", e.target.value))} /></div>
        <div><label className="label">Fix Craft Avg Min</label><input className="input" value={thresholds.fixCraftAvgMin} onChange={(e) => setThresholds(toThresholdInput(thresholds, "fixCraftAvgMin", e.target.value))} /></div>
        <div><label className="label">Fix Percent of Craft Avg</label><input className="input" value={thresholds.fixPctOfCraftAvg} onChange={(e) => setThresholds(toThresholdInput(thresholds, "fixPctOfCraftAvg", e.target.value))} /></div>
        <div><label className="label">Add Craft Avg Min</label><input className="input" value={thresholds.addCraftAvgMin} onChange={(e) => setThresholds(toThresholdInput(thresholds, "addCraftAvgMin", e.target.value))} /></div>
        <div><label className="label">Outperform Retail Min</label><input className="input" value={thresholds.outperformRetailMin} onChange={(e) => setThresholds(toThresholdInput(thresholds, "outperformRetailMin", e.target.value))} /></div>
      </div><div className="button-group" style={{marginTop:12}}><button className="button primary" onClick={savePreset}>Save Thresholds to Preset</button></div></div>
      <div className="card"><h2>Preset Notes</h2><p className="note">Annual thresholds match the original manual CFAO workflow. Monthly thresholds are intentionally lower so one-month uploads do not classify everything as a cut.</p><p className="note">Use Annual / 12M mode for official CFAO review. Use Monthly mode for directional check-ins and trend tracking.</p></div>
    </div>}
  </main>;
}
