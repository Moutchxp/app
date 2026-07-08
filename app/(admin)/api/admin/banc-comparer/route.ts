import { NextResponse } from "next/server";
import { comparerProfils } from "../../../../lib/db/bancEssai";
import type { ProfilDegagement } from "../../../../lib/svv/profilDegagement";

/**
 * Banc M5 · Lot 5 — exécution ×2 (actif/test) + comparaison. LECTURE SEULE (comparerProfils ne fait que des
 * SELECT + calcul pur). Gardé par proxy.ts (matcher /api/admin/:path*). `profilTest` optionnel (Lot 2b) :
 * absent → clone du profil actif (délta nul).
 */
export async function POST(req: Request) {
  let body: {
    point?: { lat?: unknown; lon?: unknown };
    azimutPrincipalDeg?: unknown;
    etage?: unknown;
    hauteurSousPlafondM?: unknown;
    dernierEtage?: unknown;
    mode?: unknown;
    profilTest?: ProfilDegagement;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Corps de requête invalide." }, { status: 400 });
  }

  const lat = body?.point?.lat;
  const lon = body?.point?.lon;
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    typeof body.azimutPrincipalDeg !== "number" ||
    typeof body.etage !== "number"
  ) {
    return NextResponse.json({ ok: false, message: "Paramètres manquants ou invalides." }, { status: 400 });
  }

  try {
    const comparaison = await comparerProfils(
      {
        point: { lat, lon },
        azimutPrincipalDeg: body.azimutPrincipalDeg,
        etage: body.etage,
        hauteurSousPlafondM: typeof body.hauteurSousPlafondM === "number" ? body.hauteurSousPlafondM : undefined,
        dernierEtage: body.dernierEtage === true,
        mode: body.mode === "manuel" ? "manuel" : "semi_auto",
      },
      body.profilTest,
    );
    return NextResponse.json(comparaison);
  } catch {
    return NextResponse.json({ ok: false, message: "Exécution indisponible." }, { status: 500 });
  }
}
