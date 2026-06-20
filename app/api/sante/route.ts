import { NextResponse } from "next/server";
import { query } from "../../lib/db/client";

export async function GET() {
  try {
    const version = await query<{ v: string }>("SELECT version() AS v");
    const postgis = await query<{ v: string }>("SELECT PostGIS_Version() AS v");
    const batiments = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM bdtopo_batiment",
    );
    const colonnes = await query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'bdtopo_batiment'
       ORDER BY ordinal_position`,
    );

    return NextResponse.json({
      ok: true,
      postgres: version.rows[0].v,
      postgis: postgis.rows[0].v,
      nbBatiments: batiments.rows[0].n,
      colonnes: colonnes.rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
