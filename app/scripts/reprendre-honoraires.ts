/**
 * CLI `gestion:honoraires:reprendre` — LOT L1 : REPRISE DU TAUX WIPPIMMO SUR LES LOCATIONS EN COURS.
 *
 * Validé par Arno (17/10/2026, point 7) : « les 317 locations en cours reçoivent le taux WIPPIMMO de leur lot (origine
 * “reprise”), loyer vide ». Le taux d'un lot vient de « Tx honos » (Lots.xlsx), écrit par l'import dans
 * `gestion_annuaire_lot.taux_honos_wippimmo` : soit l'import est passé AVANT (migration 370 en place), soit la reprise
 * le lit elle-même avec `--dossier=` (deux colonnes des lots, rien d'autre).
 *
 *   npm run gestion:honoraires:reprendre               → SIMULATION : compte, n'écrit rien
 *   npm run gestion:honoraires:reprendre -- --appliquer → écrit, en UNE transaction
 *   … -- --dossier=/chemin --appliquer                  → lit AUSSI « Tx honos » / « Base honos » de Lots.xlsx et pose
 *                                                         ces deux colonnes des lots, SANS relancer l'import complet
 *                                                         (qui réécrirait aussi contacts et fiches) ; puis la reprise.
 *
 * 🔴 CE QU'ELLE ÉCRIT, ET RIEN D'AUTRE : avec `--dossier`, les deux colonnes `taux_honos_wippimmo` / `base_honos_wippimmo`
 * des lots dont la valeur change ; puis une ligne de conditions (origine « reprise », loyer VIDE) pour chaque location
 * en cours qui n'en a encore aucune, dans la table neuve `gestion_location_conditions`, et une ligne au journal.
 * Aucune ligne existante n'est modifiée ; une location déjà pourvue n'est jamais touchée. REJOUABLE : la seconde passe
 * ne trouve plus rien à reprendre.
 */
import '../lib/chargerEnv';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reprendreTauxWippimmo } from '../lib/gestion/honorairesGestionRepo';
import { tauxHonosDesLots } from '../lib/gestion/annuaireImport';
import { lireClasseur } from '../lib/gestion/xlsxLecture';

async function principal(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const dossier = process.argv.find((a) => a.startsWith('--dossier='))?.slice('--dossier='.length);
  // 🔒 Le fichier est LU, jamais écrit ni déplacé ; seules deux colonnes des lots en sortent.
  const tauxLots = dossier === undefined ? undefined : tauxHonosDesLots(lireClasseur(readFileSync(join(dossier, 'Lots.xlsx'))));
  const c = await reprendreTauxWippimmo({ appliquer, auteur: 'reprise du taux WIPPIMMO (lot L1)', tauxLots });
  if (c === null) {
    console.error('\n❌ La migration 370 n’est pas appliquée : rien n’a été fait.\n');
    process.exitCode = 1;
    return;
  }
  console.log(appliquer ? '── REPRISE APPLIQUÉE ──' : '── SIMULATION (aucune écriture) ──');
  if (tauxLots !== undefined) {
    console.log(`  · lots lus dans Lots.xlsx                         ${tauxLots.length}`);
    console.log(`  · lots dont le taux WIPPIMMO ${appliquer ? 'est posé' : 'serait posé'}           ${c.tauxLots}`);
  }
  console.log(`  · locations en cours (lot de l’annuaire)          ${c.enCours}`);
  console.log(`  · déjà pourvues de conditions (non touchées)      ${c.dejaPourvues}`);
  console.log(`  · ${appliquer ? 'reprises' : 'à reprendre'} (taux WIPPIMMO, loyer à saisir)      ${c.reprises}`);
  console.log(`  · lot sans taux WIPPIMMO (rien d’écrit)           ${c.sansTauxWippimmo}`);
  if (!appliquer) console.log('\nRien n’a été écrit. Pour appliquer : relancer avec --appliquer.');
}

if (estPointEntree(import.meta.url)) {
  void principal().then(async () => {
    const { closePool } = await import('../lib/db/client');
    await closePool();
  });
}
