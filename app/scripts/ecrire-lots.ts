/**
 * N8-B — CLI : écrit les FAITS ÉNONCÉS par lot (voie b). Requiert migrations 108 (sommet permis) + 109 (methode 'enonce') appliquées.
 * Renomme/crée les corps par lot, écrit nb_etages / nb_niveaux_sous_sol / (plancher du lot le plus haut), déplace le sommet au
 * niveau permis. Journal sous 'enonce' → un recompute `permis:ecrire-champs` est inoffensif. Idempotent.
 * Lancer : npm run permis:ecrire-lots -- --permis <num_dau> [--type PC|PD].
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { decisionLots } from '../lib/permis/decisionLots';
import { ecrireLots } from '../lib/permis/ecritureLots';

const MAJ_PAR = 'enonce:lots';
const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:ecrire-lots -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const resolu = await resoudreDossier(numDau, lireArg('--type'));
  if (!resolu.ok) { console.error(`[permis:ecrire-lots] permis non résolu : ${numDau}`); process.exitCode = 2; return; }

  const deps = depsReellesLectureGed();
  const ged = await lireGedPermis(resolu.dossier.dossierId, deps);
  const decision = decisionLots(ged, extraireCandidats(ged));

  console.log(`\n══════ ÉCRITURE PAR LOT (énoncé) — ${resolu.dossier.numDau} ══════`);
  console.log('Décision (fait énoncé √ · inférence ~ · non écrit ✗) :');
  for (const l of decision.lots) {
    console.log(`  ${l.repere} :`);
    console.log(`    nb_etages = ${l.nbEtages?.valeur ?? '—'}${l.nbEtages ? ` (${l.nbEtages.confiance}, ${l.nbEtages.sources.length} source(s))` : ''}`);
    console.log(`    nb_niveaux_sous_sol = ${l.nbSousSol?.valeur ?? '—'}${l.nbSousSol ? ` (${l.nbSousSol.confiance} · ${l.nbSousSol.note})` : ''}`);
    console.log(`    altitude_dernier_plancher_ngf = ${l.plancher ? `~${l.plancher.valeur} (à vérifier — ${l.plancher.motif})` : `✗ ${l.plancherMotif ?? '—'}`}`);
    console.log(`    altitude_sommet_ngf = ✗ (${l.sommetMotif})`);
  }
  console.log(`  PERMIS : altitude_sommet_ngf = ${decision.sommetPermis?.valeur ?? '—'} (à vérifier ; réserve conservée)`);

  const r = await ecrireLots(resolu.dossier.dossierId, decision, MAJ_PAR);
  console.log('\nÉcrit :');
  for (const c of r.corps) console.log(`  corps « ${c.repere} » #${c.corpsId}${c.cree ? ' (créé)' : ''} — champs écrits : ${c.ecrits.length ? c.ecrits.join(', ') : 'aucun (déjà à jour ou saisie prioritaire)'}`);
  console.log(`  sommet permis : ${r.sommetPermisEcrit ? 'écrit' : 'non écrit (saisie prioritaire ?)'}`);
  console.log('');
}

void main().catch((e) => { console.error('[permis:ecrire-lots] échec', e); process.exitCode = 1; }).finally(() => closePool());
