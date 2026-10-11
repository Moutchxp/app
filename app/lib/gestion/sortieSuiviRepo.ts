import { query, withTransaction } from '../db/client';
import type { Auteur } from './gestes';

/**
 * ══ 🔴🔴 LOT INVARIANT-HISTORIQUE-INALTERABLE — « SORTIR DU SUIVI », LA SEULE PORTE DE SORTIE D'UN HISTORIQUE ════════
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `envoiCiblesRepo.ts`).
 *
 * RÈGLE D'ARNO (11/10/2026) : « Un mail entré dans l'historique d'un bien n'en sort JAMAIS, sauf par le bouton
 * “Sortir du suivi”, utilisé mail par mail et restaurable. »
 *
 * 🔴 ON MARQUE, ON N'EFFACE PAS. Le lien du mail vers CE bien passe au statut « sorti » (migration 340), avec qui, quand
 * et pourquoi (`sorti_*`) : la ligne reste, ses pièces restent, et les liens du même mail vers d'AUTRES biens ne sont
 * jamais touchés. L'historique ne lit que les liens « confirme » (`sqlLiensDuBien`). « Restaurer » rend le lien
 * « confirme » : le mail revient dans CE bien, exactement tel qu'il était.
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

/** La transaction de l'appelant (`withTransaction`) : les gestes dédiés s'écrivent DANS le geste qui les déclenche. */
type Tx = Parameters<Parameters<typeof withTransaction>[0]>[0];

/**
 * 🔴 LE RÉGLAGE DE SESSION QUE LA BASE EXIGE (migrations 339-340) pour qu'un lien CONFIRMÉ change de statut, local à
 * la transaction. Seules les fonctions de ce module — et `changerStatut` / `rattacher` qui les appellent — le posent.
 */
export async function autoriserGesteDedie(q: Tx): Promise<void> {
  await q(`SELECT set_config('svav.sortie_suivi', 'on', true)`);
}

/**
 * SORTIR DU SUIVI UN LIEN DE BIEN CONFIRMÉ, dans la transaction de l'appelant. Le lien passe au statut « sorti » pour CE
 * bien seul (la ligne du couple mail, bien) : il reste en base, restaurable. Rend `true` s'il a été marqué.
 */
export async function sortirLeLien(q: Tx, lienId: number, auteur: Auteur, motif: string | null): Promise<boolean> {
  await autoriserGesteDedie(q);
  const { rows } = await q<{ id: string; message_id: string; cible_cle: string }>(
    `UPDATE gestion_rattachement
        SET statut = 'sorti', statut_le = now(), statut_par = $2, statut_par_libelle = $3, statut_motif = $4,
            sorti_le = now(), sorti_par = $2, sorti_par_libelle = $3, sorti_motif = $4
      WHERE id = $1 AND statut = 'confirme' AND cible_sorte = 'lot'
      RETURNING id::text, message_id::text, cible_cle`,
    [lienId, auteur.id, auteur.libelle, motif]);
  for (const r of rows) {
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('rattachement', $1, 'sortir_du_suivi', 'confirme', 'sorti', $2, $3, $4)`,
      [Number(r.id), `mail ${r.message_id} · lot ${r.cible_cle}${motif ? ` · ${motif}` : ''}`, auteur.id, auteur.libelle]);
  }
  return rows.length > 0;
}

/** RESTAURER UN LIEN SORTI DU SUIVI, dans la transaction de l'appelant : il redevient « confirme », tel qu'il était. */
export async function restaurerLeLien(q: Tx, lienId: number, auteur: Auteur, motif: string | null = null): Promise<boolean> {
  await autoriserGesteDedie(q);
  const { rows } = await q<{ id: string; message_id: string; cible_cle: string }>(
    `UPDATE gestion_rattachement
        SET statut = 'confirme', statut_le = now(), statut_par = $2, statut_par_libelle = $3, statut_motif = $4,
            sorti_le = NULL, sorti_par = NULL, sorti_par_libelle = NULL, sorti_motif = NULL
      WHERE id = $1 AND statut = 'sorti'
      RETURNING id::text, message_id::text, cible_cle`,
    [lienId, auteur.id, auteur.libelle, motif]);
  for (const r of rows) {
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('rattachement', $1, 'restaurer_dans_le_suivi', 'sorti', 'confirme', $2, $3, $4)`,
      [Number(r.id), `mail ${r.message_id} · lot ${r.cible_cle}`, auteur.id, auteur.libelle]);
  }
  return rows.length > 0;
}

async function marquer(o: {
  messageId: number; lotCle: string; auteur: Auteur; sortir: boolean; motif?: string | null;
}): Promise<IssueSortie> {
  const cle = (o.lotCle ?? '').trim();
  if (!Number.isSafeInteger(o.messageId) || o.messageId <= 0 || cle === '') return { ok: false, motif: 'Mail ou bien non désigné.' };
  const libelle = (o.auteur.libelle ?? '').trim();
  if (libelle === '') return { ok: false, motif: 'Auteur inconnu.' };
  const auteur = { id: o.auteur.id, libelle };
  return withTransaction<IssueSortie>(async (q) => {
    // ⚠️ LE COUPLE (MAIL, CE BIEN) SEULEMENT : les liens du même mail vers d'AUTRES biens ne sont jamais lus ici.
    const { rows } = await q<{ id: string }>(
      `SELECT id::text FROM gestion_rattachement
        WHERE message_id = $1 AND cible_sorte = 'lot' AND cible_cle = $2 AND piece_id IS NULL AND statut = $3
        FOR UPDATE`,
      [o.messageId, cle, o.sortir ? 'confirme' : 'sorti']);
    let faits = 0;
    for (const r of rows) {
      const fait = o.sortir
        ? await sortirLeLien(q, Number(r.id), auteur, o.motif ?? null)
        : await restaurerLeLien(q, Number(r.id), auteur);
      if (fait) faits += 1;
    }
    if (faits === 0) {
      return { ok: false, motif: o.sortir ? 'Ce mail n’est pas (ou plus) dans le suivi de ce bien.' : 'Ce mail n’est pas sorti du suivi de ce bien.' };
    }
    return { ok: true, liens: faits };
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
      WHERE r.cible_sorte = 'lot' AND r.cible_cle = $1 AND r.statut = 'sorti' AND r.piece_id IS NULL
        -- ⚠️ Un mail qui porte AUSSI un lien vivant vers ce bien est encore dans l'historique : il n'est pas « sorti ».
        AND NOT EXISTS (SELECT 1 FROM gestion_rattachement v
                         WHERE v.message_id = r.message_id AND v.cible_sorte = 'lot' AND v.cible_cle = $1
                           AND v.statut = 'confirme' AND v.piece_id IS NULL)
      ORDER BY m.id, r.sorti_le DESC`, [cle]);
  return rows.map((r) => ({
    messageId: Number(r.message_id), objet: r.objet, de: r.de, deNom: r.de_nom, recuLe: r.recu_le,
    sortiLe: r.sorti_le, sortiPar: r.sorti_par, motif: r.motif,
  })).sort((a, b) => b.sortiLe.localeCompare(a.sortiLe));
}
