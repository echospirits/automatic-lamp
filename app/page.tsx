"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PRESETS, defaultThresholds, type AnalysisMode, type CfaoThresholds, type SkuPreset } from "@/lib/cfao";
import { SectionTable } from "@/components/SectionTable";
import { HistoryCharts } from "@/components/HistoryCharts";

type RunSummary = { id: string; label: string; month: string; our_sku: string; created_at: string };
type RunDetails = {
  id: string;
  label: string;
  month: string;
  ourSku: string;
  createdAt: string;
  oneToOneMode: boolean;
  results: {
    cuts: any[];
    fixes: any[];
    adds: any[];
    outperform: any[];
    allStores: any[];
  };
};

export default function Page() {
  const [presets, setPresets] = useState<SkuPreset[]>(DEFAULT_PRESETS);
  const [presetSlug, setPresetSlug] = useState(DEFAULT_PRESETS[0].slug);
  const [ourSku, setOurSku] = useState(DEFAULT_PRESETS[0].ourSku);
  const [competitorSkus, setCompetitorSkus] = useState(DEFAULT_PRESETS[0].competitorSkus.join(","));
  const [oneToOneMode, setOneToOneMode] = useState(DEFAULT_PRESETS[0].oneToOneMode);
  const [mode, setMode] = useState<AnalysisMode>(DEFAULT_PRESETS[0].mode);
  const [thresholds, setThresholds] = useState<CfaoThresholds>(DEFAULT_PRESETS[0].thresholds);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [label, setLabel] = useState("Current Run");
  const [coverageFile, setCoverageFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetails | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadPresets() {
    const res = await fetch("/api/presets");
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      const mapped = data.map((p: any) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        ourSku: p.our_sku,
        competitorSkus: Array.isArray(p.competitor_skus) ? p.competitor_skus : JSON.parse(p.competitor_skus ?? "[]"),
        oneToOneMode: p.one_to_one_mode,
        mode: p.mode,
        thresholds: typeof p.thresholds === "string" ? JSON.parse(p.thresholds) : p.thresholds,
        notes: p.notes ?? undefined,
      }));
      setPresets(mapped);
    }
  }

  async function loadRuns() {
    const res = await fetch(`/api/runs?ourSku=${encodeURIComponent(ourSku)}`);
    const data = await res.json();
    setRuns(Array.isArray(data) ? data : []);
  }

  async function openRun(runId: string) {
    const res = await fetch(`/api/runs?runId=${encodeURIComponent(runId)}`);
    const data = await res.json();
    setSelectedRun(data);
  }

  useEffect(() => {
    loadPresets();
  }, []);

  useEffect(() => {
    loadRuns();
  }, [ourSku]);

  function applyPreset(slug: string) {
    const preset = presets.find((p) => p.slug === slug);
    if (!preset) return;
    setPresetSlug(slug);
    setOurSku(preset.ourSku);
    setCompetitorSkus(preset.competitorSkus.join(","));
    setOneToOneMode(preset.oneToOneMode);
    setMode(preset.mode);
    setThresholds(preset.thresholds);
  }

  async function savePreset() {
    const slug = prompt("Preset slug", `${ourSku.toLowerCase()}-${Date.now()}`);
    const name = prompt("Preset name", `${ourSku} custom`);
    if (!slug || !name) return;
    await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug, name, ourSku,
        competitorSkus: competitorSkus.split(",").map((s) => s.trim()).filter(Boolean),
        oneToOneMode, mode, thresholds
      })
    });
    await loadPresets();
    setPresetSlug(slug);
  }

  async function saveRun() {
    if (!coverageFile || !salesFile) {
      alert("Upload both files first.");
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.append("coverageFile", coverageFile);
    form.append("salesFile", salesFile);
    form.append("label", label);
    form.append("month", month);
    form.append("ourSku", ourSku);
    form.append("competitorSkus", JSON.stringify(competitorSkus.split(",").map((s) => s.trim()).filter(Boolean)));
    form.append("oneToOneMode", String(oneToOneMode));
    form.append("mode", mode);
    form.append("thresholds", JSON.stringify(thresholds));

    const preset = presets.find((p) => p.slug === presetSlug);
    form.append("presetId", preset?.id ?? "");
    form.append("createdBy", "team-user");

    const res = await fetch("/api/runs", { method: "POST", body: form });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      alert(data.error || "Failed to save run");
      return;
    }
    await loadRuns();
    await openRun(data.runId);
  }

  async function deleteRun(runId: string) {
    await fetch(`/api/runs?runId=${encodeURIComponent(runId)}`, { method: "DELETE" });
    if (selectedRun?.id === runId) setSelectedRun(null);
    await loadRuns();
  }

  const filtered = useMemo(() => {
    if (!selectedRun) return null;
    if (!search.trim()) return selectedRun.results;
    const q = search.toLowerCase();
    const filterRows = (rows: any[]) => rows.filter((r) => `${r.agencyId} ${r.store} ${r.city} ${r.district}`.toLowerCase().includes(q));
    return {
      ...selectedRun.results,
      cuts: filterRows(selectedRun.results.cuts),
      fixes: filterRows(selectedRun.results.fixes),
      adds: filterRows(selectedRun.results.adds),
      outperform: filterRows(selectedRun.results.outperform),
    };
  }, [selectedRun, search]);

  const storeOptions = useMemo(() => {
    return (selectedRun?.results.allStores ?? [])
      .map((r) => ({ agencyId: r.agencyId, store: r.store }))
      .sort((a, b) => a.store.localeCompare(b.store));
  }, [selectedRun]);

  const skuData = selectedRun ? [{
    month: selectedRun.month,
    Cuts: selectedRun.results.cuts.length,
    Fixes: selectedRun.results.fixes.length,
    Adds: selectedRun.results.adds.length,
    Outperform: selectedRun.results.outperform.length
  }] : [];

  const storeData = selectedStoreId && selectedRun
    ? (() => {
        const row = selectedRun.results.allStores.find((r) => r.agencyId === selectedStoreId);
        return [{
          month: selectedRun.month,
          Retail: row?.ourRetail ?? 0,
          Benchmark: selectedRun.oneToOneMode ? row?.oneToOneRetail ?? 0 : row?.craftAvg ?? 0,
          Share: row?.share ? Number((row.share * 100).toFixed(1)) : 0
        }];
      })()
    : [];

  return (
    <main className="page">
      <div className="hero">
        <div>
          <h1>CFAO Team Tool</h1>
          <p>Shared presets, shared saved runs, CSV export, history charts, and corrected CFAO logic.</p>
        </div>
        <span className="badge">Vercel team version</span>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Analysis Setup</h2>
          <div className="row-4">
            <div>
              <label className="label">Preset</label>
              <select className="input" value={presetSlug} onChange={(e) => applyPreset(e.target.value)}>
                {presets.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Our SKU</label>
              <input className="input" value={ourSku} onChange={(e) => setOurSku(e.target.value)} />
            </div>
            <div>
              <label className="label">Competitor SKUs</label>
              <input className="input" value={competitorSkus} onChange={(e) => setCompetitorSkus(e.target.value)} />
            </div>
            <div>
              <label className="label">Mode</label>
              <select className="input" value={mode} onChange={(e) => {
                const m = e.target.value as AnalysisMode;
                setMode(m);
                setThresholds(defaultThresholds(m));
              }}>
                <option value="annual">Annual / 12M</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <label><input type="checkbox" checked={oneToOneMode} onChange={(e) => setOneToOneMode(e.target.checked)} /> 1:1 competitor mode</label>
            <button className="secondary" onClick={() => setThresholds(defaultThresholds(mode))}>Reset thresholds</button>
            <button className="primary" onClick={savePreset}>Save preset</button>
          </div>

          <hr className="sep" />
          <h3>Editable Thresholds</h3>
          <div className="row-4">
            <div><label className="label">Cut retail max</label><input className="input" type="number" value={thresholds.cutRetailMax} onChange={(e) => setThresholds({ ...thresholds, cutRetailMax: Number(e.target.value) })} /></div>
            <div><label className="label">Cut wholesale max</label><input className="input" type="number" value={thresholds.cutWholesaleMax} onChange={(e) => setThresholds({ ...thresholds, cutWholesaleMax: Number(e.target.value) })} /></div>
            <div><label className="label">Cut craft avg max</label><input className="input" type="number" value={thresholds.cutCraftAvgMax} onChange={(e) => setThresholds({ ...thresholds, cutCraftAvgMax: Number(e.target.value) })} /></div>
            <div><label className="label">Fix craft avg min</label><input className="input" type="number" value={thresholds.fixCraftAvgMin} onChange={(e) => setThresholds({ ...thresholds, fixCraftAvgMin: Number(e.target.value) })} /></div>
            <div><label className="label">Fix % of craft avg</label><input className="input" type="number" step="0.05" value={thresholds.fixPctOfCraftAvg} onChange={(e) => setThresholds({ ...thresholds, fixPctOfCraftAvg: Number(e.target.value) })} /></div>
            <div><label className="label">Add craft avg min</label><input className="input" type="number" value={thresholds.addCraftAvgMin} onChange={(e) => setThresholds({ ...thresholds, addCraftAvgMin: Number(e.target.value) })} /></div>
            <div><label className="label">Outperform retail min</label><input className="input" type="number" value={thresholds.outperformRetailMin} onChange={(e) => setThresholds({ ...thresholds, outperformRetailMin: Number(e.target.value) })} /></div>
          </div>
        </div>

        <div className="card">
          <h2>Upload Shared Run</h2>
          <div className="row-2">
            <div><label className="label">Month</label><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            <div><label className="label">Run label</label><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
            <div><label className="label">Item Coverage CSV</label><input className="file" type="file" accept=".csv" onChange={(e) => setCoverageFile(e.target.files?.[0] ?? null)} /></div>
            <div><label className="label">Annual Sales Summary CSV</label><input className="file" type="file" accept=".csv" onChange={(e) => setSalesFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="primary" onClick={saveRun} disabled={saving}>{saving ? "Saving..." : "Save shared run"}</button>
          </div>
          <p className="note">This version saves files in Blob and results in Postgres so the whole team sees the same history.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Saved Runs</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Label</th><th>SKU</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.month}</td><td>{r.label}</td><td>{r.our_sku}</td><td>{new Date(r.created_at).toLocaleString()}</td>
                  <td className="toolbar">
                    <button className="secondary" onClick={() => openRun(r.id)}>Open</button>
                    <button className="danger" onClick={() => deleteRun(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!runs.length && <p className="small">No shared runs yet.</p>}
        </div>
      </div>

      {selectedRun && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Results: {selectedRun.label}</h2>
            <div className="toolbar">
              <input className="input" style={{ maxWidth: 360 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by agency ID, store, district..." />
              <span className="small">Cut tables include wholesale sanity check. Agency ID + store name are preserved.</span>
            </div>
          </div>

          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <div className="card"><div className="small">Cuts</div><div className="kpi-value">{filtered?.cuts.length ?? 0}</div></div>
            <div className="card"><div className="small">Fixes</div><div className="kpi-value">{filtered?.fixes.length ?? 0}</div></div>
            <div className="card"><div className="small">Adds</div><div className="kpi-value">{filtered?.adds.length ?? 0}</div></div>
            <div className="card"><div className="small">Outperform</div><div className="kpi-value">{filtered?.outperform.length ?? 0}</div></div>
          </div>

          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <SectionTable title="Cut" rows={filtered?.cuts ?? []} oneToOneMode={selectedRun.oneToOneMode} variant="cut" ourSku={selectedRun.ourSku} />
            <SectionTable title="Fix" rows={filtered?.fixes ?? []} oneToOneMode={selectedRun.oneToOneMode} variant="fix" ourSku={selectedRun.ourSku} />
            <SectionTable title="Add" rows={filtered?.adds ?? []} oneToOneMode={selectedRun.oneToOneMode} variant="add" ourSku={selectedRun.ourSku} />
            <SectionTable title="Outperform" rows={filtered?.outperform ?? []} oneToOneMode={selectedRun.oneToOneMode} variant="outperform" ourSku={selectedRun.ourSku} />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>History Charts</h2>
            <div className="row-2">
              <div>
                <label className="label">Store</label>
                <select className="input" value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
                  <option value="">Select a store</option>
                  {storeOptions.map((s) => <option key={s.agencyId} value={s.agencyId}>{s.agencyId} - {s.store}</option>)}
                </select>
              </div>
            </div>
            <HistoryCharts skuData={skuData} storeData={storeData} />
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Required Vercel setup</h2>
        <p className="note">Add Vercel Postgres and Vercel Blob to your project, then run the SQL in db/schema.sql. After that, this becomes a real shared team analysis tool.</p>
      </div>
    </main>
  );
}
