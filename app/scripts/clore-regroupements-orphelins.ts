/**
 * ══ 🔴 CLORE LES REGROUPEMENTS ORPHELINS (Arno, 20/11/2026, LOT 0 — correctif 504) ═══════════════════════════════════════════════════════════════
 *
 * Avant le correctif, « Valider » sur la fiche copropriété retirait en silence les adresses d'un regroupement, qui restait « en cours » (recette :
 * le regroupement n° 1 du 54 avenue Puvis de Chavannes, ses 5 adresses retirées le 19/11 à 22h03). Ce script les CLÔT, avec une ligne d'Historique
 * par bien concerné. Rien n'est effacé, aucune adresse de bien n'est touchée.
 *
 *   npx tsx app/scripts/clore-regroupements-orphelins.ts              → à blanc : la liste, AUCUNE écriture
 *   npx tsx app/scripts/clore-regroupements-orphelins.ts --appliquer  → les clôt (une transaction)
 *
 * 🔴 GARDE : la base doit être `svav_recette` (DATABASE_URL pointé dessus) — la production n'a pas encore la migration 504.
 * Le rapport va dans `.captures/regroupements-orphelins/`.
 */
import { writeFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { regroupementsOrphelins } from '../lib/gestion/regroupementCoproprietesRepo';
import { cheminRapport } from '../lib/ops/rapportScript';
import type { Auteur } from '../lib/gestion/gestes';

const AUTEUR: Auteur = { id: null, libelle: 'réparation regroupements orphelins (lot 0)' };

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0]?.b ?? '?';
  if (base !== 'svav_recette') {
    console.error(`Base « ${base} » : ce script ne s'exécute que sur svav_recette. Rien n'est écrit.`);
    process.exit(2);
  }
  const lus = await regroupementsOrphelins(appliquer, AUTEUR);
  const lignes = [`Base : ${base} — ${appliquer ? 'APPLIQUÉ' : 'à blanc (rien n’est écrit)'} — ${new Date().toISOString()}`,
    `Regroupements « en cours » sans aucune adresse en cours : ${lus.length}`,
    ...lus.map((r) => `  n° ${r.id} — principale « ${r.principale} » — adresses retirées le ${r.retireLe ?? '?'} : ${r.regroupees.map((x) => `« ${x} »`).join(', ')}`),
    appliquer && lus.length > 0 ? 'Clos, avec une ligne d’Historique par bien concerné.' : ''].filter((x) => x !== '');
  const chemin = cheminRapport({ nomScript: 'regroupements-orphelins', prefixe: appliquer ? 'applique' : 'a-blanc' });
  writeFileSync(chemin, `${lignes.join('\n')}\n`);
  console.log(lignes.join('\n'));
  console.log(`Rapport : ${chemin}`);
}
void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
