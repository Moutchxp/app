import { query } from '../db/client';
import { colonneExisteMemo } from '../location/sondeLocation';
import { collaborateursDuReglage } from './collaborateursPrevenus';

/**
 * ══ 🔴 LE RÉGLAGE « COLLABORATEURS PRÉVENUS », LU EN BASE (Arno, 18/11/2026). LECTURE SEULE. ═══════════════════════════════════
 *
 * Rend la liste à utiliser pour les mails internes de la Location, ou `null` = appliquer la règle des comptes. `null` aussi,
 * et JAMAIS une exception, quand la migration 493 n'est pas passée (colonne sondée HORS transaction, comme le reste du module),
 * quand la ligne de configuration manque, ou quand la base ne répond pas : un réglage illisible ne bloque aucun envoi.
 */
export async function lireCollaborateursPrevenus(): Promise<string[] | null> {
  try {
    if (!(await colonneExisteMemo('gestion_config', 'collaborateurs_prevenus'))) return null;
    const { rows } = await query<{ v: string | null }>('SELECT collaborateurs_prevenus AS v FROM gestion_config WHERE id = 1');
    return collaborateursDuReglage(rows[0]?.v ?? null);
  } catch {
    return null;
  }
}
