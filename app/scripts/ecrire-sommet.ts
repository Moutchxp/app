/**
 * N5-C — CLI d'ÉCRITURE : mesure le sommet depuis le texte de la GED (N5-A/B/B2 → décision N5-C) puis l'ÉCRIT (dépôt encadré,
 * migration 104 requise). Contrairement à `permis:extraire` (qui n'imprime que la mesure), CELLE-CI écrit en base :
 * permis_corps_batiment (altitude de sommet, origine 'extraite') + permis_extraction_journal (audit de la décision).
 * Rien n'attend personne : la confiance est portée par le journal, il n'y a aucune file de validation.
 * Lancer : npm run permis:ecrire-sommet -- --permis <num_dau> [--type PC|PD]. `chargerEnv` EN PREMIER (avant tout db/client).
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { decisionSommet } from '../lib/permis/decisionSommet';
import { ecrireSommet } from '../lib/permis/ecritureSommet';

const MAJ_PAR = 'extraction:sommet';

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:ecrire-sommet -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const type = lireArg('--type');

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) {
    if (resolu.raison === 'inconnu') console.error(`[permis:ecrire-sommet] permis inconnu : « ${numDau} »${type ? ` (type ${type})` : ''}.`);
    else { console.error(`[permis:ecrire-sommet] num_dau « ${numDau} » AMBIGU — précise --type parmi :`); for (const c of resolu.candidats) console.error(`    --type ${c.type}   (INSEE ${c.codeInsee})`); }
    process.exitCode = 2;
    return;
  }

  const ged = await lireGedPermis(resolu.dossier.dossierId, depsReellesLectureGed());
  const decision = decisionSommet(extraireCandidats(ged));
  const r = await ecrireSommet(resolu.dossier.dossierId, decision, MAJ_PAR);

  console.log(`\n══════ ÉCRITURE SOMMET — permis ${resolu.dossier.numDau} (${resolu.dossier.type}) ══════`);
  if (r.statut === 'aucun_sommet') {
    console.log('  aucun sommet (aucune cote « acrotère ») → rien écrit ; candidats « niveau fini » éventuels journalisés.');
  } else if (r.statut === 'ambigu_plusieurs_corps') {
    console.log(`  ⚠ ALERTE : ${r.nbCorps} corps existants → attribution ambiguë, AUCUNE altitude écrite (on ne devine pas lequel porte le point haut).`);
    console.log('  La mesure est journalisée (role=ecartee). Saisie humaine requise pour trancher le corps.');
  } else {
    console.log(`  sommet ${decision.valeurNgf} NGF écrit sur le corps #${r.corpsId}${r.corpsCree ? ' (créé)' : ''} — confiance ${decision.confiance}.`);
    if (r.ignoreSaisie) console.log('  ⚠ une saisie manuelle occupait déjà le champ → NON écrasée (invariant). Mesure journalisée en role=ecartee.');
    console.log(`  ⚠ RÉSERVE : ${decision.reserve}`);
  }
  console.log('');
}

void main()
  .catch((e) => { console.error('[permis:ecrire-sommet] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
