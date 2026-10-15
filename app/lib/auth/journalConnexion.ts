import 'server-only';
import { queryAnalytics } from '../analytics/pool';

/**
 * ══ AUDIT POINT 8 (15/10/2026) — JOURNAL NOMINATIF DES CONNEXIONS À L'ADMIN ═════════════════════════════════════════════
 *
 * Le trou : seuls des COMPTEURS quotidiens anonymes existaient ; une intrusion ne laissait aucune trace exploitable (qui,
 * quand, d'où). Une ligne par tentative de connexion dans `admin_connexion_journal` (migration 357, NON appliquée) :
 * moment, identifiant saisi (minuscules), compte s'il existe, résultat (réussie / échouée / bloquée par la limite), et
 * l'ADRESSE EN EMPREINTE seulement (HMAC avec le secret serveur, la même que la limite par IP) — jamais en clair.
 * Lisible par l'administrateur dans la tuile Audit (« Dernières connexions »).
 *
 * CONSERVATION : 12 mois (`journal_connexions_retention_mois`, défaut 12, plage [1 ; 60] ; analytics_config, migration 357)
 * — les lignes plus anciennes sont effacées à chaque connexion réussie.
 * MÊME CONTRAT QUE LES ÉCRIVAINS ANALYTICS : pool dédié, ne throw JAMAIS, n'empêche jamais une connexion. Table absente
 * (migration 357 non appliquée, SQLSTATE 42P01) → écriture abandonnée avec UN avertissement par processus.
 */

export type ResultatConnexion = 'succes' | 'echec' | 'bloque';

export interface TentativeConnexion {
  identifiant: string;
  compteId: number | null;
  resultat: ResultatConnexion;
  /** Empreinte HMAC de l'adresse (sans le préfixe « ip: »), ou null si l'adresse n'est pas établie. */
  ipEmpreinte: string | null;
}

export const RETENTION_MOIS = { defaut: 12, plage: [1, 60] as const };

let tableAbsenteSignalee = false;
function signalerOuJournaliser(e: unknown, quoi: string): void {
  if ((e as { code?: string })?.code === '42P01') {
    if (!tableAbsenteSignalee) {
      tableAbsenteSignalee = true;
      console.warn('[admin] admin_connexion_journal absente (migration 357 non appliquée) — journal des connexions non tenu');
    }
    return;
  }
  console.error(`[admin] ${quoi} abandonné`, e);
}

/** Une ligne de journal. Best-effort : n'empêche jamais la connexion. */
export async function journaliserConnexion(t: TentativeConnexion): Promise<void> {
  try {
    await queryAnalytics(
      `INSERT INTO admin_connexion_journal (identifiant, compte_id, resultat, ip_empreinte) VALUES ($1, $2, $3, $4)`,
      [t.identifiant.toLowerCase().slice(0, 254), t.compteId, t.resultat, t.ipEmpreinte],
    );
  } catch (e) {
    signalerOuJournaliser(e, 'journaliserConnexion');
  }
}

/** Durée de conservation réglée (mois), plage appliquée, repli 12. */
export async function lireRetentionMois(): Promise<number> {
  try {
    const r = await queryAnalytics<{ valeur: string }>(`SELECT valeur FROM analytics_config WHERE cle = 'journal_connexions_retention_mois'`);
    const v = Number(r.rows[0]?.valeur);
    const [min, max] = RETENTION_MOIS.plage;
    return Number.isInteger(v) && v >= min && v <= max ? v : RETENTION_MOIS.defaut;
  } catch {
    return RETENTION_MOIS.defaut;
  }
}

/** Efface les lignes plus anciennes que la conservation réglée. Best-effort. */
export async function purgerJournalConnexions(): Promise<void> {
  try {
    const mois = await lireRetentionMois();
    await queryAnalytics(`DELETE FROM admin_connexion_journal WHERE survenu_le < now() - ($1 || ' months')::interval`, [mois]);
  } catch (e) {
    signalerOuJournaliser(e, 'purgerJournalConnexions');
  }
}

export interface LigneJournalConnexion {
  survenuLe: string;
  identifiant: string;
  compteId: number | null;
  resultat: ResultatConnexion;
  ipEmpreinte: string | null;
}

/** Les dernières tentatives (plus récentes d'abord). `disponible: false` tant que la migration 357 n'est pas appliquée. */
export async function lireJournalConnexions(limite: number): Promise<{ disponible: boolean; lignes: LigneJournalConnexion[] }> {
  try {
    const r = await queryAnalytics<{ survenu_le: Date | string; identifiant: string; compte_id: number | null; resultat: ResultatConnexion; ip_empreinte: string | null }>(
      `SELECT survenu_le, identifiant, compte_id, resultat, ip_empreinte
         FROM admin_connexion_journal ORDER BY survenu_le DESC, id DESC LIMIT $1`,
      [limite],
    );
    return {
      disponible: true,
      lignes: r.rows.map((l) => ({
        survenuLe: l.survenu_le instanceof Date ? l.survenu_le.toISOString() : String(l.survenu_le),
        identifiant: l.identifiant, compteId: l.compte_id, resultat: l.resultat, ipEmpreinte: l.ip_empreinte,
      })),
    };
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return { disponible: false, lignes: [] };
    throw e;
  }
}
