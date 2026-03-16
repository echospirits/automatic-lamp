"use client";
import { DeltaTables } from "@/components/DeltaTables";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { upload } from "@vercel/blob/client";
import {
  computeCfao,
  DEFAULT_PRESETS,
  defaultThresholds,
  type AnalysisMode,
  type CfaoThresholds,
  type SkuPreset,
  type CoverageRow,
  type SalesRow,
} from "@/lib/cfao";
import { SectionTable } from "@/components/SectionTable";
import { HistoryCharts } from "@/components/HistoryCharts";

type RunSummary = {
  id: string;
  label: string;
  month: string;
  our_sku: string;
  created_at: string;
};

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

type PreviewResults = {
  cuts: any[];
  fixes: any[];
  adds: any[];
  outperform: any[];
  allStores: any[];
};

function parseCsvFile<T extends Record<string, string>>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data || []),
      error: reject,
    });
  });
}

export default function Page() {
  const [presets, setPresets] = useState<SkuPreset[]>(DEFAULT_PRESETS);
  const [presetSlug, setPresetSlug] = useState(DEFAULT_PRESETS[0].slug);
  const [ourSku, setOurSku] = useState(DEFAULT_PRESETS[0].ourSku);
  const [competitorSkus, setCompetitorSkus] = useState(
    DEFAULT_PRESETS[0].competitorSkus.join(",")
  );
  const [oneToOneMode, setOneToOneMode] = useState(
    DEFAULT_PRESETS[0].oneToOneMode
  );
  const [mode, setMode] = useState<AnalysisMode>(DEFAULT_PRESETS[0].mode);
  const [thresholds, setThresholds] = useState<CfaoThresholds>(
    DEFAULT_PRESETS[0].thresholds
  );

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [label, setLabel] = useState("Current Run");

  const [coverageFile, setCoverageFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runFilterSku, setRunFilterSku] = useState("ALL");
  const [selectedRun, setSelectedRun] = useState<RunDetails | null>(null);

  const [previewResults, setPreviewResults] = useState<PreviewResults | null>(
    null
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [search, setSearch] = useState("");

  const [historyRuns, setHistoryRuns] = useState<RunDetails[]>([]);

  async function loadPresets() {
    const res = await fetch("/api/presets");
    const data = await res.json();

    if (Array.isArray(data) && data.length) {
      const mapped = data.map((p: any) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        ourSku: p.our_sku,
        competitorSkus: Array.isArray(p.competitor_skus)
          ? p.competitor_skus
          : JSON.parse(p.competitor_skus ?? "[]"),
        oneToOneMode: p.one_to_one_mode,
        mode: p.mode,
        thresholds:
          typeof p.thresholds === "string"
            ? JSON.parse(p.thresholds)
            : p.thresholds,
        notes: p.notes ?? undefined,
      }));
      setPresets(mapped);
    }
  }

  async function loadRuns(filterSku?: string) {
    const qs =
      filterSku && filterSku !== "ALL"
        ? `?ourSku=${encodeURIComponent(filterSku)}`
        : "";
    const res = await fetch(`/api/runs${qs}`);
    const data = await res.json();
    setRuns(Array.isArray(data) ? data : []);
  }

  async function openRun(runId: string) {
    const res = await fetch(`/api/runs?runId=${encodeURIComponent(runId)}`);
    const data = await res.json();
    setSelectedRun(data);
    setPreviewResults(null);
    setSelectedStoreId("");
  }

  async function loadHistoryForSku(sku: string) {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/runs?ourSku=${encodeURIComponent(sku)}`);
      const summaries = await res.json();

      if (!Array.isArray(summaries) || !summaries.length) {
        setHistoryRuns([]);
        return;
      }

      const details = await Promise.all(
        summaries.map(async (run: RunSummary) => {
          const detailRes = await fetch(
            `/api/runs?runId=${encodeURIComponent(run.id)}`
          );
          return detailRes.json();
        })
      );

      details.sort((a, b) => a.month.localeCompare(b.month));
      setHistoryRuns(details);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadPresets();
  }, []);

  useEffect(() => {
    loadRuns(runFilterSku);
  }, [runFilterSku]);

  useEffect(() => {
    loadHistoryForSku(ourSku);
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

    setPreviewResults(null);
    setSelectedRun(null);
    setSelectedStoreId("");
  }

  async function savePreset() {
    const slug = prompt("Preset slug", `${ourSku.toLowerCase()}-${Date.now()}`);
    const name = prompt("Preset name", `${ourSku} custom`);
    if (!slug || !name) return;

    await fetch("/api/presets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug,
        name,
        ourSku,
        competitorSkus: competitorSkus
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        oneToOneMode,
        mode,
        thresholds,
      }),
    });

    await loadPresets();
    setPresetSlug(slug);
  }

  async function runPreview() {
    if (!coverageFile || !salesFile) {
      alert("Upload both files first.");
      return;
    }

    setPreviewLoading(true);

    try {
      const coverageRows = await parseCsvFile<CoverageRow>(coverageFile);
      const salesRows = await parseCsvFile<SalesRow>(salesFile);

      const results = computeCfao({
        coverageRows,
        salesRows,
        ourSku,
        competitorSkus: competitorSkus
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        oneToOneMode,
        mode,
        thresholds,
      });

      setPreviewResults(results);
      setSelectedRun(null);
      setSelectedStoreId("");
    } catch (error) {
      console.error(error);
      alert("Preview failed. Check the uploaded CSV structure.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function saveRun() {
    if (!coverageFile || !salesFile) {
      alert("Upload both files first.");
      return;
    }

    if (!previewResults) {
      alert("Run Preview first before saving.");
      return;
    }

    setSaving(true);

    try {
      const coverageUpload = await upload(
        `coverage/${month}-${coverageFile.name}`,
        coverageFile,
        {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
        }
      );

      const salesUpload = await upload(
        `sales/${month}-${salesFile.name}`,
        salesFile,
        {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
        }
      );

      const preset = presets.find((p) => p.slug === presetSlug);

      const res = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label,
          month,
          presetId: preset?.id ?? null,
          ourSku,
          competitorSkus: competitorSkus
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          oneToOneMode,
          mode,
          thresholds,
          coverageBlobUrl: coverageUpload.url,
          salesBlobUrl: salesUpload.url,
          createdBy: "team-user",
          results: previewResults,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to save run");
        return;
      }

      await loadRuns(runFilterSku);
      await openRun(data.runId);
      await loadHistoryForSku(ourSku);
    } catch (error) {
      console.error(error);
      alert("Failed to save shared run.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRun(runId: string) {
    await fetch(`/api/runs?runId=${encodeURIComponent(runId)}`, {
      method: "DELETE",
    });

    if (selectedRun?.id === runId) {
      setSelectedRun(null);
    }

    await loadRuns(runFilterSku);
    await loadHistoryForSku(ourSku);
  }

  const activeResults = previewResults ?? selectedRun?.results ?? null;
  const activeOneToOneMode = previewResults
    ? oneToOneMode
    : selectedRun?.oneToOneMode ?? oneToOneMode;
  const activeSku = previewResults ? ourSku : selectedRun?.ourSku ?? ourSku;
  const activeLabel = previewResults
    ? `Preview: ${label}`
    : selectedRun?.label ?? null;

  const filtered = useMemo(() => {
    if (!activeResults) return null;
    if (!search.trim()) return activeResults;

    const q = search.toLowerCase();
    const filterRows = (rows: any[]) =>
      rows.filter((r) =>
        `${r.agencyId} ${r.store} ${r.city} ${r.district}`
          .toLowerCase()
          .includes(q)
      );

    return {
      ...activeResults,
      cuts: filterRows(activeResults.cuts),
      fixes: filterRows(activeResults.fixes),
      adds: filterRows(activeResults.adds),
      outperform: filterRows(activeResults.outperform),
    };
  }, [activeResults, search]);

  const storeOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const run of historyRuns) {
      for (const store of run.results.allStores) {
        if (!map.has(store.agencyId)) {
          map.set(store.agencyId, store.store);
        }
      }
    }

    return Array.from(map.entries())
      .map(([agencyId, store]) => ({ agencyId, store }))
      .sort((a, b) => a.store.localeCompare(b.store));
  }, [historyRuns]);

  const skuData = useMemo(() => {
    return historyRuns.map((run) => ({
      month: run.month,
      Cuts: run.results.cuts.length,
      Fixes: run.results.fixes.length,
      Adds: run.results.adds.length,
      Outperform: run.results.outperform.length,
    }));
  }, [historyRuns]);

  const storeData = useMemo(() => {
    if (!selectedStoreId) return [];

    return historyRuns.map((run) => {
      const row = run.results.allStores.find(
        (r: any) => r.agencyId === selectedStoreId
      );

      return {
        month: run.month,
        Retail: row?.ourRetail ?? 0,
        Benchmark: run.oneToOneMode
          ? row?.oneToOneRetail ?? 0
          : row?.craftAvg ?? 0,
        Share: row?.share ? Number((row.share * 100).toFixed(1)) : 0,
      };
    });
  }, [historyRuns, selectedStoreId]);

  return (
    <main className="page">
      <div className="hero">
        <div>
          <h1>CFAO Team Tool</h1>
          <p>
            Shared presets, persistent saved runs, CSV export, true history
            charts, and corrected CFAO logic.
          </p>
        </div>
        <span className="badge">Vercel team version</span>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Analysis Setup</h2>
          <div className="row-4">
            <div>
              <label className="label">Preset</label>
              <select
                className="input"
                value={presetSlug}
                onChange={(e) => applyPreset(e.target.value)}
              >
                {presets.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Our SKU</label>
              <input
                className="input"
                value={ourSku}
                onChange={(e) => setOurSku(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Competitor SKUs</label>
              <input
                className="input"
                value={competitorSkus}
                onChange={(e) => setCompetitorSkus(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Mode</label>
              <select
                className="input"
                value={mode}
                onChange={(e) => {
                  const m = e.target.value as AnalysisMode;
                  setMode(m);
                  setThresholds(defaultThresholds(m));
                  setPreviewResults(null);
                }}
              >
                <option value="annual">Annual / 12M</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <label>
              <input
                type="checkbox"
                checked={oneToOneMode}
                onChange={(e) => {
                  setOneToOneMode(e.target.checked);
                  setPreviewResults(null);
                }}
              />{" "}
              1:1 competitor mode
            </label>
            <button
              className="secondary"
              onClick={() => {
                setThresholds(defaultThresholds(mode));
                setPreviewResults(null);
              }}
            >
              Reset thresholds
            </button>
            <button className="primary" onClick={savePreset}>
              Save preset
            </button>
          </div>

          <hr className="sep" />
          <h3>Editable Thresholds</h3>
          <div className="row-4">
            <div>
              <label className="label">Cut retail max</label>
              <input
                className="input"
                type="number"
                value={thresholds.cutRetailMax}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    cutRetailMax: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Cut wholesale max</label>
              <input
                className="input"
                type="number"
                value={thresholds.cutWholesaleMax}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    cutWholesaleMax: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Cut craft avg max</label>
              <input
                className="input"
                type="number"
                value={thresholds.cutCraftAvgMax}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    cutCraftAvgMax: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Fix craft avg min</label>
              <input
                className="input"
                type="number"
                value={thresholds.fixCraftAvgMin}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    fixCraftAvgMin: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Fix % of craft avg</label>
              <input
                className="input"
                type="number"
                step="0.05"
                value={thresholds.fixPctOfCraftAvg}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    fixPctOfCraftAvg: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Add craft avg min</label>
              <input
                className="input"
                type="number"
                value={thresholds.addCraftAvgMin}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    addCraftAvgMin: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Outperform retail min</label>
              <input
                className="input"
                type="number"
                value={thresholds.outperformRetailMin}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    outperformRetailMin: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Upload Shared Run</h2>
          <div className="row-2">
            <div>
              <label className="label">Month</label>
              <input
                className="input"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Run label</label>
              <input
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Item Coverage CSV</label>
              <input
                className="file"
                type="file"
                accept=".csv"
                onChange={(e) => {
                  setCoverageFile(e.target.files?.[0] ?? null);
                  setPreviewResults(null);
                }}
              />
            </div>
            <div>
              <label className="label">Annual Sales Summary CSV</label>
              <input
                className="file"
                type="file"
                accept=".csv"
                onChange={(e) => {
                  setSalesFile(e.target.files?.[0] ?? null);
                  setPreviewResults(null);
                }}
              />
            </div>
          </div>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <button
              className="secondary"
              onClick={runPreview}
              disabled={previewLoading}
            >
              {previewLoading ? "Running..." : "Run Preview"}
            </button>
            <button
              className="primary"
              onClick={saveRun}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save shared run"}
            </button>
          </div>

          <p className="note">
            Run Preview shows CFAO instantly without saving. Save shared run
            uploads the source CSVs to Blob and stores the preview results in
            Postgres for the team.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Saved Runs</h2>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <label className="label" style={{ marginBottom: 0 }}>
            Saved run filter
          </label>
          <select
            className="input"
            style={{ maxWidth: 260 }}
            value={runFilterSku}
            onChange={(e) => setRunFilterSku(e.target.value)}
          >
            <option value="ALL">All SKUs</option>
            {Array.from(new Set(runs.map((r) => r.our_sku)))
              .sort()
              .map((sku) => (
                <option key={sku} value={sku}>
                  {sku}
                </option>
              ))}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Label</th>
                <th>SKU</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.month}</td>
                  <td>{r.label}</td>
                  <td>{r.our_sku}</td>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td className="toolbar">
                    <button
                      className="secondary"
                      onClick={() => openRun(r.id)}
                    >
                      Open
                    </button>
                    <button
                      className="danger"
                      onClick={() => deleteRun(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!runs.length && <p className="small">No saved runs found.</p>}
        </div>
      </div>

      {activeResults && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>{activeLabel ? `Results: ${activeLabel}` : "Results"}</h2>
            <div className="toolbar">
              <input
                className="input"
                style={{ maxWidth: 360 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by agency ID, store, district..."
              />
              <span className="small">
                Cut tables include wholesale sanity check. Agency ID + store
                name are preserved.
              </span>
            </div>
          </div>

          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="small">Cuts</div>
              <div className="kpi-value">{filtered?.cuts.length ?? 0}</div>
            </div>
            <div className="card">
              <div className="small">Fixes</div>
              <div className="kpi-value">{filtered?.fixes.length ?? 0}</div>
            </div>
            <div className="card">
              <div className="small">Adds</div>
              <div className="kpi-value">{filtered?.adds.length ?? 0}</div>
            </div>
            <div className="card">
              <div className="small">Outperform</div>
              <div className="kpi-value">
                {filtered?.outperform.length ?? 0}
              </div>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <SectionTable
              title="Cut"
              rows={filtered?.cuts ?? []}
              oneToOneMode={activeOneToOneMode}
              variant="cut"
              ourSku={activeSku}
            />
            <SectionTable
              title="Fix"
              rows={filtered?.fixes ?? []}
              oneToOneMode={activeOneToOneMode}
              variant="fix"
              ourSku={activeSku}
            />
            <SectionTable
              title="Add"
              rows={filtered?.adds ?? []}
              oneToOneMode={activeOneToOneMode}
              variant="add"
              ourSku={activeSku}
            />
            <SectionTable
              title="Outperform"
              rows={filtered?.outperform ?? []}
              oneToOneMode={activeOneToOneMode}
              variant="outperform"
              ourSku={activeSku}
            />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>History Charts</h2>
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <span className="small">
                {historyLoading
                  ? "Loading store/SKU history..."
                  : `Loaded ${historyRuns.length} saved run(s) for SKU ${ourSku}`}
              </span>
            </div>

            <div className="row-2">
              <div>
                <label className="label">Store</label>
                <select
                  className="input"
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                >
                  <option value="">Select a store</option>
                  {storeOptions.map((s) => (
                    <option key={s.agencyId} value={s.agencyId}>
                      {s.agencyId} - {s.store}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <HistoryCharts skuData={skuData} storeData={storeData} />
         
</div>
<DeltaTables historyRuns={historyRuns} /> 
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Required Vercel setup</h2>
        <p className="note">
          Add Vercel Postgres and Vercel Blob to your project, then run the SQL
          in db/schema.sql.
        </p>
      </div>
    </main>
  );
}