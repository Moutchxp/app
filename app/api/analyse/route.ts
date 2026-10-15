import { NextResponse, after } from "next/server";
import { analyserAdresse } from "../../lib/db/pipeline";
import { avecPlafondAnalyse, estPlafondAtteint } from "../../lib/db/plafondAnalyse";
import { verifierCadence, purgerCadence } from "../../lib/cadence/limiteur";
import { sujetVisiteur } from "../../lib/cadence/ip";
import { internauteConnecteDepuisCookies } from "../../lib/internaute/gardeEspace";
import type { ModeOrigine } from "../../lib/svv/config";
// M2 (LOT 2) — instrumentation best-effort, dans la couche ROUTE (jamais le moteur ; garde anti-couplage OK).
import { incrementerCompteur } from "../../lib/analytics/writer";
import { communeDuPoint } from "../../lib/analytics/commune";
import { scoreTranche } from "../../lib/analytics/contexte";
// Lot ZONE SANS LiDAR — pourquoi une analyse s'arrête sans verdict (couche ROUTE, après le calcul ; moteur intact).
import { mntSousLePoint } from "../../lib/db/couvertureLidar";
import { motifSansResultat, dalleIgn, type MotifSansResultat } from "../../lib/tunnel/motifSansResultat";
import { journaliserAnalyseSansLidar } from "../../lib/analytics/sansLidar";

// `after()` (émission post-réponse) requiert le runtime Node (déjà le défaut ; rendu explicite).
export const runtime = "nodejs";

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
  // hauteur sous plafond optionnelle : nombre > 0, sinon undefined → le moteur applique 2,50.
  const hauteurSousPlafondM =
    typeof b.hauteurSousPlafondM === "number" && b.hauteurSousPlafondM > 0 ? b.hauteurSousPlafondM : undefined;
  // adresse saisie, optionnelle : n'entre JAMAIS dans le calcul ; sert seulement au journal d'une analyse sans LiDAR.
  const adresse = typeof b.adresse === "string" && b.adresse.trim() !== "" ? b.adresse.trim().slice(0, 300) : null;

  // ── CADENCE (résidu G4) — APRÈS la validation d'entrée (une requête malformée ne consomme pas de quota),
  //    AVANT le calcul (c'est lui qu'on protège). Un titulaire de compte est compté PAR COMPTE et n'a aucune
  //    limite journalière ni totale ; un visiteur sans compte est compté par adresse (cf. `cadence/ip.ts`).
  let internauteId: string | null = null;
  try {
    internauteId = await internauteConnecteDepuisCookies();
  } catch {
    internauteId = null; // session illisible → traité comme un visiteur, jamais comme une erreur
  }
  const cadence = await verifierCadence("analyse", sujetVisiteur(req), internauteId);
  if (!cadence.autorise) {
    return NextResponse.json(
      { ok: false, code: cadence.code, sansCompte: cadence.sansCompte, erreur: "Trop d'analyses en peu de temps." },
      { status: 429, headers: { "Retry-After": String(cadence.retryApresS), "Cache-Control": "no-store" } },
    );
  }

  let sortie: Awaited<ReturnType<typeof analyserAdresse>>;
  try {
    // `avecPlafondAnalyse` borne l'attente de la BASE pour ce seul appel (statement_timeout 15 s,
    // attente d'une connexion 10 s) — cf. `lib/db/plafondAnalyse.ts`. Le calcul, le score et le verdict
    // sont strictement inchangés : seul le pool qui porte les requêtes change, à l'intérieur de ce try.
    sortie = await avecPlafondAnalyse(() =>
      analyserAdresse({
        point: { lat, lon },
        azimutPrincipalDeg: azimut,
        etage,
        hauteurSousPlafondM,
        dernierEtage,
        mode,
      }),
    );
  } catch (e) {
    // Plafond atteint → erreur PROPRE et transitoire (503) : le front affiche un message figé, jamais
    // une trace technique. On journalise sans détail SQL (le message pg peut contenir la requête).
    if (estPlafondAtteint(e)) {
      console.error("[/api/analyse] plafond base atteint (requête 15 s / connexion 10 s) — 503 rendu");
      return NextResponse.json(
        {
          ok: false,
          erreur:
            "Le service d'analyse n'a pas pu interroger ses données dans le délai imparti. Merci de relancer l'analyse dans un instant.",
        },
        { status: 503 },
      );
    }
    console.error("[/api/analyse] échec pipeline:", e);
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  // ── Instrumentation M2 (LOT 2) — HORS du try de calcul, best-effort, POST-RÉPONSE ──────────────────
  // Émet l'événement `resultat` (verdict OBSERVÉ + tranche de score + commune dérivée). Garanties :
  //  - ne peut JAMAIS throw vers l'appelant (after() enveloppé + writer/commune sans exception) ;
  //  - ne peut JAMAIS bloquer/ralentir (tout est différé après la réponse ; commune = KNN sur le pool
  //    analytique DÉDIÉ) ;
  //  - le verdict/score sont seulement LUS (jamais modifiés ni recalculés) → golden intact ;
  //  - lat/lon servent au lookup commune EN VOL puis sont jetés — seul l'INSEE (5 car) est stocké.
  const { validation, resultat } = sortie;

  // ── POURQUOI SANS VERDICT (lot ZONE SANS LiDAR) — seulement quand le moteur n'a rien rendu. Origine dans un bâtiment
  //    mais altitude absente : une dalle MNT couvre-t-elle le point ? Non → zone sans relevés (« pas_de_lidar ») ; oui →
  //    simple trou de valeur. Une vérification en échec ne prétend jamais « pas de LiDAR » (repli altitude_indisponible).
  let motif: MotifSansResultat | null = null;
  if (resultat === null) {
    let mnt: boolean | null = null;
    if (validation.valide === true && validation.altitudeTerrainOrigineM == null && validation.pointSnappeL93) {
      const pointL93 = validation.pointSnappeL93;
      mnt = await avecPlafondAnalyse(() => mntSousLePoint(pointL93)).catch((e) => {
        console.error("[/api/analyse] vérification de couverture LiDAR impossible — motif altitude_indisponible", e instanceof Error ? e.message : e);
        return null;
      });
    }
    motif = motifSansResultat(validation, mnt);
  }

  try {
    after(async () => {
      try {
        const verdict = resultat ? resultat.verdict.verdict : "INDETERMINE";
        const tranche = resultat ? scoreTranche(resultat.score.total) : null;
        const commune = await communeDuPoint(lat, lon);
        await incrementerCompteur({
          nom: "resultat", verdict, scoreTranche: tranche, communeInsee: commune,
          ...(motif === "pas_de_lidar" ? { raison: "hors_lidar" } : {}),
        });
        if (motif === "pas_de_lidar") {
          const p = validation.pointSnappeL93;
          await journaliserAnalyseSansLidar({
            adresse, lat, lon, xL93: p?.x ?? null, yL93: p?.y ?? null, dalle: p ? dalleIgn(p.x, p.y) : null, communeInsee: commune,
          });
        }
        await purgerCadence(); // purge des vieux compteurs, post-réponse et best-effort (aucune tâche planifiée à tenir)
      } catch (e) {
        console.error("[analytics] émission resultat abandonnée", e);
      }
    });
  } catch (e) {
    console.error("[analytics] after() indisponible — resultat abandonné", e);
  }

  return NextResponse.json({ ok: true, validation, resultat, ...(motif ? { motif } : {}) });
}
