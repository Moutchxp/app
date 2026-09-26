/**
 * MODULE « GESTION » — LOT DRIVE-2-bis : MÉMORISER LES PROPOSITIONS DE TRI. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UNE PROPOSITION N'ÉCRASE JAMAIS LA PRÉCÉDENTE. La table est un HISTORIQUE : comparer ce que le moteur
 * proposait hier et ce qu'il propose aujourd'hui est précisément ce qui permettra de dire s'il s'améliore. Une
 * table écrasée ne dirait plus rien.
 *
 * ⚠️ MAIS ON N'AJOUTE QUE CE QUI CHANGE. Recalculer 26 000 propositions identiques ajouterait 26 000 lignes qui
 * n'apprennent rien et noieraient les vrais changements. On relit donc la dernière, et on n'écrit que si elle
 * diffère.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { adressesMessagesDisponibles } from './schema';
import { memeProposition, type Proposition } from './propositionTri';
import type { Confiance, Regle } from './triPieces';

/** Combien d'adresses fondatrices on garde en clair. Au-delà, la liste devient illisible et n'apprend plus rien. */
export const ADRESSES_GARDEES = 12;

/** La dernière proposition connue pour un lot de pièces, en UNE requête. LECTURE SEULE. */
export async function dernieresPropositions(pieceIds: readonly number[]): Promise<Map<number, Proposition>> {
  const m = new Map<number, Proposition>();
  if (pieceIds.length === 0 || !(await adressesMessagesDisponibles())) return m;

  const { rows } = await query<{
    piece_id: string; destination_sorte: string; destination_cle: string | null; regle: string;
    confiance: string; motif: string | null; adresses_fondatrices: string | null;
  }>(
    `SELECT DISTINCT ON (piece_id) piece_id, destination_sorte, destination_cle, regle, confiance, motif,
            adresses_fondatrices
       FROM gestion_piece_proposition
      WHERE piece_id = ANY($1::bigint[])
      ORDER BY piece_id, propose_le DESC, id DESC`, [pieceIds]);

  for (const r of rows) {
    m.set(Number(r.piece_id), {
      destination: r.destination_sorte === 'aucune'
        ? { sorte: 'aucune' }
        : { sorte: r.destination_sorte as 'bien' | 'proprietaire', cle: r.destination_cle ?? '' },
      regle: r.regle as Regle,
      confiance: r.confiance as Confiance,
      motif: r.motif ?? '',
      adressesFondatrices: (r.adresses_fondatrices ?? '').split(/\s*,\s*/).filter((x) => x !== ''),
    });
  }
  return m;
}

/**
 * ENREGISTRE UNE PROPOSITION, **si elle diffère de la dernière**. Rend `true` quand une ligne a été ajoutée.
 *
 * ⚠️ `precedente` est passée par l'appelant, qui les a toutes relues en une fois : une requête par pièce sur
 * 26 000 pièces ferait 26 000 allers-retours pour rien.
 */
export async function enregistrerProposition(
  pieceId: number, p: Proposition, precedente: Proposition | undefined,
): Promise<boolean> {
  if (precedente !== undefined && memeProposition(precedente, p)) return false;

  const adresses = p.adressesFondatrices.slice(0, ADRESSES_GARDEES).join(', ')
    + (p.adressesFondatrices.length > ADRESSES_GARDEES
      ? ` (+${p.adressesFondatrices.length - ADRESSES_GARDEES} autres)` : '');

  await query(
    `INSERT INTO gestion_piece_proposition
       (piece_id, destination_sorte, destination_cle, regle, confiance, motif, adresses_fondatrices)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [pieceId, p.destination.sorte,
      p.destination.sorte === 'aucune' ? null : p.destination.cle,
      p.regle, p.confiance, p.motif, adresses === '' ? null : adresses]);
  return true;
}

/** Les chiffres des propositions, pour le rapport. LECTURE SEULE. */
export async function chiffresPropositions(): Promise<{
  total: number; pieces: number; bien: number; proprietaire: number; aucune: number;
  parRegle: Record<string, number>; parConfiance: Record<string, number>;
}> {
  const { rows } = await query<{
    total: string; pieces: string; bien: string; prop: string; aucune: string;
    a: string; b: string; c: string; d: string; haute: string; moyenne: string; basse: string;
  }>(
    `WITH derniere AS (
       SELECT DISTINCT ON (piece_id) * FROM gestion_piece_proposition ORDER BY piece_id, propose_le DESC, id DESC)
     SELECT (SELECT count(*) FROM gestion_piece_proposition)::text AS total,
            count(*)::text AS pieces,
            count(*) FILTER (WHERE destination_sorte = 'bien')::text AS bien,
            count(*) FILTER (WHERE destination_sorte = 'proprietaire')::text AS prop,
            count(*) FILTER (WHERE destination_sorte = 'aucune')::text AS aucune,
            count(*) FILTER (WHERE regle = 'a')::text AS a,
            count(*) FILTER (WHERE regle = 'b')::text AS b,
            count(*) FILTER (WHERE regle = 'c')::text AS c,
            count(*) FILTER (WHERE regle = 'd')::text AS d,
            count(*) FILTER (WHERE confiance = 'haute')::text AS haute,
            count(*) FILTER (WHERE confiance = 'moyenne')::text AS moyenne,
            count(*) FILTER (WHERE confiance = 'basse')::text AS basse
       FROM derniere`);
  const r = rows[0];
  return {
    total: Number(r.total), pieces: Number(r.pieces), bien: Number(r.bien),
    proprietaire: Number(r.prop), aucune: Number(r.aucune),
    parRegle: { a: Number(r.a), b: Number(r.b), c: Number(r.c), d: Number(r.d) },
    parConfiance: { haute: Number(r.haute), moyenne: Number(r.moyenne), basse: Number(r.basse) },
  };
}
