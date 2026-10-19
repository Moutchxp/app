/**
 * Charge UN calcul de rapprochement des dossiers clients (propositions) dans `gestion_rapprochement_proposition`
 * (migration 387). Ajout seul ; un calcul déjà chargé est refusé. N'écrit RIEN d'autre : ni le Drive, ni l'annuaire.
 *
 *   npx tsx app/scripts/gestion-rapprochement-charger.ts <propositions.json> [--essai]
 *
 * Le fichier (nominatif, jamais versionné) est produit dans `.captures/` par le calcul du rapprochement :
 * `{ calcul: "2026-10-19", propositions: [...] }`. `--essai` : contrôle le fichier, compte, n'écrit rien.
 */
import '../lib/chargerEnv';
import { readFileSync } from 'node:fs';
import { closePool } from '../lib/db/client';
import { chargerPropositions, type PropositionACharger } from '../lib/gestion/rapprochementDossiersRepo';

async function main() {
  const fichier = process.argv[2];
  if (!fichier) throw new Error('usage : gestion-rapprochement-charger.ts <propositions.json> [--essai]');
  const j = JSON.parse(readFileSync(fichier, 'utf8')) as { calcul: string; propositions: PropositionACharger[] };
  const parNiveau: Record<string, number> = {};
  for (const p of j.propositions) parNiveau[p.niveau] = (parNiveau[p.niveau] ?? 0) + 1;
  console.log(`calcul ${j.calcul} : ${j.propositions.length} proposition(s)`, parNiveau,
    `· contrôle à l'œil ${j.propositions.filter((p) => p.controle_oeil).length}`);
  if (process.argv.includes('--essai')) { console.log('--essai : rien n’est écrit.'); return; }
  const r = await chargerPropositions(j.calcul, j.propositions);
  if (!r.ok) throw new Error(r.motif);
  console.log(`chargé : ${r.nombre} proposition(s).`);
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exitCode = 1; }).finally(() => closePool());
