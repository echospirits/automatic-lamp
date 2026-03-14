"use client";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { computeCfao, type CoverageRow, type SalesRow, type StoreRecord } from "@/lib/cfao";

type Results = { cuts: StoreRecord[]; fixes: StoreRecord[]; adds: StoreRecord[]; outperform: StoreRecord[]; allStores: StoreRecord[]; };

function parseCsv(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => resolve((results.data as Record<string, string>[]) || []), error: reject });
  });
}

function SectionTable({ title, rows, oneToOneMode, variant }: { title:string; rows:StoreRecord[]; oneToOneMode:boolean; variant:"cut"|"fix"|"add"|"outperform"; }) {
  return <div className="card">
    <div className="section-title"><h3>{title}</h3><span className="pill">{rows.length}</span></div>
    <div style={{overflowX:"auto"}}><table><thead><tr>
      <th>Agency ID</th><th>Store</th><th>District</th><th>Our Retail</th>
      {variant === "cut" && <th>Wholesale</th>}
      <th>{oneToOneMode ? "Competitor Retail" : "Craft Avg"}</th>
      {oneToOneMode && variant !== "add" && variant !== "cut" && <th>Share</th>}
      {variant === "fix" && !oneToOneMode && <th>Gap to 50%</th>}
      {variant === "fix" && oneToOneMode && <th>Segment</th>}
    </tr></thead><tbody>
      {rows.map((r) => <tr key={`${variant}-${r.agencyId}`}>
        <td>{r.agencyId}</td><td>{r.store}</td><td>{r.district}</td><td>{Math.round(r.ourRetail ?? 0)}</td>
        {variant === "cut" && <td>{Math.round(r.ourWholesale ?? 0)}</td>}
        <td>{Math.round(oneToOneMode ? (r.oneToOneRetail ?? 0) : (r.craftAvg ?? 0))}</td>
        {oneToOneMode && variant !== "add" && variant !== "cut" && <td>{((r.share ?? 0) * 100).toFixed(1)}%</td>}
        {variant === "fix" && !oneToOneMode && <td>{Math.round(r.gapTo50Pct ?? 0)}</td>}
        {variant === "fix" && oneToOneMode && <td>{r.segment ?? ""}</td>}
      </tr>)}
    </tbody></table>{!rows.length && <p className="small">No rows match the current rules.</p>}</div>
  </div>;
}

const PRESETS = [
  { name: "2804B Standard Bourbon", ourSku: "2804B", competitors: "6539B,6931B,9520B", oneToOne: false },
  { name: "3135B House Vodka", ourSku: "3135B", competitors: "7698B,9505B,6930B,4166B", oneToOne: false },
  { name: "5656L Capital City vs Vohio", ourSku: "5656L", competitors: "9755L", oneToOne: true },
];

