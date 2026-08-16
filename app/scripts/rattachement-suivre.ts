/**
 * FUS-3b — CLI de PERSISTANCE du suivi de rattachement : rejoue le moteur et écrit/met à jour le dossier (verdict ≠ RIEN),
 * sur UN permis (--permis) ou sur TOUS les permis suivis (--tous = ceux qui ont une empreinte). Un verdict RIEN n'écrit rien
 * (les permis sans signal sont dérivés à l'affichage). NON lancé automatiquement — Arno le lance.
 * Lancer : npm run permis:rattachement-suivre -- (--permis <num_dau> [--type PC|PD] | --tous).
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { resoudreDossier } from '../lib/permis/lectureGed';
import { suivreRattachement } from '../lib/permis/rattachementSuiviRepo';

const MAJ_PAR = 'cli:rattachement-suivre';
const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const tous = process.argv.includes('--tous');
  const numDau = lireArg('--permis');
  if (!tous && !numDau) { console.error('usage : npm run permis:rattachement-suivre -- (--permis <num_dau> [--type PC|PD] | --tous)'); process.exitCode = 2; return; }

  let dossierIds: number[];
  if (tous) {
    // L'univers des permis SUIVIS = ceux qui ont une empreinte (parcelles analysées) — PAS tout Sitadel.
    const { rows } = await query<{ dossier_id: number }>(`SELECT dossier_id FROM permis_empreinte ORDER BY dossier_id`);
    dossierIds = rows.map((r) => r.dossier_id);
  } else {
    const resolu = await resoudreDossier(numDau as string, lireArg('--type'));
    if (!resolu.ok) { console.error(`[permis:rattachement-suivre] permis non résolu : ${numDau}`); process.exitCode = 2; return; }
    dossierIds = [resolu.dossier.dossierId];
  }

  console.log(`\n══════ SUIVI RATTACHEMENT — ${dossierIds.length} permis suivi(s) ══════`);
  let persistes = 0, sansSignal = 0;
  for (const id of dossierIds) {
    const r = await suivreRattachement(id, MAJ_PAR);
    if (r.persiste) { persistes++; console.log(`  dossier ${id} : ${r.action} → ${r.etat} (${r.verdict})`); }
    else { sansSignal++; console.log(`  dossier ${id} : aucun signal (${r.verdict}) → pas de dossier`); }
  }
  console.log(`\nBilan : ${persistes} dossier(s) persisté(s), ${sansSignal} sans signal (dérivés à l'affichage).\n`);
}

void main().catch((e) => { console.error('[permis:rattachement-suivre] échec', e); process.exitCode = 1; }).finally(() => closePool());
