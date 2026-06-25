import { NextResponse } from "next/server";
import { analyserAdresse } from "../../lib/db/pipeline";
import type { ModeOrigine } from "../../lib/svv/config";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, erreur: "Corps JSON invalide." },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;
  const { lat, lon, azimut, etage, dernierEtage } = b;

  if (
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lon !== "number" || !Number.isFinite(lon) ||
    typeof azimut !== "number" || !Number.isFinite(azimut) ||
    typeof etage !== "number" || !Number.isFinite(etage) ||
    typeof dernierEtage !== "boolean"
  ) {
    return NextResponse.json(
      {
        ok: false,
        erreur:
          "Entrées requises : lat, lon, azimut, etage (nombres) et dernierEtage (booléen).",
      },
      { status: 400 },
    );
  }

  // mode optionnel et défensif : tout ce qui n'est pas exactement "manuel" → "semi_auto".
  const mode: ModeOrigine = b.mode === "manuel" ? "manuel" : "semi_auto";

  try {
    const { validation, resultat } = await analyserAdresse({
      point: { lat, lon },
      azimutPrincipalDeg: azimut,
      etage,
      dernierEtage,
      mode,
    });
    return NextResponse.json({ ok: true, validation, resultat });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
