import { NextResponse } from "next/server";
import { validerOrigine } from "../../lib/db/origine";

type Statut = "VALIDE" | "HORS_BATIMENT" | "SANS_BATIMENT";

export async function POST(req: Request) {
  let lat: unknown;
  let lon: unknown;
  try {
    const body = await req.json();
    lat = body?.lat;
    lon = body?.lon;
  } catch {
    return NextResponse.json({ erreur: "lat/lon requis" }, { status: 400 });
  }

  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ erreur: "lat/lon requis" }, { status: 400 });
  }

  try {
    const v = await validerOrigine({ lat, lon });

    // Statut dérivé.
    // NB : validerOrigine ne renseigne batimentOrigine que si valide. Le signal
    // « aucun bâtiment trouvé » est donc distanceAuBatimentM = Infinity (0 ligne),
    // sinon un bâtiment existe mais le point est hors tolérance → HORS_BATIMENT.
    let statut: Statut;
    if (v.valide) {
      statut = "VALIDE";
    } else if (Number.isFinite(v.distanceAuBatimentM)) {
      statut = "HORS_BATIMENT";
    } else {
      statut = "SANS_BATIMENT";
    }

    // Messages FR pour l'UI.
    const altTxt = v.altitudeTerrainOrigineM === null ? "non disponible" : `${v.altitudeTerrainOrigineM} m`;
    let message: string;
    if (statut === "VALIDE" && v.dansBatiment) {
      message = `Point validé — à l'intérieur du bâtiment (altitude terrain ${altTxt}).`;
    } else if (statut === "VALIDE") {
      const cm = (v.distanceAuBatimentM * 100).toFixed(0);
      message = `Point validé — sur la façade, à ${cm} cm du bâtiment (altitude terrain ${altTxt}).`;
    } else if (statut === "HORS_BATIMENT") {
      message = `Point hors bâtiment (à ${v.distanceAuBatimentM.toFixed(2)} m). Déplacez le marqueur sur la pièce de vie.`;
    } else {
      message = "Aucun bâtiment détecté ici — certificat impossible à cet emplacement.";
    }

    return NextResponse.json({
      statut,
      valide: v.valide,
      message,
      dansBatiment: v.dansBatiment,
      distanceAuBatimentM: v.distanceAuBatimentM,
      batimentOrigine: v.batimentOrigine,
      altitudeTerrainOrigineM: v.altitudeTerrainOrigineM,
    });
  } catch {
    return NextResponse.json({ erreur: "validation indisponible" }, { status: 500 });
  }
}
