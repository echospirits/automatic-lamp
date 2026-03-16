import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import Papa from "papaparse";
import { computeCfao } from "@/lib/cfao";
import { createResult, createRun, getRun, listRuns, removeRun } from "@/lib/db";

function parseCsvText(text: string) {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return result.data;
}

function regroup(rows: any[]) {
  const allStores = rows.map((r) => ({
    agencyId: r.agency_id,
    store: r.store,
    city: r.city ?? "",
    district: r.district ?? "",
    inventory: Number(r.inventory ?? 0),
    doh: Number(r.doh ?? 0),
    placed: Boolean(r.placed),
    ourRetail: Number(r.our_retail ?? 0),
    ourWholesale: Number(r.our_wholesale ?? 0),
    competitorRetails: [],
    craftAvg: Number(r.craft_avg ?? 0),
    oneToOneRetail: Number(r.one_to_one_retail ?? 0),
    share: Number(r.share ?? 0),
    gapToFix: r.gap_to_fix == null ? undefined : Number(r.gap_to_fix),
    segment: r.segment ?? undefined,
    bucket: r.bucket,
  }));
  return {
    allStores,
    cuts: allStores.filter((r) => r.bucket === "cut"),
    fixes: allStores.filter((r) => r.bucket === "fix"),
    adds: allStores.filter((r) => r.bucket === "add"),
    outperform: allStores.filter((r) => r.bucket === "outperform"),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    const ourSku = url.searchParams.get("ourSku") || undefined;
    if (runId) {
      const { run, rows } = await getRun(runId);
      if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
      return NextResponse.json({
        id: run.id,
        label: run.label,
        month: run.month,
        ourSku: run.our_sku,
        createdAt: run.created_at,
        oneToOneMode: run.one_to_one_mode,
        results: regroup(rows),
      });
    }
    return NextResponse.json(await listRuns(ourSku));
  } catch (error) {
    return NextResponse.json({ error: "Failed to load runs", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const coverageFile = form.get("coverageFile") as File | null;
    const salesFile = form.get("salesFile") as File | null;
    if (!coverageFile || !salesFile) {
      return NextResponse.json({ error: "Coverage and sales files are required" }, { status: 400 });
    }

    const label = String(form.get("label") ?? "");
    const month = String(form.get("month") ?? "");
    const presetId = String(form.get("presetId") ?? "") || null;
    const ourSku = String(form.get("ourSku") ?? "");
    const competitorSkus = JSON.parse(String(form.get("competitorSkus") ?? "[]"));
    const oneToOneMode = String(form.get("oneToOneMode") ?? "false") === "true";
    const mode = String(form.get("mode") ?? "annual");
    const thresholds = JSON.parse(String(form.get("thresholds") ?? "{}"));
    const createdBy = String(form.get("createdBy") ?? "") || null;

    const coverageText = await coverageFile.text();
    const salesText = await salesFile.text();

    const coverageRows = parseCsvText(coverageText);
    const salesRows = parseCsvText(salesText);

    const results = computeCfao({ coverageRows, salesRows, ourSku, competitorSkus, oneToOneMode, mode, thresholds });

    const coverageBlob = await put(`coverage/${month}-${coverageFile.name}`, coverageText, { access: "public", contentType: "text/csv", addRandomSuffix: true });
    const salesBlob = await put(`sales/${month}-${salesFile.name}`, salesText, { access: "public", contentType: "text/csv", addRandomSuffix: true });

    const runId = await createRun({
      label, month, presetId, ourSku, competitorSkus, oneToOneMode, mode, thresholds,
      coverageBlobUrl: coverageBlob.url, salesBlobUrl: salesBlob.url, createdBy
    });

    for (const row of results.allStores) {
      await createResult(runId, row);
    }

    return NextResponse.json({ ok: true, runId });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save run", detail: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });
    await removeRun(runId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete run", detail: String(error) }, { status: 500 });
  }
}
