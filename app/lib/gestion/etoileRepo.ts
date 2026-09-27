import { query, withTransaction } from '../db/client';
import { etoileDisponible } from './schema';
/** ⚠️ `Auteur` vient de `rattachementRepo` : c'est là qu'il a été défini, et le recopier en ferait une seconde
 *  définition à maintenir. Un `import type` est effacé à la compilation — il n'entraîne aucun code. */
import type { Auteur } from './rattachementRepo';

/**
 * MODULE « GESTION » — LOT LISTE-GMAIL : L'ÉTOILE DE L'ÉQUIPE SUR UN ÉCHANGE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UNE ÉTOILE, PAS DEUX. Gmail a la sienne (libellé STARRED, posée sur un MESSAGE, gérée par `gmailAction.ts`) :
 * elle vit dans la boîte et suit le compte Google. Celle-ci est un état de NOTRE application, posé sur un ÉCHANGE,
 * partagé par toute l'équipe et daté — « je m'en occupe », « à reprendre lundi ». Elle ne touche PAS à Gmail, et
 * Gmail ne la touche pas. Les confondre ferait croire qu'un geste ici change la boîte de quelqu'un d'autre.
 *
 * 🔴 RIEN N'EST SUPPRIMÉ. Décrocher l'étoile écrit `etoilee = false` ; la ligne reste, avec qui l'a touchée et
 * quand. Chaque bascule est en outre journalisée (`gestion_journal`, append-only garanti par trigger).
 *
 * ⚠️ PAS DE `import 'server-only'` ICI, ET C'EST VOULU — comme ses voisins `nonRemiseRepo` et `rattachementRepo`.
 * Ce module est atteint par `boiteRepo`, lui-même importé par le script CLI `boite-epreuve.ts` : `server-only` lève
 * hors bundle react-server (tsx / node), et la commande mourrait au chargement. Le garde de graphe
 * `app/lib/garde/serverOnly.guard.test.ts` l'a attrapé le jour même — je l'avais ajouté par réflexe.
 *
 * ⚠️ SANS LA MIGRATION 264, LA TABLE N'EST NOMMÉE NULLE PART : la lecture rend une carte vide et l'écriture refuse
 * proprement. Nommer une table absente ferait échouer TOUTE la liste, pas seulement le geste nouveau.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Quels échanges, parmi ceux-ci, portent l'étoile ? LECTURE SEULE. Liste vide ⇒ aucune requête. */
export async function etoilesDesFils(filIds: readonly number[]): Promise<Set<number>> {
  if (filIds.length === 0 || !(await etoileDisponible())) return new Set();
  const { rows } = await query<{ fil_id: string }>(
    `SELECT fil_id::text AS fil_id FROM gestion_fil_etoile
      WHERE etoilee AND fil_id = ANY($1::bigint[])`, [[...filIds]]);
  return new Set(rows.map((r) => Number(r.fil_id)));
}

export type IssueEtoile = { ok: true; etoilee: boolean } | { ok: false; motif: string };

/**
 * POSE OU DÉCROCHE L'ÉTOILE. Idempotent par construction : l'état DEMANDÉ est écrit, jamais « l'inverse de ce qui
 * est là » — deux clics partis en même temps depuis deux postes ne peuvent pas se croiser et laisser l'étoile dans
 * l'état contraire de ce que les deux voulaient.
 */
export async function poserEtoile(o: { filId: number; etoilee: boolean; auteur: Auteur }): Promise<IssueEtoile> {
  if (!(await etoileDisponible())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 264).' };
  }
  return withTransaction(async (q) => {
    const { rows: avant } = await q<{ etoilee: boolean }>(
      'SELECT etoilee FROM gestion_fil_etoile WHERE fil_id = $1', [o.filId]);
    const etait = avant[0]?.etoilee === true;
    await q(
      `INSERT INTO gestion_fil_etoile (fil_id, etoilee, maj_le, maj_par, maj_par_libelle)
       VALUES ($1, $2, now(), $3, $4)
       ON CONFLICT (fil_id) DO UPDATE
         SET etoilee = EXCLUDED.etoilee, maj_le = now(),
             maj_par = EXCLUDED.maj_par, maj_par_libelle = EXCLUDED.maj_par_libelle`,
      [o.filId, o.etoilee, o.auteur.id, o.auteur.libelle]);
    /**
     * ⚠️ ON NE JOURNALISE QUE LE CHANGEMENT RÉEL. Reposer une étoile déjà posée n'est pas un geste : l'écrire
     * remplirait le journal de lignes qui ne racontent rien, et rendrait illisible celui qui compte.
     */
    if (etait !== o.etoilee) {
      await q(
        `INSERT INTO gestion_journal
           (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
         VALUES ('fil_etoile', $1, $2, $3, $4, $5, $6, $7)`,
        [o.filId, o.etoilee ? 'etoiler' : 'desetoiler', String(etait), String(o.etoilee),
          o.etoilee ? 'étoile posée sur l’échange' : 'étoile retirée de l’échange',
          o.auteur.id, o.auteur.libelle]);
    }
    return { ok: true, etoilee: o.etoilee };
  });
}
