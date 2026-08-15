/**
 * N5-E — CLI d'ÉCRITURE généralisée : mesure TOUS les champs depuis le texte de la GED (décision N5-E) puis les ÉCRIT (dépôt
 * encadré, migrations 104/105 requises). Écrit en base : permis_corps_batiment (valeurs, origine 'extraite') +
 * permis_extraction_journal (retenue / candidat / ecartee AVEC MOTIF). Imprime, champ par champ, ce qui est écrit et ce qui ne
 * l'est pas AVEC son motif. Rien n'attend personne : la confiance et le motif vivent dans le journal.
 * Lancer : npm run permis:ecrire-champs -- --permis <num_dau> [--type PC|PD]. `chargerEnv` EN PREMIER (avant tout db/client).
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { decisionChamps } from '../lib/permis/decisionChamps';
import { ecrireChamps } from '../lib/permis/ecritureChamps';

const MAJ_PAR = 'extraction:champs';

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:ecrire-champs -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const type = lireArg('--type');

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) {
    if (resolu.raison === 'inconnu') console.error(`[permis:ecrire-champs] permis inconnu : « ${numDau} »${type ? ` (type ${type})` : ''}.`);
    else { console.error(`[permis:ecrire-champs] num_dau « ${numDau} » AMBIGU — précise --type parmi :`); for (const c of resolu.candidats) console.error(`    --type ${c.type}   (INSEE ${c.codeInsee})`); }
    process.exitCode = 2;
    return;
  }

  const ged = await lireGedPermis(resolu.dossier.dossierId, depsReellesLectureGed());
  const decision = decisionChamps(extraireCandidats(ged));
  const r = await ecrireChamps(resolu.dossier.dossierId, decision, MAJ_PAR);

  console.log(`\n══════ ÉCRITURE CHAMPS — permis ${resolu.dossier.numDau} (${resolu.dossier.type}) ══════`);
  console.log('Décision champ par champ (√ écrit · ✗ non écrit + motif) :');
  for (const d of decision.champs) {
    if (d.statut === 'ecrit') {
      const u = d.unite ? ` ${d.unite}` : '';
      console.log(`  √ ${d.champ} = ${d.valeur}${u} — confiance ${d.confiance}${d.reserve ? `  ⚠ ${d.reserve}` : ''}`);
    } else {
      console.log(`  ✗ ${d.champ} — ${d.motif}`);
    }
  }
  console.log('');
  if (r.statut === 'ambigu_plusieurs_corps') {
    console.log(`  ⚠ ALERTE : ${r.nbCorps} corps existants → attribution ambiguë, AUCUNE valeur écrite. Tout est journalisé (ecartee). Saisie humaine requise.`);
  } else {
    console.log(`  Corps #${r.corpsId ?? '—'}${r.corpsCree ? ' (créé)' : ''} — champs écrits : ${r.champsEcrits.length ? r.champsEcrits.join(', ') : 'aucun'}.`);
    if (r.champsIgnoresSaisie.length) console.log(`  ⚠ non écrasés (saisie prioritaire) : ${r.champsIgnoresSaisie.join(', ')} — journalisés en ecartee.`);
  }
  console.log('');
}

void main()
  .catch((e) => { console.error('[permis:ecrire-champs] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
