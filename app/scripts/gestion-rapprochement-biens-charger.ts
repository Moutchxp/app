/**
 * Charge UN calcul de rapprochement des BIENS (section « Biens » de l'écran « Rapprochement des dossiers clients ») dans
 * `gestion_rapprochement_bien_proposition` (migration 388). Ajout seul ; un calcul déjà chargé est refusé. N'écrit RIEN
 * d'autre : ni le Drive, ni `gestion_annuaire_lot.drive_dossier_id` (c'est l'étape F).
 *
 *   npx tsx app/scripts/gestion-rapprochement-biens-charger.ts <propositions-biens.json> [--essai]
 *
 * Le fichier (nominatif, jamais versionné) est écrit dans `.captures/rangement/` par le plan des racines :
 * `{ calcul, fiches: { id: n° WIPPIMMO }, lots: { id: n° WIPPIMMO }, propositions: [...] }`. `--essai` : contrôle la
 * concordance des fiches ET des biens avec la base visée, compte, n'écrit rien. Une seule discordance refuse tout.
 */
import '../lib/chargerEnv';
import { readFileSync } from 'node:fs';
import { closePool, query } from '../lib/db/client';
import { fichesDiscordantes } from '../lib/gestion/rapprochementDossiers';
import { chargerPropositionsBiens, type PropositionBienACharger } from '../lib/gestion/rapprochementBiensRepo';

async function main() {
  const fichier = process.argv[2];
  if (!fichier) throw new Error('usage : gestion-rapprochement-biens-charger.ts <propositions-biens.json> [--essai]');
  const j = JSON.parse(readFileSync(fichier, 'utf8')) as {
    calcul: string; fiches: Record<string, string>; lots: Record<string, string>; propositions: PropositionBienACharger[];
  };
  if (!j.fiches || !j.lots) throw new Error('fichier sans table des fiches ou des biens (id → n° WIPPIMMO) : refaire le plan');
  const base = (await query<{ b: string }>('SELECT current_database() AS b')).rows[0].b;
  const f = await query<{ id: string; wippimmo_id: string }>('SELECT id::text, wippimmo_id FROM gestion_annuaire_proprietaire WHERE id = ANY($1::bigint[])', [Object.keys(j.fiches).map(Number)]);
  const l = await query<{ id: string; wippimmo_id: string }>('SELECT id::text, wippimmo_id FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[])', [Object.keys(j.lots).map(Number)]);
  const discordantes = [
    ...fichesDiscordantes(j.fiches, new Map(f.rows.map((r) => [Number(r.id), r.wippimmo_id]))),
    ...fichesDiscordantes(j.lots, new Map(l.rows.map((r) => [Number(r.id), r.wippimmo_id]))).map((x) => x.replace(/^fiche/, 'bien')),
  ];
  if (discordantes.length > 0) throw new Error(`REFUS (${base}) : ${discordantes.length} discordance(s) — ${discordantes.slice(0, 5).join(' ; ')}`);
  const parNiveau: Record<string, number> = {};
  for (const p of j.propositions) parNiveau[p.niveau] = (parNiveau[p.niveau] ?? 0) + 1;
  console.log(`base ${base} · ${Object.keys(j.fiches).length} fiche(s) et ${Object.keys(j.lots).length} bien(s) concordants · calcul ${j.calcul} : ${j.propositions.length} proposition(s)`, parNiveau);
  if (process.argv.includes('--essai')) { console.log('--essai : rien n’est écrit.'); return; }
  const r = await chargerPropositionsBiens(j.calcul, j.propositions);
  if (!r.ok) throw new Error(r.motif);
  console.log(`CHARGÉ : ${r.nombre} proposition(s) dans ${base}.`);
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exitCode = 1; }).finally(() => closePool());
