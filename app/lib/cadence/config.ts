import { query } from '../db/client';

/**
 * Seuils de cadence, LUS AU RUNTIME depuis `config_cadence` (singleton id = 1) — exigence « pilotage sans code » :
 * aucun seuil n'est figé dans le code applicatif, on peut les changer sans redéployer.
 *
 * REPLI SÛR, même convention que `profilConfig.ts` : table absente (migration non appliquée), ligne manquante ou
 * base indisponible → `CADENCE_DEFAUT`. La limitation ne doit jamais devenir elle-même une panne : à défaut de
 * configuration, on applique les valeurs d'origine plutôt que d'ouvrir ou de fermer le service.
 */

export interface SeuilsCadence {
  visiteurAnalysesPar10min: number;
  visiteurAnalysesPar24h: number;
  compteAnalysesPar10min: number;
  compteAnalysesParHeure: number;
  creationComptreParHeure: number;
  actif: boolean;
}

/** Valeurs d'origine (arbitrage du porteur du 2026-09-22). Servent de repli ET de défaut en base. */
export const CADENCE_DEFAUT: SeuilsCadence = {
  visiteurAnalysesPar10min: 3,
  visiteurAnalysesPar24h: 10,
  compteAnalysesPar10min: 10,
  compteAnalysesParHeure: 40,
  creationComptreParHeure: 3,
  actif: true,
};

/**
 * Bornes de VALIDATION (mêmes que la contrainte CHECK de la migration 227). Une valeur hors bornes lue en base
 * est remplacée par le défaut de son champ : une configuration abîmée ne peut ni fermer le service (0) ni le
 * laisser sans garde (valeur absurde).
 */
export const BORNES: Record<keyof Omit<SeuilsCadence, 'actif'>, { min: number; max: number }> = {
  visiteurAnalysesPar10min: { min: 1, max: 1000 },
  visiteurAnalysesPar24h: { min: 1, max: 10000 },
  compteAnalysesPar10min: { min: 1, max: 1000 },
  compteAnalysesParHeure: { min: 1, max: 10000 },
  creationComptreParHeure: { min: 1, max: 1000 },
};

function borner(champ: keyof typeof BORNES, valeur: unknown): number {
  const n = typeof valeur === 'number' ? valeur : Number.parseInt(String(valeur ?? ''), 10);
  const { min, max } = BORNES[champ];
  return Number.isFinite(n) && n >= min && n <= max ? n : CADENCE_DEFAUT[champ];
}

interface LigneConfig {
  visiteur_analyses_par_10min: number | string;
  visiteur_analyses_par_24h: number | string;
  compte_analyses_par_10min: number | string;
  compte_analyses_par_heure: number | string;
  creation_compte_par_heure: number | string;
  actif: boolean;
}

/** Lit les seuils. NE THROW JAMAIS : toute anomalie rend `CADENCE_DEFAUT`. */
export async function lireSeuilsCadence(): Promise<SeuilsCadence> {
  try {
    const r = await query<LigneConfig>(
      `SELECT visiteur_analyses_par_10min, visiteur_analyses_par_24h, compte_analyses_par_10min,
              compte_analyses_par_heure, creation_compte_par_heure, actif
         FROM config_cadence WHERE id = 1`,
    );
    const row = r.rows[0];
    if (!row) return CADENCE_DEFAUT;
    return {
      visiteurAnalysesPar10min: borner('visiteurAnalysesPar10min', row.visiteur_analyses_par_10min),
      visiteurAnalysesPar24h: borner('visiteurAnalysesPar24h', row.visiteur_analyses_par_24h),
      compteAnalysesPar10min: borner('compteAnalysesPar10min', row.compte_analyses_par_10min),
      compteAnalysesParHeure: borner('compteAnalysesParHeure', row.compte_analyses_par_heure),
      creationComptreParHeure: borner('creationComptreParHeure', row.creation_compte_par_heure),
      actif: row.actif !== false,
    };
  } catch {
    return CADENCE_DEFAUT; // table absente (migration non appliquée) ou base indisponible
  }
}
