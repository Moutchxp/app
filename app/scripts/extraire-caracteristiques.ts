/**
 * N5-A — CLI de MESURE : extrait les caractéristiques depuis le texte de la GED d'un permis et IMPRIME un rapport. N'écrit NULLE
 * PART (ni base, ni fichier, ni e-mail). Réutilise N4 `lireGedPermis` (texte page par page) puis le moteur PUR `extraireCandidats`.
 * Lancer : npm run permis:extraire -- --permis <num_dau> [--type PC|PD]. `chargerEnv` EN PREMIER (avant tout module db/client).
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats, distributionCotesQualifiees, type RapportExtraction } from '../lib/permis/extractionCaracteristiques';

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const prov = (p: { pieceNom: string; page: number }) => `${p.pieceNom} p.${p.page}`;

function imprimer(numDau: string, type: string, r: RapportExtraction): void {
  const b = r.bilan;
  console.log(`\n══════ EXTRACTION — permis ${numDau} (${type}) ══════`);
  console.log(`Pièces : ${b.nbPieces}`);
  console.log(`\n[COTES NGF] ${b.nbCotes} cote(s) sur ${b.piecesAvecCote} pièce(s) / ${b.pagesAvecCote} page(s).`);
  const qMax = b.coteMax?.qualificatifSommet ? ` [qualif : ${b.coteMax.qualificatifSommet}]` : '';
  console.log(`  Cote la plus HAUTE : ${b.coteMax ? `${b.coteMax.valeur} (${prov(b.coteMax.provenance)}, « ${b.coteMax.texteBrut} »)${qMax}` : '(aucune)'}`);

  console.log(`\n[NIVEAUX reconnus] ${b.niveaux.length} :`);
  for (const n of b.niveaux) {
    const valeurs = n.cotes.map((c) => `${c.valeur} (${prov(c.provenance)})`).join(' · ');
    console.log(`  ${n.niveau} : ${valeurs}`);
  }
  const cotesSansNiveau = r.cotes.filter((c) => c.niveau === null);
  if (cotesSansNiveau.length > 0) {
    console.log(`  cotes SANS niveau identifiable (niveau non deviné) : ${cotesSansNiveau.length}`);
    for (const c of cotesSansNiveau.slice(0, 20)) console.log(`    · ${c.valeur} (${prov(c.provenance)}, « ${c.texteBrut} »)`);
    if (cotesSansNiveau.length > 20) console.log(`    … et ${cotesSansNiveau.length - 20} autres`);
  }

  // N5-B2 — distribution des cotes QUALIFIÉES par valeur distincte : dit si la toiture a UN palier ou PLUSIEURS.
  const distrib = distributionCotesQualifiees(r);
  console.log(`\n[COTES QUALIFIÉES — distribution par valeur DISTINCTE] ${b.cotesQualifiees}/${b.nbCotes} cote(s) qualifiée(s)`);
  if (distrib.length === 0) console.log('  (aucune cote qualifiée)');
  for (const d of distrib) {
    console.log(`  « ${d.qualificatif} » : ${d.valeurs.length} valeur(s) distincte(s)`);
    for (const v of d.valeurs) {
      const pages = [...new Set(v.provenances.map(prov))];
      const apercu = pages.slice(0, 8).join(' · ') + (pages.length > 8 ? ` … +${pages.length - 8}` : '');
      const rep = v.reperesMemePage.length ? `  [repère(s) même page — NON attribué(s) : ${v.reperesMemePage.join(', ')}]` : '';
      console.log(`     ${v.valeur} ×${v.effectif} — ${apercu}${rep}`);
    }
  }

  console.log(`\n[HAUTEUR SOUS PLAFOND annoncée] ${r.hsp.length}${r.hsp.length ? ' : ' + r.hsp.map((h) => `${h.valeurM} m (${prov(h.provenance)})`).join(' · ') : ' (aucune)'}`);
  console.log(`[ÉPAISSEUR DE DALLE annoncée] ${r.dalles.length}${r.dalles.length ? ' : ' + r.dalles.map((d) => `${d.valeurM} m (${prov(d.provenance)})`).join(' · ') : ' (aucune)'}`);

  console.log(`\n[GABARITS R+n] ${r.gabarits.length} :`);
  for (const g of r.gabarits) console.log(`  R+${g.rMin}${g.rMax !== g.rMin ? ` à R+${g.rMax}` : ''} (${prov(g.provenance)}, « ${g.texteBrut} »)`);
  console.log(`[SOUS-SOLS] ${r.sousSols.length} :`);
  for (const s of r.sousSols) console.log(`  ${s.niveaux} niveau(x) (${prov(s.provenance)}, « ${s.texteBrut} »)`);
  console.log(`[REPÈRES de corps — signal faible] ${r.reperes.length} :`);
  for (const rp of r.reperes.slice(0, 20)) console.log(`  ${rp.repere} (${prov(rp.provenance)}, « ${rp.texteBrut} »)`);

  const pasDeTexte = b.piecesSansCandidat.filter((p) => p.motif === 'pas_de_texte');
  const texteSansMotif = b.piecesSansCandidat.filter((p) => p.motif === 'texte_sans_motif');
  console.log(`\n[PIÈCES SANS AUCUN CANDIDAT] ${b.piecesSansCandidat.length}`);
  console.log(`  · pas de texte (muettes → OCR) : ${pasDeTexte.length}`);
  for (const p of pasDeTexte) console.log(`      ${p.pieceNom}`);
  console.log(`  · texte présent mais aucun motif reconnu : ${texteSansMotif.length}`);
  for (const p of texteSansMotif) console.log(`      ${p.pieceNom}`);
  console.log('');
}

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:extraire -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const type = lireArg('--type');

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) {
    if (resolu.raison === 'inconnu') console.error(`[permis:extraire] permis inconnu : « ${numDau} »${type ? ` (type ${type})` : ''}.`);
    else { console.error(`[permis:extraire] num_dau « ${numDau} » AMBIGU — précise --type parmi :`); for (const c of resolu.candidats) console.error(`    --type ${c.type}   (INSEE ${c.codeInsee})`); }
    process.exitCode = 2;
    return;
  }

  const ged = await lireGedPermis(resolu.dossier.dossierId, depsReellesLectureGed());
  imprimer(resolu.dossier.numDau, resolu.dossier.type, extraireCandidats(ged));
}

void main()
  .catch((e) => { console.error('[permis:extraire] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
