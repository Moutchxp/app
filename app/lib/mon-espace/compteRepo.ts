// 🔴 MON ESPACE — le compte qui agit : administrateur ou non (relu en base). Un module à part : la création, les apporteurs et les gestes s'en
// servent sans s'importer les uns les autres. LECTURE SEULE.
import { query } from '../db/client';
import { statutDuCompte } from '../admin/statutCompte';
import { droitsD37Disponibles } from '../admin/schemaDroits';

export async function estAdministrateur(compteId: number): Promise<boolean> {
  const { rows } = await query<{ role: string }>('SELECT role FROM admin_utilisateur WHERE id = $1', [compteId]);
  return rows[0]?.role === 'administrateur';
}

export interface Titulaire { id: number; prenom: string | null; administrateur: boolean;
  /** 🔴 « Les coûts » (décision C1, Arno, 03/11/2026) — le statut « Associé » du compte (statut existant, relu en base). */
  associe: boolean;
  /** 🔴 D37 (Arno, 04/11/2026, option A) — la case « Les coûts » (`perm_couts`, migration 454), qui remplace la condition « associé » ;
   *  sans la 454 : le statut « Associé » (la règle d'avant). L'onglet reste dans « Voir », réservé aux administrateurs. */
  couts: boolean }

/** Le titulaire de l'espace : prénom, administrateur, associé, la case « Les coûts » (relus en base). */
export async function titulaireDuCompte(compteId: number): Promise<Titulaire> {
  const avecCase = await droitsD37Disponibles();
  const [{ rows }, statut] = await Promise.all([
    query<{ role: string; prenom: string | null; couts: boolean | null }>(
      `SELECT role, prenom, ${avecCase ? 'perm_couts' : 'NULL::boolean'} AS couts FROM admin_utilisateur WHERE id = $1`, [compteId]), statutDuCompte(compteId)]);
  const associe = statut === 'associe';
  return { id: compteId, prenom: rows[0]?.prenom ?? null, administrateur: rows[0]?.role === 'administrateur', associe,
    couts: avecCase ? rows[0]?.couts === true : associe };
}

/**
 * 🔴 « Les coûts » — l'onglet est-il ouvert à ce compte ? 🔴 D37 (option A) : la case « Les coûts » (qui remplace le statut « Associé » de
 * la décision C1 ; sans la 454 : le statut) ; décision C2 : il suit « Voir » (le mode agence), réservé aux administrateurs. Relus en base.
 */
export async function peutVoirCouts(compteId: number): Promise<boolean> {
  const t = await titulaireDuCompte(compteId);
  return t.couts && t.administrateur;
}
