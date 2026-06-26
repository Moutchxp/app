import { NextResponse } from "next/server";
import { analyserAdresse, type ParametresAnalyse } from "../../lib/db/pipeline";
import { preparerPaysageGeometrique } from "../../lib/svv/preparateurPaysage";
import { analyserPhotoIa } from "../../lib/svv/adaptateurIaPhoto";
import { assemblerEntreePaysage } from "../../lib/svv/fusionPaysage";
import type { ModeOrigine } from "../../lib/svv/config";

// TEST UNIQUEMENT — simule la lenteur de l'analyse photo pour voir le spinner.
// À RETIRER quand l'affichage "en cours" aura été validé sur iPhone.
const DELAI_TEST_MS = 3000;

export async function POST(req: Request) {
  // 1) Parse body défensif
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erreur: "Corps JSON invalide." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const { photo, lat, lon, azimut } = b;
  // champs optionnels (le front les ajoutera au commit 3) — défauts défensifs :
  const etage = typeof b.etage === "number" ? b.etage : 0;
  const dernierEtage = b.dernierEtage === true;
  const mode: ModeOrigine = b.mode === "manuel" ? "manuel" : "semi_auto";

  if (
    typeof photo !== "string" || photo.length === 0 ||
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lon !== "number" || !Number.isFinite(lon) ||
    typeof azimut !== "number" || !Number.isFinite(azimut)
  ) {
    return NextResponse.json({ ok: false, erreur: "Entrée invalide" }, { status: 400 });
  }

  // Délai de test (garde le spinner visible)
  await new Promise((res) => setTimeout(res, DELAI_TEST_MS));

  // 2) RUN #1 — pipeline géométrique déterministe (sans IA) : donne le snap + le score de repli
  const params1: ParametresAnalyse = {
    point: { lat, lon },
    azimutPrincipalDeg: azimut,
    etage,
    dernierEtage,
    mode,
  };
  const run1 = await analyserAdresse(params1);
  const scoreRepli = run1.resultat?.score.total ?? null;
  const pointSnappe = run1.validation.pointSnappeL93;

  // Si pas de point snappé valide ou pas de résultat → indisponible (on garde le score géométrique côté front)
  if (!run1.resultat || !pointSnappe) {
    return NextResponse.json({ ok: true, disponible: false, raison: "snap_indisponible", score: scoreRepli });
  }

  // 3) Géométrie paysage (candidats monuments) à partir du point snappé
  let geo;
  try {
    geo = await preparerPaysageGeometrique(pointSnappe, azimut);
  } catch (e) {
    console.warn("[analyse-photo] préparateur paysage échoué", e);
    return NextResponse.json({ ok: true, disponible: false, raison: "preparateur_echec", score: scoreRepli });
  }

  // 4) Analyse IA (photoDataUrl complète OK : analyserPhotoIa strippe le préfixe en interne)
  const ia = await analyserPhotoIa({
    photoDataUrl: photo,
    azimutPrincipalDeg: azimut,
    candidats: geo.monuments,
  });

  // 4a) Échec technique de l'IA → score estimé sans photo
  if (ia.statut === "echec_technique") {
    return NextResponse.json({ ok: true, disponible: false, raison: "echec_technique", detail: ia.raison, score: scoreRepli });
  }

  // 4b) Photo inexploitable → score partiel (identique au géométrique, monuments/nuisances vidés par la fusion)
  if (!ia.reponse.photoExploitable) {
    return NextResponse.json({ ok: true, disponible: true, exploitable: false, score: scoreRepli });
  }

  // 5) Photo exploitable → fusion géo+IA puis RUN #2 avec injection paysage → total enrichi
  const paysage = assemblerEntreePaysage(geo, ia.reponse);
  const params2: ParametresAnalyse = { ...params1, paysage };
  const run2 = await analyserAdresse(params2);
  const scoreEnrichi = run2.resultat?.score.total ?? scoreRepli;

  return NextResponse.json({ ok: true, disponible: true, exploitable: true, score: scoreEnrichi });
}
