/**
 * N7-B — CLI de MESURE : imprime les CHAMPS DE FORMULAIRE (AcroForm) renseignés de chaque pièce d'un permis (identité du
 * demandeur filtrée à la source par `champsFormulaire`). N'écrit NULLE PART. `chargerEnv` EN PREMIER (avant tout db/client).
 * Lancer : npm run permis:champs -- --permis <num_dau> [--type PC|PD].
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { lireChampsFormulaire } from '../lib/permis/champsFormulaire';

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:champs -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const type = lireArg('--type');

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) {
    if (resolu.raison === 'inconnu') console.error(`[permis:champs] permis inconnu : « ${numDau} »${type ? ` (type ${type})` : ''}.`);
    else { console.error(`[permis:champs] num_dau « ${numDau} » AMBIGU — précise --type parmi :`); for (const c of resolu.candidats) console.error(`    --type ${c.type}   (INSEE ${c.codeInsee})`); }
    process.exitCode = 2;
    return;
  }

  const deps = depsReellesLectureGed();
  const metas = await deps.listerPieces(resolu.dossier.dossierId);
  console.log(`\n══════ CHAMPS DE FORMULAIRE — permis ${resolu.dossier.numDau} (${resolu.dossier.type}) ══════`);
  let totalAvecChamps = 0;
  for (const m of metas) {
    let contenu: Buffer;
    try { contenu = await deps.lireObjet(m.cleStockage); } catch { continue; }
    const champs = await lireChampsFormulaire(contenu);
    if (champs.length === 0) continue;
    totalAvecChamps += 1;
    console.log(`\n[${m.nomFichier}] ${champs.length} champ(s) renseigné(s) hors identité :`);
    for (const c of champs) console.log(`  [${c.type ?? '?'}] p.${c.page ?? '?'} « ${c.nom} » = ${c.valeur}`);
  }
  if (totalAvecChamps === 0) console.log('  (aucune pièce ne porte de champ de formulaire renseigné)');
  console.log('');
}

void main()
  .catch((e) => { console.error('[permis:champs] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
