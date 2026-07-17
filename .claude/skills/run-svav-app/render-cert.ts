/**
 * render-cert.ts — DIRECT INVOCATION of the production certificate pipeline (no HTTP, no browser).
 *
 * Imports the real production modules (carte generator + PDF assembler + PDF generator) and produces a
 * fresh certificate PDF for an already-emitted projet, writing it to disk. This is the layer most PRs touch
 * (carte / PDF rendering). Hits the network for IGN tiles (real Plan IGN mosaic) — a few seconds.
 *
 * Usage:  node_modules/.bin/tsx .claude/skills/run-svav-app/render-cert.ts <SAVV-NUMERO> <out.pdf>
 * Env:    DATABASE_URL, SITE_URL required (the driver loads .env / .env.local before calling this).
 */
const APP = process.cwd();
const numero = process.argv[2] ?? 'SAVV-2026-000012';
const outPdf = process.argv[3] ?? '/tmp/svav-cert.pdf';

async function main() {
  const { query } = await import(`${APP}/app/lib/db/client.ts`);
  const { genererCarteOrientation } = await import(`${APP}/app/lib/carte/orientationCarte.ts`);
  const { assembler } = await import(`${APP}/app/lib/pdf/publierCertificatPdf.ts`);
  const { genererCertificatPdf } = await import(`${APP}/app/lib/pdf/certificatPdf.ts`);
  const { ANALYSIS_RANGE_M, AMPLITUDE_BEAM_COUNT, AMPLITUDE_BEAM_STEP_DEG } = await import(`${APP}/app/lib/svv/config.ts`);
  const { writeFileSync } = await import('node:fs');

  // Geometry passed to the drawing = ENGINE geometry (single source, cf. publierCarteOrientation).
  const geom = {
    demiAngleDeg: ((AMPLITUDE_BEAM_COUNT - 1) / 2) * AMPLITUDE_BEAM_STEP_DEG,
    rayonAxeM: ANALYSIS_RANGE_M,
    rayonChampM: ANALYSIS_RANGE_M,
    arcPoints: 49,
  };

  const REQ = `SELECT c.numero, c.reference, c.emis_le, c.verdict, c.score, c.distance_obstacle_m, c.profondeur_moyenne_m,
      c.lat, c.lon, c.azimut_deg, c.etage, c.dernier_etage, c.hauteur_sous_plafond_m, c.hauteur_vision_m,
      c.adresse, c.type_bien, c.surface_m2, c.nb_pieces, c.annee_batiment, c.altitude_terrain_m,
      c.altitude_sol_m, c.reference_cadastrale, c.jeton_verification, c.photo_cle,
      ip.residence_principale, ip.mode_origine, ip.payload, i.prenom, i.nom, i.email, i.telephone,
      a.carte_orientation_cle
    FROM certificat c JOIN internaute_projet ip ON ip.id = c.projet_id
    LEFT JOIN internaute i ON i.id = ip.internaute_id
    LEFT JOIN certificat_acheminement a ON a.certificat_id = c.id
    WHERE c.numero = $1`;
  const row = (await query(REQ, [numero])).rows[0];
  if (!row) { console.error('numero introuvable:', numero); process.exit(1); }

  const carte: Buffer = await genererCarteOrientation(Number(row.lat), Number(row.lon), Number(row.azimut_deg), geom);
  const base = (process.env.SITE_URL ?? 'https://sansvisavis.com').replace(/\/+$/, '');
  const pdf: Buffer = await genererCertificatPdf(assembler(row, base, carte, null));
  writeFileSync(outPdf, pdf);
  console.log(`OK numero=${numero} pdf=${outPdf} bytes=${pdf.length}`);
  process.exit(0);
}
main().catch((e) => { console.error('RENDER ERROR', e?.message, '\n', e?.stack?.split('\n').slice(0, 4).join('\n')); process.exit(1); });
