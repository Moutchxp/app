import { query } from '../db/client';
import type { FamillePlan } from './planMasse';

/**
 * PC-1 (perfo) — PERSISTANCE du best-of PDF (le cache P1 vit en mémoire du processus et meurt au redémarrage/HMR ; ici il SURVIT).
 * ACCÉLÉRATEUR, JAMAIS un prérequis : toute lecture qui échoue (table absente = migration 208 non appliquée, entrée absente/périmée,
 * lecture KO) renvoie `null` → l'appelant retombe sur le calcul à la volée (comportement inchangé). Toute écriture est BEST-EFFORT
 * (jamais bloquante). Invalidation par la MÊME empreinte GED que P1 (colonne `empreinte`). Purge par dossier (voir PC-2).
 */

// ── Forme du best-of (valeur mémoïsée) : proposees/autres sont du JSON simple ; les Map/Set doivent être sérialisés pour jsonb. ──
type PlancheBestOf = { page: number; echelle: string | null; tracable: boolean; famille: FamillePlan; ambigu: boolean };
type PieceBestOf = { id: number; nomFichier: string; typeMime: string | null; famille?: FamillePlan | null };
export interface BestOfValeur {
  proposees: (PieceBestOf & { famille: FamillePlan })[];
  autres: PieceBestOf[];
  niveauxParId: Map<number, string[]>;
  confirmations: Map<number, { planches: PlancheBestOf[] }>;
  cerfaIds: Set<number>;
  indisGed: string[];
}
// Forme SÉRIALISÉE (jsonb) : Map → tableau de paires, Set → tableau.
interface BestOfSerialise {
  proposees: (PieceBestOf & { famille: FamillePlan })[];
  autres: PieceBestOf[];
  niveauxParId: [number, string[]][];
  confirmations: [number, { planches: PlancheBestOf[] }][];
  cerfaIds: number[];
  indisGed: string[];
}

/** PUR — best-of → forme sérialisable (jsonb). Déterministe (les Map préservent leur ordre d'insertion → même octet). */
export function serialiserBestOf(v: BestOfValeur): BestOfSerialise {
  return { proposees: v.proposees, autres: v.autres, niveauxParId: [...v.niveauxParId], confirmations: [...v.confirmations], cerfaIds: [...v.cerfaIds], indisGed: v.indisGed };
}
/** PUR — forme sérialisée → best-of (reconstruit Map/Set). Inverse EXACT de `serialiserBestOf`. */
export function deserialiserBestOf(s: BestOfSerialise): BestOfValeur {
  return { proposees: s.proposees ?? [], autres: s.autres ?? [], niveauxParId: new Map(s.niveauxParId ?? []), confirmations: new Map(s.confirmations ?? []), cerfaIds: new Set(s.cerfaIds ?? []), indisGed: s.indisGed ?? [] };
}

/**
 * LIT le best-of persisté SI l'empreinte STOCKÉE == l'empreinte COURANTE (sinon `null` → périmé → recalcul). RÉSILIENT : table absente
 * (208 non appliquée) ou lecture KO → `null`. La clause `AND empreinte = $2` garantit qu'on ne sert JAMAIS un best-of d'un autre état de GED.
 */
export async function lireBestOfPersiste(dossierId: number, empreinte: string): Promise<BestOfValeur | null> {
  try {
    const { rows } = await query<{ resultat: BestOfSerialise }>(
      `SELECT resultat FROM permis_best_of_precalcul WHERE dossier_id = $1 AND empreinte = $2`, [dossierId, empreinte]);
    return rows[0] ? deserialiserBestOf(rows[0].resultat) : null;
  } catch { return null; } // table absente / lecture indisponible → repli sur le calcul à la volée (jamais un écran cassé)
}

/**
 * ÉCRIT (upsert par dossier) le best-of persisté. BEST-EFFORT : table absente ou écriture KO → no-op silencieux (jamais bloquant). Une
 * seule entrée par dossier (son état de GED courant) : ON CONFLICT met à jour l'empreinte + le résultat. `par` = 'fond' ou 'a_la_volee'.
 */
export async function ecrireBestOfPersiste(dossierId: number, empreinte: string, v: BestOfValeur, par: 'fond' | 'a_la_volee'): Promise<void> {
  try {
    await query(
      `INSERT INTO permis_best_of_precalcul (dossier_id, empreinte, resultat, calcule_par) VALUES ($1, $2, $3, $4)
       ON CONFLICT (dossier_id) DO UPDATE SET empreinte = EXCLUDED.empreinte, resultat = EXCLUDED.resultat, calcule_le = now(), calcule_par = EXCLUDED.calcule_par`,
      [dossierId, empreinte, JSON.stringify(serialiserBestOf(v)), par]);
  } catch { /* table absente (208 non appliquée) ou écriture indisponible → best-effort, jamais bloquant */ }
}
