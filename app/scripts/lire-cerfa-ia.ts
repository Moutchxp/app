/**
 * CR-2b1 — LECTURE IA VISION du Cerfa. DRY-RUN par défaut : fait l'appel (lecture PAYANTE) et RAPPORTE (transmission, compte rendu,
 * confiance, pages citées, coût) SANS persister. `--appliquer` : persiste chaque passe (append-only) — no-op si la migration 216 n'est
 * pas appliquée. UN SEUL appel par dossier, aucune boucle, aucun rejeu.
 *
 * Lancer : npm run permis:lire-cerfa-ia -- 468 470 531   (dry-run, appel payant sur ces dossiers)
 *          npm run permis:lire-cerfa-ia -- 468 --appliquer   (persiste, requiert migration 216)
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { closePool } from '../lib/db/client';
import { produirePasseIa, depsReellesIa } from '../lib/permis/compteRenduIaRepo';

function fmtChamp(nom: string, c: { valeur: unknown; confiance: string; page: number | null } | undefined): string {
  if (!c) return `${nom}: —`;
  const v = c.valeur === null ? 'ABSENT' : JSON.stringify(c.valeur);
  return `${nom}: ${v} (confiance ${c.confiance}${c.page !== null ? `, page ${c.page}` : ''})`;
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  if (ids.length === 0) { console.log('Usage : npm run permis:lire-cerfa-ia -- <dossierId…> [--appliquer]'); return; }
  console.log(`[lire-cerfa-ia] ${appliquer ? 'APPLIQUER (persiste)' : 'DRY-RUN (appel payant, pas de persistance)'} — ${ids.length} dossier(s).`);
  const deps = depsReellesIa();
  let coutTotal = 0;
  for (const id of ids) {
    const r = await produirePasseIa(id, deps, { persister: appliquer, forcer: true });
    coutTotal += r.coutUsd;
    console.log(`\n===== dossier ${id} — statut ${r.statut}${r.motif ? ` (${r.motif})` : ''} =====`);
    const t = r.transmission;
    console.log(`  TRANSMIS : ${t.envoyees.map((e) => `p${e.page}[${e.cibles.join('+')}]`).join(', ') || '(rien)'}`);
    console.log(`  REFUSÉES : ${t.refusees.filter((x) => !/aucune cible/.test(x.motif)).map((x) => `p${x.page}(${x.motif})`).join(' ; ') || '(aucune page-cible refusée)'}`);
    if (r.lecture) {
      const l = r.lecture as unknown as Record<string, { valeur: unknown; confiance: string; page: number | null }>;
      console.log('  LECTURE IA :');
      for (const k of ['natureProjet', 'typeOperationSvav', 'recoursArchitecte', 'demolition', 'travauxParTranches']) console.log(`     ${fmtChamp(k, l[k])}`);
      console.log(`     resumeDescription: ${r.lecture.resumeDescription ?? '—'}`);
    }
    console.log(`  MODÈLE : ${r.modele ?? '—'} · COÛT : ${r.coutUsd.toFixed(5)} USD · ${r.persiste ? 'persisté' : 'non persisté'}`);
  }
  console.log(`\n[lire-cerfa-ia] Terminé. Coût total : ${coutTotal.toFixed(5)} USD.`);
}

const estPointEntree = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (estPointEntree) void main().catch((e) => { console.error('[permis:lire-cerfa-ia] échec', e); process.exitCode = 1; }).finally(() => closePool());
