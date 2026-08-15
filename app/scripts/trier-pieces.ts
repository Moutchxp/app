/**
 * N7-A — CLI de MESURE : imprime le PLAN DE LECTURE d'un permis (pages à faire regarder visuellement), déterministe. N'écrit
 * NULLE PART (ni base, ni fichier). Réutilise N4 `lireGedPermis` + N5-A `extraireCandidats`, puis le module PUR `trierPieces`.
 * Lancer : npm run permis:trier -- --permis <num_dau> [--type PC|PD]. `chargerEnv` EN PREMIER (avant tout db/client).
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { trierPieces } from '../lib/permis/triagePieces';

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:trier -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const type = lireArg('--type');

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) {
    if (resolu.raison === 'inconnu') console.error(`[permis:trier] permis inconnu : « ${numDau} »${type ? ` (type ${type})` : ''}.`);
    else { console.error(`[permis:trier] num_dau « ${numDau} » AMBIGU — précise --type parmi :`); for (const c of resolu.candidats) console.error(`    --type ${c.type}   (INSEE ${c.codeInsee})`); }
    process.exitCode = 2;
    return;
  }

  const ged = await lireGedPermis(resolu.dossier.dossierId, depsReellesLectureGed());
  const plan = trierPieces(ged, extraireCandidats(ged));

  console.log(`\n══════ PLAN DE LECTURE — permis ${resolu.dossier.numDau} (${resolu.dossier.type}) ══════`);
  console.log(`Pièces : ${plan.totalPieces} · Pages : ${plan.totalPages} · Retenues : ${plan.pages.length}${plan.tronque ? ` (TRONQUÉ au plafond ${plan.plafond})` : ''}`);

  const parRegle = plan.pages.reduce<Record<string, number>>((m, p) => ({ ...m, [p.regle]: (m[p.regle] ?? 0) + 1 }), {});
  console.log(`Par règle : ${Object.entries(parRegle).map(([r, n]) => `${r}=${n}`).join(' · ') || '(aucune)'}`);

  console.log('\n[PAGES RETENUES]');
  for (const p of plan.pages) console.log(`  ${p.priorite}. ${p.piece} p.${p.page} — ${p.regle} — ${p.indice}`);
  if (plan.pages.length === 0) console.log('  (aucune page retenue — résultat légitime)');

  console.log(`\n[EXCLUSIONS] ${plan.exclusions.length}`);
  for (const e of plan.exclusions) console.log(`  ${e.piece}${e.page !== undefined ? ` p.${e.page}` : ''} — ${e.motif}`);
  console.log('');
}

void main()
  .catch((e) => { console.error('[permis:trier] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
