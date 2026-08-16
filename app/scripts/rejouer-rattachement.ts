/**
 * FUS-2 — REJEU À BLANC du moteur de rattachement sur un permis : dit ce que le moteur conclurait AUJOURD'HUI (verdict, régime,
 * critères, preuves), SANS rien écrire en base et SANS e-mail ni page (chantiers FUS-3/4). Lecture seule.
 *
 * ⚠️ GARDE : imprime les TROIS seuils effectivement utilisés ET leur PROVENANCE (valeur en base, ou repli sur défaut si la
 * migration 115 n'est pas appliquée) — on sait toujours avec quels seuils une décision serait prise.
 * Lancer : npm run permis:rejouer-rattachement -- --permis <num_dau> [--type PC|PD].
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier } from '../lib/permis/lectureGed';
import { rejouerRattachement } from '../lib/permis/rattachementRepo';

const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:rejouer-rattachement -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const resolu = await resoudreDossier(numDau, lireArg('--type'));
  if (!resolu.ok) { console.error(`[permis:rejouer-rattachement] permis non résolu : ${numDau}`); process.exitCode = 2; return; }
  const { dossierId, numDau: dau } = resolu.dossier;

  const { entrees, contexte, resultat } = await rejouerRattachement(dossierId);

  console.log(`\n══════ REJEU RATTACHEMENT — ${dau} (dossier ${dossierId}) ══════`);
  console.log(`Seuils utilisés (${contexte.seuilsProvenance === 'base' ? 'valeurs en base' : 'REPLI SUR DÉFAUT — migration 115 non appliquée'}) :`);
  console.log(`  · surface   ${contexte.seuilsBrut.surfacePct} %  (ratio ${entrees.seuils.seuilSurface})`);
  console.log(`  · bordure   ${contexte.seuilsBrut.bordurePct} %  (ratio ${entrees.seuils.seuilBordure})`);
  console.log(`  · marge alt ${contexte.seuilsBrut.margeAltitudeCm} cm (${entrees.seuils.margeAltitudeM} m)`);

  console.log(`\nContexte :`);
  console.log(`  empreinte : ${entrees.empreinteComplete ? `complète${contexte.empreinteSurfaceM2 !== null ? ` (${Math.round((contexte.empreinteSurfaceM2 + Number.EPSILON) * 10) / 10} m²)` : ''}${contexte.empreinteMillesime ? `, millésime ${contexte.empreinteMillesime}` : ''}` : 'INCOMPLÈTE / non figée'}`);
  console.log(`  parcelles d'origine : ${contexte.nbOrigineEncore}/${contexte.nbParcellesOrigine} encore au cadastre courant → régime ${entrees.parcellesOrigineToujoursLa ? 'SANS fusion' : 'AVEC fusion'}`);
  if (entrees.parcelleCandidate) {
    console.log(`  parcelle candidate : ${entrees.parcelleCandidate.idu ?? '—'} · recouvrement ${(entrees.parcelleCandidate.ratioSurface * 100).toFixed(1)} % · bordure ${(entrees.parcelleCandidate.partBordure * 100).toFixed(1)} %`);
  } else if (!entrees.parcellesOrigineToujoursLa) {
    console.log(`  parcelle candidate : aucune parcelle courante ne recouvre l'empreinte`);
  }
  console.log(`  bâti : ${contexte.nbBatimentsEmpreinte} bâtiment(s) courant(s) dans l'empreinte, ${contexte.nbSnapshot} au snapshot → ${entrees.polygones.length} nouveau(x)/modifié(s)`);
  for (const p of entrees.polygones) {
    const det = [p.nbEtages !== null ? `${p.nbEtages} ét.` : null, p.altitudeMaxToit !== null ? `toit ${p.altitudeMaxToit} m` : null].filter(Boolean).join(', ');
    console.log(`    · ${p.cleabs ?? '(cleabs inconnu)'} — ${p.etat}${det ? ` (${det})` : ''}`);
  }
  if (entrees.corpsPermis.length > 0) {
    console.log(`  corps déclarés au permis : ${entrees.corpsPermis.length}`);
    for (const c of entrees.corpsPermis) console.log(`    · ${c.repere ?? '—'}${c.altitudeSommetNgf !== null ? ` — sommet ${c.altitudeSommetNgf} m NGF` : ''}${c.nbEtages !== null ? `, ${c.nbEtages} ét.` : ''}`);
  }

  console.log(`\n▶ VERDICT : ${resultat.verdict}  (régime ${resultat.regime})`);
  console.log(`  motif : ${resultat.motif}`);
  console.log(`  critères : surface ${critere(resultat.criteres.surface.applicable, resultat.criteres.surface.franchi)} · bordure ${critere(resultat.criteres.bordure.applicable, resultat.criteres.bordure.franchi)} · bâti ${resultat.criteres.bati.franchi ? '✓' : '✗'} (${resultat.criteres.bati.nbNouveauxOuModifies})`);
  for (const pr of resultat.preuves) console.log(`  – ${pr}`);
  console.log('');
}

const critere = (applicable: boolean, franchi: boolean): string => (!applicable ? 'n/a' : franchi ? '✓' : '✗');

void main().catch((e) => { console.error('[permis:rejouer-rattachement] échec', e); process.exitCode = 1; }).finally(() => closePool());
