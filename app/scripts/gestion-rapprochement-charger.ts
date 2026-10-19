/**
 * Charge UN calcul de rapprochement des dossiers clients (propositions) dans `gestion_rapprochement_proposition`
 * (migration 387). Ajout seul ; un calcul déjà chargé est refusé. N'écrit RIEN d'autre : ni le Drive, ni l'annuaire.
 *
 *   npx tsx app/scripts/gestion-rapprochement-charger.ts <propositions.json> [--essai]
 *
 * Le fichier (nominatif, jamais versionné) est produit dans `.captures/` par le calcul du rapprochement :
 * `{ calcul, source, fiches: { id: n° WIPPIMMO }, propositions: [...] }`. `--essai` : contrôle le fichier ET la concordance des
 * fiches avec la base visée, compte, n'écrit rien. Une seule fiche discordante refuse tout le chargement.
 */
import '../lib/chargerEnv';
import { readFileSync } from 'node:fs';
import { closePool, query } from '../lib/db/client';
import { fichesDiscordantes } from '../lib/gestion/rapprochementDossiers';
import { chargerPropositions, type PropositionACharger } from '../lib/gestion/rapprochementDossiersRepo';

async function main() {
  const fichier = process.argv[2];
  if (!fichier) throw new Error('usage : gestion-rapprochement-charger.ts <propositions.json> [--essai]');
  const j = JSON.parse(readFileSync(fichier, 'utf8')) as { calcul: string; source?: string; fiches?: Record<string, string>; propositions: PropositionACharger[] };
  // Les identifiants de fiche viennent de la base du calcul (le serveur) : ils doivent désigner les MÊMES fiches ici.
  if (!j.fiches) throw new Error('fichier sans table des fiches (id → n° WIPPIMMO) : refait le calcul');
  const ids = Object.keys(j.fiches).map(Number);
  const { rows } = await query<{ id: string; wippimmo_id: string }>(
    'SELECT id::text, wippimmo_id FROM gestion_annuaire_proprietaire WHERE id = ANY($1::bigint[])', [ids]);
  const discordantes = fichesDiscordantes(j.fiches, new Map(rows.map((r) => [Number(r.id), r.wippimmo_id])));
  if (discordantes.length > 0) throw new Error(`REFUS : ${discordantes.length} fiche(s) ne concordent pas avec cette base — ${discordantes.slice(0, 5).join(' ; ')}`);
  console.log(`source : ${j.source ?? '?'} · ${ids.length} fiche(s) citée(s), toutes concordantes dans cette base (même n° WIPPIMMO).`);
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
