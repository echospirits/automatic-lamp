import { sql } from "@vercel/postgres";

export async function listPresets() {
  const res = await sql`SELECT * FROM sku_presets ORDER BY name`;
  return res.rows;
}

export async function upsertPreset(preset: {
  slug: string; name: string; ourSku: string; competitorSkus: string[];
  oneToOneMode: boolean; mode: string; thresholds: unknown; notes?: string;
}) {
  await sql`
    INSERT INTO sku_presets (slug, name, our_sku, competitor_skus, one_to_one_mode, mode, thresholds, notes)
    VALUES (${preset.slug}, ${preset.name}, ${preset.ourSku}, ${JSON.stringify(preset.competitorSkus)}::jsonb, ${preset.oneToOneMode}, ${preset.mode}, ${JSON.stringify(preset.thresholds)}::jsonb, ${preset.notes ?? null})
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      our_sku = EXCLUDED.our_sku,
      competitor_skus = EXCLUDED.competitor_skus,
      one_to_one_mode = EXCLUDED.one_to_one_mode,
      mode = EXCLUDED.mode,
      thresholds = EXCLUDED.thresholds,
      notes = EXCLUDED.notes,
      updated_at = NOW()
  `;
}

export async function createRun(run: any) {
  const res = await sql`
    INSERT INTO analysis_runs (
      label, month, preset_id, our_sku, competitor_skus, one_to_one_mode, mode, thresholds, coverage_blob_url, sales_blob_url, created_by
    ) VALUES (
      ${run.label}, ${run.month}, ${run.presetId ?? null}, ${run.ourSku}, ${JSON.stringify(run.competitorSkus)}::jsonb,
      ${run.oneToOneMode}, ${run.mode}, ${JSON.stringify(run.thresholds)}::jsonb,
      ${run.coverageBlobUrl ?? null}, ${run.salesBlobUrl ?? null}, ${run.createdBy ?? null}
    ) RETURNING id
  `;
  return res.rows[0].id as string;
}

export async function createResult(runId: string, row: any) {
  await sql`
    INSERT INTO analysis_results (
      run_id, agency_id, store, city, district, inventory, doh, placed, our_retail, our_wholesale,
      craft_avg, one_to_one_retail, share, gap_to_fix, segment, bucket
    ) VALUES (
      ${runId}, ${row.agencyId}, ${row.store}, ${row.city}, ${row.district}, ${row.inventory}, ${row.doh},
      ${row.placed}, ${row.ourRetail}, ${row.ourWholesale}, ${row.craftAvg}, ${row.oneToOneRetail},
      ${row.share}, ${row.gapToFix ?? null}, ${row.segment ?? null}, ${row.bucket ?? "none"}
    )
  `;
}

export async function listRuns(ourSku?: string) {
  const res = ourSku
    ? await sql`SELECT * FROM analysis_runs WHERE our_sku = ${ourSku} ORDER BY created_at DESC`
    : await sql`SELECT * FROM analysis_runs ORDER BY created_at DESC`;
  return res.rows;
}

export async function getRun(runId: string) {
  const run = await sql`SELECT * FROM analysis_runs WHERE id = ${runId} LIMIT 1`;
  const rows = await sql`SELECT * FROM analysis_results WHERE run_id = ${runId} ORDER BY store`;
  return { run: run.rows[0] ?? null, rows: rows.rows };
}

export async function removeRun(runId: string) {
  await sql`DELETE FROM analysis_runs WHERE id = ${runId}`;
}
