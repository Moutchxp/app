// 🔴 MON ESPACE — le compte qui agit : administrateur ou non (relu en base). Un module à part : la création, les apporteurs et les gestes s'en
// servent sans s'importer les uns les autres. LECTURE SEULE.
import { query } from '../db/client';
import { statutDuCompte } from '../admin/statutCompte';

export async function estAdministrateur(compteId: number): Promise<boolean> {
  const { rows } = await query<{ role: string }>('SELECT role FROM admin_utilisateur WHERE id = $1', [compteId]);
  return rows[0]?.role === 'administrateur';
}

export interface Titulaire { id: number; prenom: string | null; administrateur: boolean;
  /** 🔴 « Les coûts » (décision C1, Arno, 03/11/2026) — le statut « Associé » du compte (statut existant, relu en base). */
  associe: boolean }

/** Le titulaire de l'espace : prénom, administrateur, associé (relus en base). */
export async function titulaireDuCompte(compteId: number): Promise<Titulaire> {
  const [{ rows }, statut] = await Promise.all([
    query<{ role: string; prenom: string | null }>('SELECT role, prenom FROM admin_utilisateur WHERE id = $1', [compteId]), statutDuCompte(compteId)]);
  return { id: compteId, prenom: rows[0]?.prenom ?? null, administrateur: rows[0]?.role === 'administrateur', associe: statut === 'associe' };
}

/**
 * 🔴 « Les coûts » — l'onglet est-il ouvert à ce compte ? Décision C1 : le statut « Associé » ; décision C2 : il suit « Voir » (le mode agence),
 * réservé aux administrateurs. Les deux, relus en base.
 */
export async function peutVoirCouts(compteId: number): Promise<boolean> {
  const t = await titulaireDuCompte(compteId);
  return t.associe && t.administrateur;
}
