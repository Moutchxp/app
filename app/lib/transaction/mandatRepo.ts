// 🔴 MON ESPACE, LOT 2 (Arno, 02/11/2026) — « CE MANDAT EXISTE-T-IL DÉJÀ DANS CETTE STRUCTURE ? » : la seule recherche, en lecture. Réutilisée
// par l'enregistrement d'une affaire (tuile Suivi CA) et par « Mon espace » (créer, rejoindre : lots 5 et 6). La comparaison passe par
// `normaliserMandat` (mandat.ts), jamais par une autre règle. Pas de `import 'server-only'` (même convention que repo.ts).
import { query, type RequeteTx } from '../db/client';
import { mandatDisponible } from '../admin/schemaDroits';
import { normaliserMandat, type VenteDuMandat } from './mandat';
import type { Societe } from './modele';

/** L'index unique de la migration 449 : une écriture qui le heurte est un doublon de mandat. */
export const INDEX_UNIQUE_MANDAT = 'transaction_vente_mandat_unique';

/** L'erreur PostgreSQL d'un doublon de n° de mandat (deux saisies simultanées, rétablissement, annulation d'un geste). */
export function estDoublonMandat(e: unknown): boolean {
  const x = e as { code?: unknown; constraint?: unknown } | null;
  return x != null && x.code === '23505' && x.constraint === INDEX_UNIQUE_MANDAT;
}

/**
 * La vente VIVANTE (non retirée, non annulée) de cette structure qui porte déjà ce n° — hors la vente `sauf` (celle qu'on modifie) ;
 * null : le n° est libre (ou la 449 n'est pas appliquée). `q` : la transaction de l'appelant (lecture avant écriture), sinon le pool.
 */
export async function venteDuMandat(societe: Societe, numero: string, sauf: number | null = null, q?: RequeteTx): Promise<VenteDuMandat | null> {
  const normalise = normaliserMandat(numero);
  if (normalise === null || !(await mandatDisponible())) return null;
  const lire = q ?? query;
  const { rows } = await lire<Record<string, unknown>>(
    `SELECT v.id, v.societe, v.numero_mandat, v.libelle, v.statut, to_char(v.date_compromis, 'YYYY-MM-DD') AS date_compromis,
            to_jsonb(v) ->> 'date_acte' AS date_acte, to_jsonb(v) ->> 'adresse_bien' AS adresse_bien
       FROM transaction_vente v
      WHERE v.societe = $1 AND v.numero_mandat_normalise = $2 AND v.retire_le IS NULL AND v.statut <> 'annulee'
        AND ($3::bigint IS NULL OR v.id <> $3)
      ORDER BY v.id LIMIT 1`, [societe, normalise, sauf]);
  const r = rows[0];
  if (r === undefined) return null;
  return { id: Number(r.id), societe: r.societe as Societe, numero: String(r.numero_mandat), libelle: String(r.libelle),
    statut: r.statut === 'vendue' ? 'vendue' : 'compromis', dateCompromis: r.date_compromis == null ? null : String(r.date_compromis),
    dateActe: r.date_acte == null ? null : String(r.date_acte).slice(0, 10), adresseBien: r.adresse_bien == null ? null : String(r.adresse_bien) };
}
