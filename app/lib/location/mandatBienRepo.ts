import { query, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { LIBELLE_MANDAT, type Mandat, type SaisieMandat, type SorteMandat } from './mandatBien';

/**
 * ══ LE MANDAT D'UN BIEN (Arno, 21/10/2026, migration 397). IMPUR (base). ════════════════════════════════════════════════════
 * Le n° vit sur la fiche propriétaire (372 / 379) ; la date de signature aussi (397). Sans la 397, le n° s'enregistre comme
 * avant et la date ne l'est pas — l'écran le DIT (jamais perdue en silence).
 */
const COLONNES: Record<SorteMandat, { numero: string; date: string }> = {
  gestion: { numero: 'numero_mandat_gestion', date: 'mandat_gestion_signe_le' },
  transaction: { numero: 'numero_mandat_transaction', date: 'mandat_transaction_signe_le' },
};

export function dateMandatDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_proprietaire', 'mandat_gestion_signe_le');
}

export interface MandatsDuProprietaire { id: number; nom: string; gestion: Mandat; transaction: Mandat }

/** Les mandats (n°, date) de propriétaires : le pré-remplissage de « Nouveau bien », la fiche propriétaire, l'encart, le mail. */
export async function mandatsDesProprietaires(ids: readonly number[]): Promise<MandatsDuProprietaire[]> {
  if (ids.length === 0) return [];
  const avecDate = await dateMandatDisponible();
  const transaction = (await colonneExisteMemo('gestion_annuaire_proprietaire', 'numero_mandat_transaction')) ? 'p.numero_mandat_transaction' : 'NULL::text';
  const gestion = (await colonneExisteMemo('gestion_annuaire_proprietaire', 'numero_mandat_gestion')) ? 'p.numero_mandat_gestion' : 'NULL::text';
  const { rows } = await query<{ id: string; nom: string | null; mg: string | null; mt: string | null; dg: string | null; dt: string | null }>(
    `SELECT p.id::text, coalesce(p.nom_complet, p.nom) AS nom, ${gestion} AS mg, ${transaction} AS mt,
            ${avecDate ? 'p.mandat_gestion_signe_le::text AS dg, p.mandat_transaction_signe_le::text AS dt' : 'NULL::text AS dg, NULL::text AS dt'}
       FROM gestion_annuaire_proprietaire p WHERE p.id = ANY($1::bigint[])`, [[...ids]]);
  return ids.map((id) => rows.find((r) => Number(r.id) === id)).filter((r) => r !== undefined)
    .map((r) => ({ id: Number(r.id), nom: r.nom ?? `Propriétaire ${r.id}`, gestion: { numero: r.mg, signeLe: r.dg }, transaction: { numero: r.mt, signeLe: r.dt } }));
}

/**
 * ÉCRIT le mandat saisi (sorte du choix final) sur la fiche de CHAQUE propriétaire du bien, dans la transaction de l'appelant :
 * seulement ce qui est saisi et différent ; journalisé (avant / après) sur la fiche. Rend un avertissement si la date n'a pas pu
 * l'être (migration 397 absente), sinon `null`.
 */
export async function enregistrerMandatDans(q: RequeteTx, proprietaireIds: readonly number[], m: SaisieMandat, lotId: number, auteur: Auteur,
  contexte = `à la création du bien ${lotId} (« Nouveau bien »)`): Promise<string | null> {
  const c = COLONNES[m.sorte];
  const avecDate = await dateMandatDisponible();
  if (!(await colonneExisteMemo('gestion_annuaire_proprietaire', c.numero))) return `${LIBELLE_MANDAT[m.sorte]} non enregistré : la mise à jour de la base manque.`;
  for (const id of proprietaireIds) {
    const { rows } = await q<{ n: string | null; d: string | null }>(
      `SELECT ${c.numero} AS n, ${avecDate ? `${c.date}::text` : 'NULL::text'} AS d FROM gestion_annuaire_proprietaire WHERE id = $1 FOR UPDATE`, [id]);
    const avant = rows[0];
    if (avant === undefined) continue;
    const numero = m.numero ?? avant.n;
    const signeLe = avecDate ? (m.signeLe ?? avant.d) : avant.d;
    if (numero === avant.n && signeLe === avant.d) continue;
    await q(avecDate ? `UPDATE gestion_annuaire_proprietaire SET ${c.numero} = $2, ${c.date} = $3::date WHERE id = $1`
      : `UPDATE gestion_annuaire_proprietaire SET ${c.numero} = $2 WHERE id = $1`, avecDate ? [id, numero, signeLe] : [id, numero]);
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
             VALUES ('annuaire', $1, $2, $3, $4, $5, $6, $7)`,
      [id, m.sorte === 'gestion' ? 'location_numero_mandat' : 'location_numero_mandat_transaction',
        [avant.n, avant.d].filter((x) => x).join(' · ') || null, [numero, signeLe].filter((x) => x).join(' · ') || null,
        `${LIBELLE_MANDAT[m.sorte]} saisi ${contexte}`, auteur.id, auteur.libelle]);
  }
  return m.signeLe !== null && !avecDate ? `${LIBELLE_MANDAT[m.sorte]} : n° enregistré, mais pas la date de signature (mise à jour de la base à appliquer, migration 397).` : null;
}
