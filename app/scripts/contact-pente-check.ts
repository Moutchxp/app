import { query, closePool } from "../lib/db/client";
import { hauteurLidarMaxNettoye } from "../lib/db/hauteurLidar";
import { pointDeContact } from "../lib/svv/contact";

/**
 * Validation du point de contact sur un TOIT EN PENTE (240320058).
 * Origine = centroïde − 80 m en x (plein ouest), azimut 90° → l'axe traverse
 * le bâtiment ; on prend une hauteur de référence à mi-pente montante et on
 * vérifie que dContact = milieu(façade, franchissement) < franchissement.
 */
interface AxeWkt { id: number; axe_wkt: string; corr_wkt: string; }

async function montage(): Promise<AxeWkt | null> {
  const res = await query<AxeWkt>(
    `WITH c AS (SELECT id, ST_Centroid(ST_Force2D(geom)) AS g FROM bdtopo_batiment WHERE cleabs='BATIMENT0000000240320058'),
     o AS (SELECT id, ST_Translate(c.g, -80, 0) AS g FROM c),
     axe AS (SELECT o.id, ST_MakeLine(o.g, ST_Translate(o.g,200*sin(radians(90)),200*cos(radians(90)))) AS ligne FROM o)
     SELECT id, ST_AsText(ligne) AS axe_wkt, ST_AsText(ST_Buffer(ligne,1.0)) AS corr_wkt FROM axe;`,
  );
  return res.rows[0] ?? null;
}

async function main() {
  const a = await montage();
  if (!a || a.id === null) { console.error("✗ Bâtiment 240320058 introuvable."); process.exitCode = 1; return; }

  const l = await hauteurLidarMaxNettoye({ batimentId: a.id, corridorWkt: a.corr_wkt, axisLineWkt: a.axe_wkt });
  if (l.hauteurM === null || l.dFacadeM === null || l.profil.length === 0) {
    console.error("✗ Profil/faîtage indisponible."); process.exitCode = 1; return;
  }

  const faiteage = l.hauteurM;
  const alt0 = l.profil[0].altM;
  const reference = alt0 + 0.5 * (faiteage - alt0); // mi-pente montante
  const faiteagePoint = l.profil.reduce((m, p) => (p.altM > m.altM ? p : m), l.profil[0]);

  const res = pointDeContact(l.dFacadeM, l.profil, reference, faiteage);

  console.log("Validation point de contact — TOIT EN PENTE (240320058)\n");
  console.log(`  dFacadeM            : ${l.dFacadeM.toFixed(2)} m`);
  console.log(`  faîtage (hauteurM)  : ${faiteage.toFixed(2)} m  (à dist ${faiteagePoint.distM.toFixed(2)} m)`);
  console.log(`  altM 1er point      : ${alt0.toFixed(2)} m`);
  console.log(`  reference (mi-pente): ${reference.toFixed(2)} m`);
  console.log(`  dFranchissementM    : ${res.dFranchissementM?.toFixed(2)} m`);
  console.log(`  dContactM           : ${res.dContactM?.toFixed(2)} m`);
  console.log(`  raison              : ${res.raison}\n`);

  const df = res.dFranchissementM!;
  const dc = res.dContactM!;
  const okFranchApresFacade = l.dFacadeM < df;
  const okMilieu = Math.abs(dc - (l.dFacadeM + df) / 2) < 1e-9;
  const okMarge = dc < df;
  console.log(`  ✔ dFacade < dFranchissement      : ${okFranchApresFacade}  (${l.dFacadeM.toFixed(2)} < ${df.toFixed(2)})`);
  console.log(`  ✔ dContact = (façade+franch)/2   : ${okMilieu}`);
  console.log(`  ✔ dContact < dFranchissement     : ${okMarge}  (marge de sécurité raccourcit la distance)`);
  if (!(okFranchApresFacade && okMilieu && okMarge)) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("✗ Échec :", e.message); process.exitCode = 1; })
  .finally(() => closePool());
