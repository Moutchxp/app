import { query, withTransaction } from '../db/client';
import type { Auteur } from './gestes';

/**
 * ══ 🔴🔴 LOT INVARIANT-HISTORIQUE-INALTERABLE — « SORTIR DU SUIVI », LA SEULE PORTE DE SORTIE D'UN HISTORIQUE ════════
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `envoiCiblesRepo.ts`).
 *
 * RÈGLE D'ARNO (11/10/2026) : « Un mail entré dans l'historique d'un bien n'en sort JAMAIS, sauf par le bouton
 * “Sortir du suivi”, utilisé mail par mail et restaurable. »
 *
 * 🔴 ON MARQUE, ON N'EFFACE PAS. Les liens confirmés du mail vers CE bien reçoivent `sorti_le` (qui, quand, motif) :
 * le lien reste, son statut reste « confirme », ses pièces restent. L'historique du bien ne lit que les liens sans
 * `sorti_le` (`sqlLiensDuBien`). « Restaurer » efface la marque : le mail revient exactement tel qu'il était.
 *
 * 🔴 TOUS LES LIENS DU MAIL VERS CE BIEN, QUELLE QUE SOIT LEUR ORIGINE (à la main, moteur, suivi de conversation) —
 * c'est ce que l'ancien geste (une exception de suivi) ne faisait pas : il laissait les liens posés à la main.
 *
 * 🔴 LA BASE N'ACCEPTE CETTE MARQUE QUE D'ICI : le verrou de la migration 339 exige le réglage de session
 * `svav.sortie_suivi`, posé localement à la transaction.
 *
 * Chaque geste est HISTORISÉ au journal (entité « rattachement », une ligne par lien).
 */

export type IssueSortie = { ok: true; liens: number } | { ok: false; motif: string };

async function marquer(o: {
  messageId: number; lotCle: string; auteur: Auteur; sortir: boolean; motif?: string | null;
}): Promise<IssueSortie> {
  const cle = (o.lotCle ?? '').trim();
  if (!Number.isSafeInteger(o.messageId) || o.messageId <= 0 || cle === '') return { ok: false, motif: 'Mail ou bien non désigné.' };
  const libelle = (o.auteur.libelle ?? '').trim();
  if (libelle === '') return { ok: false, motif: 'Auteur inconnu.' };
  return withTransaction<IssueSortie>(async (q) => {
    await q(`SELECT set_config('svav.sortie_suivi', 'on', true)`);
    const { rows } = await q<{ id: string }>(
      o.sortir
        ? `UPDATE gestion_rattachement
              SET sorti_le = now(), sorti_par = $3, sorti_par_libelle = $4, sorti_motif = $5
            WHERE message_id = $1 AND cible_sorte = 'lot' AND cible_cle = $2 AND statut = 'confirme'
              AND piece_id IS NULL AND sorti_le IS NULL
            RETURNING id::text`
        : `UPDATE gestion_rattachement
              SET sorti_le = NULL, sorti_par = NULL, sorti_par_libelle = NULL, sorti_motif = NULL
            WHERE message_id = $1 AND cible_sorte = 'lot' AND cible_cle = $2 AND statut = 'confirme'
              AND piece_id IS NULL AND sorti_le IS NOT NULL
            RETURNING id::text`,
      o.sortir ? [o.messageId, cle, o.auteur.id, libelle, o.motif ?? null] : [o.messageId, cle]);
    if (rows.length === 0) {
      return { ok: false, motif: o.sortir ? 'Ce mail n’est pas (ou plus) dans le suivi de ce bien.' : 'Ce mail n’est pas sorti du suivi de ce bien.' };
    }
    for (const r of rows) {
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
         VALUES ('rattachement', $1, $2, $3, $4, $5, $6, $7)`,
        [Number(r.id), o.sortir ? 'sortir_du_suivi' : 'restaurer_dans_le_suivi', o.sortir ? 'suivi' : 'sorti du suivi',
          o.sortir ? 'sorti du suivi' : 'suivi', `mail ${o.messageId} · lot ${cle}${o.motif ? ` · ${o.motif}` : ''}`,
          o.auteur.id, libelle]);
    }
    return { ok: true, liens: rows.length };
  });
}

/** « Sortir ce mail du suivi de ce bien » : marque, n'efface rien. */
export function sortirDuSuivi(o: { messageId: number; lotCle: string; auteur: Auteur; motif?: string | null }): Promise<IssueSortie> {
  return marquer({ ...o, sortir: true });
}

/** « Restaurer » : le mail revient dans l'historique du bien, tel qu'il était. */
export function restaurerDansLeSuivi(o: { messageId: number; lotCle: string; auteur: Auteur }): Promise<IssueSortie> {
  return marquer({ ...o, sortir: false });
}

/** Un mail sorti du suivi d'un bien, pour la ligne repliée en bas de l'historique. */
export interface MailSorti {
  messageId: number; objet: string | null; de: string | null; deNom: string | null; recuLe: string;
  sortiLe: string; sortiPar: string | null; motif: string | null;
}

/** Les mails sortis du suivi de ce bien, le plus récemment sorti d'abord. LECTURE SEULE. */
export async function mailsSortisDuSuivi(lotCle: string): Promise<MailSorti[]> {
  const cle = (lotCle ?? '').trim();
  if (cle === '') return [];
  const { rows } = await query<{
    message_id: string; objet: string | null; de: string | null; de_nom: string | null; recu_le: string;
    sorti_le: string; sorti_par: string | null; motif: string | null;
  }>(
    `SELECT DISTINCT ON (m.id) m.id::text AS message_id, m.objet, m.de_adresse AS de, m.de_nom,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            to_char(r.sorti_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sorti_le,
            r.sorti_par_libelle AS sorti_par, r.sorti_motif AS motif
       FROM gestion_rattachement r
       JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_sorte = 'lot' AND r.cible_cle = $1 AND r.statut = 'confirme' AND r.piece_id IS NULL
        AND r.sorti_le IS NOT NULL
        -- ⚠️ Un mail qui porte AUSSI un lien vivant vers ce bien est encore dans l'historique : il n'est pas « sorti ».
        AND NOT EXISTS (SELECT 1 FROM gestion_rattachement v
                         WHERE v.message_id = r.message_id AND v.cible_sorte = 'lot' AND v.cible_cle = $1
                           AND v.statut = 'confirme' AND v.piece_id IS NULL AND v.sorti_le IS NULL)
      ORDER BY m.id, r.sorti_le DESC`, [cle]);
  return rows.map((r) => ({
    messageId: Number(r.message_id), objet: r.objet, de: r.de, deNom: r.de_nom, recuLe: r.recu_le,
    sortiLe: r.sorti_le, sortiPar: r.sorti_par, motif: r.motif,
  })).sort((a, b) => b.sortiLe.localeCompare(a.sortiLe));
}