export default function Page() {
  const [coverageRows, setCoverageRows] = useState<CoverageRow[]>([]);
  const [salesRows, setSalesRows] = useState<SalesRow[]>([]);
  const [coverageFileName, setCoverageFileName] = useState("");
  const [salesFileName, setSalesFileName] = useState("");
  const [ourSku, setOurSku] = useState("2804B");
  const [competitorSkus, setCompetitorSkus] = useState("6539B,6931B,9520B");
  const [oneToOneMode, setOneToOneMode] = useState(false);
  const [search, setSearch] = useState("");

  const results: Results = useMemo(() => {
    if (!coverageRows.length || !salesRows.length || !ourSku.trim()) return { cuts: [], fixes: [], adds: [], outperform: [], allStores: [] };
    return computeCfao({ coverageRows, salesRows, ourSku: ourSku.trim(), competitorSkus: competitorSkus.split(",").map((s) => s.trim()).filter(Boolean), oneToOneMode });
  }, [coverageRows, salesRows, ourSku, competitorSkus, oneToOneMode]);

  const filtered = useMemo(() => {
    if (!search.trim()) return results;
    const q = search.toLowerCase();
    const filterFn = (rows: StoreRecord[]) => rows.filter((r) => `${r.agencyId} ${r.store} ${r.district} ${r.city}`.toLowerCase().includes(q));
    return { ...results, cuts: filterFn(results.cuts), fixes: filterFn(results.fixes), adds: filterFn(results.adds), outperform: filterFn(results.outperform) };
  }, [results, search]);

  async function onCoverageChange(file?: File) { if (!file) return; setCoverageFileName(file.name); setCoverageRows((await parseCsv(file)) as CoverageRow[]); }
  async function onSalesChange(file?: File) { if (!file) return; setSalesFileName(file.name); setSalesRows((await parseCsv(file)) as SalesRow[]); }

  return <main className="page">
    <div className="hero"><div><h1>CFAO Dashboard</h1><p>Upload an Item Coverage CSV and an Annual Sales Summary CSV to generate Cut / Fix / Add / Outperform work lists.</p></div><span className="badge">Next.js + Vercel-ready MVP</span></div>

    <div className="grid grid-2">
      <div className="card">
        <h2>Analysis Setup</h2>
        <div className="row-2">
          <div><label className="label">Preset</label><select className="input" onChange={(e) => { const p = PRESETS.find((x) => x.name === e.target.value); if (!p) return; setOurSku(p.ourSku); setCompetitorSkus(p.competitors); setOneToOneMode(p.oneToOne); }} defaultValue=""><option value="" disabled>Select a preset</option>{PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select></div>
          <div><label className="label">Our SKU</label><input className="input" value={ourSku} onChange={(e) => setOurSku(e.target.value)} /></div>
          <div><label className="label">Competitor SKUs (comma-separated)</label><input className="input" value={competitorSkus} onChange={(e) => setCompetitorSkus(e.target.value)} /></div>
          <div><label className="label">Store Filter</label><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Agency ID, store, district..." /></div>
        </div>
        <div className="mode"><input id="one-to-one" type="checkbox" checked={oneToOneMode} onChange={(e) => setOneToOneMode(e.target.checked)} /><label htmlFor="one-to-one">1:1 competitor mode (share-based)</label></div>
        <p className="small">{oneToOneMode ? "Use this when there is one direct competitor." : "Use this when benchmarking against multiple craft competitors."}</p>
      </div>

      <div className="card">
        <h2>Monthly Uploads</h2>
        <div className="row-2">
          <div><label className="label">Item Coverage CSV</label><input className="file" type="file" accept=".csv" onChange={(e) => onCoverageChange(e.target.files?.[0])} />{coverageFileName && <p className="small">Loaded: {coverageFileName}</p>}</div>
          <div><label className="label">Annual Sales Summary CSV</label><input className="file" type="file" accept=".csv" onChange={(e) => onSalesChange(e.target.files?.[0])} />{salesFileName && <p className="small">Loaded: {salesFileName}</p>}</div>
        </div>
        <p className="note">This MVP runs entirely in the browser. For production, persist uploads and monthly history in Vercel Blob or a database.</p>
      </div>
    </div>

    <div className="grid grid-4" style={{marginTop:16}}>
      <div className="card kpi"><div><div className="small">Cuts</div><div className="kpi-value">{filtered.cuts.length}</div></div></div>
      <div className="card kpi"><div><div className="small">Fixes</div><div className="kpi-value">{filtered.fixes.length}</div></div></div>
      <div className="card kpi"><div><div className="small">Adds</div><div className="kpi-value">{filtered.adds.length}</div></div></div>
      <div className="card kpi"><div><div className="small">Outperform</div><div className="kpi-value">{filtered.outperform.length}</div></div></div>
    </div>

    <div className="grid grid-2" style={{marginTop:16}}>
      <SectionTable title="Cuts" rows={filtered.cuts} oneToOneMode={oneToOneMode} variant="cut" />
      <SectionTable title="Fix" rows={filtered.fixes} oneToOneMode={oneToOneMode} variant="fix" />
      <SectionTable title="Add" rows={filtered.adds} oneToOneMode={oneToOneMode} variant="add" />
      <SectionTable title="Outperform" rows={filtered.outperform} oneToOneMode={oneToOneMode} variant="outperform" />
    </div>

    <div className="card" style={{marginTop:16}}>
      <h2>Deployment Notes</h2>
      <p className="note">To deploy on Vercel: create a new Next.js project, copy these files in, run <code>npm install</code>, then deploy. Next upgrades: auth, history, saved runs, and export.</p>
    </div>
  </main>;
}
