/**
 * N9-B — CLI : écrit les caractéristiques par corps depuis le TABLEAU DE NIVEAUX de la coupe (source structurée, attribuée par
 * bâtiment). SUPERSÈDE `permis:ecrire-champs`/`permis:ecrire-lots` pour plancher / sommet / nb_etages / nb_sous_sol : la table
 * prime, et elle attribue par corps (là où le chaînage mettait le R07 de 2D2 sur 2D1). Journal 'enonce' → recompute inoffensif.
 * ⚠️ NE PAS relancer `ecrire-lots` après (même methode 'enonce' : le dernier passage gagne). Aucune migration requise.
 * Lancer : npm run permis:ecrire-niveaux -- --permis <num_dau> [--type PC|PD].
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { decisionLots } from '../lib/permis/decisionLots';
import { decisionNiveaux } from '../lib/permis/decisionNiveaux';
import { ecrireNiveaux } from '../lib/permis/ecritureNiveaux';

const MAJ_PAR = 'enonce:niveaux';
const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:ecrire-niveaux -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const resolu = await resoudreDossier(numDau, lireArg('--type'));
  if (!resolu.ok) { console.error(`[permis:ecrire-niveaux] permis non résolu : ${numDau}`); process.exitCode = 2; return; }

  const ged = await lireGedPermis(resolu.dossier.dossierId, depsReellesLectureGed());
  const lots = decisionLots(ged, extraireCandidats(ged));
  const fc: Record<string, { valeur: number; piece: string }> = {};
  for (const l of lots.lots) if (l.nbEtages) fc[l.repere] = { valeur: l.nbEtages.valeur, piece: l.nbEtages.sources[0]?.piece ?? '?' };
  const decision = decisionNiveaux(ged, fc);

  const nom = (r: string | null) => (r !== null ? `BAT ${r}` : 'bâtiment SANS TITRE (jeu d’altitudes unique)');
  console.log(`\n══════ ÉCRITURE PAR TABLEAU DE NIVEAUX — ${resolu.dossier.numDau} ══════`);
  if (decision.nonAttribue) console.log(`\n  ⚠ NON ATTRIBUÉ : ${decision.nonAttribue}`);
  for (const c of decision.corps) {
    console.log(`\n  ${nom(c.repere)} (${c.nbPieces} pièce(s)) :`);
    console.log(`    plancher = ${c.plancher ? `${c.plancher.valeur} (${c.plancher.label}, ${c.plancher.confiance})` : '—'}`);
    console.log(`    nb_etages = ${c.nbEtages ? `${c.nbEtages.valeur} (${c.nbEtages.confiance})${c.nbEtages.tension ? `  ⚠ ${c.nbEtages.tension}` : ''}` : '—'}`);
    console.log(`    nb_sous_sol = ${c.nbSousSol ? `${c.nbSousSol.valeur} (${c.nbSousSol.confiance})${c.nbSousSol.reserve ? `  ⚠ ${c.nbSousSol.reserve}` : ''}` : '—'}`);
    console.log(`    sommet = ${c.sommet ? `${c.sommet.valeur} [${c.sommet.qualif}] (${c.sommet.confiance})${c.sommet.note ? `  — ${c.sommet.note}` : ''}` : '—'}`);
    console.log(`    garde-corps écarté : ${c.gardeCorps.map((g) => g.cote).join(', ') || '—'}`);
    console.log(`    niveaux nommés (hors vocab) : ${c.niveauxNommes.map((n) => `${n.label}=${n.cote}`).join(', ') || '—'}`);
    console.log(`    superstructures écartées (au-dessus du sommet) : ${c.superstructures.map((s) => s.cote).join(', ') || '—'}`);
  }
  console.log(`\n  gardeCorpsAttribué (ex-sommet permis) : ${decision.gardeCorpsAttribue ? `${decision.gardeCorpsAttribue.cote} → ${nom(decision.gardeCorpsAttribue.repere)}` : '—'}`);

  const r = await ecrireNiveaux(resolu.dossier.dossierId, decision, MAJ_PAR);
  console.log('\nÉcrit :');
  for (const c of r.corps) {
    console.log(`  « ${c.repere ?? 'sans titre'} » #${c.corpsId}${c.cree ? ' (créé)' : ''} — champs : ${c.ecrits.length ? c.ecrits.join(', ') : 'aucun (saisie prioritaire ?)'}`);
    for (const corr of c.corrections) console.log(`    ↳ CORRECTION : ${corr}`);
  }
  console.log(`  sommet permis : ${r.sommetPermisEfface ? 'EFFACÉ (89,46 réattribué à un garde-corps)' : 'inchangé (saisie prioritaire ou absent)'}`);
  console.log('');
}

void main().catch((e) => { console.error('[permis:ecrire-niveaux] échec', e); process.exitCode = 1; }).finally(() => closePool());
