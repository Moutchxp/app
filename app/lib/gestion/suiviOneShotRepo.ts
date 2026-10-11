import { query } from '../db/client';
import { MOTIF_RETIRE_PAR_SUIVI, mailsDuFil, suiviDuFil } from './periodeRepo';
import { MOTIF_DETACHE_PAR_INTERNE } from './interneDetache';
import { MOTIF_RATTACHEMENT_ANNULE } from './interneLevee';
import { projeter } from './periodesConversation';
import {
  exceptionEstUnGeste, sortieEstUnGeste, modificationDeLaSortie, modificationsDeLException, type ModificationOneShot,
} from './suiviOneShot';

/**
 * ══ 🔴🔴 LOT PASTILLE-SUIVI-MODIFIE-ONE-SHOT — LES MODIFICATIONS « CE MAIL UNIQUEMENT » D'UN PAQUET DE MAILS ═══════
 *
 * 🔒 LECTURE SEULE : aucun `INSERT`, `UPDATE`, `DELETE`. Les décisions (qu'est-ce qui compte, comment le dire) sont
 * dans `suiviOneShot.ts` (PUR) ; ce fichier ne fait que lire les deux traces et recalculer le fond.
 *
 * ⚠️ D'ABORD LE FILTRE BON MARCHÉ, ENSUITE LE CALCUL : une page de liste montre cinquante mails, et l'immense
 * majorité ne porte ni exception ni sortie. Une requête dit lesquels en portent ; le fond (périodes du fil) n'est
 * recalculé que pour ceux-là, une fois par conversation.
 *
 * ⚠️ SILENCIEUX EN CAS D'ÉCHEC, comme la lecture du suivi : la pastille est un renseignement de plus. Une lecture
 * en faute rend une carte vide — aucune pastille — et ne doit jamais empêcher de lire le courrier.
 */
/**
 * ⚠️ LES SORTIES QUI NE SONT PAS UN GESTE « CE MAIL UNIQUEMENT ». Depuis le lot INVARIANT-HISTORIQUE-INALTERABLE,
 * TOUT retrait d'un lien de bien confirmé devient une sortie du suivi (`changerStatut`) — y compris ceux que la
 * projection d'une fenêtre écrit, ceux de « Interne » (portée non enregistrée) et l'annulation d'un ajout. Ils se
 * reconnaissent à leur motif, fixe. Les compter aurait mis la pastille sur chaque mail touché par « toute la
 * conversation » (constaté en transaction annulée sur le fil _TEST 36588) — et compté deux fois une exception.
 */
const MOTIFS_SORTIE_AUTOMATIQUE: readonly string[] = [
  MOTIF_RETIRE_PAR_SUIVI, MOTIF_DETACHE_PAR_INTERNE, MOTIF_RATTACHEMENT_ANNULE,
];

export async function oneShotDesMessages(messageIds: readonly number[]): Promise<Map<number, ModificationOneShot[]>> {
  const parMail = new Map<number, ModificationOneShot[]>();
  const ids = [...new Set(messageIds.filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (ids.length === 0) return parMail;
  const ajouter = (m: number, l: ModificationOneShot[]): void => {
    if (l.length > 0) parMail.set(m, [...(parMail.get(m) ?? []), ...l]);
  };

  try {
    /* ① LES EXCEPTIONS VIVANTES — `to_regclass` : sans la migration 290, la table n'est nommée nulle part. */
    const { rows: dispo } = await query<{ e: string | null; s: boolean }>(
      `SELECT to_regclass('public.gestion_message_exception')::text AS e,
              EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'gestion_rattachement' AND column_name = 'sorti_le') AS s`);
    const avecExceptions = dispo[0]?.e !== null && dispo[0]?.e !== undefined;
    const avecSorties = dispo[0]?.s === true;

    if (avecExceptions) {
      const { rows } = await query<{ message_id: string; fil_id: string; libelle: string; nom: string | null;
        le: string }>(
        `SELECT e.message_id::text, m.fil_id::text, e.cree_par_libelle AS libelle,
                nullif(btrim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')), '') AS nom,
                to_char(e.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le
           FROM gestion_message_exception e
           JOIN gestion_message m ON m.id = e.message_id
           LEFT JOIN admin_utilisateur u ON u.id = e.cree_par
          WHERE e.message_id = ANY($1::bigint[]) AND e.retiree_le IS NULL AND m.fil_id IS NOT NULL`, [ids]);
      const gestes = rows.filter((r) => exceptionEstUnGeste(r.libelle));
      const fils = [...new Set(gestes.map((r) => Number(r.fil_id)))];

      if (fils.length > 0) {
        const { rows: internes } = await query<{ fil_id: string }>(
          `SELECT DISTINCT fil_id::text FROM gestion_fil_interne
            WHERE fil_id = ANY($1::bigint[]) AND retire_le IS NULL`, [fils]);
        const filsInternes = new Set(internes.map((r) => Number(r.fil_id)));

        for (const fil of fils) {
          const { periodes, exceptions } = await suiviDuFil(fil);
          const mails = await mailsDuFil(fil);
          /* 🔴 LE FOND = LES FENÊTRES SEULES, l'exception mise de côté : ce que le mail suivrait sans elle. */
          const fond = projeter(mails, periodes, []);
          for (const r of gestes.filter((g) => Number(g.fil_id) === fil)) {
            const m = Number(r.message_id);
            const ex = exceptions.find((e) => e.messageId === m);
            if (ex === undefined) continue;
            ajouter(m, modificationsDeLException({
              fond: fond.get(m), exception: ex.classement, interneDeLEchange: filsInternes.has(fil),
              par: r.nom ?? r.libelle, le: r.le,
            }));
          }
        }
      }
    }

    /* ② LES SORTIES DU SUIVI, couple (mail, bien), restaurables. */
    if (avecSorties) {
      const { rows } = await query<{ message_id: string; libelle: string | null; cle: string | null;
        par: string | null; motif: string | null; nom: string | null; le: string | null }>(
        /* ⚠️ `DISTINCT ON (mail, bien)` : une sortie marque TOUS les liens du mail vers ce bien (posé à la main ET
           par le moteur, p. ex.). C'est un seul geste — il ne doit compter qu'une fois dans le « ×N ». */
        `SELECT DISTINCT ON (r.message_id, r.cible_cle)
                r.message_id::text, r.cible_libelle AS libelle, r.cible_cle AS cle, r.sorti_par_libelle AS par,
                r.sorti_motif AS motif,
                nullif(btrim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')), '') AS nom,
                to_char(r.sorti_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le
           FROM gestion_rattachement r
           LEFT JOIN admin_utilisateur u ON u.id = r.sorti_par
          WHERE r.message_id = ANY($1::bigint[]) AND r.statut = 'sorti' AND r.piece_id IS NULL
          ORDER BY r.message_id, r.cible_cle, r.sorti_le DESC, r.id DESC`, [ids]);
      for (const r of rows) {
        if (!sortieEstUnGeste({ par: r.par, motif: r.motif, motifsAutomatiques: MOTIFS_SORTIE_AUTOMATIQUE })) continue;
        ajouter(Number(r.message_id), [modificationDeLaSortie({
          bienLibelle: r.libelle ?? (r.cle === null ? '' : `lot ${r.cle}`),
          motif: r.motif, par: r.nom ?? r.par ?? '', le: r.le,
        })]);
      }
    }
  } catch (e) {
    console.error('[gestion/one-shot] lecture impossible', e);
    return new Map();
  }
  return parMail;
}
