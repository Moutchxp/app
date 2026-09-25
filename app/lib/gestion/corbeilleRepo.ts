/**
 * MODULE « GESTION » — LOT 5-BOITE-3 : LA CORBEILLE, ENTIÈREMENT CHEZ NOUS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DÉCISION D'ARNO, 25/09/2026 : LE MAIL RESTE INTACT DANS GMAIL. Aucun `TRASH` n'est posé — la portée qui le
 * permettrait n'est même pas demandée (`PORTEES_GESTION`). « Supprimer » veut dire ici « je ne veux plus voir cet
 * échange dans mes boîtes », et rien d'autre. C'est réversible d'un clic, et le courrier n'a pas bougé d'un octet.
 *
 * 🔴 AUCUNE LIGNE N'EST JAMAIS EFFACÉE. On pose une DATE et un AUTEUR FIGÉ EN TEXTE sur l'échange — même patron que
 * `sans_suite_le` / `sans_suite_par_libelle` depuis la migration 228. Restaurer remet la date à NULL ; le JOURNAL,
 * lui, garde les deux gestes, en append-only. La trace de ce qui s'est passé ne dépend donc pas d'une colonne qu'on
 * remet à zéro.
 *
 * 🔴 LE RETOUR AUTOMATIQUE EST DÉRIVÉ, PAS ÉCRIT (cf. `SQL_EN_CORBEILLE` dans `boiteRepo`). Un échange n'est à la
 * corbeille que tant que le geste est POSTÉRIEUR OU ÉGAL à son dernier message : un nouveau message l'en fait
 * ressortir tout seul, comme dans Gmail, et la relève n'a strictement rien à savoir de la corbeille.
 *
 * 🔴 L'ÉTAT DE L'ÉCHANGE N'EST PAS TOUCHÉ. Un échange à la corbeille RESTE `a_classer`, `affecte` ou `sans_suite`, et
 * RESTE rattaché à sa carte d'événement — la carte n'est pas modifiée. Restaurer le remet donc exactement là où il
 * était, sans qu'on ait à s'en souvenir.
 *
 * 🔴 TOUT PASSE PAR LA SONDE DE SCHÉMA, HORS TRANSACTION. Sans la migration 251, ces fonctions rendent « pas
 * disponible » et n'émettent AUCUNE requête : nommer une colonne absente ferait échouer toute la boîte, pas
 * seulement le geste nouveau.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { corbeilleDisponible } from './schema';

/** Ce qu'un geste rapporte. `sans_schema` = la migration 251 n'est pas là ; l'écran ne propose alors pas le geste. */
export type IssueCorbeille =
  | { etat: 'ok'; corbeille: boolean }
  | { etat: 'sans_schema' }
  | { etat: 'inconnu' };

/** Qui a fait le geste. Le libellé est FIGÉ : des années après, on doit pouvoir le lire même si le compte a disparu. */
export interface AuteurGeste { id: number | null; libelle: string }

/**
 * MET UN ÉCHANGE À LA CORBEILLE, ou l'en SORT. Un seul verbe pour les deux sens : c'est le même geste, et écrire
 * deux fonctions jumelles ferait diverger leur journal au premier changement.
 *
 * ⚠️ `maj_le` est touché aussi — c'est la colonne que le reste du module lit pour savoir quand l'échange a bougé.
 */
export async function mettreALaCorbeille(
  filId: number, versLaCorbeille: boolean, auteur: AuteurGeste,
): Promise<IssueCorbeille> {
  if (!await corbeilleDisponible()) return { etat: 'sans_schema' };

  const { rowCount } = await query(
    versLaCorbeille
      ? `UPDATE gestion_fil
            SET corbeille_le = now(), corbeille_par = $2, corbeille_par_libelle = $3, maj_le = now()
          WHERE id = $1`
      : `UPDATE gestion_fil
            SET corbeille_le = NULL, corbeille_par = NULL, corbeille_par_libelle = NULL, maj_le = now()
          WHERE id = $1`,
    versLaCorbeille ? [filId, auteur.id, auteur.libelle] : [filId],
  );
  if ((rowCount ?? 0) === 0) return { etat: 'inconnu' };

  // Le journal, au mieux-effort : il ne doit JAMAIS défaire un geste qui a eu lieu. L'entité « fil » existe depuis
  //   la migration 228 — aucune contrainte à élargir, donc aucune sonde de plus à poser.
  try {
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('fil', $1, $2, $3, $4, $5, $6, $7)`,
      [
        filId,
        versLaCorbeille ? 'corbeille' : 'corbeille_restauration',
        versLaCorbeille ? 'dans ses boîtes' : 'à la corbeille',
        versLaCorbeille ? 'à la corbeille' : 'dans ses boîtes',
        versLaCorbeille
          ? 'Échange mis à la corbeille. Rien n’est supprimé : le courrier reste en base, il reste intact dans Gmail, '
            + 'et un nouveau message dans cet échange le fera revenir tout seul dans sa boîte.'
          : 'Échange restauré depuis la corbeille : il est revenu dans sa boîte, avec tous ses messages.',
        auteur.id,
        auteur.libelle,
      ],
    );
  } catch (e) {
    console.error('[gestion/corbeille] geste enregistré mais NON journalisé', { filId, e });
  }
  return { etat: 'ok', corbeille: versLaCorbeille };
}

/**
 * COMBIEN D'ÉCHANGES SONT À LA CORBEILLE. `null` = on ne sait pas (migration absente) : l'étiquette ne s'affiche
 * alors pas du tout, plutôt que d'annoncer un zéro qui ressemblerait à « la corbeille est vide ».
 *
 * La condition est la MÊME que celle du parcours de la boîte — le dernier message décide : un échange dont un
 * nouveau message est arrivé depuis le geste n'est plus à la corbeille, et ne doit donc pas être compté.
 */
export async function compterCorbeille(): Promise<number | null> {
  if (!await corbeilleDisponible()) return null;
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM gestion_fil f
      WHERE f.corbeille_le IS NOT NULL
        AND f.corbeille_le >= coalesce((SELECT max(m.recu_le) FROM gestion_message m WHERE m.fil_id = f.id),
                                       f.corbeille_le)`);
  return rows[0]?.n ?? 0;
}
