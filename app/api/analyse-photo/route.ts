import { NextResponse } from "next/server";

// TEST UNIQUEMENT — simule la lenteur de l'analyse photo pour voir le spinner.
// À RETIRER quand l'IA réelle sera câblée.
const DELAI_TEST_MS = 3000;

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
  const { photo, lat, lon, azimut } = b;

  if (
    typeof photo !== "string" || photo.length === 0 ||
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lon !== "number" || !Number.isFinite(lon) ||
    typeof azimut !== "number" || !Number.isFinite(azimut)
  ) {
    return NextResponse.json(
      { ok: false, erreur: "Entrée invalide" },
      { status: 400 },
    );
  }

  // BOUCHON : aucun traitement IA pour l'instant.
  // FUTUR : { ok: true, disponible: true, score: <resultat.score mis à jour avec strate2 + malus photo> }
  // Pour l'instant, bouchon : disponible:false → la page résultat garde le score géométrique.
  await new Promise((res) => setTimeout(res, DELAI_TEST_MS));
  return NextResponse.json({ ok: true, disponible: false });
}
