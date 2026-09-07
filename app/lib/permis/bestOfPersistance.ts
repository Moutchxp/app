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
 * TYPE de pré-calcul du best-of dans le socle générique `permis_best_of_precalcul` (clé (dossier_id, type), migration 209). Le best-of
 * est LE consommateur historique → toujours 'best_of' ici. La colonne `type` est une LISTE FERMÉE (GARDE) contrainte EN BASE : ce module
 * ne peut donc écrire/lire que sous ce type. SOURCE UNIQUE de la chaîne (réutilisée par le producteur de fond, precalculBestOfAuto).
 */
export const TYPE_BEST_OF = 'best_of';

/**
 * LIT le best-of persisté SI l'empreinte STOCKÉE == l'empreinte COURANTE (sinon `null` → périmé → recalcul). RÉSILIENT : table absente
 * (208/209 non appliquées) ou lecture KO → `null`. Les clauses `type = $2 AND empreinte = $3` garantissent qu'on ne sert JAMAIS le résultat
 * d'un autre TYPE ni d'un autre état de GED.
 */
export async function lireBestOfPersiste(dossierId: number, empreinte: string): Promise<BestOfValeur | null> {
  try {
    const { rows } = await query<{ resultat: BestOfSerialise }>(
      `SELECT resultat FROM permis_best_of_precalcul WHERE dossier_id = $1 AND type = $2 AND empreinte = $3`, [dossierId, TYPE_BEST_OF, empreinte]);
    return rows[0] ? deserialiserBestOf(rows[0].resultat) : null;
  } catch { return null; } // table absente / lecture indisponible → repli sur le calcul à la volée (jamais un écran cassé)
}

/**
 * ÉCRIT (upsert par (dossier_id, type)) le best-of persisté. BEST-EFFORT : table absente ou écriture KO → no-op silencieux (jamais bloquant).
 * Une seule entrée par (dossier × type) : ON CONFLICT (dossier_id, type) met à jour l'empreinte + le résultat. `par` = 'fond' ou 'a_la_volee'.
 * Le type est TOUJOURS lié explicitement (TYPE_BEST_OF) : aucun écrit sans type, aucun écrasement d'un autre type.
 */
export async function ecrireBestOfPersiste(dossierId: number, empreinte: string, v: BestOfValeur, par: 'fond' | 'a_la_volee'): Promise<void> {
  try {
    await query(
      `INSERT INTO permis_best_of_precalcul (dossier_id, type, empreinte, resultat, calcule_par) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (dossier_id, type) DO UPDATE SET empreinte = EXCLUDED.empreinte, resultat = EXCLUDED.resultat, calcule_le = now(), calcule_par = EXCLUDED.calcule_par`,
      [dossierId, TYPE_BEST_OF, empreinte, JSON.stringify(serialiserBestOf(v)), par]);
  } catch { /* table absente (208/209 non appliquées) ou écriture indisponible → best-effort, jamais bloquant */ }
}
