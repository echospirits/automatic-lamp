import { NextResponse } from "next/server";
import { DEFAULT_PRESETS } from "@/lib/cfao";
import { listPresets, upsertPreset } from "@/lib/db";

export async function GET() {
  try {
    const rows = await listPresets();
    if (!rows.length) {
      for (const p of DEFAULT_PRESETS) {
        await upsertPreset(p);
      }
      return NextResponse.json(await listPresets());
    }
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json({ error: "Failed to load presets", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await upsertPreset(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save preset", detail: String(error) }, { status: 500 });
  }
}
